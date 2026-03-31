"""
流媒体拉流服务
使用 OpenCV 从各种流媒体源读取视频帧
"""
import cv2
import numpy as np
import threading
import time
import base64
from typing import Optional, Dict, Any
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class StreamReader:
    """流媒体读取器"""
    
    def __init__(self, stream_id: str, url: str, auto_reconnect: bool = True, reconnect_interval: int = 5):
        self.stream_id = stream_id
        self.url = url
        self.auto_reconnect = auto_reconnect
        self.reconnect_interval = reconnect_interval
        
        self.cap: Optional[cv2.VideoCapture] = None
        self.current_frame: Optional[np.ndarray] = None
        self.is_running = False
        self.is_connected = False
        self.last_frame_time: Optional[datetime] = None
        self.error_message = ""
        self.error_count = 0
        
        self.lock = threading.Lock()
        self.thread: Optional[threading.Thread] = None

    def _is_local_camera(self) -> bool:
        return isinstance(self.url, str) and self.url.startswith('/dev/video')
    
    def start(self) -> bool:
        """启动流媒体读取"""
        if self.is_running:
            logger.warning(f"Stream {self.stream_id} is already running")
            return True
        
        self.is_running = True
        self.thread = threading.Thread(target=self._read_loop, daemon=True)
        self.thread.start()
        
        # 等待连接建立（最多3秒）
        for _ in range(30):
            if self.is_connected:
                return True
            time.sleep(0.1)
        
        return self.is_connected
    
    def stop(self):
        """停止流媒体读取"""
        self.is_running = False
        if self.thread:
            self.thread.join(timeout=2.0)
        self._release_capture()

    def _build_capture_candidates(self):
        """构建候选采集源。

        Jetson 运行服务的 venv OpenCV 未启用 GStreamer，但 V4L2 + MJPG 可以
        稳定拿到 1080p/720p。这里显式请求高分辨率，避免静默退回 640x480。
        """
        if self._is_local_camera():
            return [
                (self.url, cv2.CAP_V4L2, 'opencv-v4l2-mjpg-1080p'),
                (self.url, cv2.CAP_ANY, 'opencv-any-mjpg-1080p'),
                (self.url, cv2.CAP_V4L2, 'opencv-v4l2-mjpg-720p'),
                (self.url, cv2.CAP_ANY, 'opencv-device-path'),
            ]

        return [
            (self.url, cv2.CAP_ANY, 'opencv-default'),
        ]

    def _configure_capture(self, cap: cv2.VideoCapture, source_label: str):
        """按候选源配置分辨率与编码格式。"""
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

        if not self._is_local_camera():
            return

        width = 1920
        height = 1080
        fps = 30
        fourcc = None

        if 'mjpg-720p' in source_label:
            width = 1280
            height = 720
            fourcc = 'MJPG'
        elif 'mjpg-1080p' in source_label:
            fourcc = 'MJPG'

        if fourcc:
            cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*fourcc))

        cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
        cap.set(cv2.CAP_PROP_FPS, fps)

    def _connect(self) -> bool:
        """连接到流媒体源"""
        last_error = "无法打开流媒体源"

        for source, backend, source_label in self._build_capture_candidates():
            cap: Optional[cv2.VideoCapture] = None
            try:
                logger.info(
                    "Connecting to stream %s via %s: %s",
                    self.stream_id,
                    source_label,
                    source if isinstance(source, str) and not source.startswith('v4l2src') else self.url,
                )
                cap = cv2.VideoCapture(source, backend)
                self._configure_capture(cap, source_label)

                if not cap.isOpened():
                    last_error = f"无法打开流媒体源 ({source_label})"
                    logger.warning("Failed to open stream %s via %s", self.stream_id, source_label)
                    cap.release()
                    continue

                # 尝试读取一帧验证连接。
                ret, frame = cap.read()
                if not ret or frame is None:
                    last_error = f"无法读取视频帧 ({source_label})"
                    logger.warning("Failed to read frame from stream %s via %s", self.stream_id, source_label)
                    cap.release()
                    continue

                with self.lock:
                    self.cap = cap
                    self.current_frame = frame
                    self.is_connected = True
                    self.last_frame_time = datetime.now()
                    self.error_message = ""

                logger.info(
                    "Successfully connected to stream %s via %s (%sx%s @ %sfps)",
                    self.stream_id,
                    source_label,
                    int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
                    int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
                    cap.get(cv2.CAP_PROP_FPS),
                )
                return True

            except Exception as e:
                last_error = f"连接错误 ({source_label}): {str(e)}"
                logger.error("Exception while connecting to stream %s via %s: %s", self.stream_id, source_label, e)
                if cap:
                    cap.release()

        self.error_message = last_error
        self.error_count += 1
        self._release_capture()
        return False
    
    def _release_capture(self):
        """释放视频捕获对象"""
        if self.cap:
            try:
                self.cap.release()
            except:
                pass
            self.cap = None
        self.is_connected = False

    def _enhance_display_frame(self, frame: np.ndarray) -> np.ndarray:
        """轻量修正 USB 摄像头常见的偏绿问题，仅用于返回前端显示帧。"""
        if not self._is_local_camera() or frame.size == 0:
            return frame

        enhanced = frame.astype(np.float32)

        # OpenCV 使用 BGR 顺序。这个 AONI 4K USB 摄像头在 Jetson 上存在明显偏绿，
        # 这里只做轻微去绿，避免过度修正成偏粉。
        channel_gains = np.array([1.07, 0.93, 1.05], dtype=np.float32)
        enhanced *= channel_gains

        # 轻微提升整体对比度，避免画面发灰。
        enhanced *= 1.03
        return np.clip(enhanced, 0, 255).astype(np.uint8)
    
    def _read_loop(self):
        """读取循环（在后台线程中运行）"""
        while self.is_running:
            # 如果未连接，尝试连接
            if not self.is_connected:
                if self._connect():
                    self.error_count = 0  # 重置错误计数
                else:
                    if self.auto_reconnect:
                        logger.info(f"Retrying connection to stream {self.stream_id} in {self.reconnect_interval}s")
                        time.sleep(self.reconnect_interval)
                        continue
                    else:
                        break
            
            # 读取帧
            try:
                ret, frame = self.cap.read()
                if not ret or frame is None:
                    logger.warning(f"Failed to read frame from stream {self.stream_id}")
                    self.error_count += 1
                    self._release_capture()
                    
                    if self.auto_reconnect:
                        time.sleep(self.reconnect_interval)
                        continue
                    else:
                        break
                
                # 更新当前帧
                with self.lock:
                    self.current_frame = frame
                    self.last_frame_time = datetime.now()
                    self.error_count = 0
                
                # 控制帧率，避免过度占用CPU
                time.sleep(0.033)  # 约30 FPS
                
            except Exception as e:
                logger.error(f"Exception while reading from stream {self.stream_id}: {e}")
                self.error_message = f"读取错误: {str(e)}"
                self.error_count += 1
                self._release_capture()
                
                if self.auto_reconnect:
                    time.sleep(self.reconnect_interval)
                else:
                    break
        
        # 清理
        self._release_capture()
        logger.info(f"Stream reader {self.stream_id} stopped")
    
    def get_frame(self) -> Optional[np.ndarray]:
        """获取当前帧"""
        with self.lock:
            return self.current_frame.copy() if self.current_frame is not None else None
    
    def get_frame_base64(self, quality: int = 100, target_width: int = 1920) -> Optional[str]:
        """获取当前帧的 Base64 编码（JPEG格式，无压缩），支持高质量缩放
        
        Args:
            quality: JPEG质量 (1-100)，默认100（无压缩/最高质量)
            target_width: 目标宽度，0表示不缩放
        """
        frame = self.get_frame()
        if frame is None:
            return None
        
        try:
            frame = self._enhance_display_frame(frame)

            # 高质量缩放（如果需要）
            if target_width > 0 and frame.shape[1] > target_width:
                # 计算目标高度，保持宽高比
                height, width = frame.shape[:2]
                target_height = int((target_width / width) * height)
                
                # 使用 INTER_AREA 算法进行缩放（速度与质量的最佳平衡）
                # INTER_AREA: 速度快，质量好，特别适合缩小图像
                # LANCZOS4: 质量最好但速度最慢（CPU占用高）
                frame = cv2.resize(
                    frame, 
                    (target_width, target_height), 
                    interpolation=cv2.INTER_AREA
                )
                logger.debug(f"Frame resized from {width}x{height} to {target_width}x{target_height} using INTER_AREA")
            
            # 编码为JPEG（无压缩，质量100）
            # JPEG质量: 0-100
            # 100 = 最高质量（无压缩），95-99 = 高质量，85-94 = 中等质量，1-84 = 低质量
            # 设置为 100 以获得最高质量（无压缩）
            quality = max(1, min(100, quality))  # 确保质量在1-100范围内
            encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), quality]
            _, buffer = cv2.imencode('.jpg', frame, encode_param)
            
            # 转换为Base64
            jpeg_as_text = base64.b64encode(buffer).decode('utf-8')
            return f"data:image/jpeg;base64,{jpeg_as_text}"
            
        except Exception as e:
            logger.error(f"Failed to encode frame to base64: {e}")
            return None
    
    def get_status(self) -> Dict[str, Any]:
        """获取流状态"""
        with self.lock:
            return {
                'stream_id': self.stream_id,
                'is_connected': self.is_connected,
                'is_running': self.is_running,
                'last_frame_time': self.last_frame_time.isoformat() if self.last_frame_time else None,
                'error_message': self.error_message,
                'error_count': self.error_count,
            }


class StreamManager:
    """流媒体管理器 - 单例"""
    
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if not hasattr(self, 'initialized'):
            self.streams: Dict[str, StreamReader] = {}
            self.initialized = True
            logger.info("StreamManager initialized")
    
    def add_stream(self, stream_id: str, url: str, auto_reconnect: bool = True, 
                   reconnect_interval: int = 5) -> bool:
        """添加并启动流媒体源"""
        # 如果已存在，先停止旧的
        if stream_id in self.streams:
            self.remove_stream(stream_id)
        
        # 创建新的流读取器
        reader = StreamReader(stream_id, url, auto_reconnect, reconnect_interval)
        success = reader.start()
        
        if success:
            self.streams[stream_id] = reader
            logger.info(f"Stream {stream_id} added and started")
        else:
            logger.error(f"Failed to start stream {stream_id}")
        
        return success
    
    def remove_stream(self, stream_id: str):
        """移除流媒体源"""
        if stream_id in self.streams:
            self.streams[stream_id].stop()
            del self.streams[stream_id]
            logger.info(f"Stream {stream_id} removed")
    
    def get_stream(self, stream_id: str) -> Optional[StreamReader]:
        """获取流读取器"""
        return self.streams.get(stream_id)
    
    def get_frame(self, stream_id: str) -> Optional[np.ndarray]:
        """获取指定流的当前帧"""
        reader = self.get_stream(stream_id)
        return reader.get_frame() if reader else None
    
    def get_frame_base64(self, stream_id: str, quality: int = 100, target_width: int = 1920) -> Optional[str]:
        """获取指定流的当前帧（Base64编码，JPEG格式，无压缩）"""
        reader = self.get_stream(stream_id)
        return reader.get_frame_base64(quality, target_width) if reader else None
    
    def get_stream_status(self, stream_id: str) -> Optional[Dict[str, Any]]:
        """获取流状态"""
        reader = self.get_stream(stream_id)
        return reader.get_status() if reader else None
    
    def get_all_streams_status(self) -> Dict[str, Dict[str, Any]]:
        """获取所有流的状态"""
        return {
            stream_id: reader.get_status()
            for stream_id, reader in self.streams.items()
        }
    
    def stop_all_streams(self):
        """停止所有流"""
        for stream_id in list(self.streams.keys()):
            self.remove_stream(stream_id)
        logger.info("All streams stopped")


# 全局流管理器实例
stream_manager = StreamManager()
