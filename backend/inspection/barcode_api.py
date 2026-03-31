"""
条码/二维码检测API端点
提供融合WeChatQR + ZBar的检测接口
"""
import json
import logging
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from .barcode_service import barcode_service

logger = logging.getLogger(__name__)


@csrf_exempt
@require_http_methods(["POST"])
def barcode_detect(request):
    """
    条码/二维码检测API端点
    
    POST /api/barcode/detect/
    
    Request Body:
    {
        "image": "base64编码的图片数据"
    }
    
    Response:
    {
        "success": true/false,
        "codes": [
            {
                "type": "qr" | "barcode",
                "data": "内容",
                "confidence": 0.9,
                "bbox": { "x": 100, "y": 100, "width": 200, "height": 200 },
                "polygon": [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
            }
        ],
        "count": 1,
        "models_used": ["wechat_qr", "zbar"],
        "errors": { "wechat_qr": null, "zbar": null },
        "error": "错误信息（如果失败）"
    }
    """
    try:
        data = json.loads(request.body)
        image_b64 = data.get('image')

        if not image_b64:
            return JsonResponse({
                'success': False,
                'error': '缺少图片数据',
                'codes': [],
                'count': 0
            })

        result = barcode_service.detect_from_base64(image_b64)
        return JsonResponse(result)

    except json.JSONDecodeError:
        return JsonResponse({
            'success': False,
            'error': '无效的JSON数据',
            'codes': [],
            'count': 0
        })
    except Exception as e:
        logger.error(f"条码检测API错误: {str(e)}", exc_info=True)
        return JsonResponse({
            'success': False,
            'error': f'条码检测API错误: {str(e)}',
            'codes': [],
            'count': 0
        })
