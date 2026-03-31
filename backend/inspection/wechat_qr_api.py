"""
微信二维码检测API端点
提供基于微信WeChatQRCode的二维码检测API接口
"""
import json
import logging
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from .wechat_qr_service import wechat_qr_service

logger = logging.getLogger(__name__)

@csrf_exempt
@require_http_methods(["POST"])
def wechat_qr_detect(request):
    """
    微信二维码检测API端点
    
    POST /api/wechat-qr/detect/
    
    Request Body:
    {
        "image": "base64编码的图片数据"
    }
    
    Response:
    {
        "success": true/false,
        "detected_codes": [
            {
                "id": 1,
                "data": "二维码内容",
                "confidence": 0.95,
                "location": {
                    "x": 100,
                    "y": 100,
                    "width": 200,
                    "height": 200
                },
                "corners": [[x1,y1], [x2,y2], [x3,y3], [x4,y4]],
                "type": "qr"
            }
        ],
        "count": 1,
        "model_used": "wechat_qr",
        "message": "检测完成信息",
        "error": "错误信息（如果失败）"
    }
    """
    try:
        # 解析请求数据
        data = json.loads(request.body)
        image_b64 = data.get('image')
        
        if not image_b64:
            return JsonResponse({
                'success': False,
                'error': '缺少图片数据',
                'detected_codes': [],
                'count': 0
            })
        
        # 执行微信二维码检测
        result = wechat_qr_service.detect_qr_codes(image_b64)
        
        return JsonResponse(result)
        
    except json.JSONDecodeError:
        return JsonResponse({
            'success': False,
            'error': '无效的JSON数据',
            'detected_codes': [],
            'count': 0
        })
    except Exception as e:
        logger.error(f"微信二维码检测API错误: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': f'微信二维码检测API错误: {str(e)}',
            'detected_codes': [],
            'count': 0
        })

@csrf_exempt
@require_http_methods(["POST"])
def wechat_qr_detect_with_retry(request):
    """
    微信二维码重试检测API端点
    
    POST /api/wechat-qr/detect-with-retry/
    
    Request Body:
    {
        "image": "base64编码的图片数据",
        "expected_codes": [
            {
                "expectedText": "期望的二维码内容",
                "matchMode": "contains" 或 "exact"
            }
        ],
        "max_retries": 3
    }
    
    Response:
    {
        "success": true/false,
        "match_results": [
            {
                "expected_text": "期望内容",
                "match_mode": "contains",
                "matched": true/false,
                "detected_data": "检测到的内容",
                "confidence": 0.95,
                "location": {
                    "x": 100,
                    "y": 100,
                    "width": 200,
                    "height": 200
                },
                "retry_count": 1
            }
        ],
        "retry_summary": {
            "total_retries": 3,
            "successful_detections": 1,
            "failed_detections": 0
        },
        "model_used": "wechat_qr",
        "message": "检测完成信息",
        "error": "错误信息（如果失败）"
    }
    """
    try:
        # 解析请求数据
        data = json.loads(request.body)
        image_b64 = data.get('image')
        expected_codes = data.get('expected_codes', [])
        max_retries = data.get('max_retries', 3)
        
        if not image_b64:
            return JsonResponse({
                'success': False,
                'error': '缺少图片数据',
                'match_results': [],
                'retry_summary': {'total_retries': 0, 'successful_detections': 0, 'failed_detections': 0}
            })
        
        if not expected_codes:
            return JsonResponse({
                'success': False,
                'error': '缺少期望的二维码配置',
                'match_results': [],
                'retry_summary': {'total_retries': 0, 'successful_detections': 0, 'failed_detections': 0}
            })
        
        # 执行微信二维码重试检测
        result = wechat_qr_service.detect_qr_codes_with_retry(image_b64, expected_codes, max_retries)
        
        return JsonResponse(result)
        
    except json.JSONDecodeError:
        return JsonResponse({
            'success': False,
            'error': '无效的JSON数据',
            'match_results': [],
            'retry_summary': {'total_retries': 0, 'successful_detections': 0, 'failed_detections': 0}
        })
    except Exception as e:
        logger.error(f"微信二维码重试检测API错误: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': f'微信二维码重试检测API错误: {str(e)}',
            'match_results': [],
            'retry_summary': {'total_retries': 0, 'successful_detections': 0, 'failed_detections': 0}
        })

@csrf_exempt
@require_http_methods(["GET"])
def wechat_qr_status(request):
    """
    微信二维码检测模型状态API端点
    
    GET /api/wechat-qr/status/
    
    Response:
    {
        "model_loaded": true/false,
        "model_path": "/path/to/models",
        "model_name": "wechat_qr",
        "available": true/false,
        "description": "微信二维码检测模型 (WeChatQRCode)"
    }
    """
    try:
        status_info = wechat_qr_service.get_model_status()
        return JsonResponse(status_info)
        
    except Exception as e:
        logger.error(f"微信二维码状态API错误: {str(e)}")
        return JsonResponse({
            'model_loaded': False,
            'model_path': None,
            'model_name': 'wechat_qr',
            'available': False,
            'description': '微信二维码检测模型 (WeChatQRCode)',
            'error': f'状态查询错误: {str(e)}'
        })
