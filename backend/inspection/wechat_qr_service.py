"""
微信二维码检测服务
基于OpenCV的WeChatQRCode模块提供高精度二维码检测
"""
import base64
import io
import logging
import json
import os
import cv2
import numpy as np
from PIL import Image
from typing import List, Dict, Any, Optional, Tuple

logger = logging.getLogger(__name__)

class WeChatQRService:
    """微信二维码检测服务"""
    
    def __init__(self):
        """初始化微信二维码检测服务"""
        self.detector = None
        self.model_loaded = False
        self.model_path = None
        self._setup_model_path()
        logger.info("微信二维码检测服务初始化完成")
    
    def _setup_model_path(self):
        """设置模型文件路径"""
        # 创建模型目录
        model_dir = os.path.join(os.path.dirname(__file__), '..', 'models', 'wechat_qr')
        os.makedirs(model_dir, exist_ok=True)
        self.model_path = model_dir
        
        # 检查模型文件是否存在
        required_files = [
            'detect.prototxt',
            'detect.caffemodel', 
            'sr.prototxt',
            'sr.caffemodel'
        ]
        
        missing_files = []
        for file in required_files:
            if not os.path.exists(os.path.join(model_dir, file)):
                missing_files.append(file)
        
        if missing_files:
            logger.warning(f"微信二维码模型文件缺失: {missing_files}")
            logger.info("请从以下地址下载模型文件:")
            logger.info("https://github.com/WeChatCV/opencv_3rdparty")
            logger.info(f"并将文件放置到: {model_dir}")
        else:
            logger.info("微信二维码模型文件检查完成")
    
    def _load_model(self) -> bool:
        """加载微信二维码检测模型"""
        if self.model_loaded and self.detector is not None:
            return True
        
        try:
            # 检查模型文件是否存在
            detect_prototxt = os.path.join(self.model_path, 'detect.prototxt')
            detect_caffemodel = os.path.join(self.model_path, 'detect.caffemodel')
            sr_prototxt = os.path.join(self.model_path, 'sr.prototxt')
            sr_caffemodel = os.path.join(self.model_path, 'sr.caffemodel')
            
            if not all(os.path.exists(f) for f in [detect_prototxt, detect_caffemodel, sr_prototxt, sr_caffemodel]):
                logger.error("微信二维码模型文件不完整，无法加载")
                return False
            
            # 初始化WeChatQRCode检测器
            self.detector = cv2.wechat_qrcode_WeChatQRCode(
                detect_prototxt,
                detect_caffemodel,
                sr_prototxt,
                sr_caffemodel
            )
            
            self.model_loaded = True
            logger.info("微信二维码检测模型加载成功")
            return True
            
        except Exception as e:
            logger.error(f"微信二维码模型加载失败: {str(e)}")
            return False
    
    def detect_qr_codes(self, image_data: str) -> Dict[str, Any]:
        """
        检测图片中的二维码
        
        Args:
            image_data: base64编码的图片数据
            
        Returns:
            dict: 检测结果
        """
        try:
            # 加载模型
            if not self._load_model():
                return {
                    'success': False,
                    'error': '微信二维码检测模型加载失败',
                    'detected_codes': [],
                    'count': 0
                }
            
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
                    'detected_codes': [],
                    'count': 0
                }
            
            # 使用微信二维码检测器进行检测
            results, points = self.detector.detectAndDecode(img)
            
            detected_codes = []
            for i, (result, point) in enumerate(zip(results, points)):
                if result:  # 只处理成功解码的二维码
                    # 计算二维码边界框
                    if len(point) >= 4:
                        # 获取四个角点
                        corners = np.array(point, dtype=np.int32)
                        x_coords = corners[:, 0]
                        y_coords = corners[:, 1]
                        
                        x_min, x_max = int(np.min(x_coords)), int(np.max(x_coords))
                        y_min, y_max = int(np.min(y_coords)), int(np.max(y_coords))
                        
                        detected_codes.append({
                            'id': i + 1,
                            'data': result,
                            'confidence': 0.95,  # 微信检测器不提供置信度，使用默认值
                            'location': {
                                'x': x_min,
                                'y': y_min,
                                'width': x_max - x_min,
                                'height': y_max - y_min
                            },
                            'corners': point.tolist() if hasattr(point, 'tolist') else point,
                            'type': 'qr'
                        })
            
            logger.info(f"微信二维码检测完成，发现 {len(detected_codes)} 个二维码")
            
            return {
                'success': True,
                'detected_codes': detected_codes,
                'count': len(detected_codes),
                'model_used': 'wechat_qr',
                'message': f'微信二维码检测完成，发现 {len(detected_codes)} 个二维码'
            }
            
        except Exception as e:
            logger.error(f"微信二维码检测失败: {str(e)}")
            return {
                'success': False,
                'error': f'微信二维码检测失败: {str(e)}',
                'detected_codes': [],
                'count': 0
            }
    
    def detect_qr_codes_with_retry(self, image_data: str, expected_codes: List[Dict[str, Any]], max_retries: int = 3) -> Dict[str, Any]:
        """
        带重试机制的二维码检测，支持迭代检测多个二维码
        
        Args:
            image_data: base64编码的图片数据
            expected_codes: 期望检测到的二维码列表
            max_retries: 最大重试次数
            
        Returns:
            dict: 检测结果
        """
        try:
            # 加载模型
            if not self._load_model():
                return {
                    'success': False,
                    'error': '微信二维码检测模型加载失败',
                    'match_results': [],
                    'retry_summary': {'total_retries': 0, 'successful_detections': 0, 'failed_detections': len(expected_codes)}
                }
            
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
                    'match_results': [],
                    'retry_summary': {'total_retries': 0, 'successful_detections': 0, 'failed_detections': len(expected_codes)}
                }
            
            # 初始化匹配结果
            match_results = []
            for expected in expected_codes:
                match_results.append({
                    'expected_text': expected.get('expectedText', ''),
                    'match_mode': expected.get('matchMode', 'contains'),
                    'matched': False,
                    'detected_data': None,
                    'confidence': 0,
                    'location': None,
                    'retry_count': 0
                })
            
            total_retries = 0
            successful_detections = 0
            all_detected_codes = []  # 存储所有检测到的二维码
            masked_img = img.copy()  # 用于遮罩的图片副本
            process_images = []  # 存储处理过程图片
            
            # 执行迭代检测
            iteration = 0
            max_iterations = 10  # 最大迭代次数，防止无限循环
            
            while iteration < max_iterations:
                iteration += 1
                logger.info(f"微信二维码迭代检测 {iteration}/{max_iterations}")
                
                # 保存当前处理状态图片
                process_img = masked_img.copy()
                process_images.append({
                    'iteration': iteration,
                    'image': self._encode_image_to_base64(process_img),
                    'description': f'第{iteration}次迭代开始'
                })
                
                # 使用遮罩后的图片进行检测
                results, points = self.detector.detectAndDecode(masked_img)
                
                if not results or len(results) == 0:
                    logger.info(f"第 {iteration} 次迭代未检测到新的二维码，检测结束")
                    break
                
                total_retries += 1
                iteration_detected = 0
                
                # 处理本次检测到的二维码
                for i, (result, point) in enumerate(zip(results, points)):
                    if result:
                        # 计算位置信息
                        if len(point) >= 4:
                            corners = np.array(point, dtype=np.int32)
                            x_coords = corners[:, 0]
                            y_coords = corners[:, 1]
                            x_min, x_max = int(np.min(x_coords)), int(np.max(x_coords))
                            y_min, y_max = int(np.min(y_coords)), int(np.max(y_coords))
                            
                            # 检查是否匹配期望的二维码
                            matched_any = False
                            for match_result in match_results:
                                if not match_result['matched'] and self._validate_barcode(result, match_result['expected_text'], match_result['match_mode']):
                                    match_result['matched'] = True
                                    match_result['detected_data'] = result
                                    match_result['confidence'] = 0.95
                                    match_result['location'] = {
                                        'x': x_min,
                                        'y': y_min,
                                        'width': x_max - x_min,
                                        'height': y_max - y_min
                                    }
                                    match_result['retry_count'] = iteration
                                    matched_any = True
                                    break
                            
                            # 记录所有检测到的二维码（无论是否匹配期望）
                            all_detected_codes.append({
                                'data': result,
                                'confidence': 0.95,
                                'location': {
                                    'x': x_min,
                                    'y': y_min,
                                    'width': x_max - x_min,
                                    'height': y_max - y_min
                                },
                                'iteration': iteration
                            })
                            
                            # 遮罩检测到的二维码区域 - 进一步优化遮罩参数
                            mask_color = (255, 255, 255)  # 白色遮罩
                            mask_padding = 30  # 进一步增加遮罩边距，从20增加到30
                            
                            # 扩展遮罩区域
                            x_start = max(0, x_min - mask_padding)
                            y_start = max(0, y_min - mask_padding)
                            x_end = min(masked_img.shape[1], x_max + mask_padding)
                            y_end = min(masked_img.shape[0], y_max + mask_padding)
                            
                            # 应用遮罩
                            masked_img[y_start:y_end, x_start:x_end] = mask_color
                            
                            logger.info(f"遮罩二维码区域: ({x_start},{y_start})-({x_end},{y_end}), 边距: {mask_padding}")
                            
                            # 保存遮罩后的图片
                            masked_process_img = masked_img.copy()
                            process_images.append({
                                'iteration': iteration,
                                'image': self._encode_image_to_base64(masked_process_img),
                                'description': f'第{iteration}次迭代 - 遮罩二维码: {result}',
                                'detected_qr': result,
                                'mask_area': {
                                    'x': x_start, 'y': y_start,
                                    'width': x_end - x_start, 'height': y_end - y_start
                                }
                            })
                            
                            iteration_detected += 1
                            successful_detections += 1
                            logger.info(f"检测到二维码: {result} (位置: {x_min},{y_min}-{x_max},{y_max})")
                
                logger.info(f"第 {iteration} 次迭代检测到 {iteration_detected} 个二维码")
                
                # 如果本次迭代没有检测到新的二维码，结束检测
                if iteration_detected == 0:
                    break
            
            # 统计失败的检测
            failed_detections = len([r for r in match_results if not r['matched']])
            
            logger.info(f"微信二维码迭代检测完成: 总共检测到 {len(all_detected_codes)} 个二维码，匹配成功 {successful_detections} 个，失败 {failed_detections} 个，迭代 {iteration} 次")
            
            return {
                'success': True,
                'match_results': match_results,
                'all_detected_codes': all_detected_codes,  # 新增：所有检测到的二维码
                'retry_summary': {
                    'total_retries': total_retries,
                    'successful_detections': successful_detections,
                    'failed_detections': failed_detections,
                    'total_detected': len(all_detected_codes),  # 新增：总检测数量
                    'iterations': iteration  # 新增：迭代次数
                },
                'model_used': 'wechat_qr',
                'message': f'微信二维码迭代检测完成，总共检测到 {len(all_detected_codes)} 个二维码，匹配成功 {successful_detections} 个',
                'original_image': self._encode_image_to_base64(img),  # 原始图片
                'final_masked_image': self._encode_image_to_base64(masked_img),  # 最终遮罩图片
                'process_images': process_images  # 新增：处理过程图片
            }
            
        except Exception as e:
            logger.error(f"微信二维码迭代检测失败: {str(e)}")
            return {
                'success': False,
                'error': f'微信二维码迭代检测失败: {str(e)}',
                'match_results': [],
                'retry_summary': {'total_retries': 0, 'successful_detections': 0, 'failed_detections': len(expected_codes)}
            }
    
    def _validate_barcode(self, detected_data: str, expected_data: str, match_mode: str) -> bool:
        """验证检测到的二维码是否匹配期望值"""
        if match_mode == 'exact':
            return detected_data == expected_data
        else:  # contains
            return expected_data in detected_data or detected_data in expected_data
    
    def get_model_status(self) -> Dict[str, Any]:
        """获取模型状态"""
        return {
            'model_loaded': self.model_loaded,
            'model_path': self.model_path,
            'model_name': 'wechat_qr',
            'available': self.model_loaded,
            'description': '微信二维码检测模型 (WeChatQRCode)'
        }
    
    def _encode_image_to_base64(self, img) -> str:
        """将OpenCV图片编码为base64字符串"""
        import cv2
        import base64
        
        # 将BGR转换为RGB
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        
        # 编码为JPEG
        _, buffer = cv2.imencode('.jpg', img_rgb)
        
        # 转换为base64
        img_base64 = base64.b64encode(buffer).decode('utf-8')
        
        return f"data:image/jpeg;base64,{img_base64}"

# 创建全局服务实例
wechat_qr_service = WeChatQRService()
