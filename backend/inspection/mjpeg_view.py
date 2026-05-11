"""
MJPEG 直推流视图
直接将摄像头 JPEG 帧通过 multipart/x-mixed-replace 推送到浏览器，
零 base64 编码开销、零 JSON 包装，延迟最低。
"""
import time
import cv2
import logging
from django.http import StreamingHttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt

from .stream_service import stream_manager

logger = logging.getLogger(__name__)


def _mjpeg_generator(stream_id: str, quality: int = 75, target_width: int = 960,
                     fps: int = 12, enhance: bool = False):
    """生成 MJPEG 帧流。

    默认对 Jetson 友好：960px / quality=75 / 12fps / 不做颜色校正。
    aarch64 没有硬件 JPEG 加速，单核 imencode 1080p quality=95 单帧 80-150ms，
    根本撑不到 25fps，反而把 worker 锁死 100% CPU。
    """
    reader = stream_manager.get_stream(stream_id)
    if reader is None:
        return

    frame_interval = 1.0 / fps
    encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), quality]
    last_seen_id = -1  # 帧去重，避免相同帧反复编码

    while reader.is_running:
        frame = reader.get_frame()
        if frame is None:
            time.sleep(0.05)
            continue

        # 用帧版本号去重：同一帧不重复编码 + 推送
        version = getattr(reader, 'frame_version', 0)
        if version == last_seen_id:
            time.sleep(0.01)
            continue
        last_seen_id = version

        # 颜色校正按需开启（USB 摄像头偏绿才需要），默认关掉省 CPU
        if enhance:
            frame = reader._enhance_display_frame(frame)

        # 先缩放再编码：缩到 960px 后 JPEG 编码 4-5x 快
        if target_width > 0 and frame.shape[1] > target_width:
            h, w = frame.shape[:2]
            target_h = int((target_width / w) * h)
            frame = cv2.resize(frame, (target_width, target_h), interpolation=cv2.INTER_AREA)

        ret, jpeg = cv2.imencode('.jpg', frame, encode_param)
        if not ret:
            continue

        yield (
            b'--frame\r\n'
            b'Content-Type: image/jpeg\r\n'
            b'Content-Length: ' + str(len(jpeg)).encode() + b'\r\n'
            b'\r\n' + jpeg.tobytes() + b'\r\n'
        )

        time.sleep(frame_interval)


@csrf_exempt
def mjpeg_stream(request, stream_id):
    """MJPEG 直推流端点

    URL: /api/streams/<stream_id>/mjpeg/
    查询参数:
        quality: JPEG 质量 1-100 (默认 85)
        width:   目标宽度 (默认 1280, 0=不缩放)
        fps:     帧率 (默认 20)
    """
    # 检查流是否存在
    reader = stream_manager.get_stream(stream_id)

    # 如果流不存在，尝试从数据库查找并启动
    if reader is None:
        try:
            from .stream_models import StreamSource
            source = StreamSource.objects.get(id=stream_id, enabled=True)
            url = source.url
            if source.username and source.password and '://' in url:
                protocol, rest = url.split('://', 1)
                url = f"{protocol}://{source.username}:{source.password}@{rest}"
            stream_manager.add_stream(
                stream_id=stream_id,
                url=url,
                auto_reconnect=source.auto_reconnect,
                reconnect_interval=source.reconnect_interval,
                low_latency=True,
            )
            reader = stream_manager.get_stream(stream_id)
        except Exception as e:
            logger.error("Failed to auto-start stream %s: %s", stream_id, e)

    if reader is None or not reader.is_running:
        return JsonResponse({'error': '流媒体未运行'}, status=503)

    quality = int(request.GET.get('quality', 75))
    quality = max(1, min(100, quality))
    width = int(request.GET.get('width', 960))
    fps = int(request.GET.get('fps', 12))
    fps = max(1, min(60, fps))
    enhance = request.GET.get('enhance', '0') in ('1', 'true', 'True')

    response = StreamingHttpResponse(
        _mjpeg_generator(stream_id, quality, width, fps, enhance),
        content_type='multipart/x-mixed-replace; boundary=frame',
    )
    response['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response['Access-Control-Allow-Origin'] = '*'
    return response
