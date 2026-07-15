"""
OCR服务类
提供图片文字识别功能，支持多种OCR引擎
"""
import base64
import io
import logging
import json
import threading
from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse

logger = logging.getLogger(__name__)

# PaddleOCR 模型
try:
    import paddleocr
    PADDLEOCR_AVAILABLE = True
    logger.info("PaddleOCR已安装，OCR功能可用")
except ImportError:
    PADDLEOCR_AVAILABLE = False
    logger.warning("PaddleOCR未安装")

# RapidOCR 模型 (Jetson 优化，更快启动、更低内存占用)
try:
    from rapidocr_onnxruntime import RapidOCR
    RAPIDOCR_AVAILABLE = True
    logger.info("RapidOCR已安装，Jetson 优化 OCR 功能可用")
except ImportError:
    RAPIDOCR_AVAILABLE = False
    logger.warning("RapidOCR未安装")

try:
    from PIL import Image
    import numpy as np
    PIL_AVAILABLE = True
    NUMPY_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False
    NUMPY_AVAILABLE = False
    logger.warning("PIL或NumPy未安装，图片处理功能将不可用")

# Jetson 环境检测
import os
IS_JETSON = os.path.exists('/etc/nv_tegra_release') or os.environ.get('JETSON_PLATFORM', '').lower() == 'true'

class OCRService:
    """OCR文字识别服务
    
    支持两种 OCR 引擎:
    - PaddleOCR: 功能完整，准确率高
    - RapidOCR: Jetson 优化，启动快、内存低
    """

    def __init__(self):
        """初始化OCR服务，延迟加载模型"""
        self._load_lock = threading.RLock()
        # RapidOCR/PaddleOCR 单例内部包含可复用执行状态。双窗口请求可以并发进入
        # Django，但同一OCR引擎按次串行，避免ORT/OpenCV线程池叠加拖垮Jetson。
        self._inference_locks = {
            'rapidocr': threading.Lock(),
            'paddleocr': threading.Lock(),
        }
        # PaddleOCR 实例
        self.paddleocr_reader_with_cls = None
        self.paddleocr_reader_without_cls = None
        self.paddleocr_with_cls_loaded = False
        self.paddleocr_without_cls_loaded = False
        
        # RapidOCR 实例
        self.rapidocr_reader = None
        self.rapidocr_loaded = False
        
        # 默认优先使用 RapidOCR（即使在非 Jetson 环境）
        if RAPIDOCR_AVAILABLE:
            self.current_model = 'rapidocr'
            if IS_JETSON:
                logger.info("检测到 Jetson 环境，默认使用 RapidOCR 引擎")
            else:
                logger.info("默认使用 RapidOCR 引擎")
        elif PADDLEOCR_AVAILABLE:
            self.current_model = 'paddleocr'
            logger.info("使用 PaddleOCR 引擎")
        else:
            self.current_model = None
            logger.error("没有可用的 OCR 引擎")
        
        logger.info(f"OCR服务初始化完成，当前引擎: {self.current_model}")
    
    def set_model(self, model_name):
        """设置当前使用的OCR模型
        
        支持的模型名称:
        - 'auto': 保持使用当前模型（不切换）
        - 'paddleocr': 使用 PaddleOCR
        - 'rapidocr': 使用 RapidOCR
        """
        # 'auto' 模式: 保持使用当前模型
        if model_name == 'auto' or model_name is None:
            if self.current_model:
                logger.info(f"OCR模型保持: {self.current_model} (auto模式)")
                return True
            else:
                logger.error("没有可用的OCR模型")
                return False
        
        if model_name == 'paddleocr' and PADDLEOCR_AVAILABLE:
            self.current_model = model_name
            logger.info(f"OCR模型已切换到: {model_name}")
            return True
        elif model_name == 'rapidocr' and RAPIDOCR_AVAILABLE:
            self.current_model = model_name
            logger.info(f"OCR模型已切换到: {model_name}")
            return True
        else:
            logger.error(f"不支持或未安装的OCR模型: {model_name}")
            return False

    def _resolve_model_name(self, requested_model_name=None):
        """解析本次请求应使用的OCR引擎，不修改全局 current_model。"""
        if requested_model_name in (None, '', 'auto'):
            return self.current_model

        if requested_model_name == 'paddleocr' and PADDLEOCR_AVAILABLE:
            return 'paddleocr'

        if requested_model_name == 'rapidocr' and RAPIDOCR_AVAILABLE:
            return 'rapidocr'

        return None
    
    def get_available_models(self):
        """获取可用的OCR模型列表"""
        models = []
        if PADDLEOCR_AVAILABLE:
            models.append('paddleocr')
        if RAPIDOCR_AVAILABLE:
            models.append('rapidocr')
        return models
    
    
    def _load_paddleocr_model(self, use_angle_cls=False):
        """加载PaddleOCR模型

        Args:
            use_angle_cls: 是否启用方向检测

        Returns:
            PaddleOCR实例
        """
        if not PADDLEOCR_AVAILABLE:
            logger.error("PaddleOCR未安装，无法加载模型")
            return None

        if not PIL_AVAILABLE or not NUMPY_AVAILABLE:
            logger.error("PIL或NumPy未安装，无法处理图片")
            return None

        with self._load_lock:
            if use_angle_cls:
                # 需要开启方向检测的实例
                if self.paddleocr_with_cls_loaded:
                    return self.paddleocr_reader_with_cls
                try:
                    logger.info("正在加载PaddleOCR模型（开启方向检测）...")
                    # 新版PaddleOCR使用 use_textline_orientation 替代 use_angle_cls
                    self.paddleocr_reader_with_cls = paddleocr.PaddleOCR(
                        use_textline_orientation=True,
                        lang='ch'
                    )
                    self.paddleocr_with_cls_loaded = True
                    logger.info("PaddleOCR模型加载成功（开启方向检测）")
                    return self.paddleocr_reader_with_cls
                except Exception as e:
                    logger.error(f"PaddleOCR模型加载失败（开启方向检测）: {str(e)}")
                    return None
            else:
                # 关闭方向检测的实例（性能更好）
                if self.paddleocr_without_cls_loaded:
                    return self.paddleocr_reader_without_cls
                try:
                    logger.info("正在加载PaddleOCR模型（关闭方向检测）...")
                    self.paddleocr_reader_without_cls = paddleocr.PaddleOCR(
                        use_textline_orientation=False,
                        lang='ch'
                    )
                    self.paddleocr_without_cls_loaded = True
                    logger.info("PaddleOCR模型加载成功（关闭方向检测）")
                    return self.paddleocr_reader_without_cls
                except Exception as e:
                    logger.error(f"PaddleOCR模型加载失败（关闭方向检测）: {str(e)}")
                    return None
    
    def _load_rapidocr_model(self):
        """加载 RapidOCR 模型
        
        Returns:
            RapidOCR 实例
        """
        if not RAPIDOCR_AVAILABLE:
            logger.error("RapidOCR未安装，无法加载模型")
            return None
        
        if not PIL_AVAILABLE or not NUMPY_AVAILABLE:
            logger.error("PIL或NumPy未安装，无法处理图片")
            return None
        
        with self._load_lock:
            if self.rapidocr_loaded:
                return self.rapidocr_reader
            try:
                logger.info("正在加载 RapidOCR 模型...")
            
            # 指定本地模型路径，避免自动下载
            # 假设模型存放在当前项目目录的 models/rapidocr/ 下
                import os
                base_path = os.path.dirname(os.path.abspath(__file__))
                model_dir = os.path.join(base_path, 'models', 'rapidocr')
            
                det_path = os.path.join(model_dir, 'ch_PP-OCRv4_det_infer.onnx')
                cls_path = os.path.join(model_dir, 'ch_ppocr_mobile_v2.0_cls_infer.onnx')
                rec_path = os.path.join(model_dir, 'ch_PP-OCRv4_rec_infer.onnx')
            
            # 检查模型文件是否存在，如果存在则指定路径，否则让它尝试自动下载
                config_args = {}
                if os.path.exists(det_path):
                    config_args['det_model_path'] = det_path
                if os.path.exists(cls_path):
                    config_args['cls_model_path'] = cls_path
                if os.path.exists(rec_path):
                    config_args['rec_model_path'] = rec_path
            
            # 初始化 RapidOCR
                self.rapidocr_reader = RapidOCR(**config_args)
                self.rapidocr_loaded = True
            
                local_models = os.path.exists(det_path)
                logger.info(f"RapidOCR 模型加载成功 (本地模型: {local_models})")
                return self.rapidocr_reader
            except Exception as e:
                logger.error(f"RapidOCR 模型加载失败: {str(e)}")
                return None
    

    def extract_text(self, image_data, model_name=None, use_angle_cls=False):
        """
        提取图片中的文字

        Args:
            image_data: 图片数据，可以是base64字符串或PIL Image对象
            model_name: 指定使用的模型名称，如果为None则使用当前设置的模型
            use_angle_cls: 是否启用方向检测，默认False（不检测方向时关闭以提升性能）

        Returns:
            dict: 包含识别结果的字典
        """
        resolved_model_name = self._resolve_model_name(model_name)
        if not resolved_model_name:
            return {
                'success': False,
                'error': f'不支持的OCR模型: {model_name}'
            }

        # 根据本次请求解析出的模型选择引擎，避免并发请求通过全局current_model相互影响
        if resolved_model_name == 'rapidocr':
            return self._extract_text_rapidocr(image_data, use_angle_cls)
        elif resolved_model_name == 'paddleocr':
            return self._extract_text_paddleocr(image_data, use_angle_cls)
        else:
            return {
                'success': False,
                'error': f'不支持的OCR模型: {resolved_model_name}'
            }
    
    def _extract_text_rapidocr(self, image_data, use_angle_cls=False):
        """使用 RapidOCR 提取文字"""
        rapidocr_reader = self._load_rapidocr_model()
        if rapidocr_reader is None:
            return {
                'success': False,
                'error': 'RapidOCR模型加载失败'
            }
        
        try:
            # 处理图片数据: RapidOCR 支持 str(path), np.ndarray, bytes, PIL.Image
            # 我们统一转为 numpy
            img_array = None
            if isinstance(image_data, str):
                image_bytes = base64.b64decode(image_data)
                image = Image.open(io.BytesIO(image_bytes)).convert('RGB')
                img_array = np.array(image)
            elif isinstance(image_data, np.ndarray):
                img_array = image_data
            elif isinstance(image_data, Image.Image):
                if image_data.mode != 'RGB':
                    image_data = image_data.convert('RGB')
                img_array = np.array(image_data)
            else:
                return {
                    'success': False,
                    'error': f'不支持的图片数据格式: {type(image_data)}'
                }
            
            if img_array is None:
                return {'success': False, 'error': '图片数据无效'}
            
            # 执行 RapidOCR 识别
            # RapidOCR接口: result, elapse = engine(img_content, use_det=True, use_cls=use_angle_cls, use_rec=True)
            logger.info(f"RapidOCR 执行识别: use_cls={use_angle_cls}")
            with self._inference_locks['rapidocr']:
                result, elapse = rapidocr_reader(
                    img_array,
                    use_det=True,
                    use_cls=use_angle_cls,
                    use_rec=True,
                )
            
            if not result:
                return {
                    'success': True, 
                    'full_text': '', 
                    'detailed_results': [], 
                    'text_count': 0,
                    'model_used': 'rapidocr',
                    'detected_orientation': None,
                    'detected_orientation_degrees': None,
                    'elapse': elapse
                }
            
            # 解析结果
            # RapidOCR result 格式: [[[[x1,y1],[x2,y2],[x3,y3],[x4,y4]], text, score], ...]
            extracted_text = []
            full_text = ""
            
            for item in result:
                box, text, score = item
                extracted_text.append({
                    'text': text,
                    'confidence': float(score),
                    'bbox': box,  # 已经是列表格式
                    'orientation_degrees': None,
                    'orientation_bucket': None
                })
                full_text += text + " "
            
            # 计算平均置信度
            avg_confidence = 0.0
            if extracted_text:
                total_score = sum(item['confidence'] for item in extracted_text)
                avg_confidence = total_score / len(extracted_text)

            return {
                'success': True,
                'full_text': full_text.strip(),
                'detailed_results': extracted_text,
                'text_count': len(extracted_text),
                'confidence': avg_confidence,  # 添加置信度
                'model_used': 'rapidocr',
                'detected_orientation': None,
                'detected_orientation_degrees': None,
                'elapse': elapse
            }
            
        except Exception as e:
            import traceback
            error_trace = traceback.format_exc()
            logger.error(f"RapidOCR 识别失败: {str(e)}")
            logger.error(f"错误详情: {error_trace}")
            return {
                'success': False,
                'error': f'RapidOCR 识别失败: {str(e)}',
                'traceback': error_trace
            }
    
    def _parse_rapidocr_results(self, results, elapse):
        """解析 RapidOCR 结果"""
        extracted_text = []
        full_text = ""
        
        if results:
            for item in results:
                # RapidOCR 返回格式: [[x1,y1], [x2,y2], [x3,y3], [x4,y4]], text, confidence
                if len(item) >= 3:
                    bbox = item[0]
                    text = item[1]
                    confidence = item[2]
                    
                    extracted_text.append({
                        'text': text,
                        'confidence': float(confidence),
                        'bbox': bbox,
                        'orientation_degrees': None,
                        'orientation_bucket': None
                    })
                    full_text += text + " "
        
        return {
            'success': True,
            'full_text': full_text.strip(),
            'detailed_results': extracted_text,
            'text_count': len(extracted_text),
            'model_used': 'rapidocr',
            'detected_orientation': None,
            'detected_orientation_degrees': None,
            'elapse': elapse
        }
    
    def _extract_text_paddleocr(self, image_data, use_angle_cls=False):
        """使用 PaddleOCR 提取文字"""
        
        # 先加载模型
        paddleocr_reader = self._load_paddleocr_model(use_angle_cls)
        if paddleocr_reader is None:
            return {
                'success': False,
                'error': 'PaddleOCR模型加载失败'
            }
        
        try:
            # 处理图片数据
            if isinstance(image_data, str):
                # base64转图片
                image_bytes = base64.b64decode(image_data)
                image = Image.open(io.BytesIO(image_bytes))
            elif isinstance(image_data, np.ndarray):
                image = Image.fromarray(image_data)
            elif isinstance(image_data, Image.Image):
                image = image_data
            else:
                return {
                    'success': False,
                    'error': f'不支持的图片数据格式: {type(image_data)}'
                }
            
            # 将PIL Image转换为numpy数组
            # 确保图片是RGB格式（3通道），PaddleOCR不支持RGBA
            if image.mode == 'RGBA':
                # 创建白色背景
                background = Image.new('RGB', image.size, (255, 255, 255))
                background.paste(image, mask=image.split()[-1])  # 使用alpha通道作为mask
                image = background
            elif image.mode != 'RGB':
                image = image.convert('RGB')
            
            image_array = np.array(image)
            
            # 执行OCR识别
            logger.info(f"PaddleOCR执行识别: use_angle_cls={use_angle_cls}")
            with self._inference_locks['paddleocr']:
                results = paddleocr_reader.ocr(image_array)
            
            # 如果启用了方向检测，使用详细解析器
            if use_angle_cls:
                return self._parse_paddleocr_results(results)
            else:
                return self._parse_paddleocr_results_simple(results)
            
        except Exception as e:
            import traceback
            error_trace = traceback.format_exc()
            logger.error(f"OCR识别失败: {str(e)}")
            logger.error(f"错误详情: {error_trace}")
            return {
                'success': False,
                'error': f'OCR识别失败: {str(e)}',
                'traceback': error_trace
            }
    
    
    def _parse_paddleocr_results_simple(self, results):
        """简化的PaddleOCR结果解析 - 支持新版本格式"""
        extracted_text = []
        full_text = ""
        
        if results and len(results) > 0:
            for page_result in results:
                if page_result is None:
                    continue
                
                # 检查是否是新的OCRResult对象格式
                if hasattr(page_result, '__iter__') and not isinstance(page_result, (list, tuple)):
                    # 新版本格式：OCRResult对象（字典类型）
                    try:
                        # OCRResult对象包含检测结果，从rec_texts, rec_scores, rec_polys中提取
                        if 'rec_texts' in page_result and 'rec_scores' in page_result and 'rec_polys' in page_result:
                            texts = page_result['rec_texts']
                            scores = page_result['rec_scores']
                            polys = page_result['rec_polys']
                            
                            for i, text in enumerate(texts):
                                confidence = scores[i] if i < len(scores) else 0
                                bbox = polys[i].tolist() if i < len(polys) else []
                                
                                extracted_text.append({
                                    'text': text,
                                    'confidence': float(confidence),
                                    'bbox': bbox,
                                    'orientation_degrees': None,
                                    'orientation_bucket': None
                                })
                                full_text += text + " "
                        else:
                            logger.warning("OCRResult对象缺少必要的文本信息字段")
                    except Exception as e:
                        logger.error(f"解析OCRResult对象失败: {str(e)}")
                else:
                    # 旧版本格式：列表格式
                    for item in page_result:
                        if len(item) >= 2:
                            # 格式: [[[x1,y1],[x2,y2],[x3,y3],[x4,y4]], (text, confidence)]
                            box = item[0]
                            text_info = item[1]
                            if len(text_info) >= 2:
                                text = text_info[0]
                                confidence = text_info[1]
                                
                                extracted_text.append({
                                    'text': text,
                                    'confidence': float(confidence),
                                    'bbox': box,
                                    'orientation_degrees': None,
                                    'orientation_bucket': None
                                })
                                full_text += text + " "
        
        return {
            'success': True,
            'full_text': full_text.strip(),
            'detailed_results': extracted_text,
            'text_count': len(extracted_text),
            'model_used': 'paddleocr',
            'detected_orientation': None,
            'detected_orientation_degrees': None
        }
    
    def _parse_paddleocr_results(self, results):
        """解析PaddleOCR结果"""
        extracted_text = []
        full_text = ""
        detected_angles = []  # 每个文本框估计角度（度）
        
        if results and len(results) > 0:
            # PaddleOCR返回的是列表，每个元素对应一页的结果
            for page_result in results:
                if page_result is None:
                    continue
                    
                # 检查是否是新的字典格式
                if isinstance(page_result, dict):
                    # 新版本格式
                    texts = page_result.get('rec_texts', [])
                    scores = page_result.get('rec_scores', [])
                    boxes = page_result.get('rec_boxes', [])
                else:
                    # 旧版本格式，直接是检测结果列表
                    texts = []
                    scores = []
                    boxes = []
                    for item in page_result:
                        if len(item) >= 2:
                            # 格式: [[[x1,y1],[x2,y2],[x3,y3],[x4,y4]], (text, confidence)]
                            box = item[0]
                            text_info = item[1]
                            if len(text_info) >= 2:
                                texts.append(text_info[0])
                                scores.append(text_info[1])
                                boxes.append(box)
            
            # 计算每个文本框的角度（基于bbox的上边缘向量）
            def _estimate_angle_deg_from_box(box):
                try:
                    # 支持两种bbox格式：
                    # 1) 四点：[[x1,y1],[x2,y2],[x3,y3],[x4,y4]]
                    # 2) 两点：[x1,y1,x2,y2]（左上、右下）
                    # 统一转换为四点形式后，使用第一条边 (p2 - p1) 的方向角
                    import math
                    # 规范化 bbox 为四点
                    norm_box = box
                    if isinstance(box, list) and len(box) == 4 and all(isinstance(v, (int, float)) for v in box):
                        x1, y1, x2, y2 = float(box[0]), float(box[1]), float(box[2]), float(box[3])
                        norm_box = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]
                    
                    if not (isinstance(norm_box, list) and len(norm_box) >= 2 and
                            isinstance(norm_box[0], (list, tuple)) and isinstance(norm_box[1], (list, tuple))):
                        return None

                    p1x, p1y = float(norm_box[0][0]), float(norm_box[0][1])
                    p2x, p2y = float(norm_box[1][0]), float(norm_box[1][1])
                    dx, dy = (p2x - p1x), (p2y - p1y)
                    if dx == 0 and dy == 0:
                        return None
                    rad = math.atan2(dy, dx)
                    deg = rad * 180.0 / math.pi
                    # 归一化到 [0, 360)
                    while deg < 0:
                        deg += 360.0
                    while deg >= 360.0:
                        deg -= 360.0
                    # 文本通常水平为 0 或 180，竖直为 90 或 270
                    return deg
                except Exception:
                    return None

            def _bucket_orientation(deg):
                try:
                    candidates = [0.0, 90.0, 180.0, 270.0]
                    return int(min(candidates, key=lambda c: min(abs(deg - c), 360.0 - abs(deg - c))))
                except Exception:
                    return None

            for i, text in enumerate(texts):
                confidence = scores[i] if i < len(scores) else 0.0
                bbox = boxes[i].tolist() if i < len(boxes) and hasattr(boxes[i], 'tolist') else []
                per_item_deg = None
                per_item_bucket = None
                if bbox and isinstance(bbox, list) and len(bbox) >= 2:
                    angle_deg = _estimate_angle_deg_from_box(bbox)
                    if angle_deg is not None:
                        detected_angles.append(angle_deg)
                        per_item_deg = float(angle_deg)
                        per_item_bucket = _bucket_orientation(per_item_deg)
                
                extracted_text.append({
                    'text': text,
                    'confidence': float(confidence),
                    'bbox': bbox,
                    'orientation_degrees': per_item_deg,
                    'orientation_bucket': per_item_bucket
                })
                full_text += text + " "
        
        # 计算整体角度（使用中位数更稳健）
        detected_orientation_degrees = None
        detected_orientation = None
        if detected_angles:
            try:
                import math
                sorted_angles = sorted(detected_angles)
                n = len(sorted_angles)
                median = sorted_angles[n // 2] if n % 2 == 1 else (sorted_angles[n // 2 - 1] + sorted_angles[n // 2]) / 2.0
                # 将角度折叠到最接近的 {0, 90, 180, 270}
                candidates = [0.0, 90.0, 180.0, 270.0]
                nearest = min(candidates, key=lambda c: min(abs(median - c), 360.0 - abs(median - c)))
                detected_orientation_degrees = float(median)
                detected_orientation = int(nearest)
            except Exception:
                detected_orientation_degrees = None
                detected_orientation = None

        return {
            'success': True,
            'full_text': full_text.strip(),
            'detailed_results': extracted_text,
            'text_count': len(extracted_text),
            'model_used': 'paddleocr',
            'detected_orientation': detected_orientation,  # 0/90/180/270（近似）
            'detected_orientation_degrees': detected_orientation_degrees  # 原始中位数角度
        }
    
    
    
    def is_available(self):
        """检查OCR服务是否可用"""
        available_models = self.get_available_models()
        return len(available_models) > 0

# 全局OCR服务实例（避免重复加载模型）
ocr_service = OCRService()
