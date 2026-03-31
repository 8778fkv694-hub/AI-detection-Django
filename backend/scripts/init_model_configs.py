#!/usr/bin/env python3
"""
初始化ModelConfig记录
创建所有模型类型的配置记录

前端模型列表与Django ModelConfig的对应关系：
1. PPE检测专用模型 (ppe_detection) -> PPE_YOLO类型
2. YOLO8X PPE检测模型 (yolo8x) -> 可选，但PPE_YOLO类型默认使用ppe_detection
3. YOLOv8N轻量模型 (yolov8n) -> 可选，但PPE_YOLO类型默认使用ppe_detection
4. YOLO8通用检测模型 (yolo8_general) -> YOLO_GENERAL类型
5. 滤芯专用检测模型 (filter_core_detection) -> FILTER_CORE类型
6. 净水机专用检测模型 (waterprifer_detection) -> CUSTOM类型
"""

import os
import sys
import django

# 设置Django环境
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from inspection.models import ModelConfig
from inspection.model_config import ppe_model_config

def init_model_configs():
    """初始化所有模型配置"""
    print("=" * 80)
    print("初始化ModelConfig记录 - 与前端模型列表一一对应")
    print("=" * 80)
    print()
    print("前端模型列表 -> Django ModelConfig对应关系：")
    print("  1. PPE检测专用模型 (ppe_detection) -> PPE_YOLO类型")
    print("  2. YOLO8通用检测模型 (yolo8_general) -> YOLO_GENERAL类型")
    print("  3. 滤芯专用检测模型 (filter_core_detection) -> FILTER_CORE类型")
    print("  4. 净水机专用检测模型 (waterprifer_detection) -> WATER_PURIFIER类型")
    print()
    print("-" * 80)
    print()
    
    # 定义所有模型类型及其对应的模型ID和配置
    # 注意：这些是每个类型默认激活的模型ID
    model_configs = [
        {
            'model_type': 'PPE_YOLO',
            'model_id': 'ppe_detection',  # 对应前端"PPE检测专用模型"
            'description': 'PPE YOLO检测模型配置 - 默认使用ppe_detection模型'
        },
        {
            'model_type': 'YOLO_GENERAL',
            'model_id': 'yolo8_general',  # 对应前端"YOLO8通用检测模型"
            'description': '通用YOLO模型配置 - 默认使用yolo8_general模型'
        },
        {
            'model_type': 'FILTER_CORE',
            'model_id': 'filter_core_detection',  # 对应前端"滤芯专用检测模型"
            'description': '滤芯检测模型配置 - 默认使用filter_core_detection模型'
        },
        {
            'model_type': 'WATER_PURIFIER',
            'model_id': 'waterprifer_detection',  # 对应前端"净水机专用检测模型"
            'description': '净水机模型配置 - 默认使用waterprifer_detection模型'
        },
    ]
    
    created_count = 0
    updated_count = 0
    
    for config_info in model_configs:
        model_type = config_info['model_type']
        model_id = config_info['model_id']
        description = config_info['description']
        
        # 获取模型配置详情
        try:
            model_config_detail = ppe_model_config.get_model_config(model_id)
        except:
            model_config_detail = None
        
        # 检查是否已存在
        try:
            config = ModelConfig.objects.get(model_type=model_type)
            old_model_id = config.current_model_id
            # 更新现有配置
            config.current_model_id = model_id
            if model_config_detail:
                config.model_config = model_config_detail
            config.save()
            if old_model_id != model_id:
                print(f"✅ 更新: {config.get_model_type_display()}")
                print(f"   模型ID: {old_model_id} -> {model_id}")
            else:
                print(f"✓ 检查: {config.get_model_type_display()} -> {model_id} (已正确)")
            updated_count += 1
        except ModelConfig.DoesNotExist:
            # 创建新配置
            config = ModelConfig.objects.create(
                model_type=model_type,
                current_model_id=model_id,
                model_config=model_config_detail or {}
            )
            print(f"✨ 创建: {config.get_model_type_display()} -> {model_id}")
            created_count += 1
    
    print()
    print("-" * 80)
    print(f"完成！创建: {created_count} 条，更新: {updated_count} 条")
    print("=" * 80)
    print()
    print("现在您可以在Django Admin中查看所有模型配置：")
    print("http://localhost:8000/admin/inspection/modelconfig/")
    print()
    print("提示：")
    print("  - 前端模型列表显示所有可用的模型（6个）")
    print("  - Django ModelConfig配置每个类型当前激活的模型（4个类型）")
    print("  - 可以在前端切换模型，也可以在Django Admin中修改current_model_id")
    print()

if __name__ == '__main__':
    init_model_configs()

