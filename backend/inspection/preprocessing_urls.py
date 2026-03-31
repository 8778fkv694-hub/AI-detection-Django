"""
图片预处理API路由配置
"""

from django.urls import path
from . import image_preprocessing_api

urlpatterns = [
    # 图片预处理相关API
    path('preprocess/', image_preprocessing_api.preprocess_image_api, name='preprocess_image'),
    path('analyze-quality/', image_preprocessing_api.analyze_image_quality_api, name='analyze_image_quality'),
    path('status/', image_preprocessing_api.preprocessing_status_api, name='preprocessing_status'),
]
