"""
图片预处理API接口
提供高级图片预处理功能，支持OpenCV算法
"""

import logging
import base64
import numpy as np
import cv2
from typing import Dict, Any, Optional, List
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
import json

logger = logging.getLogger(__name__)

class ImagePreprocessingService:
    """图片预处理服务"""
    
    def __init__(self):
        self.supported_formats = ['jpg', 'jpeg', 'png', 'bmp', 'tiff']
    
    def preprocess_image(self, image_data: str, options: Dict[str, Any]) -> Dict[str, Any]:
        """
        预处理图片
        
        Args:
            image_data: base64编码的图片数据
            options: 预处理选项
            
        Returns:
            dict: 预处理结果
        """
        try:
            # 解码图片
            if 'base64,' in image_data:
                image_data = image_data.split('base64,', 1)[1]
            
            image_bytes = base64.b64decode(image_data)
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if img is None:
                return {
                    'success': False,
                    'error': '图片解码失败',
                    'processed_image': None
                }
            
            # 应用预处理
            processed_img = self._apply_preprocessing(img, options)
            
            # 编码处理后的图片
            _, buffer = cv2.imencode('.jpg', processed_img)
            processed_base64 = base64.b64encode(buffer).decode('utf-8')
            
            return {
                'success': True,
                'processed_image': f'data:image/jpeg;base64,{processed_base64}',
                'original_size': img.shape[:2],
                'processed_size': processed_img.shape[:2],
                'applied_options': options
            }
            
        except Exception as e:
            logger.error(f'图片预处理失败: {str(e)}')
            return {
                'success': False,
                'error': f'预处理失败: {str(e)}',
                'processed_image': None
            }
    
    def _apply_preprocessing(self, img: np.ndarray, options: Dict[str, Any]) -> np.ndarray:
        """应用预处理选项"""
        processed_img = img.copy()
        
        # 亮度调整
        if 'brightness' in options and options['brightness'] != 0:
            processed_img = self._adjust_brightness(processed_img, options['brightness'])
        
        # 对比度调整
        if 'contrast' in options and options['contrast'] != 0:
            processed_img = self._adjust_contrast(processed_img, options['contrast'])
        
        # 锐化
        if 'sharpness' in options and options['sharpness'] > 0:
            processed_img = self._apply_sharpening(processed_img, options['sharpness'])
        
        # 旋转
        if 'rotation' in options and options['rotation'] != 0:
            processed_img = self._rotate_image(processed_img, options['rotation'])
        
        # 去噪
        if options.get('denoise', False):
            processed_img = self._denoise_image(processed_img)
        
        # 灰度转换
        if options.get('grayscale', False):
            processed_img = self._convert_to_grayscale(processed_img)
        
        # 二值化
        if 'binary_threshold' in options:
            processed_img = self._apply_binary_threshold(processed_img, options['binary_threshold'])
        
        # 尺寸调整
        if 'scale' in options and options['scale'] != 1.0:
            processed_img = self._scale_image(processed_img, options['scale'])
        
        return processed_img
    
    def _adjust_brightness(self, img: np.ndarray, brightness: int) -> np.ndarray:
        """调整亮度"""
        return cv2.convertScaleAbs(img, alpha=1.0, beta=brightness)
    
    def _adjust_contrast(self, img: np.ndarray, contrast: float) -> np.ndarray:
        """调整对比度"""
        return cv2.convertScaleAbs(img, alpha=contrast, beta=0)
    
    def _apply_sharpening(self, img: np.ndarray, strength: float) -> np.ndarray:
        """应用锐化"""
        kernel = np.array([[-1,-1,-1],
                          [-1, 9,-1],
                          [-1,-1,-1]]) * strength
        return cv2.filter2D(img, -1, kernel)
    
    def _rotate_image(self, img: np.ndarray, angle: float) -> np.ndarray:
        """旋转图片"""
        h, w = img.shape[:2]
        center = (w // 2, h // 2)
        rotation_matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
        return cv2.warpAffine(img, rotation_matrix, (w, h))
    
    def _denoise_image(self, img: np.ndarray) -> np.ndarray:
        """去噪处理"""
        return cv2.fastNlMeansDenoisingColored(img, None, 10, 10, 7, 21)
    
    def _convert_to_grayscale(self, img: np.ndarray) -> np.ndarray:
        """转换为灰度图"""
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
    
    def _apply_binary_threshold(self, img: np.ndarray, threshold: int) -> np.ndarray:
        """应用二值化阈值"""
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        _, binary = cv2.threshold(gray, threshold, 255, cv2.THRESH_BINARY)
        return cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR)
    
    def _scale_image(self, img: np.ndarray, scale: float) -> np.ndarray:
        """缩放图片"""
        h, w = img.shape[:2]
        new_h, new_w = int(h * scale), int(w * scale)
        return cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
    
    def analyze_image_quality(self, image_data: str) -> Dict[str, Any]:
        """
        分析图片质量
        
        Args:
            image_data: base64编码的图片数据
            
        Returns:
            dict: 质量分析结果
        """
        try:
            # 解码图片
            if 'base64,' in image_data:
                image_data = image_data.split('base64,', 1)[1]
            
            image_bytes = base64.b64decode(image_data)
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if img is None:
                return {
                    'success': False,
                    'error': '图片解码失败'
                }
            
            # 转换为灰度图进行分析
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            
            # 计算各种质量指标
            metrics = {
                'brightness': float(np.mean(gray)),
                'contrast': float(np.std(gray)),
                'sharpness': self._calculate_sharpness(gray),
                'noise': self._calculate_noise(gray),
                'blur': self._calculate_blur(gray),
                'resolution': img.shape[:2],
                'file_size': len(image_bytes)
            }
            
            return {
                'success': True,
                'metrics': metrics,
                'recommendations': self._generate_recommendations(metrics)
            }
            
        except Exception as e:
            logger.error(f'图片质量分析失败: {str(e)}')
            return {
                'success': False,
                'error': f'质量分析失败: {str(e)}'
            }
    
    def _calculate_sharpness(self, gray_img: np.ndarray) -> float:
        """计算清晰度（使用拉普拉斯算子）"""
        laplacian = cv2.Laplacian(gray_img, cv2.CV_64F)
        return float(np.var(laplacian))
    
    def _calculate_noise(self, gray_img: np.ndarray) -> float:
        """计算噪点程度"""
        # 使用局部方差估计噪点
        kernel = np.ones((3,3), np.float32) / 9
        mean = cv2.filter2D(gray_img.astype(np.float32), -1, kernel)
        variance = cv2.filter2D((gray_img.astype(np.float32) - mean) ** 2, -1, kernel)
        return float(np.mean(variance))
    
    def _calculate_blur(self, gray_img: np.ndarray) -> float:
        """计算模糊程度"""
        # 使用拉普拉斯算子检测边缘
        laplacian = cv2.Laplacian(gray_img, cv2.CV_64F)
        return float(np.var(laplacian))
    
    def _generate_recommendations(self, metrics: Dict[str, Any]) -> List[Dict[str, Any]]:
        """生成预处理推荐"""
        recommendations = []
        
        # 亮度推荐
        if metrics['brightness'] < 80:
            recommendations.append({
                'type': 'brightness',
                'value': 30,
                'confidence': 0.8,
                'reason': '图片过暗，建议增加亮度'
            })
        elif metrics['brightness'] > 200:
            recommendations.append({
                'type': 'brightness',
                'value': -30,
                'confidence': 0.8,
                'reason': '图片过亮，建议降低亮度'
            })
        
        # 对比度推荐
        if metrics['contrast'] < 30:
            recommendations.append({
                'type': 'contrast',
                'value': 1.5,
                'confidence': 0.9,
                'reason': '对比度不足，建议增强对比度'
            })
        
        # 锐化推荐
        if metrics['sharpness'] < 100:
            recommendations.append({
                'type': 'sharpness',
                'value': 0.8,
                'confidence': 0.7,
                'reason': '图片不够清晰，建议应用锐化'
            })
        
        # 去噪推荐
        if metrics['noise'] > 50:
            recommendations.append({
                'type': 'denoise',
                'value': True,
                'confidence': 0.8,
                'reason': '图片噪点较多，建议去噪处理'
            })
        
        return recommendations

# 全局服务实例
preprocessing_service = ImagePreprocessingService()

@csrf_exempt
@require_http_methods(["POST"])
def preprocess_image_api(request):
    """图片预处理API"""
    try:
        data = json.loads(request.body)
        image_data = data.get('image_data')
        options = data.get('options', {})
        
        if not image_data:
            return JsonResponse({
                'success': False,
                'error': '缺少图片数据'
            }, status=400)
        
        result = preprocessing_service.preprocess_image(image_data, options)
        
        if result['success']:
            return JsonResponse(result)
        else:
            return JsonResponse(result, status=400)
            
    except json.JSONDecodeError:
        return JsonResponse({
            'success': False,
            'error': '无效的JSON数据'
        }, status=400)
    except Exception as e:
        logger.error(f'预处理API错误: {str(e)}')
        return JsonResponse({
            'success': False,
            'error': f'服务器错误: {str(e)}'
        }, status=500)

@csrf_exempt
@require_http_methods(["POST"])
def analyze_image_quality_api(request):
    """图片质量分析API"""
    try:
        data = json.loads(request.body)
        image_data = data.get('image_data')
        
        if not image_data:
            return JsonResponse({
                'success': False,
                'error': '缺少图片数据'
            }, status=400)
        
        result = preprocessing_service.analyze_image_quality(image_data)
        
        if result['success']:
            return JsonResponse(result)
        else:
            return JsonResponse(result, status=400)
            
    except json.JSONDecodeError:
        return JsonResponse({
            'success': False,
            'error': '无效的JSON数据'
        }, status=400)
    except Exception as e:
        logger.error(f'质量分析API错误: {str(e)}')
        return JsonResponse({
            'success': False,
            'error': f'服务器错误: {str(e)}'
        }, status=500)

@require_http_methods(["GET"])
def preprocessing_status_api(request):
    """预处理服务状态API"""
    return JsonResponse({
        'success': True,
        'status': 'running',
        'supported_formats': preprocessing_service.supported_formats,
        'version': '1.0.0'
    })
