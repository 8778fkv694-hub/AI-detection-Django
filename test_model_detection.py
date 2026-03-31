#!/usr/bin/env python3
"""
测试滤芯检测模型的检测结果
"""

import os
import sys
import json
from ultralytics import YOLO

def test_model_detection():
    """测试模型检测结果"""
    
    print("=" * 60)
    print("测试滤芯检测模型")
    print("=" * 60)
    
    # 检查模型文件
    model_path = "PPE_detection_YOLO/best.pt"
    if not os.path.exists(model_path):
        print(f"❌ 模型文件不存在: {model_path}")
        return
    
    print(f"✅ 模型文件存在: {model_path}")
    
    try:
        # 加载模型
        model = YOLO(model_path)
        print(f"✅ 模型加载成功")
        print(f"📋 模型类别: {model.names}")
        print(f"📊 类别数量: {len(model.names)}")
        
        # 检查类别映射
        print("\n🔍 类别映射检查:")
        for i, name in model.names.items():
            print(f"  {i}: {name}")
        
        # 测试检测（使用摄像头或测试图片）
        print("\n🎯 开始检测测试...")
        
        # 如果有测试图片，使用测试图片
        test_images = [
            "test_image.jpg",
            "test_files/test_image.jpg", 
            "IMG_1677.JPG"
        ]
        
        test_image = None
        for img_path in test_images:
            if os.path.exists(img_path):
                test_image = img_path
                break
        
        if test_image:
            print(f"📸 使用测试图片: {test_image}")
            results = model(test_image)
        else:
            print("📸 使用摄像头进行实时检测...")
            # 使用摄像头进行检测
            results = model.predict(source=0, show=True, conf=0.5, save=False)
        
        # 分析检测结果
        print("\n📊 检测结果分析:")
        for i, result in enumerate(results):
            print(f"\n检测结果 {i+1}:")
            
            if result.boxes is not None:
                boxes = result.boxes
                print(f"  检测到 {len(boxes)} 个目标")
                
                for j, box in enumerate(boxes):
                    # 获取类别ID和置信度
                    cls_id = int(box.cls[0])
                    conf = float(box.conf[0])
                    cls_name = model.names[cls_id]
                    
                    # 获取边界框坐标
                    xyxy = box.xyxy[0].cpu().numpy()
                    x1, y1, x2, y2 = xyxy
                    
                    print(f"    目标 {j+1}:")
                    print(f"      类别: {cls_name} (ID: {cls_id})")
                    print(f"      置信度: {conf:.3f}")
                    print(f"      坐标: x1={x1:.1f}, y1={y1:.1f}, x2={x2:.1f}, y2={y2:.1f}")
                    print(f"      尺寸: {x2-x1:.1f} x {y2-y1:.1f}")
                    
                    # 检查是否检测到了人
                    if cls_name == 'person':
                        print(f"      ⚠️  检测到人员！")
                    elif cls_name in ['filter', 'filtername', 'nsplogo', 'qrcode']:
                        print(f"      ✅ 检测到滤芯相关目标: {cls_name}")
                    else:
                        print(f"      ❓ 检测到其他目标: {cls_name}")
            else:
                print("  未检测到任何目标")
        
        print("\n" + "=" * 60)
        print("检测测试完成")
        print("=" * 60)
        
    except Exception as e:
        print(f"❌ 检测失败: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_model_detection()
