"""
滤芯检测专用配置文件
用于控制滤芯检测的抓拍逻辑和最佳照片选择
"""

import time
import cv2
import numpy as np
from typing import List, Dict, Any, Tuple
import os

class FilterCoreDetectionConfig:
    """滤芯检测配置类"""
    
    def __init__(self):
        # 检测参数
        self.detection_window = 5  # 检测窗口时间（秒）
        self.capture_interval = 0.5  # 抓拍间隔（秒）
        self.max_captures = 10  # 最大抓拍数量
        self.quality_threshold = 0.7  # 照片质量阈值
        self.confidence_threshold = 0.6  # 检测置信度阈值
        
        # 照片质量评估权重
        self.quality_weights = {
            'sharpness': 0.3,  # 清晰度权重
            'brightness': 0.2,  # 亮度权重
            'contrast': 0.2,   # 对比度权重
            'size': 0.2,       # 物体大小权重
            'position': 0.1    # 位置权重
        }
        
        # 抓拍状态
        self.capture_session = None
        self.captured_images = []
        self.best_image = None
        self.detection_start_time = None
        
    def start_detection_session(self):
        """开始检测会话"""
        self.capture_session = {
            'start_time': time.time(),
            'images': [],
            'detections': [],
            'best_score': 0,
            'best_image': None
        }
        self.detection_start_time = time.time()
        print(f"开始滤芯检测会话，检测窗口: {self.detection_window}秒")
        
    def should_capture(self, detection_confidence: float) -> bool:
        """判断是否应该抓拍"""
        if not self.capture_session:
            return False
            
        # 检查置信度是否达到阈值
        if detection_confidence < self.confidence_threshold:
            return False
            
        # 检查是否在检测窗口内
        elapsed_time = time.time() - self.detection_start_time
        if elapsed_time > self.detection_window:
            return False
            
        # 检查抓拍间隔
        if self.captured_images:
            last_capture_time = self.captured_images[-1]['timestamp']
            if time.time() - last_capture_time < self.capture_interval:
                return False
                
        # 检查最大抓拍数量
        if len(self.captured_images) >= self.max_captures:
            return False
            
        return True
        
    def evaluate_image_quality(self, image: np.ndarray, detection_box: List[int]) -> float:
        """评估照片质量"""
        try:
            # 提取检测区域
            x1, y1, x2, y2 = detection_box
            roi = image[y1:y2, x1:x2]
            
            if roi.size == 0:
                return 0.0
                
            # 1. 清晰度评估（拉普拉斯方差）
            gray_roi = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY) if len(roi.shape) == 3 else roi
            sharpness = cv2.Laplacian(gray_roi, cv2.CV_64F).var()
            sharpness_score = min(sharpness / 1000, 1.0)  # 归一化到0-1
            
            # 2. 亮度评估
            brightness = np.mean(gray_roi)
            brightness_score = 1.0 - abs(brightness - 127.5) / 127.5  # 越接近127.5越好
            
            # 3. 对比度评估
            contrast = np.std(gray_roi)
            contrast_score = min(contrast / 100, 1.0)  # 归一化到0-1
            
            # 4. 物体大小评估
            area = (x2 - x1) * (y2 - y1)
            image_area = image.shape[0] * image.shape[1]
            size_ratio = area / image_area
            size_score = min(size_ratio * 10, 1.0)  # 归一化到0-1
            
            # 5. 位置评估（中心位置更好）
            center_x = (x1 + x2) / 2
            center_y = (y1 + y2) / 2
            image_center_x = image.shape[1] / 2
            image_center_y = image.shape[0] / 2
            distance_from_center = np.sqrt((center_x - image_center_x)**2 + (center_y - image_center_y)**2)
            max_distance = np.sqrt(image_center_x**2 + image_center_y**2)
            position_score = 1.0 - (distance_from_center / max_distance)
            
            # 计算综合质量分数
            quality_score = (
                sharpness_score * self.quality_weights['sharpness'] +
                brightness_score * self.quality_weights['brightness'] +
                contrast_score * self.quality_weights['contrast'] +
                size_score * self.quality_weights['size'] +
                position_score * self.quality_weights['position']
            )
            
            return quality_score
            
        except Exception as e:
            print(f"照片质量评估失败: {e}")
            return 0.0
            
    def capture_image(self, image: np.ndarray, detection_box: List[int], confidence: float) -> bool:
        """抓拍照片"""
        if not self.should_capture(confidence):
            return False
            
        # 评估照片质量
        quality_score = self.evaluate_image_quality(image, detection_box)
        
        # 记录抓拍信息
        capture_info = {
            'timestamp': time.time(),
            'confidence': confidence,
            'quality_score': quality_score,
            'detection_box': detection_box,
            'image': image.copy()
        }
        
        self.captured_images.append(capture_info)
        
        # 更新最佳照片
        if quality_score > self.capture_session['best_score']:
            self.capture_session['best_score'] = quality_score
            self.capture_session['best_image'] = capture_info
            self.best_image = capture_info
            
        print(f"抓拍照片 - 置信度: {confidence:.3f}, 质量分数: {quality_score:.3f}")
        return True
        
    def get_best_image(self) -> Dict[str, Any]:
        """获取最佳照片"""
        if self.capture_session and self.capture_session['best_image']:
            return self.capture_session['best_image']
        return None
        
    def end_detection_session(self) -> Dict[str, Any]:
        """结束检测会话并返回结果"""
        if not self.capture_session:
            return None
            
        result = {
            'total_captures': len(self.captured_images),
            'best_image': self.capture_session['best_image'],
            'all_images': self.captured_images,
            'detection_duration': time.time() - self.detection_start_time,
            'best_quality_score': self.capture_session['best_score']
        }
        
        print(f"检测会话结束 - 总抓拍: {result['total_captures']}, 最佳质量: {result['best_quality_score']:.3f}")
        
        # 重置会话
        self.capture_session = None
        self.captured_images = []
        self.best_image = None
        self.detection_start_time = None
        
        return result
        
    def save_best_image(self, output_path: str) -> bool:
        """保存最佳照片"""
        best_image = self.get_best_image()
        if not best_image:
            return False
            
        try:
            cv2.imwrite(output_path, best_image['image'])
            print(f"最佳照片已保存到: {output_path}")
            return True
        except Exception as e:
            print(f"保存最佳照片失败: {e}")
            return False
            
    def get_detection_status(self) -> Dict[str, Any]:
        """获取检测状态"""
        if not self.capture_session:
            return {'active': False}
            
        elapsed_time = time.time() - self.detection_start_time
        remaining_time = max(0, self.detection_window - elapsed_time)
        
        return {
            'active': True,
            'elapsed_time': elapsed_time,
            'remaining_time': remaining_time,
            'captured_count': len(self.captured_images),
            'max_captures': self.max_captures,
            'best_quality_score': self.capture_session['best_score']
        }

# 创建全局实例
filter_core_detection_config = FilterCoreDetectionConfig()
