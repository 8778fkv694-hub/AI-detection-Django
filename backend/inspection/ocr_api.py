"""
OCR API端点
提供图片文字识别API接口
"""
import json
import base64
import binascii
import logging
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.conf import settings
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from .ocr_service import ocr_service

logger = logging.getLogger(__name__)

@csrf_exempt
@require_http_methods(["POST"])
def ocr_extract(request):
    """
    OCR文字识别API端点
    
    POST /api/ocr/extract/
    
    Request Body:
    {
        "image": "base64编码的图片数据",
        "model": "easyocr" 或 "paddleocr" (可选，默认使用PaddleOCR)
    }
    
    Response:
    {
        "success": true/false,
        "full_text": "识别出的完整文字",
        "detailed_results": [
            {
                "text": "识别的文字",
                "confidence": 0.95,
                "bbox": [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
            }
        ],
        "text_count": 5,
        "model_used": "easyocr",
        "error": "错误信息（如果失败）"
    }
    """
    try:
        # 解析请求数据
        data = json.loads(request.body)
        image_b64 = data.get('image')
        model_name = data.get('model')  # 可选的模型选择
        expected_orientation = data.get('expected_orientation')  # 可选: 期望方向 0/90/180/270
        use_angle_cls = data.get('use_angle_cls', False)  # 是否启用方向检测，默认False

        if not image_b64:
            return JsonResponse({
                'success': False,
                'error': '缺少图片数据'
            })
        if not isinstance(image_b64, str):
            return JsonResponse({
                'success': False,
                'error': '图片数据格式无效'
            }, status=400)

        # 基础大小校验（避免超大base64导致资源耗尽）
        max_image_bytes = getattr(settings, 'OCR_MAX_IMAGE_BYTES', 20 * 1024 * 1024)  # 20MB
        approx_bytes = (len(image_b64) * 3) // 4
        if approx_bytes > max_image_bytes:
            return JsonResponse({
                'success': False,
                'error': '图片数据过大',
                'max_bytes': max_image_bytes
            }, status=413)

        # base64 合法性校验（快速失败）
        try:
            base64.b64decode(image_b64, validate=True)
        except binascii.Error:
            return JsonResponse({
                'success': False,
                'error': '图片数据不是有效的base64编码'
            }, status=400)

        # 执行OCR识别（带超时保护）
        ocr_timeout = getattr(settings, 'OCR_REQUEST_TIMEOUT', 12)  # 秒
        executor = ThreadPoolExecutor(max_workers=1)
        try:
            future = executor.submit(ocr_service.extract_text, image_b64, model_name, use_angle_cls=use_angle_cls)
            result = future.result(timeout=ocr_timeout)
        except TimeoutError:
            return JsonResponse({
                'success': False,
                'error': 'OCR处理超时',
                'timeout_seconds': ocr_timeout
            }, status=504)
        finally:
            executor.shutdown(wait=False)

        # 如果提供了期望方向，则根据检测方向进行合格判定增强
        if expected_orientation is not None and isinstance(result, dict) and result.get('success'):
            try:
                # 允许期望方向为字符串或数字
                eo = int(expected_orientation)
                detected_ori = result.get('detected_orientation')
                if detected_ori is None:
                    # 无法估计方向时，不改变success，但给出提示
                    result['orientation_match'] = None
                    result['orientation_message'] = '无法估计文字方向'
                else:
                    match = (int(detected_ori) % 360) == (eo % 360)
                    result['orientation_match'] = bool(match)
                    result['orientation_expected'] = eo
                    result['orientation_detected'] = int(detected_ori)
                    # 若不匹配，标为不合格
                    result['is_orientation_qualified'] = bool(match)
            except Exception as e:
                result['orientation_match'] = None
                result['orientation_message'] = f'方向判定异常: {str(e)}'
        
        return JsonResponse(result)
        
    except json.JSONDecodeError:
        return JsonResponse({
            'success': False,
            'error': '无效的JSON数据'
        })
    except Exception as e:
        logger.error(f"OCR API错误: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': f'服务器错误: {str(e)}'
        })

@csrf_exempt
@require_http_methods(["GET"])
def ocr_status(request):
    """
    OCR服务状态检查API端点
    
    GET /api/ocr/status/
    
    Response:
    {
        "available": true/false,
        "message": "状态信息",
        "available_models": ["paddleocr", "easyocr"],
        "current_model": "paddleocr"
    }
    """
    try:
        is_available = ocr_service.is_available()
        available_models = ocr_service.get_available_models()
        current_model = ocr_service.current_model
        
        return JsonResponse({
            'available': is_available,
            'message': 'OCR服务正常' if is_available else 'OCR服务不可用',
            'available_models': available_models,
            'current_model': current_model
        })
        
    except Exception as e:
        logger.error(f"OCR状态检查错误: {str(e)}")
        return JsonResponse({
            'available': False,
            'message': f'状态检查失败: {str(e)}',
            'available_models': [],
            'current_model': None
        })

@csrf_exempt
@require_http_methods(["POST"])
def ocr_set_model(request):
    """
    OCR模型切换API端点
    
    POST /api/ocr/set-model/
    
    Request Body:
    {
        "model": "easyocr" 或 "paddleocr"
    }
    
    Response:
    {
        "success": true/false,
        "message": "状态信息",
        "current_model": "easyocr"
    }
    """
    try:
        data = json.loads(request.body)
        model_name = data.get('model')
        
        if not model_name:
            return JsonResponse({
                'success': False,
                'message': '缺少模型参数'
            })
        
        # 设置模型
        success = ocr_service.set_model(model_name)
        
        if success:
            return JsonResponse({
                'success': True,
                'message': f'模型已切换到: {model_name}',
                'current_model': ocr_service.current_model
            })
        else:
            return JsonResponse({
                'success': False,
                'message': f'不支持的模型: {model_name}',
                'current_model': ocr_service.current_model
            })
        
    except json.JSONDecodeError:
        return JsonResponse({
            'success': False,
            'message': '无效的JSON数据'
        })
    except Exception as e:
        logger.error(f"OCR模型切换错误: {str(e)}")
        return JsonResponse({
            'success': False,
            'message': f'模型切换失败: {str(e)}'
        })
