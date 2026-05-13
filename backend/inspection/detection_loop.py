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

logger = logging.getLogger(__name__)


class DetectionLoop:
    """单个流的持续检测循环"""

    def __init__(self, stream_id: str, model_id: str, conf_threshold: float = 0.5):
        self.stream_id = stream_id
        self.model_id = model_id
        self.conf_threshold = conf_threshold

        # === 核心缓存 ===
        self._latest_result: Optional[Dict[str, Any]] = None
        self._latest_raw_frame: Optional[np.ndarray] = None  # 不做 JPEG 编码
        self._frame_id_counter: int = 0

        self._lock = threading.Lock()
        self._thread: Optional[threading.Thread] = None
        self.is_running: bool = False
        self._error_message: str = ""

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
        if model_id is not None:
            self.model_id = model_id
            logger.info(f"DetectionLoop {self.stream_id}: model changed to {model_id}")
        if conf_threshold is not None:
            self.conf_threshold = conf_threshold
            logger.info(f"DetectionLoop {self.stream_id}: conf changed to {conf_threshold}")

    def _detect_loop(self):
        """核心检测循环：只做推理，不做编码"""
        from .stream_service import stream_manager
        from .yolo import run_inference

        fps_window: List[float] = []

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

                # YOLO 推理
                frame_height, frame_width = frame.shape[:2]
                t0 = time.time()
                boxes = run_inference(
                    frame,
                    conf=self.conf_threshold,
                    model_id=self.model_id,
                )
                elapsed = time.time() - t0

                # 滑动窗口计算 FPS
                fps_window.append(elapsed)
                if len(fps_window) > 30:
                    fps_window.pop(0)
                avg_elapsed = sum(fps_window) / len(fps_window)
                avg_fps = 1.0 / max(avg_elapsed, 0.001)

                # 更新缓存
                with self._lock:
                    self._frame_id_counter += 1
                    self._latest_raw_frame = frame  # 存引用，不编码
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
                        'model_id': self.model_id,
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
        """
        with self._lock:
            frame = self._latest_raw_frame
            actual_id = self._frame_id_counter
        if frame is None:
            return None, None
        # 编码在此线程中执行
        _, jpeg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 95])
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
            'box_count': len(result['boxes']) if result else 0,
            'error': self._error_message,
        }


class DetectionLoopManager:
    """管理多个流的检测循环（单例）"""

    _instance: Optional['DetectionLoopManager'] = None
    _init_lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._init_lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._loops: Dict[str, DetectionLoop] = {}
                    cls._instance._ref_counts: Dict[str, int] = {}
                    cls._instance._owners: Dict[str, set[str]] = {}
                    cls._instance._lock = threading.Lock()
        return cls._instance

    def start_loop(
        self,
        stream_id: str,
        model_id: str,
        conf_threshold: float = 0.5,
        owner_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """启动指定流的检测循环（引用计数，支持多消费者）"""
        with self._lock:
            # 递增引用计数。新版前端传 owner_id，同一 owner 重复 start 只算一次；
            # 这样 OCR/实时检测/PPE 共享同一个 stream 时，一个页面的 cleanup
            # 不会误停另一个页面正在使用的检测循环。
            if owner_id:
                owners = self._owners.setdefault(stream_id, set())
                owners.add(owner_id)
                self._ref_counts[stream_id] = len(owners)
            else:
                self._ref_counts[stream_id] = self._ref_counts.get(stream_id, 0) + 1

            # 如果已有循环在跑
            if stream_id in self._loops and self._loops[stream_id].is_running:
                old_loop = self._loops[stream_id]
                # 如果配置没变，直接返回
                if old_loop.model_id == model_id and old_loop.conf_threshold == conf_threshold:
                    return {
                        'success': True,
                        'message': f'检测循环已在运行: stream={stream_id}',
                        'status': old_loop.get_status(),
                        'owners': self._ref_counts.get(stream_id, 0),
                    }
                # 配置变了，更新配置
                old_loop.update_config(model_id=model_id, conf_threshold=conf_threshold)
                return {
                        'success': True,
                        'message': f'检测循环配置已更新: stream={stream_id}',
                        'status': old_loop.get_status(),
                        'owners': self._ref_counts.get(stream_id, 0),
                    }

            # 检查模型池容量
            from .yolo import MAX_MODEL_POOL_SIZE
            active_models = set(
                loop.model_id for loop in self._loops.values() if loop.is_running
            )
            if len(active_models) >= MAX_MODEL_POOL_SIZE and model_id not in active_models:
                return {
                    'success': False,
                    'message': (
                        f'模型池已满（{len(active_models)}/{MAX_MODEL_POOL_SIZE}），'
                        f'无法加载新模型 {model_id}。请先停止一个检测循环。'
                    ),
                }

            # 创建并启动新循环
            loop = DetectionLoop(stream_id, model_id, conf_threshold)
            loop.start()
            self._loops[stream_id] = loop

            return {
                'success': True,
                'message': f'检测循环已启动: stream={stream_id}, model={model_id}',
                'status': loop.get_status(),
                'owners': self._ref_counts.get(stream_id, 0),
            }

    def stop_loop(self, stream_id: str, owner_id: Optional[str] = None) -> Dict[str, Any]:
        """停止指定流的检测循环（引用计数归零才真停）"""
        with self._lock:
            if owner_id:
                owners = self._owners.setdefault(stream_id, set())
                if owner_id not in owners:
                    return {
                        'success': True,
                        'message': f'owner 未持有检测循环，忽略停止: stream={stream_id}',
                        'owners': len(owners),
                    }
                owners.discard(owner_id)
                self._ref_counts[stream_id] = len(owners)
            elif self._owners.get(stream_id):
                return {
                    'success': True,
                    'message': f'存在 owner 持有检测循环，忽略无 owner 停止: stream={stream_id}',
                    'owners': len(self._owners[stream_id]),
                }
            else:
                current = self._ref_counts.get(stream_id, 0)
                if current <= 0:
                    return {
                        'success': False,
                        'message': f'未找到检测循环引用: stream={stream_id}',
                    }
                self._ref_counts[stream_id] = current - 1

            current = self._ref_counts.get(stream_id, 0)
            if current > 0:
                return {
                    'success': True,
                    'message': f'检测循环仍有其他消费者 ({current}), 不停止: stream={stream_id}',
                    'owners': current,
                }

            if stream_id not in self._loops:
                return {
                    'success': True,
                    'message': f'检测循环引用已清零: stream={stream_id}',
                    'owners': 0,
                }
            loop = self._loops[stream_id]
            loop.stop()
            del self._loops[stream_id]
            self._owners.pop(stream_id, None)
            return {
                'success': True,
                'message': f'检测循环已停止: stream={stream_id}',
                'owners': 0,
            }

    def get_latest_boxes(self, stream_id: str) -> List[Dict[str, Any]]:
        """获取指定流的最新检测框（给 MJPEG 画框用）"""
        with self._lock:
            loop = self._loops.get(stream_id)
        if loop and loop.is_running:
            return loop.get_latest_boxes()
        return []

    def get_latest_result(self, stream_id: str) -> Optional[Dict[str, Any]]:
        """获取指定流的最新检测结果"""
        with self._lock:
            loop = self._loops.get(stream_id)
        if loop and loop.is_running:
            return loop.get_latest_result()
        return None

    def get_snapshot_jpeg(self, stream_id: str, frame_id: Optional[int] = None) -> Tuple[Optional[bytes], Optional[int]]:
        """获取指定流的高清截图"""
        with self._lock:
            loop = self._loops.get(stream_id)
        if loop and loop.is_running:
            return loop.get_snapshot_jpeg(frame_id)
        return None, None

    def get_all_status(self) -> Dict[str, Any]:
        """获取所有检测循环的状态"""
        with self._lock:
            statuses = {
                sid: loop.get_status()
                for sid, loop in self._loops.items()
            }
        return {
            'active_loops': len(statuses),
            'loops': statuses,
            'owners': {
                sid: len(owners)
                for sid, owners in self._owners.items()
            },
        }

    def stop_all(self):
        """停止所有检测循环"""
        with self._lock:
            for stream_id, loop in list(self._loops.items()):
                loop.stop()
            self._loops.clear()
            self._ref_counts.clear()
            self._owners.clear()
        logger.info("🛑 All detection loops stopped")


# 全局单例实例
detection_loop_manager = DetectionLoopManager()
