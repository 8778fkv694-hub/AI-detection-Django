#!/usr/bin/env python
"""
初始化检测类别分类数据
从 model_config.py 同步分类信息到数据库
"""

import os
import sys
import django

# 设置 Django 环境
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(backend_dir)
os.chdir(backend_dir)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from inspection.models import ClassCategory
from inspection.model_config import ppe_model_config

def init_class_categories():
    """初始化类别分类数据"""
    print("开始初始化检测类别分类数据...")
    
    # 获取所有模型的类别
    all_classes = set()
    for config in ppe_model_config.models.values():
        all_classes.update(config.get('classes', []))
    
    created_count = 0
    updated_count = 0
    
    for class_name in sorted(all_classes):
        # 从 model_config.py 获取分类和中文名称
        category = ppe_model_config.get_class_category(class_name)
        chinese_name = ppe_model_config.get_class_chinese_name(class_name)
        
        # 创建或更新记录
        obj, created = ClassCategory.objects.get_or_create(
            class_name=class_name,
            defaults={
                'category': category,
                'chinese_name': chinese_name,
                'is_active': True,
            }
        )
        
        if created:
            created_count += 1
            print(f"✅ 创建: {class_name} -> {category} ({chinese_name})")
        else:
            # 如果数据库中没有中文名称，则更新
            if not obj.chinese_name:
                obj.chinese_name = chinese_name
                obj.save()
                updated_count += 1
                print(f"🔄 更新: {class_name} -> 添加中文名称: {chinese_name}")
            elif obj.category != category:
                # 如果分类不一致，更新分类
                old_category = obj.category
                obj.category = category
                obj.save()
                updated_count += 1
                print(f"🔄 更新: {class_name} -> {old_category} -> {category}")
    
    print(f"\n初始化完成：创建 {created_count} 条，更新 {updated_count} 条")
    print(f"总计: {ClassCategory.objects.count()} 条记录")

if __name__ == '__main__':
    init_class_categories()

