"""
流媒体拉流服务
使用 OpenCV 从各种流媒体源读取视频帧
"""
import os

# 强制 OpenCV FFmpeg 使用 TCP 传输 RTSP，并启用低延迟选项（nobuffer + low_delay）
# 注意：本地摄像头通常使用 V4L2 backend，不受 FFmpeg 选项影响
os.environ.setdefault(
    'OPENCV_FFMPEG_CAPTURE_OPTIONS',
    'rtsp_transport;tcp|fflags;nobuffer|flags;low_delay|max_delay;500000'
)

import cv2
import numpy as np
import threading
import time
import base64
from typing import Optional, Dict, Any
from datetime import datetime
import logging
import re

logger = logging.getLogger(__name__)


def _sanitize_url(url: str) -> str:
    """脱敏URL中的密码，防止明文凭据写入日志。"""
    return re.sub(r'://([^:]+):([^@]+)@', r'://\1:***@', url)


class StreamReader:
    """流媒体读取器"""
    
    def __init__(self, stream_id: str, url: str, auto_reconnect: bool = True, reconnect_interval: int = 5, low_latency: bool = False):
        self.stream_id = stream_id
        self.url = url
        self.auto_reconnect = auto_reconnect
        self.reconnect_interval = reconnect_interval
        self.low_latency = low_latency

        self.cap: Optional[cv2.VideoCapture] = None
        self.current_frame: Optional[np.ndarray] = None
        self.is_running = False
        self.is_connected = False
        self.last_frame_time: Optional[datetime] = None
        self.error_message = ""
        self.error_count = 0
        self.frame_version: int = 0  # 帧版本计数器，用于 MJPEG 去重

        self.lock = threading.Lock()
        self.thread: Optional[threading.Thread] = None

        # 共享编码缓存：多 MJPEG 消费者复用同一帧的 JPEG 编码结果，避免重复 cv2.imencode
        # key: (frame_version, quality, target_width) → bytes
        self._encode_cache: Dict[tuple, bytes] = {}
        self._raw_mjpeg: Optional[bytes] = None  # V4L2RawReader 喂入的原始 MJPEG 字节
        self._raw_mjpeg_version: int = 0

        # Jetson V4L2 原始 MJPEG 源（替代 cv2 采集）
        self._v4l2_source = None  # 由 StreamManager 注入

        # _enhance_display_frame 结果缓存（同帧复用，省浮点运算）
        self._enhanced_frame: Optional[np.ndarray] = None
        self._enhanced_version: int = -1

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
            self.thread.join(timeout=5.0)
            if self.thread.is_alive():
                logger.warning(
                    "StreamReader %s: thread did not stop within 5s, "
                    "forcing capture release (thread may linger)",
                    self.stream_id,
                )
        # 如果有 V4L2 原始源，一并停止，避免 /dev/video 设备句柄泄漏
        v4l2 = getattr(self, '_v4l2_source', None)
        if v4l2 is not None:
            try:
                v4l2.stop()
            except Exception as e:
                logger.warning("StreamReader %s: V4L2 stop error: %s", self.stream_id, e)
            self._v4l2_source = None
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

        candidates = [
            (self.url, cv2.CAP_ANY, 'opencv-default'),
        ]

        # RTSP 流强制 TCP 传输，避免 UDP 认证失败
        if isinstance(self.url, str) and self.url.startswith('rtsp://'):
            tcp_url = f"{self.url}?rtsp_transport=tcp"
            candidates.insert(0, (tcp_url, cv2.CAP_FFMPEG, 'opencv-ffmpeg-tcp'))

        return candidates

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
                    _sanitize_url(source if isinstance(source, str) and not source.startswith('v4l2src') else self.url),
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
                    self.frame_version += 1

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
        """轻量修正 USB 摄像头常见的偏绿问题，仅用于返回前端显示帧。
        结果按帧版本缓存，同帧多次调用复用同一份增强结果。"""
        if not self._is_local_camera() or frame.size == 0:
            return frame

        version = self.frame_version
        if version == self._enhanced_version and self._enhanced_frame is not None:
            return self._enhanced_frame

        enhanced = frame.astype(np.float32)

        # OpenCV 使用 BGR 顺序。这个 AONI 4K USB 摄像头在 Jetson 上存在明显偏绿，
        # 这里只做轻微去绿，避免过度修正成偏粉。
        channel_gains = np.array([1.07, 0.93, 1.05], dtype=np.float32)
        enhanced *= channel_gains

        # 轻微提升整体对比度，避免画面发灰。
        enhanced *= 1.03
        result = np.clip(enhanced, 0, 255).astype(np.uint8)
        self._enhanced_frame = result
        self._enhanced_version = version
        return result
    
    def _read_loop(self):
        """读取循环（在后台线程中运行）。

        当 _v4l2_source 存在时（Jetson V4L2 原始 MJPEG 路径），从 V4L2RawReader
        同步帧引用，不持有 cv2.VideoCapture。否则走 cv2 采集路径。
        """
        if self._v4l2_source is not None:
            self._v4l2_sync_loop()
            return
        self._cv2_read_loop()

    def _v4l2_sync_loop(self):
        """Jetson: 从 V4L2RawReader 同步帧状态，不解码、不重编码。"""
        while self.is_running:
            src = self._v4l2_source
            if src is None or not src.is_connected:
                time.sleep(0.5)
                continue
            if hasattr(src, 'get_raw_mjpeg_with_version'):
                raw, raw_version = src.get_raw_mjpeg_with_version()
            else:
                raw = src.get_raw_mjpeg()
                raw_version = getattr(src, 'frame_version', 0)
            if hasattr(src, 'get_bgr_frame_with_version'):
                bgr, bgr_version = src.get_bgr_frame_with_version()
            else:
                bgr = src.get_bgr_frame()
                bgr_version = getattr(src, 'frame_version', 0)
            if raw is None and bgr is None:
                time.sleep(0.005)
                continue
            with self.lock:
                if bgr is not None:
                    self.current_frame = bgr
                    self.frame_version = bgr_version
                if raw is not None:
                    self._raw_mjpeg = raw
                    self._raw_mjpeg_version = raw_version
                self.last_frame_time = datetime.now()
                self.is_connected = True
                self.error_count = 0
            time.sleep(0.003)

    def _cv2_read_loop(self):
        reconnect_delay = self.reconnect_interval  # B6: 动态退避延迟
        while self.is_running:
            # 如果未连接，尝试连接
            if not self.is_connected:
                if self._connect():
                    self.error_count = 0  # 重置错误计数
                    reconnect_delay = self.reconnect_interval  # B6: 成功后重置退避
                else:
                    if self.auto_reconnect:
                        logger.info(
                            "Retrying connection to stream %s in %.1fs (backoff)",
                            self.stream_id, reconnect_delay,
                        )
                        time.sleep(reconnect_delay)
                        # B6修复：指数退避，1s→2s→4s→...→封顶30s
                        reconnect_delay = min(reconnect_delay * 2, 30)
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
                    self.frame_version += 1
                
                # 控制读取频率
                if self.low_latency:
                    # V4L2/RTSP 的 read() 本身会阻塞到下一帧；这里不能连续读多帧再只发布
                    # 最后一帧，否则 frame_version 会按“批次”增长，MJPEG 去重后显示帧率被压低。
                    time.sleep(0.001)
                else:
                    time.sleep(0.033)   # 普通模式：约 30 FPS
                
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
        """获取当前帧（返回副本，可安全修改）"""
        with self.lock:
            return self.current_frame.copy() if self.current_frame is not None else None

    def get_frame_ref(self) -> Optional[np.ndarray]:
        """获取当前帧引用（零拷贝，仅供只读消费者使用）。

        _read_loop 写入时是 self.current_frame = frame（整体替换引用），
        读线程拿到的引用指向的旧数组不会被修改，因此只读场景下线程安全。
        """
        with self.lock:
            return self.current_frame

    def set_raw_mjpeg(self, data: bytes):
        """V4L2RawReader 喂入原始 MJPEG 字节（Jetson 专用）。"""
        with self.lock:
            self._raw_mjpeg = data
            self._raw_mjpeg_version += 1

    def get_raw_mjpeg(self) -> Optional[bytes]:
        """获取原始 MJPEG 字节，可直接推给浏览器，零 CPU 编码。"""
        with self.lock:
            return self._raw_mjpeg

    def get_raw_mjpeg_version(self) -> int:
        """获取原始 MJPEG 版本号。用于显示流按原始帧去重。"""
        with self.lock:
            return self._raw_mjpeg_version

    def get_or_encode_jpeg(self, frame_version: int, quality: int,
                           target_width: int) -> Optional[bytes]:
        """获取帧的 JPEG 字节。优先返回原始 MJPEG（零 CPU），其次查缓存，
        最后走 cv2.imencode 编码路径。缓存按帧版本号自动失效。"""
        # 1) 原始 MJPEG 优先（Jetson V4L2RawReader 路径，零 CPU）
        raw = self.get_raw_mjpeg()
        if raw is not None:
            return raw

        # 2) 查共享编码缓存（多 tab 复用同一次 cv2.imencode）
        cache_key = (frame_version, quality, target_width)
        with self.lock:
            cached = self._encode_cache.get(cache_key)
        if cached is not None:
            return cached

        # 3) 编码并缓存（用 get_frame_ref 零拷贝，因为后续会缩放/编码生成新数组）
        frame = self.get_frame_ref()
        if frame is None:
            return None
        if target_width > 0 and frame.shape[1] > target_width:
            h, w = frame.shape[:2]
            frame = cv2.resize(
                frame, (target_width, int((target_width / w) * h)),
                interpolation=cv2.INTER_AREA,
            )
        _, jpeg = cv2.imencode(
            '.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, quality],
        )
        result = jpeg.tobytes()
        with self.lock:
            self._encode_cache[cache_key] = result
            # 清理旧版本缓存，只保留当前帧版本
            stale = [k for k in self._encode_cache if k[0] != frame_version]
            for k in stale:
                del self._encode_cache[k]
        return result
    
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
    """流媒体管理器
    
    进程级单例。若使用 gunicorn --workers > 1，每个 worker 有独立实例，
    会导致多 reader 竞争同一设备。Jetson 部署强制 --workers 1。
    """
    
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
            self._streams_lock = threading.Lock()
            self.initialized = True
            logger.info("StreamManager initialized")
    
    def add_stream(self, stream_id: str, url: str, auto_reconnect: bool = True,
                   reconnect_interval: int = 5, low_latency: bool = False) -> bool:
        """添加并启动流媒体源"""
        # 总是先清理旧流（remove_stream 对不存在的 key 安全，pop 返回 None）
        self.remove_stream(stream_id)

        # 创建新的流读取器
        reader = StreamReader(stream_id, url, auto_reconnect, reconnect_interval, low_latency)

        # Jetson 本地摄像头：尝试 V4L2 原始 MJPEG 采集（零 CPU 显示路径）
        if url.startswith('/dev/video') and os.path.exists('/etc/nv_tegra_release'):
            from .v4l2_raw_reader import V4L2RawReader
            v4l2 = V4L2RawReader(url)
            if v4l2.start():
                reader._v4l2_source = v4l2
                reader.is_connected = True
                reader.is_running = True
                reader.thread = threading.Thread(
                    target=reader._v4l2_sync_loop, daemon=True,
                )
                reader.thread.start()
                logger.info("Stream %s: 使用 V4L2 原始 MJPEG 采集（零 CPU 显示）", stream_id)
            else:
                logger.warning(
                    "Stream %s: V4L2 原始 MJPEG 启动失败，回退 OpenCV: %s",
                    stream_id,
                    v4l2.error_message,
                )

        # V4L2 未启用时走 cv2 路径
        if reader._v4l2_source is None:
            success = reader.start()
            if not success:
                logger.error("Failed to start stream %s", stream_id)
                return False

        with self._streams_lock:
            self.streams[stream_id] = reader
            logger.info("Stream %s added and started", stream_id)
        return True
    
    def remove_stream(self, stream_id: str):
        """移除流媒体源（stop 在锁外执行，避免 join 阻塞其他线程）"""
        with self._streams_lock:
            reader = self.streams.pop(stream_id, None)
        if reader is not None:
            reader.stop()
            logger.info(f"Stream {stream_id} removed")
    
    def get_stream(self, stream_id: str) -> Optional[StreamReader]:
        """获取流读取器"""
        with self._streams_lock:
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
        with self._streams_lock:
            return {
                stream_id: reader.get_status()
                for stream_id, reader in self.streams.items()
            }
    
    def stop_all_streams(self):
        """停止所有流"""
        with self._streams_lock:
            stream_ids = list(self.streams.keys())
        for stream_id in stream_ids:
            self.remove_stream(stream_id)
        logger.info("All streams stopped")


# 全局流管理器实例
stream_manager = StreamManager()
