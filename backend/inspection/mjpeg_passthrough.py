"""MJPEG 零编解码透传方案。

设计：
    USB 摄像头硬件 → MJPG 帧 → ffmpeg(-c:v copy -f mpjpeg) → HTTP → 浏览器 <img>

    全程 jetson CPU 不解码、不重编码 JPEG。
    只有摄像头 USB 控制器、ffmpeg 容器封装、Linux 网络栈，
    实测 Jetson Orin Nano CPU < 5%。

兼容性：
    - 仅适用于本地 /dev/video* 设备（USB 摄像头硬件 MJPG 输出）
    - RTSP / RTMP / 其他源仍走原 cv2 编码路径

并发与资源回收：
    - 每个 device 同时只能被一个 ffmpeg 持有；新请求来直接驱逐旧 ffmpeg
      （单用户 kiosk「后来者覆盖」语义：浏览器刷新就该恢复，不应 409）
    - ffmpeg 放在新进程组（start_new_session=True），用 killpg 整组干掉，
      杜绝僵尸/孤儿（之前的 bug 根因：StreamingHttpResponse 生成器没被 GC
      → finally 不跑 → ffmpeg 永远活着 → /dev/video0 一直被占）
"""
import logging
import os
import shlex
import signal
import subprocess
import threading
import time
from typing import Optional

from django.http import StreamingHttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt

from .stream_service import stream_manager
from .stream_models import StreamSource

logger = logging.getLogger(__name__)


# device -> 当前持有该 v4l2 设备的 ffmpeg Popen
_ACTIVE_PROCS: dict[str, subprocess.Popen] = {}
_REGISTRY_GUARD = threading.Lock()


# Linux prctl 常量（不同 libc 都是这个值）
_PR_SET_PDEATHSIG = 1


def _set_pdeathsig() -> None:
    """preexec_fn：在 fork-exec 之间运行，告诉内核「我父进程死了请也杀我」。
    这是处理孤儿 ffmpeg 的最后防线——Django worker 崩了，
    ffmpeg 不会被 init 收养继续占摄像头。
    """
    try:
        import ctypes
        libc = ctypes.CDLL('libc.so.6', use_errno=True)
        libc.prctl(_PR_SET_PDEATHSIG, signal.SIGTERM, 0, 0, 0)
    except Exception:
        # 非 Linux 或 libc 找不到时静默失败——主流程仍能跑
        pass


def _reap_orphans_at_startup() -> None:
    """模块加载时清扫前一个 worker 实例遗留的 ffmpeg。

    匹配规则严格——必须是「ffmpeg ... -f mpjpeg ... pipe:1」这种形式
    （我们这个模块特有的命令模式），避免误杀用户自己启的 ffmpeg。
    """
    try:
        out = subprocess.run(
            ['pgrep', '-af', 'ffmpeg.*-i /dev/video.*-f mpjpeg.*pipe:1'],
            capture_output=True, text=True, timeout=2,
        )
    except Exception:
        return
    for line in out.stdout.splitlines():
        try:
            pid = int(line.split(None, 1)[0])
        except (ValueError, IndexError):
            continue
        try:
            os.kill(pid, signal.SIGTERM)
            logger.warning("Reaped orphan ffmpeg pid=%d at startup", pid)
        except ProcessLookupError:
            pass


_reap_orphans_at_startup()


def _kill_proc_tree(proc: subprocess.Popen, timeout: float = 2.0) -> None:
    """杀进程组（不仅是 ffmpeg 自己，连同它的所有子孙）。"""
    if proc.poll() is not None:
        return
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
    except (ProcessLookupError, PermissionError):
        try:
            proc.terminate()
        except Exception:
            pass
    try:
        proc.wait(timeout=timeout)
        return
    except subprocess.TimeoutExpired:
        pass
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
    except ProcessLookupError:
        pass
    try:
        proc.kill()
    except Exception:
        pass
    try:
        proc.wait(timeout=1)
    except subprocess.TimeoutExpired:
        pass


def _evict_holder(device: str) -> None:
    """新请求进来前先清掉这个 device 上的旧 ffmpeg（活的或死的）。"""
    with _REGISTRY_GUARD:
        old = _ACTIVE_PROCS.pop(device, None)
    if old is None:
        return
    if old.poll() is None:
        logger.warning("Evicting active ffmpeg pid=%d for %s", old.pid, device)
        _kill_proc_tree(old)
    else:
        logger.info("Reaping dead ffmpeg pid=%d for %s (exit=%d)",
                    old.pid, device, old.returncode)


def _release_holder(device: str, proc: subprocess.Popen) -> None:
    """流自然结束 / 客户端断连后调用。仅在我们仍是登记者时移除。"""
    with _REGISTRY_GUARD:
        if _ACTIVE_PROCS.get(device) is proc:
            _ACTIVE_PROCS.pop(device, None)


def _resolve_device(stream_id: str) -> tuple[Optional[str], Optional[dict]]:
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
    return [
        'ffmpeg', '-hide_banner', '-loglevel', 'error',
        '-fflags', 'nobuffer', '-flags', 'low_delay',
        '-f', 'v4l2',
        '-input_format', 'mjpeg',
        '-video_size', f'{width}x{height}',
        '-framerate', str(fps),
        '-i', device,
        '-c:v', 'copy',
        '-f', 'mpjpeg',
        '-an',
        'pipe:1',
    ]


def _stream_ffmpeg_output(proc: subprocess.Popen, device: str):
    """把 ffmpeg stdout 按块直接转发给 HTTP 客户端。

    finally 里**一定**杀进程组 + 解登记。即便客户端突然消失，
    BrokenPipeError 触发后这里会把 ffmpeg 干净收掉。
    """
    try:
        while True:
            chunk = proc.stdout.read(8192)
            if not chunk:
                break
            yield chunk
    except (BrokenPipeError, ConnectionResetError):
        pass
    finally:
        _kill_proc_tree(proc)
        _release_holder(device, proc)


@csrf_exempt
def mjpeg_passthrough_view(request, stream_id):
    """MJPEG 零编解码透传端点。

    URL: /api/streams/<stream_id>/mjpeg/
    Query:
        width  (默认 1280)
        height (默认 720)
        fps    (默认 10, 前端显示用低帧率减轻 Jetson 负担)
    """
    # USB 摄像头 MJPG 必须给 ffmpeg 一个具体分辨率，width=0 当作"用默认"
    width = int(request.GET.get('width', 1280)) or 1280
    height = int(request.GET.get('height', 720)) or 720
    fps = max(1, min(30, int(request.GET.get('fps', 10))))  # 默认10fps，前端显示不需要高帧率
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

    # 关键：清掉任何旧 ffmpeg（这就是 409 bug 的根本修复）
    # 等 50ms 让内核完成 v4l2 解绑，否则新 ffmpeg open 设备会 EBUSY
    _evict_holder(device)
    time.sleep(0.05)

    # 暂停 cv2 reader（如果存在），让出设备
    cv2_was_running = stream_manager.get_stream(stream_id) is not None
    if cv2_was_running:
        logger.info("Pausing cv2 reader on %s for ffmpeg passthrough", device)
        stream_manager.remove_stream(stream_id)

    cmd = _build_ffmpeg_cmd(device, width, height, fps)
    logger.info("Starting ffmpeg passthrough: %s", shlex.join(cmd))

    try:
        # start_new_session=True：让 ffmpeg 成为新进程组组长，便于 killpg 整组
        # preexec_fn=_set_pdeathsig：父进程（Django worker）一旦死掉，
        # 内核立刻给 ffmpeg 发 SIGTERM，避免变成 init 收养的孤儿
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            bufsize=0,
            start_new_session=True,
            preexec_fn=_set_pdeathsig,
        )
    except FileNotFoundError:
        if cv2_was_running:
            _restart_cv2_reader(stream_id, device, meta)
        return JsonResponse({'error': 'ffmpeg 未安装'}, status=500)

    # 等 200ms 看 ffmpeg 是否立刻挂掉（设备被占、参数错等）
    time.sleep(0.2)
    if proc.poll() is not None:
        if cv2_was_running:
            _restart_cv2_reader(stream_id, device, meta)
        return JsonResponse({
            'error': f'ffmpeg 启动失败 (exit={proc.returncode})',
        }, status=500)

    # 登记到 active procs，下次请求来时能驱逐我们
    with _REGISTRY_GUARD:
        _ACTIVE_PROCS[device] = proc

    def cleanup_after_stream():
        try:
            yield from _stream_ffmpeg_output(proc, device)
        finally:
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
        # 恢复原始 low_latency 配置（默认 True，与 _start_stream 一致）
        original_low_latency = meta.get('low_latency', True)
        stream_manager.add_stream(
            stream_id=stream_id,
            url=device,
            auto_reconnect=meta.get('auto_reconnect', True),
            reconnect_interval=meta.get('reconnect_interval', 5),
            low_latency=original_low_latency,
        )
    except Exception as e:
        logger.warning("Failed to restart cv2 reader for %s: %s", device, e)
