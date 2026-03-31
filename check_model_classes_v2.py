#!/usr/bin/env python3
"""
检查YOLO模型中的目标关键词 - 改进版
"""

import torch
import os
import pickle

def check_yolo_model_classes_v2(model_path):
    """检查YOLO模型的类别信息 - 改进版"""
    try:
        print(f"正在加载模型: {model_path}")
        
        # 检查文件是否存在
        if not os.path.exists(model_path):
            print(f"❌ 模型文件不存在: {model_path}")
            return
        
        # 获取文件大小
        file_size = os.path.getsize(model_path)
        print(f"📁 文件大小: {file_size:,} 字节 ({file_size/1024/1024:.2f} MB)")
        
        # 尝试不同的加载方式
        print(f"\n🔍 尝试加载模型...")
        
        # 方法1: 直接加载
        try:
            model = torch.load(model_path, map_location='cpu', weights_only=False)
            print(f"✅ 模型加载成功")
            print(f"模型类型: {type(model)}")
            
            # 检查是否是字典格式
            if isinstance(model, dict):
                print(f"\n📋 模型字典键值:")
                for key, value in model.items():
                    print(f"  {key}: {type(value)}")
                    
                    # 特别检查names
                    if key == 'names' and isinstance(value, dict):
                        print(f"\n🎯 检测类别 ({len(value)}个):")
                        for i, name in value.items():
                            print(f"  {i}: {name}")
                    
                    # 检查model字段
                    elif key == 'model':
                        print(f"\n🏗️  模型架构信息:")
                        if hasattr(value, 'names'):
                            names = value.names
                            print(f"检测类别 ({len(names)}个):")
                            for i, name in names.items():
                                print(f"  {i}: {name}")
                        else:
                            print(f"模型对象类型: {type(value)}")
                            # 尝试获取属性
                            attrs = [attr for attr in dir(value) if not attr.startswith('_')]
                            print(f"可用属性: {attrs[:10]}...")  # 只显示前10个
                            
            else:
                print(f"模型不是字典格式，类型: {type(model)}")
                
        except Exception as e:
            print(f"❌ 加载失败: {e}")
            
            # 方法2: 尝试pickle加载
            try:
                print(f"\n🔄 尝试pickle加载...")
                with open(model_path, 'rb') as f:
                    model = pickle.load(f)
                print(f"✅ Pickle加载成功")
                print(f"模型类型: {type(model)}")
                
                if isinstance(model, dict):
                    for key, value in model.items():
                        print(f"  {key}: {type(value)}")
                        if key == 'names':
                            print(f"检测类别: {value}")
                            
            except Exception as e2:
                print(f"❌ Pickle加载也失败: {e2}")
                
    except Exception as e:
        print(f"❌ 检查模型失败: {e}")

def check_yolov8n_classes():
    """检查YOLOv8n的标准类别"""
    print(f"\n📚 YOLOv8n标准类别 (COCO数据集):")
    coco_classes = [
        'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat',
        'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat',
        'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack',
        'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball',
        'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket',
        'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
        'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair',
        'couch', 'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse',
        'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink', 'refrigerator',
        'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier', 'toothbrush'
    ]
    
    print(f"总共 {len(coco_classes)} 个类别:")
    for i, cls in enumerate(coco_classes):
        print(f"  {i}: {cls}")
        
    # 特别标注滤芯相关的类别
    filter_related = ['bottle', 'cup', 'vase', 'wine glass']
    print(f"\n🔍 滤芯检测相关类别:")
    for cls in filter_related:
        if cls in coco_classes:
            idx = coco_classes.index(cls)
            print(f"  {idx}: {cls} ⭐")

if __name__ == "__main__":
    print("=" * 60)
    print("YOLO模型目标关键词检查 - 改进版")
    print("=" * 60)
    
    # 检查当前best.pt
    model_path = "best.pt"
    check_yolo_model_classes_v2(model_path)
    
    # 显示YOLOv8n标准类别
    check_yolov8n_classes()
    
    print("\n" + "=" * 60)
    print("检查完成")
    print("=" * 60)
