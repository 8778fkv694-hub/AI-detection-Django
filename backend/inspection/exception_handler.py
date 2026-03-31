"""
自定义异常处理器
生产环境隐藏详细错误信息，防止敏感信息泄露
"""
import logging
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status
from django.conf import settings

logger = logging.getLogger(__name__)


def custom_exception_handler(exc, context):
    """
    自定义异常处理器
    - 开发环境(DEBUG=True): 返回详细错误信息
    - 生产环境(DEBUG=False): 返回通用错误消息，详细信息记录到日志
    """
    # 首先调用REST framework默认的异常处理
    response = exception_handler(exc, context)

    # 获取请求信息用于日志记录
    request = context.get('request')
    view = context.get('view')

    if response is not None:
        # 已处理的异常（如验证错误、权限错误等）
        if not settings.DEBUG:
            # 生产环境：记录详细日志
            logger.warning(
                f"API异常 | 视图: {view.__class__.__name__ if view else 'Unknown'} | "
                f"路径: {request.path if request else 'Unknown'} | "
                f"状态码: {response.status_code} | "
                f"详情: {response.data}"
            )
        return response

    # 未处理的异常（如500错误）
    logger.error(
        f"未处理异常 | 视图: {view.__class__.__name__ if view else 'Unknown'} | "
        f"路径: {request.path if request else 'Unknown'} | "
        f"异常类型: {type(exc).__name__} | "
        f"详情: {str(exc)}",
        exc_info=True  # 记录完整堆栈
    )

    if settings.DEBUG:
        # 开发环境：返回详细错误信息
        return Response({
            'error': str(exc),
            'error_type': type(exc).__name__,
            'detail': '开发模式：查看服务器日志获取完整堆栈信息'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    else:
        # 生产环境：返回通用错误消息
        return Response({
            'error': '服务器内部错误，请稍后重试',
            'code': 'INTERNAL_ERROR',
            'message': '如果问题持续存在，请联系技术支持'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
