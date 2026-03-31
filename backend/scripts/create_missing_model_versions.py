#!/usr/bin/env python3
"""
为models文件夹中的模型文件创建ModelVersion记录
自动检测models文件夹中的.pt文件，如果ModelVersion中没有对应记录，则创建
"""

import os
import sys
import django

# 设置Django环境
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from inspection.models import ModelVersion
from inspection.model_config import ppe_model_config

def get_models_directory():
    """获取models目录路径"""
    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    return os.path.join(repo_root, 'models')

def find_model_id_by_filename(file_name):
    """通过文件名查找对应的模型ID"""
    for model_id, config in ppe_model_config.models.items():
        if config.get('file') == file_name:
            return model_id, config
    return None, None

def get_model_type_from_model_id(model_id):
    """根据模型ID推断ModelVersion的model_type"""
    if model_id in ['ppe_detection', 'yolo8x', 'yolov8l', 'yolov8n']:
        return 'PPE_YOLO'
    elif model_id in ['yolo8_general']:
        return 'YOLO_GENERAL'
    elif model_id in ['filter_core_detection', 'waterprifer_detection']:
        return 'CUSTOM'
    return 'CUSTOM'  # 默认

def create_missing_model_versions():
    """为缺失的模型文件创建ModelVersion记录"""
    print("=" * 80)
    print("创建缺失的ModelVersion记录")
    print("=" * 80)
    print()
    
    models_dir = get_models_directory()
    if not os.path.exists(models_dir):
        print(f"❌ models目录不存在: {models_dir}")
        return
    
    # 获取所有.pt文件
    pt_files = [f for f in os.listdir(models_dir) if f.endswith('.pt')]
    print(f"📁 在 {models_dir} 中找到 {len(pt_files)} 个模型文件:")
    for f in sorted(pt_files):
        file_path = os.path.join(models_dir, f)
        size = os.path.getsize(file_path) / (1024 * 1024)  # MB
        print(f"  - {f} ({size:.2f} MB)")
    print()
    
    created_count = 0
    skipped_count = 0
    
    for file_name in sorted(pt_files):
        # 检查是否已存在ModelVersion记录
        existing = ModelVersion.objects.filter(model_file__icontains=file_name)
        if existing.exists():
            print(f"✓ {file_name}: 已存在ModelVersion记录")
            for v in existing:
                print(f"    - {v.name} v{v.version} ({v.get_status_display()})")
            skipped_count += 1
            continue
        
        # 查找对应的模型ID和配置
        model_id, config = find_model_id_by_filename(file_name)
        
        if not config:
            print(f"⚠️ {file_name}: 未在model_config.py中找到配置，跳过")
            skipped_count += 1
            continue
        
        # 确定模型类型
        model_type = get_model_type_from_model_id(model_id)
        
        # 创建ModelVersion记录
        try:
            file_path = os.path.join(models_dir, file_name)
            file_size = os.path.getsize(file_path)
            
            # 使用模型配置中的名称
            model_name = config.get('name', file_name.replace('.pt', ''))
            
            # 创建记录（注意：model_file字段需要File对象，这里先创建记录，文件路径会在保存时处理）
            version = ModelVersion.objects.create(
                name=model_name,
                version='1.0.0',
                model_type=model_type,
                status='ACTIVE',
                description=config.get('description', ''),
                file_size=file_size,
            )
            
            # 设置文件路径（相对路径）
            version.model_file.name = f'models/{file_name}'
            version.save()
            
            print(f"✅ 创建: {model_name} v1.0.0")
            print(f"   模型ID: {model_id}")
            print(f"   类型: {version.get_model_type_display()}")
            print(f"   文件: {file_name} ({file_size / (1024 * 1024):.2f} MB)")
            created_count += 1
            
        except Exception as e:
            print(f"❌ 创建失败 {file_name}: {str(e)}")
    
    print()
    print("-" * 80)
    print(f"完成！创建: {created_count} 条，跳过: {skipped_count} 条")
    print("=" * 80)
    print()
    print("现在您可以在Django Admin中查看所有模型版本：")
    print("http://localhost:8000/admin/inspection/modelversion/")
    print()

if __name__ == '__main__':
    create_missing_model_versions()

