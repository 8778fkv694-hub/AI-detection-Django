"""MJPEG 零编解码透传方案。

设计：
    USB 摄像头硬件 → MJPG 帧 → ffmpeg(-c:v copy -f mpjpeg) → HTTP → 浏览器 <img>

    全程 jetson CPU 不解码、不重编码 JPEG。
    只有摄像头 USB 控制器、ffmpeg 容器封装、Linux 网络栈，
    实测 Jetson Orin Nano CPU < 5%。

兼容性：
    - 仅适用于本地 /dev/video* 设备（USB 摄像头硬件 MJPG 输出）
    - RTSP / RTMP / 其他源仍走原 cv2 编码路径
    - 一台摄像头同一时刻只能被一个 ffmpeg 进程持有，因此进入透传时会
      暂停 stream_service 的 cv2 reader，断开时再恢复
"""
import logging
import shlex
import subprocess
import threading
import time

from django.http import StreamingHttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt

from .stream_service import stream_manager
from .stream_models import StreamSource

logger = logging.getLogger(__name__)


# 一台摄像头一把锁，避免两个 ffmpeg 同时抢 /dev/videoX
_DEVICE_LOCKS: dict[str, threading.Lock] = {}
_DEVICE_LOCKS_GUARD = threading.Lock()


def _device_lock(device: str) -> threading.Lock:
    with _DEVICE_LOCKS_GUARD:
        if device not in _DEVICE_LOCKS:
            _DEVICE_LOCKS[device] = threading.Lock()
        return _DEVICE_LOCKS[device]


def _resolve_device(stream_id: str) -> tuple[str | None, dict | None]:
    """根据 stream_id 找出底层设备路径与流元数据。"""
    try:
        src = StreamSource.objects.get(id=stream_id, enabled=True)
    except StreamSource.DoesNotExist:
        return None, None
    return src.url, {
        'name': src.name,
        'auto_reconnect': src.auto_reconnect,
        'reconnect_interval': src.reconnect_interval,
    }


def _build_ffmpeg_cmd(device: str, width: int, height: int, fps: int) -> list[str]:
    """构造 ffmpeg passthrough 命令。

    关键参数：
        -input_format mjpeg : 强制 v4l2 拿 MJPG 而不是 YUYV（关键，否则一切作废）
        -c:v copy           : 不重编码，原 JPEG 字节直接转发
        -f mpjpeg           : 输出 multipart/x-mixed-replace 容器，浏览器 <img> 可直接消费
        pipe:1              : 输出到 stdout
    """
    cmd = [
        'ffmpeg', '-hide_banner', '-loglevel', 'error',
        '-fflags', 'nobuffer', '-flags', 'low_delay',
        '-f', 'v4l2',
        '-input_format', 'mjpeg',
        '-video_size', f'{width}x{height}',
        '-framerate', str(fps),
        '-i', device,
        '-c:v', 'copy',
        '-f', 'mpjpeg',
        '-an',  # 没有音频
        'pipe:1',
    ]
    return cmd


def _stream_ffmpeg_output(proc: subprocess.Popen):
    """把 ffmpeg stdout 按块直接转发给 HTTP 客户端。

    这里**不解析 multipart 帧**，让浏览器 <img> 自己处理 boundary。
    用 8KB 块避免 chunk 太小拖累内核 sendfile 优化。
    """
    try:
        while True:
            chunk = proc.stdout.read(8192)
            if not chunk:
                break
            yield chunk
    except (BrokenPipeError, ConnectionResetError):
        # 客户端断开是正常情况
        pass
    finally:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                proc.kill()


@csrf_exempt
def mjpeg_passthrough_view(request, stream_id):
    """MJPEG 零编解码透传端点。

    URL: /api/streams/<stream_id>/mjpeg/
    Query:
        width  (默认 1280)
        height (默认 720)
        fps    (默认 25)
    """
    # USB 摄像头 MJPG 必须给 ffmpeg 一个具体分辨率，width=0 当作"用默认"
    width = int(request.GET.get('width', 1280)) or 1280
    height = int(request.GET.get('height', 720)) or 720
    fps = max(1, min(60, int(request.GET.get('fps', 25))))
    # 摄像头原生支持的分辨率档（USB cam）：3840x2160 / 2560x1440 / 1920x1080 / 1280x720 / 640x480
    # 如果传进来一个非标准宽度，强制对齐到 720p（最稳）
    if width not in (640, 1280, 1920, 2560, 3840):
        width, height = 1280, 720

    device, meta = _resolve_device(stream_id)
    if not device:
        return JsonResponse({'error': '流不存在或未启用'}, status=404)

    # 仅本地 /dev/video* 走 passthrough；其他源回退老路径（旧 mjpeg_view）
    if not device.startswith('/dev/video'):
        from .mjpeg_view import mjpeg_stream
        return mjpeg_stream(request, stream_id)

    lock = _device_lock(device)
    if not lock.acquire(blocking=False):
        return JsonResponse({'error': f'设备 {device} 已被占用'}, status=409)

    # 暂停 cv2 reader（如果存在），让出设备
    cv2_was_running = stream_id in stream_manager.streams
    if cv2_was_running:
        logger.info("Pausing cv2 reader on %s for ffmpeg passthrough", device)
        stream_manager.remove_stream(stream_id)

    cmd = _build_ffmpeg_cmd(device, width, height, fps)
    logger.info("Starting ffmpeg passthrough: %s", shlex.join(cmd))

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            bufsize=0,
        )
    except FileNotFoundError:
        lock.release()
        return JsonResponse({'error': 'ffmpeg 未安装'}, status=500)

    # 等 0.5s 看 ffmpeg 是否立刻挂掉（设备被占、参数错等）
    time.sleep(0.5)
    if proc.poll() is not None:
        lock.release()
        if cv2_was_running:
            _restart_cv2_reader(stream_id, device, meta)
        return JsonResponse({
            'error': f'ffmpeg 启动失败 (exit={proc.returncode})',
        }, status=500)

    def cleanup_after_stream():
        try:
            yield from _stream_ffmpeg_output(proc)
        finally:
            lock.release()
            if cv2_was_running:
                _restart_cv2_reader(stream_id, device, meta)
            logger.info("ffmpeg passthrough ended for %s", device)

    response = StreamingHttpResponse(
        cleanup_after_stream(),
        content_type='multipart/x-mixed-replace; boundary=ffmpeg',
    )
    response['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response['Access-Control-Allow-Origin'] = '*'
    response['X-Accel-Buffering'] = 'no'  # 关掉任何反向代理的缓冲
    return response


def _restart_cv2_reader(stream_id, device, meta):
    """ffmpeg 透传结束后，重新拉起 cv2 reader 给 AI 推理用。"""
    try:
        stream_manager.add_stream(
            stream_id=stream_id,
            url=device,
            auto_reconnect=meta.get('auto_reconnect', True),
            reconnect_interval=meta.get('reconnect_interval', 5),
            low_latency=False,
        )
    except Exception as e:
        logger.warning("Failed to restart cv2 reader for %s: %s", device, e)
