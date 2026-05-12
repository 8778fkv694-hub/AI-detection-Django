
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, FileUploadParser
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from django.db import models, transaction
import os
import hashlib
import shutil
from datetime import datetime, timedelta
from django.db.models import Count, Q, Max

from .models import (
    AIConfig, DefectType, DefectSeverity, Standard,
    InspectionArea, InspectionResult, ModelVersion, ModelDeployment,
    ModelUpload, ModelPerformance, ModelConfig,
    OCRKeywordTemplate, OCRBarcodeTemplate, StageRecipeTemplate,
    FixtureTemplate,
    ProductRecipe, ProductStage, FQCRecord
)
from .serializers import (
    AIConfigSerializer, DefectTypeSerializer, DefectSeveritySerializer,
    StandardSerializer, InspectionAreaSerializer, InspectionResultSerializer,
    ModelVersionSerializer, ModelDeploymentSerializer, ModelUploadSerializer,
    ModelPerformanceSerializer, ModelVersionDetailSerializer,
    ModelUploadProgressSerializer, ModelDeploymentStatusSerializer,
    OCRKeywordTemplateSerializer, OCRBarcodeTemplateSerializer,
    StageRecipeTemplateSerializer, FixtureTemplateSerializer,
    ProductRecipeSerializer, ProductStageSerializer, FQCRecordSerializer
)
from .tasks import process_batch_inspection
from .yolo import run_inference, get_model_status, validate_model_availability, get_ppe_model_info, load_model
from .model_manager import ModelManager
import base64
import cv2
import numpy as np
from django.http import HttpResponse
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from django.middleware.csrf import get_token
import json
from django.db import connection


class FixtureTemplateViewSet(viewsets.ModelViewSet):
    queryset = FixtureTemplate.objects.all()
    serializer_class = FixtureTemplateSerializer

class AIConfigViewSet(viewsets.ModelViewSet):
    queryset = AIConfig.objects.all()
    serializer_class = AIConfigSerializer

    def create(self, request, *args, **kwargs):
        """创建或更新AI配置，支持前端驼峰命名格式"""
        try:
            # 获取配置数据
            config_data = request.data.copy()
            
            # 处理前端发送的驼峰命名格式
            if 'apiKey' in config_data:
                config_data['api_key'] = config_data.get('apiKey', '')
            if 'apiBaseUrl' in config_data:
                config_data['api_base_url'] = config_data.get('apiBaseUrl', '')
            if 'modelName' in config_data:
                config_data['model_name'] = config_data.get('modelName', '')
            if 'systemPrompt' in config_data:
                config_data['system_prompt'] = config_data.get('systemPrompt', '')
            if 'userMessage' in config_data:
                config_data['user_message'] = config_data.get('userMessage', '')
            if 'compressionEnabled' in config_data:
                config_data['compression_enabled'] = config_data.get('compressionEnabled', False)
            if 'compressionQuality' in config_data:
                config_data['compression_quality'] = config_data.get('compressionQuality', 80)
            
            # 清理不需要的字段
            for key in ['apiKey', 'apiBaseUrl', 'modelName', 'systemPrompt', 'userMessage', 'compressionEnabled', 'compressionQuality']:
                config_data.pop(key, None)
            
            # 获取或创建配置对象
            obj, created = AIConfig.objects.get_or_create(
                id=1,
                defaults=config_data
            )
            
            if not created:
                # 更新现有配置
                for key, value in config_data.items():
                    setattr(obj, key, value)
                obj.save()
            
            serializer = self.get_serializer(obj)
            return Response(serializer.data, status=status.HTTP_200_OK if not created else status.HTTP_201_CREATED)
            
        except Exception as e:
            return Response({
                'error': f'保存配置失败: {str(e)}'
            }, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def get_current_config(self, request):
        obj, _ = AIConfig.objects.get_or_create(
            id=1,
            defaults=dict(
                model_name='default',
                api_key='',
                api_base_url='',
                system_prompt='You are an AI for quality inspection.',
                compression_enabled=False,
                compression_quality=80,
            )
        )
        return Response(self.get_serializer(obj).data)
    
    @action(detail=False, methods=['post'], url_path='test-connection')
    def test_connection(self, request):
        """
        测试AI模型连接
        用于产品检测的AI分析模型连接测试
        """
        try:
            # 获取配置数据，支持多种格式
            config_data = request.data.get('config', {})
            if not config_data:
                # 如果config字段为空，直接使用request.data
                config_data = request.data
            
            # 处理前端发送的驼峰命名格式
            if 'apiKey' in config_data:
                config_data['api_key'] = config_data.get('apiKey', '')
            if 'apiBaseUrl' in config_data:
                config_data['api_base_url'] = config_data.get('apiBaseUrl', '')
            if 'modelName' in config_data:
                config_data['model_name'] = config_data.get('modelName', '')
            if 'systemPrompt' in config_data:
                config_data['system_prompt'] = config_data.get('systemPrompt', '')
            if 'userMessage' in config_data:
                config_data['user_message'] = config_data.get('userMessage', '')
            if 'compressionEnabled' in config_data:
                config_data['compression_enabled'] = config_data.get('compressionEnabled', False)
            if 'compressionQuality' in config_data:
                config_data['compression_quality'] = config_data.get('compressionQuality', 80)
            
            # 调试信息（生产环境可移除）
            # print(f"接收到的请求数据: {request.data}")
            # print(f"解析后的配置数据: {config_data}")
            
            # 验证必要的配置参数
            if not config_data.get('api_key'):
                return Response({
                    'success': False,
                    'message': 'API Key 不能为空'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            if not config_data.get('api_base_url'):
                return Response({
                    'success': False,
                    'message': 'API Base URL 不能为空'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            if not config_data.get('model_name'):
                return Response({
                    'success': False,
                    'message': '模型名称不能为空'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # 模拟测试连接 - 发送一个简单的测试请求
            import requests
            
            test_payload = {
                "model": config_data.get('model_name'),
                "messages": [
                    {"role": "system", "content": "你是一个测试助手"},
                    {"role": "user", "content": "请回复'测试成功'"}
                ],
                "max_tokens": 50
            }
            
            headers = {
                'Authorization': f'Bearer {config_data.get("api_key")}',
                'Content-Type': 'application/json'
            }
            
            # 发送测试请求
            response = requests.post(
                config_data.get('api_base_url'),
                json=test_payload,
                headers=headers,
                timeout=10
            )
            
            if response.status_code == 200:
                return Response({
                    'success': True,
                    'message': 'AI模型连接测试成功',
                    'response': response.json()
                })
            else:
                return Response({
                    'success': False,
                    'message': f'AI模型连接测试失败: HTTP {response.status_code}',
                    'error': response.text
                }, status=status.HTTP_400_BAD_REQUEST)
                
        except requests.exceptions.Timeout:
            return Response({
                'success': False,
                'message': '连接超时，请检查网络或API地址'
            }, status=status.HTTP_408_REQUEST_TIMEOUT)
        except requests.exceptions.ConnectionError:
            return Response({
                'success': False,
                'message': '连接失败，请检查API地址是否正确'
            }, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({
                'success': False,
                'message': f'测试连接时发生错误: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
class DefectTypeViewSet(viewsets.ModelViewSet):
    queryset = DefectType.objects.all().order_by('name')
    serializer_class = DefectTypeSerializer

class DefectSeverityViewSet(viewsets.ModelViewSet):
    queryset = DefectSeverity.objects.all().order_by('level')
    serializer_class = DefectSeveritySerializer

class StandardViewSet(viewsets.ModelViewSet):
    queryset = Standard.objects.all().order_by('-name')
    serializer_class = StandardSerializer

class InspectionAreaViewSet(viewsets.ModelViewSet):
    queryset = InspectionArea.objects.all().order_by('name')
    serializer_class = InspectionAreaSerializer

class InspectionResultViewSet(viewsets.ModelViewSet):
    queryset = InspectionResult.objects.all().order_by('-timestamp')
    serializer_class = InspectionResultSerializer
    
    def get_queryset(self):
        """
        支持通过参数限制返回数量
        """
        queryset = super().get_queryset()
        if getattr(self, 'action', None) and self.action != 'list':
            return queryset
        limit = self.request.query_params.get('limit')
        if limit and limit.isdigit():
            queryset = queryset[:int(limit)]
        else:
            # 默认限制返回最新的100条，防止数据量过大导致掉线
            queryset = queryset[:100]
        return queryset

    @action(detail=False, methods=['get'], url_path='ppe-model-status')
    def ppe_model_status(self, request):
        """
        获取PPE模型状态信息
        系统必须依赖PPE模型，此端点用于检查PPE模型是否可用
        """
        try:
            status_info = get_model_status()
            return Response(status_info, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({
                'status': 'error',
                'message': f'获取PPE模型状态失败: {str(e)}',
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['get'], url_path='ppe-model-info')
    def ppe_model_info(self, request):
        """
        获取PPE模型详细信息
        """
        try:
            model_info = get_ppe_model_info()
            return Response(model_info, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({
                'error': f'获取PPE模型信息失败: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['get'], url_path='available-models')
    def available_models(self, request):
        """
        获取可用的PPE检测模型列表
        现在包含 detection_type 字段（向后兼容）
        """
        try:
            from .yolo import get_available_models, get_default_model_id
            models = get_available_models()
            return Response({
                'models': models,
                'current_model': get_default_model_id(),
                'message': '获取可用模型列表成功'
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({
                'error': f'获取可用模型列表失败: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=False, methods=['get'], url_path='model-config')
    def model_config(self, request):
        """
        获取指定模型的完整配置信息
        包括检测类型、类别列表等
        
        参数:
            model_id: 模型ID（可选，如果不提供则返回所有模型的配置）
        
        返回:
            - 如果提供了 model_id: 返回单个模型的配置
            - 如果没有提供 model_id: 返回所有可用模型的配置列表
        """
        try:
            from .model_config import ppe_model_config
            
            model_id = request.query_params.get('model_id', None)
            
            if model_id:
                # 返回单个模型的配置
                config = ppe_model_config.get_model_config_for_api(model_id)
                if not config:
                    return Response({
                        'error': f'未找到模型: {model_id}'
                    }, status=status.HTTP_404_NOT_FOUND)
                
                return Response({
                    'model': config,
                    'message': '获取模型配置成功'
                }, status=status.HTTP_200_OK)
            else:
                # 返回所有可用模型的配置列表
                available_models = ppe_model_config.get_available_models()
                return Response({
                    'models': available_models,
                    'message': '获取所有模型配置成功'
                }, status=status.HTTP_200_OK)
                
        except Exception as e:
            return Response({
                'error': f'获取模型配置失败: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['post'], url_path='switch-model')
    def switch_model(self, request):
        """
        切换到指定的PPE检测模型
        """
        try:
            model_id = request.data.get('model_id')
            if not model_id:
                return Response({
                    'error': 'model_id参数是必需的'
                }, status=status.HTTP_400_BAD_REQUEST)

            from .yolo import switch_model, get_default_model_id
            success = switch_model(model_id)

            if success:
                # 确保数据库中的配置也得到更新
                try:
                    from .model_config import ppe_model_config
                    model_config = ppe_model_config.get_model_config(model_id)
                    ModelConfig.set_current_model('PPE_YOLO', model_id, model_config)
                except Exception as e:
                    print(f"更新数据库模型配置失败: {e}")

                return Response({
                    'message': f'成功切换到模型: {model_id}',
                    'current_model': get_default_model_id(),
                    'model_id': model_id
                }, status=status.HTTP_200_OK)
            else:
                return Response({
                    'error': f'切换到模型失败: {model_id}'
                }, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            return Response({
                'error': f'切换模型失败: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['post'], url_path='remove-model')
    def remove_model(self, request):
        """
        从模型池中移除指定模型
        """
        try:
            model_id = request.data.get('model_id')
            if not model_id:
                return Response({
                    'error': 'model_id参数是必需的'
                }, status=status.HTTP_400_BAD_REQUEST)

            from .yolo import remove_model_from_pool
            result = remove_model_from_pool(model_id)

            if result['success']:
                return Response(result, status=status.HTTP_200_OK)
            else:
                return Response(result, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            return Response({
                'error': f'移除模型失败: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['get'], url_path='model-pool-status')
    def model_pool_status(self, request):
        """
        获取模型池状态信息
        """
        try:
            from .yolo import get_model_pool_status
            status_info = get_model_pool_status()
            return Response(status_info, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({
                'error': f'获取模型池状态失败: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['get'], url_path='validate-ppe-model')
    def validate_ppe_model(self, request):
        """
        验证PPE模型是否可用
        系统必须依赖PPE模型，此端点用于验证PPE模型是否正常工作
        """
        try:
            is_available = validate_model_availability()
            if is_available:
                return Response({
                    'valid': True,
                    'message': 'PPE模型验证成功，系统可以正常运行',
                    'model_type': 'PPE_YOLO'
                }, status=status.HTTP_200_OK)
            else:
                return Response({
                    'valid': False,
                    'message': 'PPE模型验证失败，系统无法正常运行',
                    'model_type': 'PPE_YOLO',
                    'error': 'PPE模型不可用'
                }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except Exception as e:
            return Response({
                'valid': False,
                'message': f'PPE模型验证失败: {str(e)}',
                'model_type': 'PPE_YOLO',
                'error': str(e)
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    @action(detail=False, methods=['get'], url_path='csrf-token')
    def get_csrf_token(self, request):
        """
        获取CSRF token
        用于前端首次加载时获取CSRF token
        """
        csrf_token = get_token(request)
        return Response({
            'csrf_token': csrf_token
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='live-inspect')
    def live_inspect(self, request):
        payload = request.data.copy()
        image = payload.get('image') or request.FILES.get('image')
        if not image:
            return Response({'error': 'image is required'}, status=status.HTTP_400_BAD_REQUEST)

        # 验证PPE模型是否可用
        if not validate_model_availability():
            return Response({
                'error': '系统必须依赖PPE模型，但PPE模型不可用。请检查PPE模型是否正确安装。'
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        # Placeholder for real AI logic
        result_payload = {
            'image': image,
            'standard_id': payload.get('standard_id'),
            'overall_quality': '合格',
            'score': 0.95,
            'reason': '表面光滑，无明显缺陷。',
            'reason_keywords': '光滑,无划痕',
            'defects': []
        }
        ser = self.get_serializer(data=result_payload)
        ser.is_valid(raise_exception=True)
        obj = ser.save()
        return Response(self.get_serializer(obj).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], url_path='batch-inspect')
    def batch_inspect(self, request):
        images = request.data.get('images', [])
        standard_id = request.data.get('standard_id')
        if not isinstance(images, list) or not images:
            return Response({'error': 'images must be a non-empty array'}, status=status.HTTP_400_BAD_REQUEST)
        
        # 验证PPE模型是否可用
        if not validate_model_availability():
            return Response({
                'error': '系统必须依赖PPE模型，但PPE模型不可用。请检查PPE模型是否正确安装。'
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        
        task = process_batch_inspection.delay(images, standard_id)
        return Response({'message': 'Batch inspection started', 'task_id': task.id}, status=status.HTTP_202_ACCEPTED)

    @action(detail=False, methods=['post'], url_path='yolo-detect')
    def yolo_detect(self, request):
        """
        接收 base64 图像或表单文件，调用指定的模型进行检测，返回检测框。
        支持多种模型切换：PPE模型、滤芯检测模型、通用模型等。
        支持模型池机制，可同时使用多个模型。
        
        body: { 
            image: <base64 string>, 
            conf?: float,
            model_id?: string,  # 可选：指定要使用的模型ID
            detection_type?: string  # 可选：指定检测类型，自动选择对应模型
        }
        """
        conf = float(request.data.get('conf', 0.5))
        image_b64 = request.data.get('image')
        upload_file = request.FILES.get('image')
        requested_model_id = request.data.get('model_id')  # 前端可以指定model_id
        detection_type = request.data.get('detection_type')  # 前端可以指定detection_type
        
        if not image_b64 and not upload_file:
            return Response({'error': 'image is required (base64 or file)'}, status=status.HTTP_400_BAD_REQUEST)

        # 根据detection_type自动映射到对应的model_id
        detection_type_to_model = {
            'cleanroom_ppe': 'ppe_detection',
            'kit_matching': 'filter_core_detection',
            'ocr_inspection': 'waterprifer_detection',
            'ocr_fusion_inspection': 'waterprifer_detection',
            'general_quality': 'yolo8_general',
        }
        
        # 确定要使用的模型
        target_model_id = None
        model_resolution = 'unspecified'
        if requested_model_id:
            # 优先使用明确指定的model_id
            target_model_id = requested_model_id
            model_resolution = 'explicit_model_id'
        elif detection_type and detection_type in detection_type_to_model:
            # 根据detection_type自动选择模型
            target_model_id = detection_type_to_model[detection_type]
            model_resolution = 'detection_type_mapping'
        
        # 检查是否有可用的模型
        try:
            from .yolo import get_default_model_id, load_model
            # 如果没有指定模型，使用稳定默认模型，不依赖最近使用模型
            if not target_model_id:
                target_model_id = get_default_model_id()
                model_resolution = 'default_model'
            
            # 加载目标模型（会自动使用模型池）
            load_model(target_model_id)
        except Exception as e:
            return Response({
                'error': f'模型加载失败: {str(e)}。请检查模型配置或切换到其他可用模型。',
                'error_type': 'model_load_failed',
                'requires_user_confirmation': True
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        try:
            if upload_file:
                file_bytes = upload_file.read()
                np_arr = np.frombuffer(file_bytes, np.uint8)
                img_bgr = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
            else:
                if 'base64,' in image_b64:
                    image_b64 = image_b64.split('base64,', 1)[1]
                raw = base64.b64decode(image_b64)
                np_arr = np.frombuffer(raw, np.uint8)
                img_bgr = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

            if img_bgr is None:
                return Response({'error': 'failed to decode image'}, status=status.HTTP_400_BAD_REQUEST)

            # 使用指定的模型进行检测
            detections = run_inference(img_bgr, conf=conf, model_id=target_model_id)
            return Response({
                'detections': detections,
                'model_type': target_model_id,
                'detection_type': detection_type,
                'model_resolution': model_resolution,
                'message': f'检测完成 (模型: {target_model_id})'
            }, status=status.HTTP_200_OK)
        except Exception as e:
            error_message = str(e)
            # 检查是否是模型不可用的错误
            if '指定的模型' in error_message and '不可用' in error_message:
                return Response({
                    'error': error_message,
                    'error_type': 'specific_model_unavailable',
                    'requires_user_confirmation': True,
                    'suggested_action': 'switch_model'
                }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
            else:
                return Response({
                    'error': f'PPE检测失败: {error_message}',
                    'model_type': 'PPE_YOLO'
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
  
    @action(detail=False, methods=['post'], url_path='save-ppe-detection')
    def save_ppe_detection(self, request):
        """
        保存PPE检测结果
        接收检测结果和图像，保存到数据库
        """
        try:
            image = request.data.get('image')
            detections = request.data.get('detections', [])
            model_type = request.data.get('model_type', 'PPE_YOLO')
            confidence_threshold = request.data.get('confidence_threshold', 0.5)
            
            if not image:
                return Response({'error': 'image is required'}, status=status.HTTP_400_BAD_REQUEST)
            
            # 分析PPE检测结果
            ppe_stats = {
                'person': 0,
                'mask': 0,
                'hat': 0,
                'other': 0
            }
            
            for detection in detections:
                label = detection.get('label', '')
                # 支持中英文标签识别
                if label in ['person', '人员']:
                    ppe_stats['person'] += 1
                elif label in ['mask', 'face-mask', 'face-guard', '口罩', '面罩']:
                    ppe_stats['mask'] += 1
                elif label in ['Hardhat', 'helmet', 'hat', '洁净帽', '安全帽']:
                    ppe_stats['hat'] += 1
                else:
                    ppe_stats['other'] += 1
            
            # 计算合规性
            has_person = ppe_stats['person'] > 0
            has_mask = ppe_stats['mask'] > 0
            has_hat = ppe_stats['hat'] > 0
            
            # 判断整体质量 - 统一逻辑，要求人员和口罩+洁净帽
            if has_person and has_mask and has_hat:
                overall_quality = '合格'
                score = 0.95
                reason = 'PPE穿戴完整，符合安全要求'
            elif has_person and has_mask:
                overall_quality = '需复检'
                score = 0.8
                reason = '检测到人员和口罩，但缺少洁净帽，需要检查'
            elif has_person and has_hat:
                overall_quality = '需复检'
                score = 0.6
                reason = '检测到人员和帽子，但缺少口罩，需要检查'
            elif has_person:
                overall_quality = '需复检'
                score = 0.4
                reason = '检测到人员，但缺少必要的PPE装备，需要检查'
            else:
                overall_quality = '不合格'
                score = 0.3
                reason = '未检测到人员或PPE装备严重不足，不符合安全要求'
            
            # 创建检测结果
            result_payload = {
                'image': image,
                'overall_quality': overall_quality,
                'score': score,
                'reason': reason,
                'defects': []
            }
            
            # 保存到数据库
            serializer = self.get_serializer(data=result_payload)
            serializer.is_valid(raise_exception=True)
            result = serializer.save()
            
            return Response({
                'message': 'PPE检测结果保存成功',
                'result_id': result.id,
                'ppe_stats': ppe_stats,
                'compliance': {
                    'has_person': has_person,
                    'has_mask': has_mask,
                    'has_hat': has_hat
                },
                'overall_quality': overall_quality,
                'score': score
            }, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            return Response({
                'error': f'保存PPE检测结果失败: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['get'], url_path='ppe-stats')
    def ppe_stats(self, request):
        """
        获取PPE检测统计数据
        支持按日期范围查询
        """
        try:
            from datetime import datetime, timedelta
            
            # 获取查询参数，默认最近30天
            date_from = request.query_params.get('date_from')
            date_to = request.query_params.get('date_to')
            
            # B4修复：未指定日期时默认最近30天，避免全表扫描
            if not date_from and not date_to:
                date_from = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
                date_to = datetime.now().strftime('%Y-%m-%d')
            
            # 构建查询条件
            queryset = InspectionResult.objects.all()
            
            if date_from:
                queryset = queryset.filter(timestamp__date__gte=date_from)
            if date_to:
                queryset = queryset.filter(timestamp__date__lte=date_to)
            
            # B4修复：使用单次聚合查询取代多次 count()，减少全表扫描
            from django.db.models import Count, Q, Sum
            agg = queryset.aggregate(
                total=Count('id'),
                qualified=Count('id', filter=Q(overall_quality='合格')),
                unqualified=Count('id', filter=Q(overall_quality='不合格')),
                recheck=Count('id', filter=Q(overall_quality='需复检')),
            )
            
            overall_stats = {
                'total': agg['total'],
                'qualified': agg['qualified'],
                'unqualified': agg['unqualified'],
                'recheck': agg['recheck'],
                'qualified_rate': (agg['qualified'] / agg['total'] * 100) if agg['total'] > 0 else 0
            }
            
            # 按日期分组统计（限制返回行数）
            daily_stats = queryset.extra(
                select={'date': 'DATE(timestamp)'}
            ).values('date').annotate(
                total=Count('id'),
                qualified=Count('id', filter=Q(overall_quality='合格')),
                unqualified=Count('id', filter=Q(overall_quality='不合格')),
                recheck=Count('id', filter=Q(overall_quality='需复检'))
            ).order_by('-date')[:90]  # 最多90天
            
            return Response({
                'overall_stats': overall_stats,
                'daily_stats': list(daily_stats),
                'query_params': {
                    'date_from': date_from,
                    'date_to': date_to
                }
            })
            
        except Exception as e:
            return Response({
                'error': f'获取PPE统计数据失败: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['get'], url_path='cleanroom-results')
    def cleanroom_results(self, request):
        """
        获取洁净用品检测结果
        专门用于洁净用品结果页面
        """
        try:
            # 获取查询参数
            date_from = request.query_params.get('date_from')
            date_to = request.query_params.get('date_to')
            page = int(request.query_params.get('page', 1))
            page_size = int(request.query_params.get('page_size', 20))
            
            # 构建查询条件 - 筛选洁净用品相关的结果
            queryset = InspectionResult.objects.filter(
                Q(reason__icontains='洁净帽') |
                Q(reason__icontains='口罩') |
                Q(reason__icontains='洁净服') |
                Q(reason__icontains='PPE') |
                Q(reason__icontains='洁净') |
                Q(reason__icontains='防护')
            )
            
            if date_from:
                queryset = queryset.filter(timestamp__date__gte=date_from)
            if date_to:
                queryset = queryset.filter(timestamp__date__lte=date_to)
            
            # 分页
            total_count = queryset.count()
            start = (page - 1) * page_size
            end = start + page_size
            results = queryset.order_by('-timestamp')[start:end]
            
            # 序列化结果
            serializer = self.get_serializer(results, many=True)
            
            return Response({
                'results': serializer.data,
                'pagination': {
                    'page': page,
                    'page_size': page_size,
                    'total_count': total_count,
                    'total_pages': (total_count + page_size - 1) // page_size
                },
                'query_params': {
                    'date_from': date_from,
                    'date_to': date_to
                }
            })
            
        except Exception as e:
            return Response({
                'error': f'获取洁净用品检测结果失败: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['post'], url_path='clear-cleanroom')
    def clear_cleanroom_results(self, request):
        """
        清除洁净用品检测结果
        支持按条件筛选删除
        """
        try:
            # 获取请求参数
            reason = request.data.get('reason', '用户手动清除')
            count = request.data.get('count', 0)

            # 筛选洁净用品检测结果（使用多种条件匹配前端逻辑）
            from django.db.models import Q

            # 构建查询条件，与前端筛选逻辑保持一致
            cleanroom_conditions = Q()

            # 1. detection_type = 'cleanroom_ppe'
            cleanroom_conditions |= Q(detection_type='cleanroom_ppe')

            # 2. 原因包含洁净用品相关关键词
            cleanroom_keywords = [
                '洁净帽', '口罩', '洁净服', '洁净用品', 'PPE', '防护装备', '灌缝帽',
                '未检测到人员或PPE装备严重不足', '人员检测', '洁净用品检测'
            ]
            for keyword in cleanroom_keywords:
                cleanroom_conditions |= Q(reason__icontains=keyword)

            # 3. 没有standardId且原因包含洁净用品关键词
            cleanroom_conditions |= Q(standard__isnull=True) & Q(reason__icontains='PPE')

            cleanroom_results = InspectionResult.objects.filter(cleanroom_conditions)

            # 记录删除前的数量
            total_to_delete = cleanroom_results.count()

            if total_to_delete == 0:
                return Response({
                    'message': '没有找到洁净用品检测结果',
                    'deleted_count': 0
                }, status=status.HTTP_200_OK)

            # 执行删除
            cleanroom_results.delete()

            # 记录操作日志（可选，如果用户未认证则跳过）
            try:
                from django.contrib.admin.models import LogEntry, ADDITION
                if request.user.is_authenticated:
                    LogEntry.objects.log_action(
                        user_id=request.user.id,
                        content_type_id=None,
                        object_id=None,
                        object_repr='洁净用品检测结果清除',
                        action_flag=ADDITION,
                        change_message=f'清除了 {total_to_delete} 条洁净用品检测结果，原因: {reason}'
                    )
            except Exception as log_error:
                # 日志记录失败不影响主要功能
                print(f"日志记录失败: {log_error}")

            return Response({
                'message': f'成功清除 {total_to_delete} 条洁净用品检测结果',
                'deleted_count': total_to_delete,
                'reason': reason,
                'timestamp': timezone.now().isoformat()
            }, status=status.HTTP_200_OK)

        except Exception as e:
            return Response({
                'error': f'清除洁净用品检测结果失败: {str(e)}',
                'message': '清除操作失败，请稍后重试'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['get'], url_path='data-stats')
    def data_stats(self, request):
        """
        获取数据统计信息
        包括齐套化结果和OCR结果的数量和存储大小
        """
        try:
            # 齐套化结果统计
            kit_results = InspectionResult.objects.filter(detection_type='kit_matching')
            kit_count = kit_results.count()
            kit_size_bytes = 0 # 暂时跳过耗时的文件大小计算

            # OCR结果统计（包括ocr_inspection和ocr_fusion_inspection）
            ocr_results = InspectionResult.objects.filter(
                Q(detection_type='ocr_inspection') | Q(detection_type='ocr_fusion_inspection')
            )
            ocr_count = ocr_results.count()
            ocr_size_bytes = 0 # 暂时跳过耗时的文件大小计算

            # 转换为MB
            kit_size_mb = round(kit_size_bytes / (1024 * 1024), 2)
            ocr_size_mb = round(ocr_size_bytes / (1024 * 1024), 2)

            return Response({
                'kit_matching': {
                    'count': kit_count,
                    'size_bytes': kit_size_bytes,
                    'size_mb': kit_size_mb,
                    'size_display': f'{kit_size_mb} MB'
                },
                'ocr_results': {
                    'count': ocr_count,
                    'size_bytes': ocr_size_bytes,
                    'size_mb': ocr_size_mb,
                    'size_display': f'{ocr_size_mb} MB'
                },
                'total': {
                    'count': kit_count + ocr_count,
                    'size_bytes': kit_size_bytes + ocr_size_bytes,
                    'size_mb': round((kit_size_bytes + ocr_size_bytes) / (1024 * 1024), 2),
                    'size_display': f'{round((kit_size_bytes + ocr_size_bytes) / (1024 * 1024), 2)} MB'
                },
                'timestamp': timezone.now().isoformat()
            }, status=status.HTTP_200_OK)

        except Exception as e:
            return Response({
                'error': f'获取数据统计失败: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class ModelVersionViewSet(viewsets.ModelViewSet):
    """模型版本管理视图集"""
    queryset = ModelVersion.objects.all().order_by('-created_at')
    serializer_class = ModelVersionSerializer
    parser_classes = [MultiPartParser, FormParser, FileUploadParser]
    
    def get_serializer_class(self):
        if self.action == 'retrieve':
            return ModelVersionDetailSerializer
        return ModelVersionSerializer
    
    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """激活模型版本"""
        model_version = self.get_object()
        
        # 停用其他同类型模型
        ModelVersion.objects.filter(
            model_type=model_version.model_type,
            status='ACTIVE'
        ).update(status='DEPRECATED')
        
        # 激活当前模型
        model_version.status = 'ACTIVE'
        model_version.deployed_at = datetime.now()
        model_version.save()
        
        return Response({
            'message': f'模型 {model_version.name} v{model_version.version} 已激活',
            'model': ModelVersionSerializer(model_version).data
        })
    
    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        """停用模型版本"""
        model_version = self.get_object()
        model_version.status = 'DEPRECATED'
        model_version.save()
        
        return Response({
            'message': f'模型 {model_version.name} v{model_version.version} 已停用',
            'model': ModelVersionSerializer(model_version).data
        })
    
    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        """下载模型文件"""
        model_version = self.get_object()
        
        if not model_version.model_file:
            return Response({
                'error': '模型文件不存在'
            }, status=status.HTTP_404_NOT_FOUND)
        
        try:
            file_path = model_version.model_file.path
            if not os.path.exists(file_path):
                return Response({
                    'error': '模型文件不存在'
                }, status=status.HTTP_404_NOT_FOUND)
            
            with open(file_path, 'rb') as f:
                response = HttpResponse(f.read(), content_type='application/octet-stream')
                response['Content-Disposition'] = f'attachment; filename="{model_version.name}_v{model_version.version}.pt"'
                return response
        except Exception as e:
            return Response({
                'error': f'下载失败: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=False, methods=['get'])
    def export_config(self, request):
        """导出模型配置"""
        try:
            models = ModelVersion.objects.all()
            config_data = {
                'export_time': datetime.now().isoformat(),
                'total_models': models.count(),
                'models': []
            }
            
            for model in models:
                config_data['models'].append({
                    'id': str(model.id),
                    'name': model.name,
                    'version': model.version,
                    'model_type': model.model_type,
                    'status': model.status,
                    'description': model.description,
                    'accuracy': model.accuracy,
                    'precision': model.precision,
                    'recall': model.recall,
                    'f1_score': model.f1_score,
                    'created_at': model.created_at.isoformat(),
                    'deployed_at': model.deployed_at.isoformat() if model.deployed_at else None
                })
            
            import json
            response = HttpResponse(
                json.dumps(config_data, ensure_ascii=False, indent=2),
                content_type='application/json'
            )
            response['Content-Disposition'] = f'attachment; filename="model_config_{datetime.now().strftime("%Y%m%d")}.json"'
            return response
        except Exception as e:
            return Response({
                'error': f'导出配置失败: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=False, methods=['post'])
    def import_config(self, request):
        """导入模型配置"""
        try:
            config_file = request.FILES.get('config_file')
            if not config_file:
                return Response({
                    'error': '请上传配置文件'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            if not config_file.name.endswith('.json'):
                return Response({
                    'error': '只支持JSON格式的配置文件'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            import json
            config_data = json.loads(config_file.read().decode('utf-8'))
            
            if 'models' not in config_data:
                return Response({
                    'error': '配置文件格式错误'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            imported_count = 0
            for model_data in config_data['models']:
                # 检查模型是否已存在
                existing_model = ModelVersion.objects.filter(
                    name=model_data['name'],
                    version=model_data['version']
                ).first()
                
                if not existing_model:
                    # 创建新模型记录（不包含文件）
                    ModelVersion.objects.create(
                        name=model_data['name'],
                        version=model_data['version'],
                        model_type=model_data.get('model_type', 'PPE_YOLO'),
                        status=model_data.get('status', 'DRAFT'),
                        description=model_data.get('description', ''),
                        accuracy=model_data.get('accuracy'),
                        precision=model_data.get('precision'),
                        recall=model_data.get('recall'),
                        f1_score=model_data.get('f1_score')
                    )
                    imported_count += 1
            
            return Response({
                'message': f'成功导入 {imported_count} 个模型配置',
                'imported_count': imported_count
            })
        except json.JSONDecodeError:
            return Response({
                'error': '配置文件格式错误'
            }, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({
                'error': f'导入配置失败: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=False, methods=['get'])
    def active_models(self, request):
        """获取所有激活的模型"""
        active_models = ModelVersion.objects.filter(status='ACTIVE')
        return Response(ModelVersionSerializer(active_models, many=True).data)
    
    @action(detail=False, methods=['get'])
    def model_types(self, request):
        """获取所有模型类型"""
        return Response({
            'model_types': dict(ModelVersion.MODEL_TYPES),
            'status_choices': dict(ModelVersion.STATUS_CHOICES)
        })

class ModelDeploymentViewSet(viewsets.ModelViewSet):
    """模型部署管理视图集"""
    queryset = ModelDeployment.objects.all().order_by('-created_at')
    serializer_class = ModelDeploymentSerializer
    
    def get_serializer_class(self):
        if self.action == 'list':
            return ModelDeploymentStatusSerializer
        return ModelDeploymentSerializer
    
    @action(detail=True, methods=['post'])
    def deploy(self, request, pk=None):
        """部署模型"""
        deployment = self.get_object()
        
        if deployment.status == 'ACTIVE':
            return Response({'error': '模型已经处于激活状态'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            # 更新部署状态
            deployment.status = 'DEPLOYING'
            deployment.deployed_by = request.data.get('deployed_by', 'system')
            deployment.save()
            
            # 这里可以添加实际的部署逻辑
            # 例如：复制模型文件到指定目录、重启服务等
            
            # 模拟部署成功
            deployment.status = 'ACTIVE'
            deployment.deployed_at = datetime.now()
            deployment.save()
            
            return Response({
                'message': f'模型 {deployment.model_version.name} 部署成功',
                'deployment': ModelDeploymentSerializer(deployment).data
            })
            
        except Exception as e:
            deployment.status = 'FAILED'
            deployment.save()
            return Response({
                'error': f'部署失败: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'])
    def stop(self, request, pk=None):
        """停止部署"""
        deployment = self.get_object()
        
        if deployment.status != 'ACTIVE':
            return Response({'error': '模型未处于激活状态'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            # 这里可以添加实际的停止逻辑
            
            deployment.status = 'STOPPED'
            deployment.stopped_at = datetime.now()
            deployment.save()
            
            return Response({
                'message': f'模型 {deployment.model_version.name} 已停止',
                'deployment': ModelDeploymentSerializer(deployment).data
            })
            
        except Exception as e:
            return Response({
                'error': f'停止失败: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'])
    def update_performance(self, request, pk=None):
        """更新性能指标"""
        deployment = self.get_object()
        
        # 记录性能数据
        performance_data = {
            'model_version': deployment.model_version,
            'deployment': deployment,
            'response_time': request.data.get('response_time', 0),
            'memory_usage': request.data.get('memory_usage', 0),
            'cpu_usage': request.data.get('cpu_usage', 0),
            'gpu_usage': request.data.get('gpu_usage'),
            'request_count': request.data.get('request_count', 1),
            'success_count': request.data.get('success_count', 1),
            'error_count': request.data.get('error_count', 0),
        }
        
        ModelPerformance.objects.create(**performance_data)
        
        # 更新部署统计
        deployment.request_count += performance_data['request_count']
        deployment.error_count += performance_data['error_count']
        
        # 计算平均响应时间
        if deployment.request_count > 0:
            deployment.avg_response_time = (
                (deployment.avg_response_time * (deployment.request_count - performance_data['request_count']) + 
                 performance_data['response_time'] * performance_data['request_count']) / 
                deployment.request_count
            )
        
        deployment.save()
        
        return Response({'message': '性能指标更新成功'})

class ModelUploadViewSet(viewsets.ModelViewSet):
    """模型上传管理视图集"""
    queryset = ModelUpload.objects.all().order_by('-uploaded_at')
    serializer_class = ModelUploadSerializer
    parser_classes = [MultiPartParser, FormParser, FileUploadParser]
    
    def get_serializer_class(self):
        if self.action == 'list':
            return ModelUploadProgressSerializer
        return ModelUploadSerializer
    
    @action(detail=False, methods=['post'])
    def upload_model(self, request):
        """上传模型文件"""
        model_file = request.FILES.get('model_file')
        if not model_file:
            return Response({'error': '请选择模型文件'}, status=status.HTTP_400_BAD_REQUEST)
        
        # 创建上传记录
        upload_record = ModelUpload.objects.create(
            file_name=model_file.name,
            file_size=model_file.size,
            uploaded_by=request.data.get('uploaded_by', 'system'),
            status='UPLOADING'
        )
        
        try:
            # 保存文件
            file_path = default_storage.save(f'models/{upload_record.id}_{model_file.name}', model_file)
            
            # 计算文件哈希
            model_file.seek(0)
            file_hash = hashlib.sha256(model_file.read()).hexdigest()
            
            # 更新上传记录
            upload_record.status = 'VALIDATING'
            upload_record.save()
            
            # 验证模型文件
            validation_result = ModelManager.validate_model_file(file_path)
            
            if validation_result['valid']:
                # 创建模型版本
                model_version = ModelVersion.objects.create(
                    name=request.data.get('name', f'Model_{upload_record.id}'),
                    version=request.data.get('version', '1.0.0'),
                    model_type=request.data.get('model_type', 'PPE_YOLO'),
                    model_file=file_path,
                    file_size=model_file.size,
                    file_hash=file_hash,
                    description=request.data.get('description', ''),
                    author=request.data.get('author', ''),
                    tags=request.data.get('tags', []),
                    validation_result=validation_result
                )
                
                upload_record.status = 'SUCCESS'
                upload_record.model_version = model_version
                upload_record.validation_result = validation_result
                upload_record.completed_at = datetime.now()
                upload_record.save()
                
                return Response({
                    'message': '模型上传成功',
                    'upload': ModelUploadSerializer(upload_record).data,
                    'model_version': ModelVersionSerializer(model_version).data
                })
            else:
                upload_record.status = 'FAILED'
                upload_record.error_message = validation_result.get('error', '模型验证失败')
                upload_record.validation_result = validation_result
                upload_record.save()
                
                return Response({
                    'error': '模型验证失败',
                    'details': validation_result
                }, status=status.HTTP_400_BAD_REQUEST)
                
        except Exception as e:
            upload_record.status = 'FAILED'
            upload_record.error_message = str(e)
            upload_record.save()
            
            return Response({
                'error': f'上传失败: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=False, methods=['get'])
    def list_all(self, request):
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def progress(self, request, pk=None):
        """获取上传进度"""
        upload = self.get_object()
        return Response(ModelUploadProgressSerializer(upload).data)


class ProductRecipeViewSet(viewsets.ModelViewSet):
    queryset = ProductRecipe.objects.all().order_by('-updated_at')
    serializer_class = ProductRecipeSerializer

    @action(detail=True, methods=['post'], url_path='assign-stages')
    def assign_stages(self, request, pk=None):
        """
        Assign a list of stage recipes to this product recipe with specific ordering.
        Payload: { "stages": [ { "stage_recipe_id": "uuid", "order": 0 }, ... ] }
        """
        product = self.get_object()
        stages_data = request.data.get('stages', [])

        if not isinstance(stages_data, list):
            return Response({'error': 'stages must be a list'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            # Clear existing links
            ProductStage.objects.filter(product_recipe=product).delete()

            # Create new links
            created_links = []
            for item in stages_data:
                stage_id = item.get('stage_recipe_id')
                order = item.get('order', 0)
                try:
                    stage_template = StageRecipeTemplate.objects.get(id=stage_id)
                    link = ProductStage.objects.create(
                        product_recipe=product,
                        stage_recipe=stage_template,
                        order=order,
                        is_fqc=item.get('is_fqc', False),
                    )
                    created_links.append(link)
                except StageRecipeTemplate.DoesNotExist:
                    continue

        serializer = ProductStageSerializer(created_links, many=True)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

class FQCRecordViewSet(viewsets.ReadOnlyModelViewSet):
    """FQC终检记录（只读）"""
    queryset = FQCRecord.objects.all().order_by('-created_at')
    serializer_class = FQCRecordSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        fixture_qr = self.request.query_params.get('fixture_qr')
        if fixture_qr:
            qs = qs.filter(fixture_qr=fixture_qr)
        product_recipe_id = self.request.query_params.get('product_recipe')
        if product_recipe_id:
            qs = qs.filter(product_recipe_id=product_recipe_id)
        return qs


class ModelPerformanceViewSet(viewsets.ModelViewSet):
    """模型性能管理视图集"""
    queryset = ModelPerformance.objects.all().order_by('-timestamp')
    serializer_class = ModelPerformanceSerializer
    
    @action(detail=False, methods=['get'])
    def statistics(self, request):
        """获取性能统计"""
        model_version_id = request.query_params.get('model_version_id')
        deployment_id = request.query_params.get('deployment_id')
        
        queryset = self.get_queryset()
        
        if model_version_id:
            queryset = queryset.filter(model_version_id=model_version_id)
        if deployment_id:
            queryset = queryset.filter(deployment_id=deployment_id)
        
        # 计算统计信息
        total_records = queryset.count()
        if total_records == 0:
            return Response({'message': '暂无性能数据'})
        
        avg_response_time = queryset.aggregate(avg=models.Avg('response_time'))['avg']
        avg_memory_usage = queryset.aggregate(avg=models.Avg('memory_usage'))['avg']
        avg_cpu_usage = queryset.aggregate(avg=models.Avg('cpu_usage'))['avg']
        
        total_requests = queryset.aggregate(total=models.Sum('request_count'))['total']
        total_success = queryset.aggregate(total=models.Sum('success_count'))['total']
        total_errors = queryset.aggregate(total=models.Sum('error_count'))['total']
        
        success_rate = (total_success / total_requests * 100) if total_requests > 0 else 0
        
        return Response({
            'total_records': total_records,
            'avg_response_time': round(avg_response_time, 2) if avg_response_time else 0,
            'avg_memory_usage': round(avg_memory_usage, 2) if avg_memory_usage else 0,
            'avg_cpu_usage': round(avg_cpu_usage, 2) if avg_cpu_usage else 0,
            'total_requests': total_requests,
            'total_success': total_success,
            'total_errors': total_errors,
            'success_rate': round(success_rate, 2)
        })


class OCRKeywordTemplateViewSet(viewsets.ModelViewSet):
    """OCR关键词模板管理"""
    queryset = OCRKeywordTemplate.objects.all().order_by('-updated_at')
    serializer_class = OCRKeywordTemplateSerializer


class OCRBarcodeTemplateViewSet(viewsets.ModelViewSet):
    """OCR二维码模板管理"""
    queryset = OCRBarcodeTemplate.objects.all().order_by('-updated_at')
    serializer_class = OCRBarcodeTemplateSerializer


class StageRecipeTemplateViewSet(viewsets.ModelViewSet):
    """工序配方模版管理"""
    queryset = StageRecipeTemplate.objects.all()
    serializer_class = StageRecipeTemplateSerializer

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except models.ProtectedError:
            return Response(
                {'detail': '该配方已被产品引用，请先解除绑定后再删除'},
                status=status.HTTP_409_CONFLICT,
            )

# 数据同步状态检查API
@csrf_exempt
def sync_status_api(request):
    """
    数据同步状态检查API
    返回详细的同步状态信息
    """
    if request.method != 'GET':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    
    try:
        from django.db.models import Max, Count, Q
        from django.core.cache import cache
        
        # 获取数据统计
        total_results = InspectionResult.objects.count()
        today_results = InspectionResult.objects.filter(
            timestamp__date=timezone.now().date()
        ).count()
        
        # 获取最后更新时间
        last_update = InspectionResult.objects.aggregate(
            last_update=Max('timestamp')
        )['last_update']
        
        # 获取PPE检测统计
        ppe_stats = {
            'total': total_results,
            'today': today_results,
            'qualified': InspectionResult.objects.filter(overall_quality='合格').count(),
            'unqualified': InspectionResult.objects.filter(overall_quality='不合格').count(),
            'recheck': InspectionResult.objects.filter(overall_quality='需复检').count(),
        }
        
        # 获取缓存状态
        cache_status = {
            'last_sync': cache.get('last_data_sync'),
            'needs_sync': cache.get('needs_sync', False),
            'last_auto_sync': cache.get('last_auto_sync'),
        }
        
        # 获取数据库连接状态
        try:
            # 检查数据库连接是否可用
            from django.db import connection
            cursor = connection.cursor()
            cursor.execute("SELECT 1")
            cursor.fetchone()
            cursor.close()
            db_connected = True
        except Exception:
            db_connected = False
            
        db_status = {
            'connected': db_connected,
            'connection_info': 'SQLite数据库连接正常' if db_connected else '数据库连接异常',
        }
        
        # 获取性能指标
        perf_data = cache.get('perf_api_results', {})
        
        return JsonResponse({
            'sync_status': 'success',
            'timestamp': timezone.now().isoformat(),
            'data_stats': ppe_stats,
            'cache_status': cache_status,
            'database_status': db_status,
            'performance': perf_data,
            'message': '数据同步状态正常'
        })
        
    except Exception as e:
        return JsonResponse({
            'sync_status': 'error',
            'error': str(e),
            'timestamp': timezone.now().isoformat()
        }, status=500)

@csrf_exempt
def force_sync_api(request):
    """
    强制数据同步API
    清理过期数据，重新计算统计数据
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    
    try:
        from django.core.cache import cache
        
        # 清理30天前的数据（可选）
        thirty_days_ago = timezone.now() - timedelta(days=30)
        old_results = InspectionResult.objects.filter(timestamp__lt=thirty_days_ago)
        old_count = old_results.count()
        old_results.delete()
        
        # 重新计算统计数据
        total_results = InspectionResult.objects.count()
        qualified_count = InspectionResult.objects.filter(overall_quality='合格').count()
        unqualified_count = InspectionResult.objects.filter(overall_quality='不合格').count()
        recheck_count = InspectionResult.objects.filter(overall_quality='需复检').count()
        
        # 清理缓存并重新连接数据库
        cache.clear()
        connection.close()
        connection.ensure_connection()
        
        # 更新同步状态
        cache.set('last_data_sync', timezone.now(), 3600)
        cache.delete('needs_sync')
        
        return JsonResponse({
            'sync_status': 'success',
            'message': '强制同步完成',
            'cleaned_old_data': old_count,
            'current_stats': {
                'total': total_results,
                'qualified': qualified_count,
                'unqualified': unqualified_count,
                'recheck': recheck_count
            },
            'timestamp': timezone.now().isoformat()
        })
        
    except Exception as e:
        return JsonResponse({
            'sync_status': 'error',
            'error': str(e),
            'timestamp': timezone.now().isoformat()
        }, status=500)
  
