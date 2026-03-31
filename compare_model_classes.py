#!/usr/bin/env python3
"""
对比当前模型与自定义滤芯模型类别
"""

def compare_model_classes():
    """对比模型类别"""
    
    print("=" * 60)
    print("模型类别对比分析")
    print("=" * 60)
    
    # 当前best.pt的类别（COCO数据集）
    current_classes = [
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
    
    # 您训练的自定义类别
    custom_classes = {
        0: 'filter',        # 过滤器
        1: 'filtername',    # 过滤器名称  
        2: 'nsplogo',      # NSP标志/Logo
        3: 'qrcode'         # 二维码
    }
    
    print("🔍 当前best.pt模型类别 (COCO数据集):")
    print(f"总数量: {len(current_classes)}个")
    print("类别列表:")
    for i, cls in enumerate(current_classes):
        print(f"  {i}: {cls}")
    
    print(f"\n🎯 您训练的自定义滤芯模型类别:")
    print(f"总数量: {len(custom_classes)}个")
    print("类别列表:")
    for i, cls in custom_classes.items():
        print(f"  {i}: {cls}")
    
    print(f"\n❌ 对比结果:")
    print("当前best.pt模型:")
    print("  ✅ 包含通用物体检测类别 (80个COCO类别)")
    print("  ❌ 不包含您的自定义滤芯检测类别")
    print("  ❌ 无法直接识别: filter, filtername, nsplogo, qrcode")
    
    print(f"\n🎯 您的自定义模型:")
    print("  ✅ 专门训练用于滤芯检测")
    print("  ✅ 包含4个特定类别: filter, filtername, nsplogo, qrcode")
    print("  ✅ 更适合滤芯检测任务")
    
    print(f"\n💡 建议:")
    print("1. 当前best.pt是通用模型，不适合您的滤芯检测需求")
    print("2. 需要使用您训练的自定义模型")
    print("3. 自定义模型应该包含以下4个类别:")
    for i, cls in custom_classes.items():
        print(f"   - {i}: {cls}")
    
    # 检查是否有其他模型文件
    print(f"\n🔍 检查项目中的其他模型文件:")
    import os
    model_files = []
    for root, dirs, files in os.walk('.'):
        for file in files:
            if file.endswith('.pt'):
                model_files.append(os.path.join(root, file))
    
    if model_files:
        print("找到的.pt模型文件:")
        for model_file in model_files:
            size = os.path.getsize(model_file)
            print(f"  - {model_file} ({size:,} 字节)")
    else:
        print("未找到其他.pt模型文件")

if __name__ == "__main__":
    compare_model_classes()
