"""
持续检测循环模块 (Detection Loop)

功能：后台线程持续从 StreamReader 取帧 → YOLO 推理 → 缓存最新检测结果。
设计要点（综合蓝军+白军评审）：
1. 检测线程只做推理，绝不做 cv2.imencode（避免 CPU 阻塞）
2. 每帧带 frame_id 保证帧原子性（帧和框绑定）
3. 存 NumPy 引用而非 JPEG，/snapshot/ 按需编码
4. 支持多摄像头（每个 stream_id 一个 DetectionLoop）
5. 使用 get_frame_ref() 零拷贝取帧
"""

import time
import threading
import logging
from typing import Dict, List, Any, Optional, Tuple

import cv2
import numpy as np
import collections

logger = logging.getLogger(__name__)


class DetectionLoop:
    """单个流的持续检测循环"""

    def __init__(self, stream_id: str, model_id: str, conf_threshold: float = 0.5):
        self.stream_id = stream_id
        self.model_id = model_id
        self.conf_threshold = conf_threshold

        # === 核心缓存 ===
        self._latest_result: Optional[Dict[str, Any]] = None
        self._frame_buffer = collections.deque(maxlen=30)  # Ring Buffer：保存最近约1秒的历史帧 (frame_id, frame_ref)
        self._frame_id_counter: int = 0

        self._lock = threading.Lock()
        self._thread: Optional[threading.Thread] = None
        self.is_running: bool = False
        self._error_message: str = ""
        self._config_version: int = 0
        self._duplicate_frame_skips: int = 0
        self._last_processed_frame_version: int = 0

    def start(self):
        """启动检测线程"""
        if self.is_running:
            logger.warning(f"DetectionLoop for stream {self.stream_id} is already running")
            return
        self.is_running = True
        self._error_message = ""
        self._thread = threading.Thread(
            target=self._detect_loop,
            daemon=True,
            name=f"detection-loop-{self.stream_id}",
        )
        self._thread.start()
        logger.info(
            f"🚀 DetectionLoop started: stream={self.stream_id}, "
            f"model={self.model_id}, conf={self.conf_threshold}"
        )

    def stop(self):
        """停止检测线程"""
        self.is_running = False
        if self._thread:
            self._thread.join(timeout=3.0)
            self._thread = None
        logger.info(f"🛑 DetectionLoop stopped: stream={self.stream_id}")

    def update_config(self, model_id: Optional[str] = None, conf_threshold: Optional[float] = None):
        """动态更新检测配置（线程安全）"""
        with self._lock:
            if model_id is not None:
                self.model_id = model_id
                logger.info(f"DetectionLoop {self.stream_id}: model changed to {model_id}")
            if conf_threshold is not None:
                self.conf_threshold = conf_threshold
                logger.info(f"DetectionLoop {self.stream_id}: conf changed to {conf_threshold}")
            self._config_version += 1

    def _detect_loop(self):
        """核心检测循环：只做推理，不做编码"""
        from .stream_service import stream_manager
        from .yolo import run_inference

        fps_window: List[float] = []
        last_processed_signature: Optional[Tuple[int, int]] = None

        logger.info(f"DetectionLoop {self.stream_id}: thread started")

        while self.is_running:
            try:
                # 获取 StreamReader
                reader = stream_manager.get_stream(self.stream_id)
                if not reader or not reader.is_connected:
                    time.sleep(0.5)
                    continue

                # 零拷贝取帧
                frame = reader.get_frame_ref()
                if frame is None:
                    time.sleep(0.01)
                    continue

                # 检查帧版本，避免对同一帧重复推理
                current_version = getattr(reader, 'frame_version', 0)
                with self._lock:
                    current_config_version = self._config_version
                    model_id = self.model_id
                    conf_threshold = self.conf_threshold
                current_signature = (current_version, current_config_version)
                if current_signature == last_processed_signature:
                    self._duplicate_frame_skips += 1
                    time.sleep(0.005)
                    continue

                # YOLO 推理
                frame_height, frame_width = frame.shape[:2]
                t0 = time.time()
                boxes = run_inference(
                    frame,
                    conf=conf_threshold,
                    model_id=model_id,
                )
                elapsed = time.time() - t0
                last_processed_signature = current_signature

                # 滑动窗口计算 FPS
                fps_window.append(elapsed)
                if len(fps_window) > 30:
                    fps_window.pop(0)
                avg_elapsed = sum(fps_window) / len(fps_window)
                avg_fps = 1.0 / max(avg_elapsed, 0.001)

                # 更新缓存
                with self._lock:
                    self._frame_id_counter += 1
                    self._frame_buffer.append({
                        'frame_id': self._frame_id_counter,
                        'frame_ref': frame
                    })
                    self._last_processed_frame_version = current_version
                    self._latest_result = {
                        'stream_id': self.stream_id,
                        'frame_id': self._frame_id_counter,
                        'frame_version': current_version,
                        'frame_width': frame_width,
                        'frame_height': frame_height,
                        'boxes': boxes,
                        'detect_fps': round(avg_fps, 1),
                        'inference_ms': round(elapsed * 1000, 1),
                        'timestamp': time.time(),
                        'model_id': model_id,
                    }
                    self._error_message = ""

            except Exception as e:
                self._error_message = str(e)
                logger.error(
                    f"DetectionLoop {self.stream_id}: inference error: {e}",
                    exc_info=True,
                )
                time.sleep(1.0)  # 出错后等一秒再重试

        logger.info(f"DetectionLoop {self.stream_id}: thread exiting")

    # ========== 数据访问接口 ==========

    def get_latest_result(self) -> Optional[Dict[str, Any]]:
        """获取最新检测结果（给 /detections/ API 用）"""
        with self._lock:
            return self._latest_result

    def get_latest_boxes(self) -> List[Dict[str, Any]]:
        """获取最新检测框列表（给 MJPEG 画框用）"""
        with self._lock:
            if self._latest_result:
                return self._latest_result['boxes']
            return []

    def get_snapshot_jpeg(self, requested_frame_id: Optional[int] = None) -> Tuple[Optional[bytes], Optional[int]]:
        """按需编码，返回 (jpeg_bytes, actual_frame_id)。

        编码在调用者线程（Django worker）中执行，不阻塞检测线程。
        如果在 Ring Buffer 中找到请求的 frame_id，返回对应的历史帧。
        """
        with self._lock:
            if not self._frame_buffer:
                return None, None

            frame_to_encode = None
            actual_id = None

            if requested_frame_id is not None:
                # 尝试在 Ring Buffer 中找 (从新往旧找更快)
                for item in reversed(self._frame_buffer):
                    if item['frame_id'] == requested_frame_id:
                        frame_to_encode = item['frame_ref']
                        actual_id = item['frame_id']
                        break

            # 如果没传 frame_id 或者已在历史中过期被挤出，退化为取最新帧
            if frame_to_encode is None:
                item = self._frame_buffer[-1]
                frame_to_encode = item['frame_ref']
                actual_id = item['frame_id']

        # 编码在此线程中执行
        _, jpeg = cv2.imencode('.jpg', frame_to_encode, [cv2.IMWRITE_JPEG_QUALITY, 95])
        return jpeg.tobytes(), actual_id

    def get_status(self) -> Dict[str, Any]:
        """获取检测循环状态"""
        with self._lock:
            result = self._latest_result
        return {
            'stream_id': self.stream_id,
            'model_id': self.model_id,
            'conf_threshold': self.conf_threshold,
            'is_running': self.is_running,
            'detect_fps': result['detect_fps'] if result else 0,
            'inference_ms': result['inference_ms'] if result else 0,
            'frame_id': result['frame_id'] if result else 0,
            'frame_version': result['frame_version'] if result else 0,
            'box_count': len(result['boxes']) if result else 0,
            'duplicate_frame_skips': self._duplicate_frame_skips,
            'last_processed_frame_version': self._last_processed_frame_version,
            'error': self._error_message,
        }


class DetectionLoopManager:
    """管理多个“视频流 + 模型 + 阈值”检测循环（单例）。

    同一路视频允许被两个独立窗口分别绑定不同模型。owner_id 用来把查询、抓拍和
    停止操作精确路由回调用方自己的循环，杜绝后打开窗口覆盖先打开窗口的模型。
    """

    _instance: Optional['DetectionLoopManager'] = None
    _init_lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._init_lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    # key = stream_id::model_id::confidence
                    cls._instance._loops: Dict[str, DetectionLoop] = {}
                    cls._instance._anonymous_ref_counts: Dict[str, int] = {}
                    cls._instance._owners: Dict[str, set[str]] = {}
                    cls._instance._owner_loops: Dict[str, str] = {}
                    cls._instance._lock = threading.Lock()
        return cls._instance

    @staticmethod
    def _make_loop_key(stream_id: str, model_id: str, conf_threshold: float) -> str:
        return f'{stream_id}::{model_id}::{float(conf_threshold):.4f}'

    def _stream_loop_keys_locked(self, stream_id: str) -> List[str]:
        return [
            loop_key for loop_key, loop in self._loops.items()
            if loop.stream_id == stream_id and loop.is_running
        ]

    def _stop_loop_key_locked(self, loop_key: str) -> None:
        loop = self._loops.pop(loop_key, None)
        if not loop:
            return
        loop.stop()
        for owner in self._owners.pop(loop_key, set()):
            if self._owner_loops.get(owner) == loop_key:
                self._owner_loops.pop(owner, None)
        self._anonymous_ref_counts.pop(loop_key, None)
        from .yolo import unpin_model
        unpin_model(loop.model_id)

    def _detach_owner_locked(self, owner_id: str) -> None:
        loop_key = self._owner_loops.pop(owner_id, None)
        if not loop_key:
            return
        owners = self._owners.setdefault(loop_key, set())
        owners.discard(owner_id)
        if not owners and self._anonymous_ref_counts.get(loop_key, 0) <= 0:
            self._stop_loop_key_locked(loop_key)

    def _resolve_loop_key_locked(
        self,
        stream_id: str,
        owner_id: Optional[str] = None,
        model_id: Optional[str] = None,
    ) -> Optional[str]:
        if owner_id:
            loop_key = self._owner_loops.get(owner_id)
            loop = self._loops.get(loop_key or '')
            if loop and loop.is_running and loop.stream_id == stream_id:
                return loop_key
            return None

        candidates = self._stream_loop_keys_locked(stream_id)
        if model_id:
            candidates = [key for key in candidates if self._loops[key].model_id == model_id]
        if not candidates:
            return None
        # 旧客户端没有 owner_id：单循环时完全兼容；多循环时稳定返回第一个，
        # 新版前端始终携带 owner_id，不会走到这个兼容分支。
        return sorted(candidates)[0]

    def start_loop(
        self,
        stream_id: str,
        model_id: str,
        conf_threshold: float = 0.5,
        owner_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """启动独立检测循环；同流不同模型不会互相覆盖。"""
        with self._lock:
            from .yolo import MAX_MODEL_POOL_SIZE, pin_model, unpin_model

            loop_key = self._make_loop_key(stream_id, model_id, conf_threshold)

            # 同一页面切换配方/模型时，只释放该页面旧循环，不影响其他窗口。
            previous_loop_key = self._owner_loops.get(owner_id or '') if owner_id else None
            if previous_loop_key and previous_loop_key != loop_key:
                self._detach_owner_locked(owner_id)

            def active_model_counts() -> Dict[str, int]:
                counts: Dict[str, int] = {}
                for loop in self._loops.values():
                    if not loop.is_running:
                        continue
                    counts[loop.model_id] = counts.get(loop.model_id, 0) + 1
                return counts

            def would_exceed_model_capacity(next_model_id: str) -> tuple[bool, int]:
                counts = active_model_counts()
                counts[next_model_id] = counts.get(next_model_id, 0) + 1
                return len(counts) > MAX_MODEL_POOL_SIZE, len(counts)

            existing_loop = self._loops.get(loop_key)
            if existing_loop and existing_loop.is_running:
                if owner_id:
                    self._owners.setdefault(loop_key, set()).add(owner_id)
                    self._owner_loops[owner_id] = loop_key
                else:
                    self._anonymous_ref_counts[loop_key] = self._anonymous_ref_counts.get(loop_key, 0) + 1
                return {
                    'success': True,
                    'message': f'检测循环已在运行: stream={stream_id}, model={model_id}',
                    'loop_id': loop_key,
                    'status': existing_loop.get_status(),
                    'owners': len(self._owners.get(loop_key, set())),
                }

            exceeds_capacity, candidate_count = would_exceed_model_capacity(model_id)
            if exceeds_capacity:
                return {
                    'success': False,
                    'message': (
                        f'模型池已满（{candidate_count}/{MAX_MODEL_POOL_SIZE}），'
                        f'无法加载新模型 {model_id}。请先停止一个检测循环。'
                    ),
                    'owners': 0,
                }

            # 启动接口同步加载并固定模型，失败会直接返回给前端，避免页面看似已启动
            # 实际后台线程持续报错。
            model_was_pinned = False
            try:
                pin_model(model_id)
                model_was_pinned = True
                loop = DetectionLoop(stream_id, model_id, conf_threshold)
                loop.start()
            except Exception as exc:
                if model_was_pinned:
                    unpin_model(model_id)
                return {
                    'success': False,
                    'message': f'模型 {model_id} 启动失败: {exc}',
                    'owners': 0,
                }

            self._loops[loop_key] = loop
            if owner_id:
                self._owners.setdefault(loop_key, set()).add(owner_id)
                self._owner_loops[owner_id] = loop_key
            else:
                self._anonymous_ref_counts[loop_key] = 1

            return {
                'success': True,
                'message': f'检测循环已启动: stream={stream_id}, model={model_id}',
                'loop_id': loop_key,
                'status': loop.get_status(),
                'owners': len(self._owners.get(loop_key, set())),
            }

    def stop_loop(
        self,
        stream_id: str,
        owner_id: Optional[str] = None,
        force: bool = False,
    ) -> Dict[str, Any]:
        """停止调用方自己的循环；force=True 才停止该视频流的全部模型。"""
        with self._lock:
            if force:
                loop_keys = self._stream_loop_keys_locked(stream_id)
                for loop_key in loop_keys:
                    self._stop_loop_key_locked(loop_key)
                return {
                    'success': True,
                    'message': f'已停止流 {stream_id} 的全部检测循环',
                    'owners': 0,
                }

            if owner_id:
                loop_key = self._owner_loops.get(owner_id)
                loop = self._loops.get(loop_key or '')
                if not loop or loop.stream_id != stream_id:
                    return {
                        'success': True,
                        'message': f'owner 未持有检测循环，忽略停止: stream={stream_id}',
                        'owners': 0,
                    }
                self._detach_owner_locked(owner_id)
                return {
                    'success': True,
                    'message': f'已释放 owner 检测循环: stream={stream_id}',
                    'owners': len(self._owners.get(loop_key, set())),
                }

            loop_key = self._resolve_loop_key_locked(stream_id)
            if not loop_key:
                return {
                    'success': False,
                    'message': f'未找到检测循环引用: stream={stream_id}',
                }
            current = self._anonymous_ref_counts.get(loop_key, 0)
            if current > 1:
                self._anonymous_ref_counts[loop_key] = current - 1
                return {
                    'success': True,
                    'message': f'检测循环仍有匿名消费者 ({current - 1})',
                    'owners': len(self._owners.get(loop_key, set())),
                }
            self._anonymous_ref_counts[loop_key] = 0
            if not self._owners.get(loop_key):
                self._stop_loop_key_locked(loop_key)
            return {
                'success': True,
                'message': f'检测循环已停止: stream={stream_id}',
                'owners': 0,
            }

    def get_latest_boxes(self, stream_id: str, owner_id: Optional[str] = None, model_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """获取指定流的最新检测框（给 MJPEG 画框用）"""
        with self._lock:
            loop_key = self._resolve_loop_key_locked(stream_id, owner_id, model_id)
            loop = self._loops.get(loop_key or '')
        if loop and loop.is_running:
            return loop.get_latest_boxes()
        return []

    def get_latest_result(self, stream_id: str, owner_id: Optional[str] = None, model_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """获取指定流的最新检测结果"""
        with self._lock:
            loop_key = self._resolve_loop_key_locked(stream_id, owner_id, model_id)
            loop = self._loops.get(loop_key or '')
        if loop and loop.is_running:
            return loop.get_latest_result()
        return None

    def get_snapshot_jpeg(self, stream_id: str, frame_id: Optional[int] = None, owner_id: Optional[str] = None, model_id: Optional[str] = None) -> Tuple[Optional[bytes], Optional[int]]:
        """获取指定流的高清截图"""
        with self._lock:
            loop_key = self._resolve_loop_key_locked(stream_id, owner_id, model_id)
            loop = self._loops.get(loop_key or '')
        if loop and loop.is_running:
            return loop.get_snapshot_jpeg(frame_id)
        return None, None

    def get_all_status(self) -> Dict[str, Any]:
        """获取所有检测循环的状态"""
        with self._lock:
            statuses = {
                loop_key: loop.get_status()
                for loop_key, loop in self._loops.items()
            }
        return {
            'active_loops': len(statuses),
            'loops': statuses,
            'owners': {
                loop_key: sorted(owners)
                for loop_key, owners in self._owners.items()
            },
            'owner_loops': dict(self._owner_loops),
        }

    def stop_all(self):
        """停止所有检测循环"""
        with self._lock:
            for loop_key in list(self._loops):
                self._stop_loop_key_locked(loop_key)
            self._anonymous_ref_counts.clear()
            self._owner_loops.clear()
        logger.info("🛑 All detection loops stopped")


# 全局单例实例
detection_loop_manager = DetectionLoopManager()
