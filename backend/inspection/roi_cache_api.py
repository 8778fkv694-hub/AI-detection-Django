"""
ROI缓存API
用于实时检测时缓存ROI图像
"""
import logging
import base64
import io
import numpy as np
from PIL import Image
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status

from inspection.roi_cache import get_roi_cache

logger = logging.getLogger(__name__)


@api_view(['POST'])
def cache_roi(request):
    """
    缓存单个ROI到后端
    
    POST /api/yolo/cache-roi/
    
    Request Body:
    {
        "label": "water_efficiency_label",
        "roi_image": "data:image/jpeg;base64,...",
        "bbox": {"x": 100, "y": 100, "w": 200, "h": 200},
        "detection": {...}  // 可选，完整的检测结果
    }
    
    Response:
    {
        "success": true,
        "roi_id": "water_efficiency_label_1234567890123",
        "label": "water_efficiency_label"
    }
    """
    try:
        # 1. 获取参数
        label = request.data.get('label')
        roi_image_base64 = request.data.get('roi_image')
        bbox = request.data.get('bbox', {})
        detection = request.data.get('detection', {})
        owner_id = request.data.get('owner_id')
        
        if not label or not roi_image_base64:
            return Response({
                'success': False,
                'error': '缺少必需参数: label 或 roi_image'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # 2. 解码Base64图像
        try:
            # 移除data URL前缀
            if ',' in roi_image_base64:
                image_data = roi_image_base64.split(',')[1]
            else:
                image_data = roi_image_base64
            
            # Base64解码
            image_bytes = base64.b64decode(image_data)
            
            # 转换为PIL Image
            image = Image.open(io.BytesIO(image_bytes))
            
            # 转换为RGB（确保3通道）
            if image.mode != 'RGB':
                image = image.convert('RGB')
            
            # 转换为numpy数组
            roi_array = np.array(image)
            
        except Exception as e:
            logger.error(f"解码ROI图像失败: {e}")
            return Response({
                'success': False,
                'error': f'图像解码失败: {str(e)}'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # 3. 缓存ROI
        roi_cache = get_roi_cache()
        
        roi_id = roi_cache.store(
            label=label,
            roi_image=roi_array,
            bbox=bbox,
            detection=detection,
            owner_id=owner_id
        )
        
        logger.info(f"ROI已缓存: {label} -> {roi_id}")
        
        # 4. 返回结果
        return Response({
            'success': True,
            'roi_id': roi_id,
            'label': label
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"缓存ROI失败: {e}", exc_info=True)
        return Response({
            'success': False,
            'error': f'缓存ROI失败: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
