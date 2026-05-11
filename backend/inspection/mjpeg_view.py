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


def _mjpeg_generator(stream_id: str, quality: int = 85, target_width: int = 1280, fps: int = 20):
    """生成 MJPEG 帧流"""
    reader = stream_manager.get_stream(stream_id)
    if reader is None:
        return

    frame_interval = 1.0 / fps
    encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), quality]

    while reader.is_running:
        frame = reader.get_frame()
        if frame is None:
            time.sleep(0.05)
            continue

        # 颜色校正（使用已优化的 LUT 方法）
        frame = reader._enhance_display_frame(frame)

        # 缩放
        if target_width > 0 and frame.shape[1] > target_width:
            h, w = frame.shape[:2]
            target_h = int((target_width / w) * h)
            frame = cv2.resize(frame, (target_width, target_h), interpolation=cv2.INTER_AREA)

        # 编码 JPEG
        ret, jpeg = cv2.imencode('.jpg', frame, encode_param)
        if not ret:
            continue

        # 输出 multipart 帧
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

    quality = int(request.GET.get('quality', 95))
    quality = max(1, min(100, quality))
    width = int(request.GET.get('width', 0))
    fps = int(request.GET.get('fps', 25))
    fps = max(1, min(60, fps))

    response = StreamingHttpResponse(
        _mjpeg_generator(stream_id, quality, width, fps),
        content_type='multipart/x-mixed-replace; boundary=frame',
    )
    response['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response['Access-Control-Allow-Origin'] = '*'
    return response
