"""
PPE检测模型配置文件
定义可用的PPE检测模型及其特性
"""

import os
from typing import Dict, List, Any
from django.apps import apps

def _get_repo_root() -> str:
    """获取项目仓库根目录（models/ 所在目录）。
    兼容处理在 Claude worktree 中运行的服务路径回退。"""
    
    def _resolve_worktree(path):
        if '.claude' in path and 'worktrees' in path:
            idx = path.find('.claude')
            return path[:idx].rstrip('/\\')
        return path

    try:
        from django.conf import settings
        root = str(settings.BASE_DIR.parent)
        real_root = _resolve_worktree(root)
        if os.path.isdir(os.path.join(real_root, 'models')):
            return real_root
    except Exception:
        pass
        
    curr_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    return _resolve_worktree(curr_root)

class PPEModelConfig:
    """PPE检测模型配置类"""
    
    def __init__(self):
        self.models = {
            'ppe_detection': {
                'name': 'PPE检测专用模型',
                'file': 'ppe.pt',  # 使用PPE目录下的ppe.pt模型
                'description': 'PPE专用检测',
                'version': 'v1.0.0',
                'created_at': '2024-01-15',
                'classes': ['Barefoots', 'Ear-protection', 'Harness', 'No_Ear-Protection', 'No_Glasses', 'Sandals', 'boots', 'face_mask', 'face_nomask', 'glasses', 'hand_glove', 'hand_noglove', 'head_helmet', 'head_nohelmet', 'person', 'shoes', 'vest'],
                'confidence_threshold': 0.5,  # 提高阈值减少误识别
                'iou_threshold': 0.4,        # 提高IOU阈值，减少重复检测
                'is_default': True,          # 设置为默认模型
                'category': 'ppe_specialized',
                'detection_type': 'cleanroom_ppe'  # 对应检测类型：洁净用品检测
            },
            'yolo8x': {
                'name': 'YOLO8X PPE检测模型',
                'file': 'yolo8x.pt',
                'description': 'YOLO8X高性能PPE检测模型，支持多种PPE类别检测，包括洁净服',
                'classes': ['person', 'face', 'head', 'hands', 'face-mask', 'face-guard', 'glasses', 'helmet', 'safety-vest', 'safety-suit', 'medical-suit', 'gloves', 'shoes', 'foot', 'ear', 'ear-mufs', 'tool'],
                'confidence_threshold': 0.25,  # 降低阈值便于检测
                'iou_threshold': 0.25,        # 降低IOU阈值，提高检测灵敏度
                'is_default': False,          # 不再是默认模型
                'category': 'high_performance',
                'hidden': True  # 隐藏此模型，只保留4个确认的模型
            },
            'yolov8l': {
                'name': 'YOLOv8L PPE检测模型',
                'file': 'yolov8l.pt',
                'description': 'YOLOv8L PPE检测模型，支持人员、帽子、口罩、眼镜、洁净服等检测',
                'classes': ['person', 'hat', 'mask', 'face-mask', 'glasses', 'Hardhat', 'Helmet', 'safety-vest', 'safety-suit', 'medical-suit'],
                'confidence_threshold': 0.1,  # 降低阈值便于检测
                'iou_threshold': 0.1,        # 降低IOU阈值，提高检测灵敏度
                'is_default': False,
                'category': 'ppe_detection',
                'hidden': True  # 隐藏此模型
            },
            'yolov8n': {
                'name': 'YOLOv8N轻量模型',
                'file': 'yolov8n.pt',
                'description': 'YOLOv8N轻量级检测模型，速度快但精度较低，支持洁净服检测',
                'classes': ['person', 'hat', 'mask', 'face-mask', 'glasses', 'Hardhat', 'Helmet', 'safety-vest', 'safety-suit', 'medical-suit'],
                'confidence_threshold': 0.5,
                'iou_threshold': 0.3,
                'is_default': False,
                'category': 'lightweight',
                'hidden': True  # 隐藏此模型，只保留4个确认的模型
            },
            'yolo8_general': {
                'name': 'YOLO8通用检测模型',
                'file': 'yolov8n.pt',
                'description': '通用目标检测，支持80类物体',
                'version': 'v1.0.0',
                'created_at': '2024-01-15',
                'classes': ['person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat', 'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket', 'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple', 'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair', 'couch', 'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse', 'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink', 'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier', 'toothbrush'],
                'confidence_threshold': 0.4,
                'iou_threshold': 0.3,
                'is_default': False,
                'category': 'general_detection',
                'detection_type': 'general_quality'  # 对应检测类型：通用质量检测
            },
            'filter_core_detection': {
                'name': '滤芯专用检测模型',
                'file': 'filter.pt',
                'description': '滤芯齐套化检测，支持15类',
                'version': 'v1.1.0',
                'created_at': '2024-02-20',
                'classes': [
                    'filter',
                    'name_MCF',
                    'nsplogo',
                    'qrcode',
                    'service_label',
                    'nameplate_label',
                    'security_label',
                    'name_MNF',
                    'name_CPP',
                    'name_MPF',
                    'name_NF',
                    'name_PCC',
                    'name_PCF',
                    'name_ZPC',
                    'filter package'
                ],
                'confidence_threshold': 0.6,  # 提高置信度确保准确检测
                'iou_threshold': 0.3,
                'is_default': True,  # 设置为默认模型
                'category': 'filter_core_detection',
                'detection_type': 'kit_matching',  # 对应检测类型：齐套化检测
                'detection_window': 5,  # 检测窗口5秒
                'best_photo_capture': True,  # 启用最佳照片抓拍
                'capture_interval': 0.5,  # 每0.5秒抓拍一次
                'max_captures': 10,  # 最多抓拍10张
                'quality_threshold': 0.7  # 照片质量阈值
            },
            'waterprifer_detection': {
                'name': '净水机专用检测模型',
                'file': 'waterprifer.pt',
                'description': '净水机标签识别，支持10类',
                'version': 'v1.0.0',
                'created_at': '2024-01-20',
                'classes': [
                    'anti_counterfeit_label',
                    'service_label',
                    'nameplate_label',
                    'water_efficiency_label',
                    'barcode_label',
                    'fotile_logo',
                    'water_outlet',
                    'Prompt_label',
                    'yellow_point',
                    'glod_logo'
                ],
                'confidence_threshold': 0.5,
                'iou_threshold': 0.3,
                'is_default': False,
                'category': 'water_purifier_detection',
                'detection_type': 'ocr_inspection'  # 对应检测类型：OCR检测
            }
        }
        
        # 模型类别映射到PPE类别
        self.ppe_mapping = {
            'ppe_detection': {
                # PPE检测模型的PPE映射 - 包含洁净帽
                'person': 'person',
                'face_mask': 'mask',
                'face_nomask': 'no_mask',
                'head_helmet': 'cleanroom_cap',      # 帽子映射为洁净帽
                'head_nohelmet': 'no_cleanroom_cap', # 未戴洁净帽
                'vest': 'safety_vest',               # 安全背心/衣服

                # 下面是辅助类的映射以防万一
                'hand_glove': 'safety_gloves',
                'hand_noglove': 'no_safety_gloves',
                'glasses': 'safety_glasses',
                'No_Glasses': 'no_safety_glasses',
                'boots': 'safety_shoes',
                'shoes': 'safety_shoes',
                'Sandals': 'sandals',
                'Barefoots': 'barefoots',
                'Harness': 'harness',
                'Ear-protection': 'ear_mufs',
                'No_Ear-Protection': 'no_ear_mufs'
            },
            'yolo8x': {
                # YOLO8X模型的PPE映射 - 过滤掉身体器官，只显示主要PPE
                'person': 'person',           # 只保留主要的人员标签
                'face': None,                 # 面部不显示框选
                'head': None,                 # 头部不显示框选
                'hands': None,                # 手部不显示框选
                'face-mask': 'mask',          # 关键：将face-mask映射到mask
                'face-guard': 'mask',         # 面罩映射到mask
                'glasses': 'safety_glasses',
                'helmet': 'cleanroom_cap',    # 所有帽子都映射为洁净帽
                'safety-vest': 'cleanroom_suit',  # 安全背心映射为洁净服
                'safety-suit': 'cleanroom_suit',  # 安全服映射为洁净服
                'medical-suit': 'cleanroom_suit',  # 医疗服映射为洁净服
                'gloves': 'safety_gloves',
                'shoes': 'safety_shoes',
                'foot': None,                 # 脚部不显示框选
                'ear': None,                  # 耳朵不显示框选
                'ear-mufs': 'ear_mufs', # 耳罩作为防护装备显示
                'tool': 'tool'                # 工具单独显示
            },
            'yolov8l': {
                # YOLOv8L模型的PPE映射
                'person': 'person',
                'hat': 'cleanroom_cap',      # 所有帽子都映射为洁净帽
                'mask': 'mask',
                'face-mask': 'mask',         # 添加face-mask映射
                'glasses': 'safety_glasses',
                'Hardhat': 'cleanroom_cap',  # 添加大写变体
                'Helmet': 'cleanroom_cap',   # 添加大写变体
                # 洁净服相关映射（只保留核心类别）
                'safety-vest': 'cleanroom_suit',  # 安全背心映射为洁净服
                'safety-suit': 'cleanroom_suit',  # 安全服映射为洁净服
                'medical-suit': 'cleanroom_suit'  # 医疗服映射为洁净服
            },
            'yolov8n': {
                # YOLOv8N模型的PPE映射
                'person': 'person',
                'hat': 'cleanroom_cap',      # 所有帽子都映射为洁净帽
                'mask': 'mask',
                'face-mask': 'mask',         # 添加face-mask映射
                'glasses': 'safety_glasses',
                'Hardhat': 'cleanroom_cap',  # 添加大写变体
                'Helmet': 'cleanroom_cap',   # 添加大写变体
                # 洁净服相关映射（只保留核心类别）
                'safety-vest': 'cleanroom_suit',  # 安全背心映射为洁净服
                'safety-suit': 'cleanroom_suit',  # 安全服映射为洁净服
                'medical-suit': 'cleanroom_suit'  # 医疗服映射为洁净服
            },
            'yolo8_general': {
                # YOLO8通用检测模型的映射 - 保持原始类别映射
                'person': 'person',
                # 其他所有类别保持原样
                'bicycle': 'bicycle',
                'car': 'car',
                'motorcycle': 'motorcycle',
                'airplane': 'airplane',
                'bus': 'bus',
                'train': 'train',
                'truck': 'truck',
                'boat': 'boat',
                'traffic light': 'traffic light',
                'fire hydrant': 'fire hydrant',
                'stop sign': 'stop sign',
                'parking meter': 'parking meter',
                'bench': 'bench',
                'bird': 'bird',
                'cat': 'cat',
                'dog': 'dog',
                'horse': 'horse',
                'sheep': 'sheep',
                'cow': 'cow',
                'elephant': 'elephant',
                'bear': 'bear',
                'zebra': 'zebra',
                'giraffe': 'giraffe',
                'backpack': 'backpack',
                'umbrella': 'umbrella',
                'handbag': 'handbag',
                'tie': 'tie',
                'suitcase': 'suitcase',
                'frisbee': 'frisbee',
                'skis': 'skis',
                'snowboard': 'snowboard',
                'sports ball': 'sports ball',
                'kite': 'kite',
                'baseball bat': 'baseball bat',
                'baseball glove': 'baseball glove',
                'skateboard': 'skateboard',
                'surfboard': 'surfboard',
                'tennis racket': 'tennis racket',
                'fork': 'fork',
                'knife': 'knife',
                'spoon': 'spoon',
                'bowl': 'bowl',
                'banana': 'banana',
                'apple': 'apple',
                'sandwich': 'sandwich',
                'orange': 'orange',
                'broccoli': 'broccoli',
                'carrot': 'carrot',
                'hot dog': 'hot dog',
                'pizza': 'pizza',
                'donut': 'donut',
                'cake': 'cake',
                'chair': 'chair',
                'couch': 'couch',
                'potted plant': 'potted plant',
                'bed': 'bed',
                'dining table': 'dining table',
                'toilet': 'toilet',
                'tv': 'tv',
                'laptop': 'laptop',
                'mouse': 'mouse',
                'remote': 'remote',
                'keyboard': 'keyboard',
                'cell phone': 'cell phone',
                'microwave': 'microwave',
                'oven': 'oven',
                'toaster': 'toaster',
                'sink': 'sink',
                'refrigerator': 'refrigerator',
                'book': 'book',
                'clock': 'clock',
                'scissors': 'scissors',
                'teddy bear': 'teddy bear',
                'hair drier': 'hair drier',
                'toothbrush': 'toothbrush'
            },
            'filter_core_detection': {
                # 滤芯专用检测模型的映射 - YOLO11版本的15个类别
                'filter': 'filter',                    # 滤芯组件
                'name_MCF': 'name_MCF',                # 名称MCF
                'nsplogo': 'nsplogo',                  # NSP标志/Logo
                'qrcode': 'qrcode',                    # 二维码
                'service_label': 'service_label',       # 服务标签
                'nameplate_label': 'nameplate_label',   # 铭牌标签
                'security_label': 'security_label',     # 防伪标签
                'name_MNF': 'name_MNF',                # 名称MNF
                'name_CPP': 'name_CPP',                # 名称CPP
                'name_MPF': 'name_MPF',                # 名称MPF
                'name_NF': 'name_NF',                  # 名称NF
                'name_PCC': 'name_PCC',                # 名称PCC
                'name_PCF': 'name_PCF',                # 名称PCF
                'name_ZPC': 'name_ZPC',                # 名称ZPC
                'filter package': 'filter package'     # 滤芯包装
            },
            'waterprifer_detection': {
                # 净水机专用检测模型的映射 - 10个类别
                'anti_counterfeit_label': 'anti_counterfeit_label',
                'service_label': 'service_label',
                'nameplate_label': 'nameplate_label',
                'water_efficiency_label': 'water_efficiency_label',
                'barcode_label': 'barcode_label',
                'fotile_logo': 'fotile_logo',
                'water_outlet': 'water_outlet',
                'Prompt_label': 'Prompt_label',
                'yellow_point': 'yellow_point',
                'glod_logo': 'glod_logo'
            }
        }
        
        # 类别分类映射（用于前端分组显示）
        self.class_category_mapping = {
            # 名称类：以 name_ 开头的类别
            'name_MCF': 'names',
            'name_MNF': 'names',
            'name_CPP': 'names',
            'name_MPF': 'names',
            'name_NF': 'names',
            'name_PCC': 'names',
            'name_PCF': 'names',
            'name_ZPC': 'names',
            # 标签类：包含 _label 的类别
            'service_label': 'labels',
            'nameplate_label': 'labels',
            'security_label': 'labels',
            'anti_counterfeit_label': 'labels',
            'water_efficiency_label': 'labels',
            'barcode_label': 'labels',
            'Prompt_label': 'labels',
            # Logo类：包含 _logo 或 logo 的类别
            'nsplogo': 'logos',
            'fotile_logo': 'logos',
            'glod_logo': 'logos',
            # 劳保类：个人防护装备和安全用品
            'person': 'ppe',
            'mask': 'ppe',
            'no_mask': 'ppe',
            'helmet': 'ppe',
            'Hardhat': 'ppe',
            'NO-Hardhat': 'ppe',
            'gloves': 'ppe',
            'safety-vest': 'ppe',
            'Safety Vest': 'ppe',
            'NO-Safety Vest': 'ppe',
            'safety-suit': 'ppe',
            'medical-suit': 'ppe',
            'cleanroom_suit': 'ppe',
            'cleanroom_cap': 'ppe',
            'no_cleanroom_cap': 'ppe',
            'safety_glasses': 'ppe',
            'safety_gloves': 'ppe',
            'safety_shoes': 'ppe',
            'face-mask': 'ppe',
            'face-guard': 'ppe',
            'glasses': 'ppe',
            'ear_mufs': 'ppe',
            'Safety Cone': 'ppe',
            'safety_cone': 'ppe',
            # 材质类：产品材质和结构部件
            'filter': 'materials',
            'filter package': 'materials',
            'qrcode': 'materials',
            'water_outlet': 'materials',
            'yellow_point': 'materials',
            # 组件类：产品组件和配件
            'machinery': 'components',
            'vehicle': 'components',
            'tool': 'components',
            # 特征类：视觉特征和标识
            'bottle': 'features',
            'cup': 'features',
            'vase': 'features',
            'wine glass': 'features',
            # 其他类：默认分类（不包含在上述分类中的类别）
        }
        
        # 类别中文名称映射
        self.class_name_mapping = {
            # 滤芯模型类别
            'filter': '滤芯组件',
            'name_MCF': '名称MCF',
            'nsplogo': 'NSP标志',
            'qrcode': '二维码',
            'service_label': '服务标签',
            'nameplate_label': '铭牌标签',
            'security_label': '防伪标签',
            'name_MNF': '名称MNF',
            'name_CPP': '名称CPP',
            'name_MPF': '名称MPF',
            'name_NF': '名称NF',
            'name_PCC': '名称PCC',
            'name_PCF': '名称PCF',
            'name_ZPC': '名称ZPC',
            'filter package': '滤芯包装',
            # 净水机模型类别
            'anti_counterfeit_label': '防伪标签',
            'water_efficiency_label': '水效标签',
            'barcode_label': '条码标签',
            'fotile_logo': '方太Logo',
            'water_outlet': '出水口',
            'Prompt_label': '提示标签',
            'yellow_point': '黄色点',
            'glod_logo': '金色Logo',
            # PPE检测类别
            'person': '人员',
            'mask': '口罩',
            'no_mask': '未戴口罩',
            'Hardhat': '安全帽',
            'NO-Hardhat': '未戴安全帽',
            'NO-Safety Vest': '未穿安全背心',
            'Safety Cone': '安全锥',
            'Safety Vest': '安全背心',
            'machinery': '机械设备',
            'vehicle': '车辆',
            'helmet': '头盔',
            'safety_helmet': '安全头盔',
            'hard_hat': '硬帽',
            'construction_hat': '施工帽',
            'work_hat': '工作帽',
            'face-mask': '面罩',
            'face-guard': '面罩',
            'glasses': '眼镜',
            'safety_glasses': '安全眼镜',
            'safety-vest': '安全背心',
            'safety-suit': '安全服',
            'medical-suit': '医疗服',
            'cleanroom_suit': '洁净服',
            'gloves': '手套',
            'safety_gloves': '安全手套',
            'shoes': '鞋子',
            'safety_shoes': '安全鞋',
            'ear_mufs': '耳罩',
            'tool': '工具',
            'hat': '帽子',
            'cleanroom_cap': '洁净帽',
            'no_cleanroom_cap': '未戴洁净帽',
            'no_safety_vest': '未穿安全背心',
            'safety_cone': '安全锥',
            'safety_vest': '安全背心',
            'no_safety_gloves': '未戴手套',
            'no_safety_glasses': '未戴眼镜',
            'no_ear_mufs': '未戴耳罩',
            'barefoots': '光脚',
            'harness': '安全带',
            'sandals': '凉鞋',
            # 通用检测类别（部分常见类别）
            'bicycle': '自行车',
            'car': '汽车',
            'motorcycle': '摩托车',
            'bus': '公交车',
            'train': '火车',
            'truck': '卡车',
            'boat': '船',
            'traffic light': '红绿灯',
            'stop sign': '停止标志',
            'chair': '椅子',
            'couch': '沙发',
            'bed': '床',
            'dining table': '餐桌',
            'tv': '电视',
            'laptop': '笔记本电脑',
            'mouse': '鼠标',
            'keyboard': '键盘',
            'cell phone': '手机',
            'book': '书',
            'clock': '时钟',
            'bottle': '瓶子',
            'cup': '杯子',
            'vase': '花瓶',
            'wine glass': '酒杯',
            'fork': '叉子',
            'knife': '刀',
            'spoon': '勺子',
            'bowl': '碗',
            # 净水机模型中的 service_label 和 nameplate_label 已在滤芯模型部分定义，这里不需要重复
        }
    
    def get_class_chinese_name(self, class_name: str) -> str:
        """获取类别的中文名称"""
        return self.class_name_mapping.get(class_name, class_name)
    
    def get_class_category(self, class_name: str) -> str:
        """获取类别的分类（names, labels, logos, others）"""
        # 优先从数据库读取，如果数据库中没有则使用硬编码映射
        try:
            from .models import ClassCategory
            db_category = ClassCategory.objects.filter(
                class_name=class_name,
                is_active=True
            ).first()
            if db_category:
                return db_category.category
        except Exception as e:
            # 如果数据库查询失败（如迁移未完成），使用硬编码映射
            pass
        
        # 使用硬编码映射作为备用
        return self.class_category_mapping.get(class_name, 'others')
    
    def get_classes_by_category(self, model_id: str = None) -> Dict[str, List[str]]:
        """
        获取指定模型或所有模型的类别按分类分组
        
        参数:
            model_id: 模型ID（可选），如果提供则只返回该模型的类别分组
        
        返回:
            分类到类别列表的映射字典，格式：{'names': [...], 'labels': [...], 'logos': [...], 'others': [...]}
        """
        if model_id:
            # 只返回指定模型的类别分组
            config = self.models.get(model_id, {})
            if not config:
                return {'names': [], 'labels': [], 'logos': [], 'others': []}
            
            classes = config.get('classes', [])
        else:
            # 返回所有模型的类别（去重）
            all_classes = set()
            for config in self.models.values():
                all_classes.update(config.get('classes', []))
            classes = list(all_classes)
        
        # 按分类分组
        result = {
            'names': [],
            'labels': [],
            'logos': [],
            'ppe': [],
            'materials': [],
            'components': [],
            'features': [],
            'others': []
        }
        
        # 获取数据库中的显示顺序
        try:
            from .models import ClassCategory
            db_categories = ClassCategory.objects.filter(
                class_name__in=classes,
                is_active=True
            ).values('class_name', 'category', 'display_order')
            
            # 构建类别到显示顺序的映射
            class_order_map = {item['class_name']: item['display_order'] for item in db_categories}
        except:
            class_order_map = {}
        
        for class_name in classes:
            category = self.get_class_category(class_name)
            result[category].append(class_name)
        
        # 对每个分类的类别列表进行排序（优先使用数据库中的显示顺序）
        for category in result:
            result[category].sort(key=lambda x: (class_order_map.get(x, 999), x))
        
        return result
    
    def get_class_names_mapping(self, model_id: str = None) -> Dict[str, str]:
        """
        获取指定模型或所有模型的类别中文名称映射
        
        参数:
            model_id: 模型ID（可选），如果提供则只返回该模型的类别映射
        
        返回:
            类别英文名称到中文名称的映射字典
        """
        if model_id:
            # 只返回指定模型的类别映射
            config = self.models.get(model_id, {})
            if not config:
                return {}
            
            classes = config.get('classes', [])
            mapping = {}
            for class_name in classes:
                mapping[class_name] = self.get_class_chinese_name(class_name)
            return mapping
        else:
            # 返回所有类别的映射（去重）
            all_classes = set()
            for config in self.models.values():
                all_classes.update(config.get('classes', []))
            
            mapping = {}
            for class_name in all_classes:
                mapping[class_name] = self.get_class_chinese_name(class_name)
            return mapping
    
    def get_available_models(self) -> List[Dict[str, Any]]:
        """获取可用的模型列表（过滤掉隐藏的模型）"""
        available_models = []
        
        for model_id, config in self.models.items():
            # 跳过隐藏的模型
            if config.get('hidden', False):
                continue
            
            # 计算候选路径：按优先级查找
            # 1. 优先查找统一的 models/ 文件夹（推荐位置）
            # 2. 查找 PPE_detection_YOLO 目录（兼容旧位置）
            # 3. 查找 backend 目录（兼容旧位置）
            # 4. 查找仓库根目录（兼容旧位置）
            repo_root = _get_repo_root()
            models_dir_path = os.path.join(repo_root, 'models', config['file'])
            ppe_model_path = os.path.join(repo_root, 'PPE_detection_YOLO', config['file'])
            backend_dir_model_path = os.path.join(os.path.dirname(__file__), '..', config['file'])
            root_model_path = os.path.join(repo_root, config['file'])

            # 按优先级选择存在的第一个路径
            if os.path.exists(models_dir_path):
                model_path = models_dir_path
            elif os.path.exists(ppe_model_path):
                model_path = ppe_model_path
            elif os.path.exists(backend_dir_model_path):
                model_path = backend_dir_model_path
            elif os.path.exists(root_model_path):
                model_path = root_model_path
            else:
                model_path = models_dir_path  # 默认使用 models/ 文件夹路径
                
            if os.path.exists(model_path):
                available_models.append({
                    'id': model_id,
                    'name': config['name'],
                    'file': config['file'],
                    'description': config['description'],
                    'version': config.get('version', 'v1.0.0'),  # 添加版本号
                    'created_at': config.get('created_at', ''),  # 添加创建时间
                    'classes': config['classes'],
                    'confidence_threshold': config['confidence_threshold'],
                    'iou_threshold': config['iou_threshold'],
                    'is_default': config['is_default'],
                    'category': config['category'],
                    'detection_type': config.get('detection_type', 'unknown'),  # 添加检测类型
                    'class_names': self.get_class_names_mapping(model_id),  # 添加类别中文名称映射
                    'class_categories': self.get_classes_by_category(model_id),  # 添加类别分类分组
                    'file_size': os.path.getsize(model_path),
                    'exists': True
                })
            else:
                available_models.append({
                    'id': model_id,
                    'name': config['name'],
                    'file': config['file'],
                    'description': config['description'],
                    'version': config.get('version', 'v1.0.0'),  # 添加版本号
                    'created_at': config.get('created_at', ''),  # 添加创建时间
                    'classes': config['classes'],
                    'confidence_threshold': config['confidence_threshold'],
                    'iou_threshold': config['iou_threshold'],
                    'is_default': config['is_default'],
                    'category': config['category'],
                    'detection_type': config.get('detection_type', 'unknown'),  # 添加检测类型
                    'class_names': self.get_class_names_mapping(model_id),  # 添加类别中文名称映射
                    'class_categories': self.get_classes_by_category(model_id),  # 添加类别分类分组
                    'file_size': 0,
                    'exists': False
                })
        
        return available_models
    
    def get_model_config(self, model_id: str) -> Dict[str, Any]:
        """获取指定模型的配置"""
        return self.models.get(model_id, {})
    
    def get_model_config_for_api(self, model_id: str) -> Dict[str, Any]:
        """
        获取指定模型的完整配置（用于API返回）
        包含检测类型、类别列表等完整信息
        """
        config = self.models.get(model_id, {})
        if not config:
            return {}
        
        # 构建返回的配置信息
        result = {
            'id': model_id,
            'name': config.get('name', ''),
            'file': config.get('file', ''),
            'description': config.get('description', ''),
            'classes': config.get('classes', []),
            'detection_type': config.get('detection_type', 'unknown'),
            'confidence_threshold': config.get('confidence_threshold', 0.5),
            'iou_threshold': config.get('iou_threshold', 0.3),
            'is_default': config.get('is_default', False),
            'category': config.get('category', ''),
            'class_names': self.get_class_names_mapping(model_id),  # 添加类别中文名称映射
            'class_categories': self.get_classes_by_category(model_id),  # 添加类别分类分组
        }
        
        # 检查文件是否存在
        import os
        repo_root = _get_repo_root()
        model_file = config.get('file', '')
        if model_file:
            models_dir_path = os.path.join(repo_root, 'models', model_file)
            if os.path.exists(models_dir_path):
                result['file_size'] = os.path.getsize(models_dir_path)
                result['exists'] = True
            else:
                result['file_size'] = 0
                result['exists'] = False
        
        return result
    
    def get_ppe_mapping(self, model_id: str) -> Dict[str, str]:
        """获取指定模型的PPE类别映射"""
        return self.ppe_mapping.get(model_id, {})
    
    def get_default_model(self) -> str:
        """获取默认模型ID（优先从数据库读取，然后返回非隐藏的默认模型）"""
        try:
            # 尝试从数据库获取当前模型配置
            ModelConfig = apps.get_model('inspection', 'ModelConfig')
            current_model = ModelConfig.get_current_model('PPE_YOLO')
            
            # 验证模型是否仍然可用
            if current_model in self.models and not self.models[current_model].get('hidden', False):
                return current_model
        except Exception as e:
            print(f"从数据库获取模型配置失败: {e}")
        
        # 如果数据库中没有配置或模型不可用，使用文件中的默认配置
        # 首先查找非隐藏的默认模型
        for model_id, config in self.models.items():
            if config.get('is_default', False) and not config.get('hidden', False):
                return model_id
        
        # 如果没有非隐藏的默认模型，返回第一个非隐藏的模型
        for model_id, config in self.models.items():
            if not config.get('hidden', False):
                return model_id
                
        return 'ppe_detection'  # 如果所有模型都隐藏，返回ppe_detection
    
    def set_default_model(self, model_id: str) -> bool:
        """设置指定模型为默认模型（保存到数据库）"""
        try:
            # 检查模型是否存在
            if model_id not in self.models:
                return False
            
            # 保存到数据库
            try:
                ModelConfig = apps.get_model('inspection', 'ModelConfig')
                model_config = self.get_model_config(model_id)
                ModelConfig.set_current_model('PPE_YOLO', model_id, model_config)
                print(f"模型 {model_id} 已保存到数据库")
            except Exception as e:
                print(f"保存模型配置到数据库失败: {e}")
                return False
            
            # 更新内存中的配置（保持向后兼容）
            # 将所有模型的is_default设置为False
            for mid in self.models:
                self.models[mid]['is_default'] = False
            
            # 将指定模型设置为默认
            self.models[model_id]['is_default'] = True
            
            # 重新排序模型，将默认模型放在第一位
            default_model = self.models.pop(model_id)
            self.models = {model_id: default_model, **self.models}
            
            print(f"模型 {model_id} 已设置为默认模型并移动到第一位")
            return True
            
        except Exception as e:
            print(f"设置默认模型失败: {e}")
            return False
    
    def validate_model_file(self, model_id: str) -> bool:
        """验证模型文件是否存在"""
        config = self.get_model_config(model_id)
        if not config:
            return False
        
        # 候选路径：按优先级查找
        # 1. 优先查找统一的 models/ 文件夹（推荐位置）
        # 2. 查找 PPE_detection_YOLO 目录（兼容旧位置）
        # 3. 查找 backend 目录（兼容旧位置）
        # 4. 查找仓库根目录（兼容旧位置）
        repo_root = _get_repo_root()
        models_dir_path = os.path.join(repo_root, 'models', config['file'])
        ppe_model_path = os.path.join(repo_root, 'PPE_detection_YOLO', config['file'])
        backend_dir_model_path = os.path.join(os.path.dirname(__file__), '..', config['file'])
        root_model_path = os.path.join(repo_root, config['file'])

        if os.path.exists(models_dir_path):
            model_path = models_dir_path
        elif os.path.exists(ppe_model_path):
            model_path = ppe_model_path
        elif os.path.exists(backend_dir_model_path):
            model_path = backend_dir_model_path
        elif os.path.exists(root_model_path):
            model_path = root_model_path
        else:
            model_path = models_dir_path  # 默认使用 models/ 文件夹路径
            
        return os.path.exists(model_path)

# 创建全局实例
ppe_model_config = PPEModelConfig()
