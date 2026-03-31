#!/usr/bin/env python3
"""
检查PPE_detection_YOLO/best.pt模型的类别
"""

import torch
import os

def check_ppe_model():
    """检查PPE_detection_YOLO/best.pt模型"""
    model_path = "PPE_detection_YOLO/best.pt"
    
    print("=" * 60)
    print("检查 PPE_detection_YOLO/best.pt 模型")
    print("=" * 60)
    
    # 检查文件是否存在
    if not os.path.exists(model_path):
        print(f"❌ 模型文件不存在: {model_path}")
        return
    
    # 获取文件大小
    file_size = os.path.getsize(model_path)
    print(f"📁 文件大小: {file_size:,} 字节 ({file_size/1024/1024:.2f} MB)")
    
    try:
        print(f"\n🔍 正在加载模型...")
        model = torch.load(model_path, map_location='cpu', weights_only=False)
        print(f"✅ 模型加载成功")
        print(f"模型类型: {type(model)}")
        
        if isinstance(model, dict):
            print(f"\n📋 模型字典键值:")
            for key, value in model.items():
                print(f"  {key}: {type(value)}")
                
                # 检查names
                if key == 'names' and isinstance(value, dict):
                    print(f"\n🎯 检测类别 ({len(value)}个):")
                    for i, name in value.items():
                        print(f"  {i}: {name}")
                        
                        # 检查是否包含自定义类别
                        if name in ['filter', 'filtername', 'nsplogo', 'qrcode']:
                            print(f"    ⭐ 找到自定义类别: {name}")
                
                # 检查model字段
                elif key == 'model':
                    print(f"\n🏗️  模型架构信息:")
                    if hasattr(value, 'names'):
                        names = value.names
                        print(f"检测类别 ({len(names)}个):")
                        
                        # 检查是否包含自定义类别
                        custom_found = []
                        for i, name in names.items():
                            print(f"  {i}: {name}")
                            if name in ['filter', 'filtername', 'nsplogo', 'qrcode']:
                                custom_found.append(f"{i}: {name}")
                                print(f"    ⭐ 找到自定义类别!")
                        
                        if custom_found:
                            print(f"\n🎉 找到自定义滤芯检测类别:")
                            for custom in custom_found:
                                print(f"  ✅ {custom}")
                        else:
                            print(f"\n❌ 未找到自定义滤芯检测类别")
                            print("这个模型不包含: filter, filtername, nsplogo, qrcode")
                            
                    else:
                        print(f"模型对象类型: {type(value)}")
                        attrs = [attr for attr in dir(value) if not attr.startswith('_')]
                        print(f"可用属性: {attrs[:10]}...")
        
        # 检查其他可能的属性
        print(f"\n🔧 其他模型信息:")
        if 'epoch' in model:
            print(f"训练轮数: {model['epoch']}")
        if 'best_fitness' in model:
            print(f"最佳适应度: {model['best_fitness']}")
        if 'date' in model:
            print(f"训练日期: {model['date']}")
        if 'version' in model:
            print(f"模型版本: {model['version']}")
            
    except Exception as e:
        print(f"❌ 加载模型失败: {e}")
        print("可能的原因:")
        print("1. 模型文件损坏")
        print("2. PyTorch版本不兼容")
        print("3. 模型格式不支持")

if __name__ == "__main__":
    check_ppe_model()
