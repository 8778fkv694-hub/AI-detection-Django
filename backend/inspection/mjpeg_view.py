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
                     fps: int = 12, enhance: bool = False, overlay: bool = True):
    """生成 MJPEG 帧流。

    默认对 Jetson 友好：960px / quality=75 / 12fps / 不做颜色校正。
    aarch64 没有硬件 JPEG 加速，单核 imencode 1080p quality=95 单帧 80-150ms，
    根本撑不到 25fps，反而把 worker 锁死 100% CPU。

    overlay: 是否叠加检测框（来自 DetectionLoop 的持续检测结果）
    """
    reader = stream_manager.get_stream(stream_id)
    if reader is None:
        return

    frame_interval = 1.0 / fps
    encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), quality]
    last_seen_id = -1  # 帧去重，避免相同帧反复编码
    last_new_frame_time = time.time()  # 心跳：记录最后一次拿到新帧的时间
    FRAME_TIMEOUT = 10.0  # 超过 10 秒没拿到新帧，判定流已死，主动退出

    # 检测框颜色映射（BGR 格式）
    _label_colors = {
        'filter': (0, 102, 255),
        'name_MCF': (255, 102, 0),
        'nsplogo': (102, 0, 255),
        'qrcode': (0, 255, 102),
        'anti_counterfeit_label': (0, 204, 255),
        'service_label': (255, 204, 0),
        'nameplate_label': (255, 0, 204),
        'water_efficiency_label': (204, 255, 0),
        'barcode_label': (153, 153, 153),
        'fotile_logo': (0, 102, 255),
        'water_outlet': (255, 102, 0),
        'Prompt_label': (102, 0, 255),
        'yellow_point': (0, 255, 255),
        'glod_logo': (0, 215, 255),
    }
    _default_color = (0, 255, 0)  # 默认绿色

    while reader.is_running:
        # 心跳检测：超过超时时间没拿到新帧，判定流已死，主动退出释放 worker
        if time.time() - last_new_frame_time > FRAME_TIMEOUT:
            logger.warning(
                "MJPEG generator for stream %s: no new frames for %.0fs, stream appears dead — exiting",
                stream_id, FRAME_TIMEOUT,
            )
            break

        frame = reader.get_frame_ref()
        if frame is None:
            time.sleep(0.05)
            continue

        # 用帧版本号去重：同一帧不重复编码 + 推送
        version = getattr(reader, 'frame_version', 0)
        if version == last_seen_id:
            time.sleep(0.01)
            continue
        last_seen_id = version
        last_new_frame_time = time.time()  # 拿到新帧，重置心跳

        frame_started_at = time.time()

        # 颜色校正按需开启（USB 摄像头偏绿才需要），默认关掉省 CPU
        if enhance:
            frame = reader._enhance_display_frame(frame)

        # ====== 叠加检测框（在原始分辨率上画，再缩放，坐标自动跟着缩） ======
        if overlay:
            try:
                from .detection_loop import detection_loop_manager
                boxes = detection_loop_manager.get_latest_boxes(stream_id)
                if boxes:
                    frame = frame.copy()
                    for box in boxes:
                        bbox = box.get('bbox', {})
                        x1, y1 = int(bbox.get('x1', 0)), int(bbox.get('y1', 0))
                        x2, y2 = int(bbox.get('x2', 0)), int(bbox.get('y2', 0))
                        label_text = box.get('label', '')
                        conf = box.get('confidence', 0)
                        color = _label_colors.get(label_text, _default_color)

                        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                        text = f"{label_text} {conf:.0%}"
                        (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
                        cv2.rectangle(frame, (x1, y1 - th - 6), (x1 + tw + 4, y1), color, -1)
                        cv2.putText(frame, text, (x1 + 2, y1 - 4),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
            except Exception:
                pass  # 检测循环未启动时静默跳过

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

        elapsed = time.time() - frame_started_at
        time.sleep(max(0.0, frame_interval - elapsed))


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
    overlay = request.GET.get('overlay', '1') not in ('0', 'false', 'False')

    response = StreamingHttpResponse(
        _mjpeg_generator(stream_id, quality, width, fps, enhance, overlay),
        content_type='multipart/x-mixed-replace; boundary=frame',
    )
    response['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response['Access-Control-Allow-Origin'] = '*'
    return response
