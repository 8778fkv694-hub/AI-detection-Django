"""
持续检测循环的 API 端点
提供前端与 DetectionLoopManager 交互的接口
"""
import json
import logging
from django.http import JsonResponse, HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .detection_loop import detection_loop_manager

logger = logging.getLogger(__name__)


@csrf_exempt
@require_http_methods(["GET"])
def detection_latest_view(request, stream_id):
    """获取指定流的最新检测结果"""
    result = detection_loop_manager.get_latest_result(stream_id)
    if not result:
        return JsonResponse({
            'stream_id': stream_id,
            'boxes': [],
            'detect_fps': 0,
        })

    return JsonResponse(result)


@csrf_exempt
@require_http_methods(["GET"])
def detection_snapshot_view(request, stream_id):
    """获取指定流的最新或指定的高清截图"""
    frame_id = request.GET.get('frame_id')
    if frame_id:
        try:
            frame_id = int(frame_id)
        except ValueError:
            frame_id = None
            
    jpeg_bytes, actual_id = detection_loop_manager.get_snapshot_jpeg(stream_id, frame_id)
    
    if not jpeg_bytes:
        return JsonResponse({'error': 'Snapshot not available'}, status=404)
        
    response = HttpResponse(jpeg_bytes, content_type='image/jpeg')
    response['X-Frame-ID'] = str(actual_id)
    # 强制不缓存
    response['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    return response


@csrf_exempt
@require_http_methods(["POST"])
def detection_loop_start(request, stream_id):
    """启动指定流的检测循环"""
    try:
        data = json.loads(request.body)
        model_id = data.get('model_id')
        conf_threshold = float(data.get('conf_threshold', 0.5))
        
        if not model_id:
            from .yolo import get_default_model_id
            model_id = get_default_model_id()
            
        result = detection_loop_manager.start_loop(stream_id, model_id, conf_threshold)
        status_code = 200 if result['success'] else 400
        return JsonResponse(result, status=status_code)
        
    except Exception as e:
        logger.error(f"Failed to start detection loop: {e}", exc_info=True)
        return JsonResponse({'success': False, 'message': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def detection_loop_stop(request, stream_id):
    """停止指定流的检测循环"""
    try:
        result = detection_loop_manager.stop_loop(stream_id)
        status_code = 200 if result['success'] else 404
        return JsonResponse(result, status=status_code)
        
    except Exception as e:
        logger.error(f"Failed to stop detection loop: {e}", exc_info=True)
        return JsonResponse({'success': False, 'message': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def detection_loop_status(request):
    """获取所有检测循环的状态"""
    return JsonResponse(detection_loop_manager.get_all_status())
