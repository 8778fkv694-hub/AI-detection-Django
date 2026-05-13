#!/usr/bin/env python3
"""Local Jetson-like burn-in for the stream detection loop.

This does not need a real USB camera, YOLO weights, or Jetson hardware. It
simulates the pressure paths that are expensive on Jetson:

- a low-FPS camera publishing new frame_version values,
- slower YOLO inference,
- repeated start/stop calls from multiple page owners,
- model-pool capacity checks,
- system-level force stop when the stream is removed/restarted.
"""

from __future__ import annotations

import argparse
import json
import sys
import threading
import time
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from inspection.detection_loop import DetectionLoopManager  # noqa: E402
from inspection.stream_service import stream_manager  # noqa: E402
import inspection.yolo as yolo  # noqa: E402


class FakeStreamReader:
    """Small in-process StreamReader substitute for burn-in tests."""

    def __init__(self, stream_id: str, fps: float, width: int, height: int):
        self.stream_id = stream_id
        self.fps = fps
        self.width = width
        self.height = height
        self.is_running = False
        self.is_connected = False
        self.frame_version = 0
        self.current_frame: np.ndarray | None = None
        self.error_message = ""
        self._lock = threading.Lock()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        self.is_running = True
        self.is_connected = True
        self._thread = threading.Thread(
            target=self._publish_loop,
            name=f"fake-stream-{self.stream_id}",
            daemon=True,
        )
        self._thread.start()

    def stop(self) -> None:
        self.is_running = False
        self.is_connected = False
        if self._thread:
            self._thread.join(timeout=2.0)
            self._thread = None

    def _publish_loop(self) -> None:
        interval = 1.0 / max(self.fps, 0.1)
        next_tick = time.monotonic()
        while self.is_running:
            with self._lock:
                value = self.frame_version % 255
                frame = np.full((self.height, self.width, 3), value, dtype=np.uint8)
                # Add a moving marker so each published frame is visibly distinct.
                x = (self.frame_version * 7) % max(self.width - 20, 1)
                y = (self.frame_version * 5) % max(self.height - 20, 1)
                frame[y : y + 20, x : x + 20] = (0, 255, 0)
                self.current_frame = frame
                self.frame_version += 1

            next_tick += interval
            time.sleep(max(0.0, next_tick - time.monotonic()))

    def get_frame_ref(self) -> np.ndarray | None:
        with self._lock:
            return self.current_frame

    def get_status(self) -> Dict[str, Any]:
        return {
            "stream_id": self.stream_id,
            "is_connected": self.is_connected,
            "is_running": self.is_running,
            "frame_version": self.frame_version,
            "error_message": self.error_message,
        }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--duration", type=float, default=60.0, help="steady burn-in seconds")
    parser.add_argument("--stream-fps", type=float, default=8.0, help="simulated camera FPS")
    parser.add_argument("--inference-ms", type=float, default=45.0, help="fake YOLO latency")
    parser.add_argument("--streams", type=int, default=2, help="simulated stream count")
    parser.add_argument("--model-pool-size", type=int, default=2, help="simulated Jetson model pool size")
    parser.add_argument("--width", type=int, default=1280)
    parser.add_argument("--height", type=int, default=720)
    parser.add_argument("--progress-interval", type=float, default=10.0)
    return parser.parse_args()


def assert_true(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def install_stream(reader: FakeStreamReader) -> None:
    reader.start()
    with stream_manager._streams_lock:
        stream_manager.streams[reader.stream_id] = reader


def remove_stream(reader: FakeStreamReader) -> None:
    with stream_manager._streams_lock:
        stream_manager.streams.pop(reader.stream_id, None)
    reader.stop()


def run_guard_checks(manager: DetectionLoopManager) -> Dict[str, Any]:
    """Exercise owner and model-pool edge cases before the steady burn-in."""

    guard_a = FakeStreamReader("burnin_guard_a", fps=4, width=320, height=180)
    guard_b = FakeStreamReader("burnin_guard_b", fps=4, width=320, height=180)
    install_stream(guard_a)
    install_stream(guard_b)
    old_pool_size = yolo.MAX_MODEL_POOL_SIZE
    yolo.MAX_MODEL_POOL_SIZE = 1
    try:
        manager.stop_all()

        first = manager.start_loop("burnin_guard_a", "model_a", 0.5, owner_id="owner_a")
        assert_true(first["success"], f"first loop should start: {first}")
        assert_true(first["owners"] == 1, f"first owner count should be 1: {first}")

        blocked = manager.start_loop("burnin_guard_b", "model_b", 0.5, owner_id="owner_b")
        assert_true(not blocked["success"], f"second model should be blocked: {blocked}")
        assert_true(blocked.get("owners") == 0, f"blocked start leaked owner: {blocked}")
        status = manager.get_all_status()
        assert_true("burnin_guard_b" not in status["loops"], f"blocked start created loop: {status}")
        assert_true("burnin_guard_b" not in status["owners"], f"blocked start created owner: {status}")

        same_owner = manager.start_loop("burnin_guard_a", "model_a", 0.5, owner_id="owner_a")
        assert_true(same_owner["owners"] == 1, f"same owner double-counted: {same_owner}")

        ownerless_stop = manager.stop_loop("burnin_guard_a")
        assert_true(ownerless_stop["success"], f"ownerless stop should be ignored: {ownerless_stop}")
        assert_true(ownerless_stop["owners"] == 1, f"ownerless stop changed owner count: {ownerless_stop}")
        assert_true(manager.get_all_status()["active_loops"] == 1, "ownerless stop removed owned loop")

        forced = manager.stop_loop("burnin_guard_a", force=True)
        assert_true(forced["success"] and forced["owners"] == 0, f"force stop failed: {forced}")
        assert_true(manager.get_all_status()["active_loops"] == 0, "force stop did not remove loop")

        return {
            "blocked_start": blocked,
            "ownerless_stop": ownerless_stop,
            "force_stop": forced,
        }
    finally:
        manager.stop_all()
        yolo.MAX_MODEL_POOL_SIZE = old_pool_size
        remove_stream(guard_a)
        remove_stream(guard_b)


def main() -> int:
    args = parse_args()
    manager = DetectionLoopManager()
    manager.stop_all()

    old_pool_size = yolo.MAX_MODEL_POOL_SIZE
    old_run_inference = yolo.run_inference
    inference_lock = threading.Lock()
    inference_counts: Dict[str, int] = defaultdict(int)

    def fake_run_inference(image_bgr: np.ndarray, conf: float = 0.5, model_id: str | None = None):
        del image_bgr
        model = model_id or "default"
        time.sleep(max(0.0, args.inference_ms / 1000.0))
        with inference_lock:
            inference_counts[model] += 1
        return [
            {
                "label": "hardhat",
                "confidence": max(conf, 0.85),
                "bbox": {"x1": 40.0, "y1": 30.0, "x2": 180.0, "y2": 210.0},
            }
        ]

    yolo.run_inference = fake_run_inference
    yolo.MAX_MODEL_POOL_SIZE = args.model_pool_size

    readers: List[FakeStreamReader] = []
    started_stream_ids: List[str] = []
    guard_result: Dict[str, Any] = {}
    intentional_reprocess_budget: Dict[str, int] = defaultdict(int)
    try:
        guard_result = run_guard_checks(manager)

        for idx in range(max(1, args.streams)):
            reader = FakeStreamReader(
                stream_id=f"burnin_stream_{idx + 1}",
                fps=args.stream_fps,
                width=args.width,
                height=args.height,
            )
            install_stream(reader)
            readers.append(reader)

        for idx, reader in enumerate(readers):
            model_id = f"model_{idx + 1}"
            started = manager.start_loop(
                reader.stream_id,
                model_id,
                0.5,
                owner_id=f"owner_{idx + 1}",
            )
            if started["success"]:
                started_stream_ids.append(reader.stream_id)
            elif idx < args.model_pool_size:
                raise AssertionError(f"expected stream {reader.stream_id} to start: {started}")

        assert_true(started_stream_ids, "no detection loop started")

        started_at = time.monotonic()
        next_progress = started_at + args.progress_interval
        next_churn = started_at + 3.0
        next_config = started_at + 5.0
        next_force_restart = started_at + 13.0
        config_toggle = False

        while time.monotonic() - started_at < args.duration:
            now = time.monotonic()
            if now >= next_churn:
                primary = started_stream_ids[0]
                extra_start = manager.start_loop(primary, "model_1", 0.5, owner_id="burnin_extra_owner")
                assert_true(extra_start["success"], f"extra owner start failed: {extra_start}")
                if "配置已更新" in extra_start.get("message", ""):
                    intentional_reprocess_budget[primary] += 1
                stop_extra = manager.stop_loop(primary, owner_id="burnin_extra_owner")
                assert_true(stop_extra["success"], f"extra owner stop failed: {stop_extra}")
                ownerless = manager.stop_loop(primary)
                assert_true(ownerless["success"], f"ownerless stop failed: {ownerless}")
                next_churn += 3.0

            if now >= next_config:
                primary = started_stream_ids[0]
                config_toggle = not config_toggle
                updated = manager.start_loop(
                    primary,
                    "model_1",
                    0.45 if config_toggle else 0.55,
                    owner_id="owner_1",
                )
                assert_true(updated["success"], f"config update failed: {updated}")
                if "配置已更新" in updated.get("message", ""):
                    intentional_reprocess_budget[primary] += 1
                next_config += 5.0

            if len(started_stream_ids) > 1 and now >= next_force_restart:
                stream_id = started_stream_ids[-1]
                forced = manager.stop_loop(stream_id, force=True)
                assert_true(forced["success"], f"periodic force stop failed: {forced}")
                restarted = manager.start_loop(
                    stream_id,
                    f"model_{started_stream_ids.index(stream_id) + 1}",
                    0.5,
                    owner_id=f"owner_{started_stream_ids.index(stream_id) + 1}",
                )
                assert_true(restarted["success"], f"periodic restart failed: {restarted}")
                next_force_restart += 13.0

            if now >= next_progress:
                status = manager.get_all_status()
                print(
                    json.dumps(
                        {
                            "elapsed_s": round(now - started_at, 1),
                            "active_loops": status["active_loops"],
                            "owners": status["owners"],
                        },
                        ensure_ascii=False,
                    ),
                    flush=True,
                )
                next_progress += args.progress_interval

            time.sleep(0.05)

        final_status = manager.get_all_status()
        stream_versions = {reader.stream_id: reader.frame_version for reader in readers}
        with inference_lock:
            inference_summary = dict(inference_counts)

        assert_true(
            final_status["active_loops"] == len(started_stream_ids),
            f"active loop count changed unexpectedly: {final_status}",
        )
        for stream_id in started_stream_ids:
            loop_status = final_status["loops"][stream_id]
            assert_true(loop_status["frame_id"] > 0, f"loop produced no frames: {loop_status}")
            assert_true(not loop_status["error"], f"loop has error: {loop_status}")
            assert_true(
                loop_status["duplicate_frame_skips"] > 0,
                f"duplicate-frame guard did not engage: {loop_status}",
            )
            assert_true(
                loop_status["frame_id"] <= stream_versions[stream_id] + intentional_reprocess_budget[stream_id] + 5,
                (
                    "loop likely inferred duplicate frames: "
                    f"status={loop_status}, stream_versions={stream_versions}, "
                    f"intentional_reprocess_budget={dict(intentional_reprocess_budget)}"
                ),
            )

        summary = {
            "ok": True,
            "duration_s": args.duration,
            "stream_fps": args.stream_fps,
            "inference_ms": args.inference_ms,
            "model_pool_size": args.model_pool_size,
            "guard_checks": guard_result,
            "stream_versions": stream_versions,
            "intentional_reprocess_budget": dict(intentional_reprocess_budget),
            "inference_counts": inference_summary,
            "final_status": final_status,
        }
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 0
    except Exception as exc:
        print(f"BURNIN_FAILED: {exc}", file=sys.stderr)
        return 1
    finally:
        manager.stop_all()
        for reader in readers:
            remove_stream(reader)
        yolo.run_inference = old_run_inference
        yolo.MAX_MODEL_POOL_SIZE = old_pool_size


if __name__ == "__main__":
    raise SystemExit(main())
