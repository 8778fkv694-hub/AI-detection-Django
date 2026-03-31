import os
import logging
import threading
from typing import List, Dict, Any, Optional
from collections import OrderedDict
from datetime import datetime

import numpy as np
from .model_config import ppe_model_config, _get_repo_root

logger = logging.getLogger(__name__)

# 模型池：支持同时加载多个模型实例
_model_pool: Dict[str, Any] = OrderedDict()  # {model_id: model_instance}
_model_last_used: Dict[str, datetime] = {}  # {model_id: last_used_time}
_current_model_id = None  # 记录最近使用的模型（用于兼容旧接口）
_lock = threading.Lock()
MAX_MODEL_POOL_SIZE = 3  # 最大同时加载3个模型


def load_model(model_id: Optional[str] = None):
    """
    加载PPE检测模型。支持多种模型选择。
    如果指定了model_id，加载指定模型；否则加载默认模型。
    使用模型池机制，支持同时加载多个模型实例。
    """
    global _model_pool, _model_last_used, _current_model_id
    
    # 如果没有指定模型ID，使用默认模型
    if not model_id:
        model_id = ppe_model_config.get_default_model()
    
    # 如果模型池中已有该模型，直接返回并更新使用时间
    if model_id in _model_pool:
        _model_last_used[model_id] = datetime.now()
        _current_model_id = model_id
        logger.info(f"📦 从模型池获取模型: {model_id}")
        return _model_pool[model_id]

    with _lock:
        # 双重检查锁定
        if model_id in _model_pool:
            _model_last_used[model_id] = datetime.now()
            _current_model_id = model_id
            return _model_pool[model_id]

        # 延迟导入，避免在未使用时占用内存/启动慢
        try:
            from ultralytics import YOLO  # type: ignore
        except ImportError as e:
            raise Exception(f"系统必须依赖PPE模型，但ultralytics库未安装。请运行: pip install ultralytics。错误: {e}")
        
        # 修复PyTorch兼容性问题
        try:
            import torch
            os.environ["TORCH_WEIGHTS_ONLY"] = "false"
            
            # 修复PyTorch 2.8+在macOS上的兼容性问题
            try:
                # 设置PyTorch的安全加载选项
                os.environ["TORCH_LOAD_SAFE"] = "true"
                os.environ["TORCH_WEIGHTS_ONLY"] = "false"
                
                # 对于macOS，设置特定的加载选项
                if hasattr(torch, 'load') and hasattr(torch.load, '__module__'):
                    # 确保torch.load函数正确初始化
                    pass
                else:
                    # 重新导入torch以确保正确初始化
                    import importlib
                    importlib.reload(torch)
                    
            except Exception as e:
                logger.warning(f"设置PyTorch macOS兼容性选项失败: {e}")
            
            # 尝试设置其他兼容性选项
            try:
                torch.set_default_dtype(torch.float32)
            except:
                pass
                
        except ImportError as e:
            raise Exception(f"系统必须依赖PPE模型，但PyTorch未安装。请运行: pip install torch。错误: {e}")

        # 获取模型配置
        model_config = ppe_model_config.get_model_config(model_id)
        if not model_config:
            raise Exception(f"未找到模型配置: {model_id}")
        
        # 构建模型文件路径
        model_file = model_config['file']
        
        # 获取项目根目录
        repo_root = _get_repo_root()
        
        # 按优先级查找模型文件路径：
        # 1. 优先查找统一的 models/ 文件夹（推荐位置）
        models_dir_path = os.path.join(repo_root, 'models', model_file)
        
        # 2. 查找 PPE_detection_YOLO 目录（兼容旧位置）
        ppe_model_path = os.path.join(repo_root, 'PPE_detection_YOLO', model_file)
        
        # 3. 查找 backend 目录（兼容旧位置）
        backend_dir_model_path = os.path.join(os.path.dirname(__file__), '..', model_file)
        
        # 4. 查找仓库根目录（兼容旧位置）
        root_model_path = os.path.join(repo_root, model_file)
        
        # 按优先级选择存在的路径
        if os.path.exists(models_dir_path):
            model_path = models_dir_path
        elif os.path.exists(ppe_model_path):
            model_path = ppe_model_path
        elif os.path.exists(backend_dir_model_path):
            model_path = backend_dir_model_path
        elif os.path.exists(root_model_path):
            model_path = root_model_path
        else:
            # 如果都不存在，默认使用 models/ 文件夹路径（用于错误提示）
            model_path = models_dir_path
        
        if not os.path.exists(model_path):
            raise Exception(f"PPE模型文件不存在: {model_path}")

        logger.info(f"正在加载PPE模型: {model_path}")

        try:
            # 检查模型池大小，如果已满则释放最久未使用的模型
            if len(_model_pool) >= MAX_MODEL_POOL_SIZE:
                # 找出最久未使用的模型
                oldest_model_id = min(_model_last_used.items(), key=lambda x: x[1])[0]
                logger.info(f"🗑️  模型池已满，释放模型: {oldest_model_id}")
                del _model_pool[oldest_model_id]
                del _model_last_used[oldest_model_id]

            # 加载新模型到模型池
            model = YOLO(model_path)
            _model_pool[model_id] = model
            _model_last_used[model_id] = datetime.now()
            _current_model_id = model_id
            logger.info(f"✅ 模型加载成功并加入模型池: {model_id} (池中模型数: {len(_model_pool)})")
            return model
            
        except Exception as e:
            raise Exception(f"PPE模型加载失败: {e}")


def get_current_model_id() -> str:
    """获取当前加载的模型ID（返回最近使用的模型）"""
    # 优先返回当前加载的模型ID
    if _current_model_id:
        return _current_model_id
    
    # 如果当前没有加载模型，从配置中获取默认模型
    return ppe_model_config.get_default_model()


def get_default_model_id() -> str:
    """获取稳定的默认模型ID，不受最近使用模型影响。"""
    return ppe_model_config.get_default_model()


def get_model_pool_status() -> Dict[str, Any]:
    """获取模型池状态信息"""
    return {
        'loaded_models': list(_model_pool.keys()),
        'pool_size': len(_model_pool),
        'max_pool_size': MAX_MODEL_POOL_SIZE,
        'current_model': _current_model_id,
        'model_last_used': {
            model_id: last_used.isoformat() 
            for model_id, last_used in _model_last_used.items()
        }
    }


def get_available_models() -> List[Dict[str, Any]]:
    """获取可用的模型列表"""
    return ppe_model_config.get_available_models()


def remove_model_from_pool(model_id: str) -> Dict[str, Any]:
    """
    从模型池中移除指定模型

    参数:
        model_id: 要移除的模型ID

    返回:
        包含操作结果的字典
    """
    global _model_pool, _model_last_used, _current_model_id

    with _lock:
        # 检查模型是否在池中
        if model_id not in _model_pool:
            return {
                'success': False,
                'message': f'模型 {model_id} 不在模型池中',
                'loaded_models': list(_model_pool.keys())
            }

        # 移除模型
        del _model_pool[model_id]
        if model_id in _model_last_used:
            del _model_last_used[model_id]

        # 如果移除的是当前模型，更新当前模型ID
        if _current_model_id == model_id:
            # 如果池中还有其他模型，选择最近使用的作为当前模型
            if _model_pool:
                _current_model_id = max(_model_last_used.items(), key=lambda x: x[1])[0]
            else:
                _current_model_id = None

        logger.info(f"🗑️  已从模型池移除模型: {model_id} (剩余模型数: {len(_model_pool)})")

        return {
            'success': True,
            'message': f'成功从模型池移除模型: {model_id}',
            'removed_model': model_id,
            'loaded_models': list(_model_pool.keys()),
            'pool_size': len(_model_pool),
            'current_model': _current_model_id
        }


def switch_model(model_id: str) -> bool:
    """切换到指定模型，并自动设置为默认模型（第一位）"""
    try:
        # 验证模型是否存在
        if not ppe_model_config.validate_model_file(model_id):
            return False
        
        # 将选中的模型设置为默认模型（移动到第一位）
        ppe_model_config.set_default_model(model_id)
        
        # 加载新模型
        load_model(model_id)
        return True
    except Exception as e:
        logger.error(f"切换模型失败: {e}")
        return False


def map_to_ppe(label: str, model_id: Optional[str] = None) -> str:
    """
    将检测到的类别映射到PPE（个人防护装备）类别
    支持多种模型，根据模型ID选择相应的映射规则
    """
    # 如果没有指定模型ID，使用稳定的默认模型，避免受其他页面最近使用模型干扰
    if not model_id:
        model_id = get_default_model_id()
    
    # 获取模型的PPE映射规则
    ppe_mapping = ppe_model_config.get_ppe_mapping(model_id)
    
    # 首先尝试精确匹配（保持原始大小写）
    if label in ppe_mapping:
        mapped_label = ppe_mapping[label]
    # 然后尝试小写匹配
    elif label.lower() in ppe_mapping:
        mapped_label = ppe_mapping[label.lower()]
    # 最后尝试大写匹配（针对Hardhat等）
    elif label.upper() in ppe_mapping:
        mapped_label = ppe_mapping[label.upper()]
    # 如果都没有找到，保持原标签
    else:
        mapped_label = label
    
    return mapped_label


def run_inference(image_bgr: np.ndarray, conf: float = 0.5, model_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    对单张BGR图像进行PPE检测，返回检测结果数组。
    支持多种模型选择，根据model_id选择相应的模型。
    返回项包含：label, confidence, x1,y1,x2,y2。
    自动将检测类别映射到PPE类别。
    """
    try:
        model = load_model(model_id)
        # ultralytics 接受 numpy 数组 (BGR 或 RGB)。
        results = model.predict(source=image_bgr, conf=conf, verbose=False)
        if not results:
            return []

        detections: List[Dict[str, Any]] = []
        r = results[0]
        
        # 兼容不同版本的ultralytics API
        try:
            # 新版本ultralytics
            names = r.names if hasattr(r, 'names') else {}
        except:
            # 旧版本ultralytics
            names = getattr(r, 'names', {}) or {}
        
        # 如果names为空，尝试从模型获取
        if not names:
            try:
                model = load_model(model_id)
                names = getattr(model.model, 'names', {}) or {}
            except:
                names = {}
        
        boxes = getattr(r, 'boxes', None)
        if boxes is None:
            return []

        for b in boxes:
            xyxy = b.xyxy[0].cpu().numpy().tolist()  # [x1,y1,x2,y2]
            conf_val = float(b.conf[0].cpu().numpy()) if hasattr(b, 'conf') else 0.0
            cls_id = int(b.cls[0].cpu().numpy()) if hasattr(b, 'cls') else -1
            original_label = names.get(cls_id, str(cls_id))
            
            # 将检测类别映射到PPE类别
            mapped_label = map_to_ppe(original_label, model_id)
            
            # 过滤掉映射为None的标签（身体器官不显示框选）
            if mapped_label is None:
                continue
            
            # 过滤掉洁净服相关的检测结果
            if mapped_label in ['cleanroom_suit', 'safety-suit', 'medical-suit', 'safety-vest']:
                continue
            
            detections.append({
                'label': mapped_label,
                'confidence': conf_val,
                'bbox': {
                    'x1': float(xyxy[0]), 'y1': float(xyxy[1]),
                    'x2': float(xyxy[2]), 'y2': float(xyxy[3])
                }
            })
        return detections

    except Exception as e:
        logger.error(f"PPE模型推理失败: {e}")
        # 系统必须依赖PPE模型，如果推理失败则抛出异常
        raise Exception(f"PPE模型推理失败了。请检查PPE模型是否正确加载。错误: {e}")


def get_model_status() -> Dict[str, Any]:
    """
    获取PPE模型状态信息
    """
    try:
        model = load_model()
        # 获取项目根目录
        repo_root = _get_repo_root()
        
        # 按优先级查找模型文件路径
        models_dir_path = os.path.join(repo_root, 'models', 'ppe.pt')
        ppe_model_path = os.path.join(repo_root, 'PPE_detection_YOLO', 'ppe.pt')
        backend_model_path = os.path.join(os.path.dirname(__file__), '..', 'ppe.pt')
        
        # 选择存在的路径
        if os.path.exists(models_dir_path):
            model_path = models_dir_path
        elif os.path.exists(ppe_model_path):
            model_path = ppe_model_path
        elif os.path.exists(backend_model_path):
            model_path = backend_model_path
        else:
            model_path = models_dir_path
            
        return {
            'status': 'loaded',
            'model_type': 'PPE_YOLO',
            'message': 'PPE检测模型已成功加载，系统正常运行',
            'model_path': model_path
        }
    except Exception as e:
        return {
            'status': 'error',
            'model_type': 'PPE_YOLO',
            'message': f'PPE检测模型加载失败: {str(e)}',
            'error': str(e),
            'required_model_path': os.path.join(
                _get_repo_root(), 
                'models', 'ppe.pt'
            )
        }


def validate_model_availability() -> bool:
    """
    验证PPE模型是否可用
    """
    try:
        load_model()
        return True
    except Exception:
        return False


def get_ppe_model_info() -> Dict[str, Any]:
    """
    获取PPE模型详细信息
    """
    ppe_model_path = os.environ.get('PPE_MODEL_PATH') or os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'ppe_detection.pt'
    )
    
    return {
        'model_type': 'PPE_YOLO',
        'model_path': ppe_model_path,
        'model_exists': os.path.exists(ppe_model_path),
        'model_size': os.path.getsize(ppe_model_path) if os.path.exists(ppe_model_path) else 0,
        'required': True,
        'description': '系统必须依赖PPE检测模型进行个人防护装备检测'
    }

