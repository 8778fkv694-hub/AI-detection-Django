#!/usr/bin/env python3
"""
检查YOLO模型实际支持的类别
验证模型文件是否包含我们配置的所有类别
"""

import os
import sys
import django

# 设置Django环境
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from ultralytics import YOLO
from inspection.model_config import ppe_model_config

def check_model_classes(model_id: str):
    """检查指定模型实际支持的类别"""
    print("=" * 60)
    print(f"检查模型: {model_id}")
    print("=" * 60)
    
    # 获取模型配置
    model_config = ppe_model_config.get_model_config(model_id)
    if not model_config:
        print(f"❌ 未找到模型配置: {model_id}")
        return
    
    print(f"模型名称: {model_config['name']}")
    print(f"模型文件: {model_config['file']}")
    print(f"配置的类别数量: {len(model_config['classes'])}")
    print(f"配置的类别: {model_config['classes']}")
    print()
    
    # 构建模型文件路径
    model_file = model_config['file']
    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    
    # 按优先级尝试多个可能的路径
    # 1. 优先查找统一的 models/ 文件夹（推荐位置）
    # 2. 查找 PPE_detection_YOLO 目录（兼容旧位置）
    # 3. 查找 backend 目录（兼容旧位置）
    # 4. 查找仓库根目录（兼容旧位置）
    possible_paths = [
        os.path.join(repo_root, 'models', model_file),
        os.path.join(repo_root, 'PPE_detection_YOLO', model_file),
        os.path.join(repo_root, 'backend', model_file),
        os.path.join(repo_root, model_file),
    ]
    
    model_path = None
    for path in possible_paths:
        if os.path.exists(path):
            model_path = path
            break
    
    if not model_path:
        print(f"❌ 模型文件不存在，尝试的路径:")
        for path in possible_paths:
            print(f"   - {path}")
        return
    
    print(f"✅ 找到模型文件: {model_path}")
    print()
    
    try:
        # 加载模型
        print("正在加载模型...")
        model = YOLO(model_path)
        print("✅ 模型加载成功")
        print()
        
        # 获取模型实际支持的类别
        if hasattr(model, 'names'):
            actual_classes = model.names
        elif hasattr(model.model, 'names'):
            actual_classes = model.model.names
        else:
            print("❌ 无法获取模型类别信息")
            return
        
        # 转换为列表格式（类别索引 -> 类别名称）
        if isinstance(actual_classes, dict):
            # 如果是字典，转换为列表（按索引排序）
            class_list = [actual_classes[i] for i in sorted(actual_classes.keys())]
        elif isinstance(actual_classes, list):
            class_list = actual_classes
        else:
            print(f"❌ 未知的类别格式: {type(actual_classes)}")
            return
        
        print(f"模型实际支持的类别数量: {len(class_list)}")
        print(f"模型实际支持的类别: {class_list}")
        print()
        
        # 比较配置的类别和实际类别
        configured_classes = model_config['classes']
        print("=" * 60)
        print("类别对比分析")
        print("=" * 60)
        
        # 检查配置中的每个类别是否在模型中存在
        missing_in_model = []
        extra_in_model = []
        
        for class_name in configured_classes:
            if class_name not in class_list:
                missing_in_model.append(class_name)
        
        for class_name in class_list:
            if class_name not in configured_classes:
                extra_in_model.append(class_name)
        
        if not missing_in_model and not extra_in_model:
            print("✅ 完美匹配！配置的类别和模型实际支持的类别完全一致")
        else:
            if missing_in_model:
                print(f"⚠️  配置中存在但模型不支持的类别 ({len(missing_in_model)} 个):")
                for cls in missing_in_model:
                    print(f"   - {cls}")
                print()
            
            if extra_in_model:
                print(f"ℹ️  模型支持但配置中未包含的类别 ({len(extra_in_model)} 个):")
                for cls in extra_in_model:
                    print(f"   - {cls}")
                print()
        
        # 显示匹配的类别
        matched_classes = [cls for cls in configured_classes if cls in class_list]
        print(f"✅ 匹配的类别 ({len(matched_classes)}/{len(configured_classes)}):")
        for cls in matched_classes:
            print(f"   - {cls}")
        
    except Exception as e:
        print(f"❌ 加载模型时出错: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    # 检查净水机模型
    print("\n")
    check_model_classes('waterprifer_detection')
    print("\n")
    
    # 可选：检查其他模型
    # check_model_classes('filter_core_detection')
    # check_model_classes('ppe_detection')

