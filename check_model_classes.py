#!/usr/bin/env python3
"""
检查YOLO模型中的目标关键词
"""

import torch
import os

def check_yolo_model_classes(model_path):
    """检查YOLO模型的类别信息"""
    try:
        print(f"正在加载模型: {model_path}")
        
        # 检查文件是否存在
        if not os.path.exists(model_path):
            print(f"❌ 模型文件不存在: {model_path}")
            return
        
        # 获取文件大小
        file_size = os.path.getsize(model_path)
        print(f"📁 文件大小: {file_size:,} 字节 ({file_size/1024/1024:.2f} MB)")
        
        # 加载模型
        model = torch.load(model_path, map_location='cpu')
        
        print(f"\n🔍 模型信息:")
        print(f"模型类型: {type(model)}")
        
        # 检查模型结构
        if hasattr(model, 'model'):
            print(f"模型架构: {type(model.model)}")
            
            # 获取类别信息
            if hasattr(model.model, 'names'):
                names = model.model.names
                print(f"\n📋 检测类别 ({len(names)}个):")
                for i, name in names.items():
                    print(f"  {i}: {name}")
            else:
                print("⚠️  未找到类别名称信息")
                
            # 获取模型配置
            if hasattr(model.model, 'yaml'):
                print(f"\n⚙️  模型配置:")
                print(f"YAML配置: {model.model.yaml}")
                
        elif hasattr(model, 'names'):
            # 直接访问names
            names = model.names
            print(f"\n📋 检测类别 ({len(names)}个):")
            for i, name in names.items():
                print(f"  {i}: {name}")
        else:
            print("⚠️  无法识别模型结构")
            
        # 检查其他可能的属性
        print(f"\n🔧 模型属性:")
        for attr in dir(model):
            if not attr.startswith('_'):
                try:
                    value = getattr(model, attr)
                    if not callable(value):
                        print(f"  {attr}: {type(value)}")
                except:
                    pass
                    
    except Exception as e:
        print(f"❌ 加载模型失败: {e}")

def check_model_file_info(model_path):
    """检查模型文件的基本信息"""
    try:
        print(f"\n📄 文件信息:")
        print(f"路径: {model_path}")
        
        if os.path.exists(model_path):
            stat = os.stat(model_path)
            print(f"创建时间: {stat.st_ctime}")
            print(f"修改时间: {stat.st_mtime}")
            print(f"文件权限: {oct(stat.st_mode)}")
        else:
            print("文件不存在")
            
    except Exception as e:
        print(f"检查文件信息失败: {e}")

if __name__ == "__main__":
    print("=" * 60)
    print("YOLO模型目标关键词检查")
    print("=" * 60)
    
    # 检查当前best.pt
    model_path = "best.pt"
    check_yolo_model_classes(model_path)
    check_model_file_info(model_path)
    
    print("\n" + "=" * 60)
    print("检查完成")
    print("=" * 60)
