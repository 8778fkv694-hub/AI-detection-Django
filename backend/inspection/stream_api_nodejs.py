"""
流媒体 API - Node.js 集成示例
这个文件展示了如何将 Node.js 流媒体服务集成到 Django
"""
import os
import requests
import logging
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone

logger = logging.getLogger(__name__)

# Node.js 流媒体服务地址
NODEJS_STREAM_SERVICE = os.getenv('NODEJS_STREAM_SERVICE', 'http://localhost:3000')
NODEJS_ENABLED = os.getenv('NODEJS_STREAM_ENABLED', 'true').lower() == 'true'

def check_nodejs_service():
    """检查 Node.js 服务是否可用"""
    try:
        response = requests.get(f'{NODEJS_STREAM_SERVICE}/health', timeout=2)
        return response.status_code == 200
    except:
        return False

def get_frame_from_nodejs(stream_id, url, stream_type, quality=95, width=1280, format='webp'):
    """
    从 Node.js 服务获取帧
    
    Args:
        stream_id: 流ID
        url: 流媒体地址
        stream_type: 流类型
        quality: 质量 (1-100)
        width: 目标宽度
        format: 格式 ('png', 'jpeg', 或 'webp'，默认 'webp')
    
    Returns:
        dict: 包含 frame 和 timestamp 的字典，失败返回 None
    """
    if not NODEJS_ENABLED:
        return None
    
    try:
        response = requests.get(
            f'{NODEJS_STREAM_SERVICE}/api/streams/{stream_id}/frame',
            params={
                'url': url,
                'stream_type': stream_type,
                'quality': quality,
                'width': width,
                'format': format
            },
            timeout=10  # 10秒超时
        )
        
        if response.status_code == 200:
            data = response.json()
            return {
                'stream_id': stream_id,
                'frame': data.get('frame'),
                'timestamp': data.get('timestamp', timezone.now().isoformat())
            }
        else:
            logger.warning(f'Node.js 服务返回错误: {response.status_code}')
            return None
            
    except requests.exceptions.Timeout:
        logger.error(f'Node.js 服务请求超时')
        return None
    except requests.exceptions.RequestException as e:
        logger.error(f'Node.js 服务请求失败: {e}')
        return None
    except Exception as e:
        logger.error(f'Node.js 服务未知错误: {e}')
        return None

# 使用示例（在 stream_api.py 中）：
"""
from .stream_api_nodejs import get_frame_from_nodejs, check_nodejs_service

@action(detail=True, methods=['get'])
def frame(self, request, pk=None):
    '''获取流媒体当前帧（优先使用 Node.js，失败回退到 Django）'''
    stream = self.get_object()
    stream_id = str(stream.id)
    
    quality = int(request.query_params.get('quality', 95))
    width = int(request.query_params.get('width', 1280))
    
    # 优先尝试 Node.js 服务
    if check_nodejs_service():
        # 从请求参数获取format，默认使用webp
        format_param = request.query_params.get('format', 'webp')
        nodejs_result = get_frame_from_nodejs(
            stream_id,
            stream.url,
            stream.stream_type,
            quality,
            width,
            format_param
        )
        
        if nodejs_result:
            logger.info(f'使用 Node.js 服务获取帧: {stream_id}')
            return Response(nodejs_result)
        else:
            logger.warning(f'Node.js 服务失败，回退到 Django: {stream_id}')
    
    # 回退到 Django 原生实现
    frame_base64 = stream_manager.get_frame_base64(stream_id, quality, width)
    
    if frame_base64:
        return Response({
            'stream_id': stream_id,
            'frame': frame_base64,
            'timestamp': timezone.now().isoformat()
        })
    else:
        return Response(
            {'error': '无法获取视频帧'},
            status=status.HTTP_404_NOT_FOUND
        )
"""

