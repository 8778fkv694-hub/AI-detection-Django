"""
V4L2 原始 MJPEG 读取器（Jetson 专用）

通过 v4l2-ctl 的 mmap streaming 从 /dev/video* 读取摄像头硬件编码的 MJPEG 字节，不解码。
缓存原始字节给 MJPEG 显示（零 CPU），仅按需 cv2.imdecode 一份 BGR 给 AI 推理。

为什么不用 cv2.VideoCapture：
  cv2.VideoCapture.read() 内部把 MJPEG→BGR 解码后丢掉了原始字节，
  显示侧又得 BGR→JPEG 重编码一遍。Jetson ARM 没有硬件 JPEG 加速，
  单帧 1080p imencode 耗时 50-100ms，多开一个页面就多一倍 CPU。
  直接从 V4L2 读原始 MJPEG 字节推给浏览器，彻底砍掉重编码。

蓝军审查要点：
  - JPEG 帧边界通过 SOI(FFD8)/EOI(FFD9) 识别，JPEG 规范保证这两个标记
    不会出现在熵编码数据中（字节填充：FF→FF00），不会误匹配。
  - 缓冲区积压防护：超过 MAX_BUF 字节后强制对齐到下一个 SOI，防止 OOM。
  - 后台进程 stdout 只输出 MJPEG 字节，stderr 单独 drain，避免状态输出阻塞。
  - 只用于 Jetson 本地 /dev/video* 摄像头，RTSP/视频文件仍走 cv2 路径。
"""

import os
import subprocess
import threading
import time
import logging
from typing import Optional, Dict, Any, Tuple

import numpy as np
import cv2

logger = logging.getLogger(__name__)

# 仅在 Jetson 平台导入此模块时可用
IS_JETSON = os.path.exists('/etc/nv_tegra_release')


class V4L2RawReader:
    """直接从 V4L2 设备读取原始 MJPEG 帧，不解码、不重编码。"""

    def __init__(self, device: str, width: int = 1920, height: int = 1080,
                 fps: int = 30, max_decode_fps: int = 15):
        self.device = device
        self.width = width
        self.height = height
        self.fps = fps
        self.max_decode_fps = max_decode_fps  # YOLO 只需 10-15fps，解码可降频
        self._min_decode_interval = 1.0 / max_decode_fps if max_decode_fps > 0 else 0
        self._last_decode_time: float = 0.0
        self.proc: Optional[subprocess.Popen] = None
        self.raw_bytes: Optional[bytes] = None       # 原始 MJPEG，直接推浏览器
        self.bgr_frame: Optional[np.ndarray] = None  # cv2.imdecode 解码，给 AI
        self.raw_frame_version: int = 0              # 每个原始 MJPEG 帧递增
        self.bgr_frame_version: int = 0              # 仅在 BGR 解码帧更新时递增
        self.frame_version: int = 0                  # 兼容旧接口：等同 bgr_frame_version
        self.is_running: bool = False
        self.is_connected: bool = False
        self.last_frame_time: float = 0.0
        self.error_message: str = ''
        self.error_count: int = 0
        self._lock = threading.Lock()
        self._thread: Optional[threading.Thread] = None
        self._stderr_thread: Optional[threading.Thread] = None
        self._stderr_tail: str = ''

    def _configure_device(self) -> bool:
        """用 v4l2-ctl 配置摄像头为 MJPG 格式。幂等：已配好时无副作用。"""
        try:
            subprocess.run(
                [
                    'v4l2-ctl', '-d', self.device,
                    '--set-fmt-video',
                    f'width={self.width},height={self.height},pixelformat=MJPG',
                    f'--set-parm={self.fps}',
                ],
                check=True, capture_output=True, timeout=10,
            )
            return True
        except FileNotFoundError:
            logger.error("v4l2-ctl 未安装，无法配置 V4L2 设备 %s", self.device)
            return False
        except subprocess.CalledProcessError as e:
            stderr = e.stderr.decode(errors='replace') if e.stderr else ''
            logger.error("v4l2-ctl 配置 %s 失败: %s", self.device, stderr.strip())
            return False
        except Exception as e:
            logger.error("v4l2-ctl 异常: %s", e)
            return False

    def start(self) -> bool:
        """启动 V4L2 读取线程。失败返回 False，调用者应回退到 cv2 路径。"""
        if not IS_JETSON:
            self.error_message = '非 Jetson 平台，V4L2RawReader 不可用'
            return False

        if not self._configure_device():
            self.error_message = f'V4L2 配置失败: {self.device}'
            return False

        try:
            # uvcvideo 摄像头通常不支持 read() I/O（v4l2-ctl --all 显示 Read buffers: 0），
            # 但支持 mmap streaming。用 v4l2-ctl 持有设备并把原始 MJPEG 写到 stdout，
            # Python 只负责拆 JPEG 帧，不做 BGR->JPEG 重编码。
            self.proc = subprocess.Popen(
                [
                    'v4l2-ctl', '-d', self.device,
                    '--stream-mmap=4',
                    '--stream-count=0',
                    '--stream-to=-',
                    '--stream-poll',
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                bufsize=0,
            )
        except FileNotFoundError:
            self.error_message = 'v4l2-ctl 未安装，无法启动 mmap streaming'
            return False
        except OSError as e:
            self.error_message = f'无法启动 mmap streaming {self.device}: {e}'
            return False

        self.is_running = True
        self.is_connected = True
        self._thread = threading.Thread(
            target=self._read_loop, daemon=True,
            name=f'v4l2-raw-{os.path.basename(self.device)}',
        )
        self._stderr_thread = threading.Thread(
            target=self._drain_stderr, daemon=True,
            name=f'v4l2-raw-stderr-{os.path.basename(self.device)}',
        )
        self._stderr_thread.start()
        self._thread.start()

        # 等待首帧就绪
        for _ in range(30):
            if self.bgr_frame is not None:
                return True
            if self.proc and self.proc.poll() is not None:
                break
            time.sleep(0.1)
        detail = f': {self._stderr_tail.strip()}' if self._stderr_tail.strip() else ''
        self.error_message = f'V4L2 mmap 首帧超时或进程退出{detail}'
        self.stop()
        return False

    def stop(self):
        """停止读线程并关闭设备。"""
        self.is_running = False
        if self._thread:
            self._thread.join(timeout=3.0)
            self._thread = None
        if self.proc is not None:
            try:
                self.proc.terminate()
                self.proc.wait(timeout=2.0)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                self.proc.wait(timeout=2.0)
            except Exception:
                pass
            self.proc = None
        if self._stderr_thread:
            self._stderr_thread.join(timeout=1.0)
            self._stderr_thread = None
        self.is_connected = False

    def _drain_stderr(self):
        """消费 v4l2-ctl 的状态输出，避免 stderr pipe 填满导致采集阻塞。"""
        proc = self.proc
        if proc is None or proc.stderr is None:
            return
        try:
            while self.is_running:
                chunk = proc.stderr.read(256)
                if not chunk:
                    break
                text = chunk.decode(errors='replace')
                self._stderr_tail = (self._stderr_tail + text)[-1000:]
        except Exception:
            pass

    @staticmethod
    def _split_jpeg(buf: bytearray) -> tuple:
        """从字节流中提取第一个完整 JPEG 帧。

        返回 (frame_bytes, remaining_buf)。
        frame_bytes 为 None 表示尚未收到完整帧（等待更多数据）。
        缓冲区头部到第一个 SOI 之前的垃圾字节会被丢弃。
        """
        soi = buf.find(b'\xff\xd8')
        if soi == -1:
            return None, bytearray()
        if soi > 0:
            buf = buf[soi:]  # 丢弃 SOI 之前的碎片
        eoi = buf.find(b'\xff\xd9', 2)
        if eoi == -1:
            return None, buf  # 保留不完整帧等待后续数据
        frame = bytes(buf[:eoi + 2])
        rest = buf[eoi + 2:]
        return frame, rest

    def _read_loop(self):
        """V4L2 mmap 读取主循环，从 v4l2-ctl stdout 拆分完整 MJPEG 帧。"""
        buf = bytearray()
        READ_SIZE = 256 * 1024         # stdout 分块读取；JPEG 帧可跨块拼接
        MAX_BUF = 4 * 1024 * 1024      # 积压上限，超过后强制对齐防止 OOM

        while self.is_running:
            try:
                proc = self.proc
                if proc is None or proc.stdout is None:
                    break
                chunk = proc.stdout.read(READ_SIZE)
                if not chunk:
                    if proc.poll() is not None:
                        self.error_message = (
                            f'v4l2-ctl streaming exited with code {proc.returncode}: '
                            f'{self._stderr_tail.strip()}'
                        )
                        self.error_count += 1
                        break
                    time.sleep(0.01)
                    continue
                buf.extend(chunk)

                # 缓冲区积压防护：丢弃最旧的碎片，从最新 SOI 开始
                if len(buf) > MAX_BUF:
                    soi = buf.find(b'\xff\xd8')
                    if soi > 0:
                        buf = buf[soi:]
                    if len(buf) > MAX_BUF:
                        buf = bytearray()

                # 一次尽可能多地提取完整帧（追帧，不积压）
                while True:
                    frame_bytes, buf = self._split_jpeg(buf)
                    if frame_bytes is None:
                        break
                    # 原始 MJPEG 字节始终更新（零成本，直接推浏览器）
                    with self._lock:
                        self.raw_bytes = frame_bytes
                        self.raw_frame_version += 1
                        raw_version = self.raw_frame_version
                        self.last_frame_time = time.time()
                    # BGR 解码降频：YOLO 只消费 ~15fps，摄像头 30fps 时每两帧解码一次
                    now = time.time()
                    if now - self._last_decode_time >= self._min_decode_interval:
                        bgr = cv2.imdecode(
                            np.frombuffer(frame_bytes, np.uint8),
                            cv2.IMREAD_COLOR,
                        )
                        if bgr is not None:
                            with self._lock:
                                self.bgr_frame = bgr
                                self.bgr_frame_version = raw_version
                                self.frame_version = self.bgr_frame_version
                            self._last_decode_time = now

            except OSError as e:
                self.error_message = f'V4L2 读取错误: {e}'
                self.error_count += 1
                logger.error("V4L2RawReader %s: %s", self.device, e)
                time.sleep(0.5)
            except Exception as e:
                self.error_message = str(e)
                self.error_count += 1
                logger.error("V4L2RawReader %s: 未知错误: %s", self.device, e,
                             exc_info=True)
                time.sleep(0.5)

    # ---- 数据访问接口 ----

    def get_raw_mjpeg(self) -> Optional[bytes]:
        """原始 MJPEG 字节，可直推浏览器，零 CPU。"""
        with self._lock:
            return self.raw_bytes

    def get_raw_mjpeg_with_version(self) -> Tuple[Optional[bytes], int]:
        """返回原始 MJPEG 字节及其版本号。"""
        with self._lock:
            return self.raw_bytes, self.raw_frame_version

    def get_bgr_frame(self) -> Optional[np.ndarray]:
        """解码后的 BGR 帧，给 YOLO/OCR 等 AI 推理用。"""
        with self._lock:
            return self.bgr_frame

    def get_bgr_frame_with_version(self) -> Tuple[Optional[np.ndarray], int]:
        """返回 BGR 帧及其版本号。版本仅在解码帧更新时变化。"""
        with self._lock:
            return self.bgr_frame, self.bgr_frame_version

    def get_frame_ref(self) -> Optional[np.ndarray]:
        """兼容 StreamReader.get_frame_ref() 接口。"""
        return self.get_bgr_frame()

    def get_status(self) -> Dict[str, Any]:
        with self._lock:
            return {
                'is_connected': self.is_connected,
                'is_running': self.is_running,
                'frame_version': self.frame_version,
                'raw_frame_version': self.raw_frame_version,
                'bgr_frame_version': self.bgr_frame_version,
                'last_frame_time': self.last_frame_time,
                'error_message': self.error_message,
                'error_count': self.error_count,
                'raw_bytes_size': len(self.raw_bytes) if self.raw_bytes else 0,
            }
