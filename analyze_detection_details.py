#!/usr/bin/env python3
"""
详细分析滤芯检测模型的检测结果
"""

import os
import sys
import json
from ultralytics import YOLO
import cv2
import numpy as np

def analyze_detection_details():
    """详细分析检测结果"""
    
    print("=" * 60)
    print("详细分析滤芯检测模型")
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
        
        # 测试图片
        test_image = "test_files/test_image.jpg"
        if not os.path.exists(test_image):
            print(f"❌ 测试图片不存在: {test_image}")
            return
        
        print(f"📸 分析测试图片: {test_image}")
        
        # 读取图片
        image = cv2.imread(test_image)
        if image is None:
            print(f"❌ 无法读取图片: {test_image}")
            return
        
        height, width = image.shape[:2]
        print(f"📐 图片尺寸: {width} x {height}")
        
        # 进行检测
        results = model(test_image)
        
        print("\n📊 详细检测结果:")
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
                    print(f"      置信度: {conf:.3f} ({conf*100:.1f}%)")
                    print(f"      绝对坐标: x1={x1:.1f}, y1={y1:.1f}, x2={x2:.1f}, y2={y2:.1f}")
                    print(f"      相对坐标: x1={x1/width:.3f}, y1={y1/height:.3f}, x2={x2/width:.3f}, y2={y2/height:.3f}")
                    print(f"      尺寸: {x2-x1:.1f} x {y2-y1:.1f}")
                    print(f"      中心点: ({x1+(x2-x1)/2:.1f}, {y1+(y2-y1)/2:.1f})")
                    
                    # 分析检测区域
                    center_x = x1 + (x2-x1)/2
                    center_y = y1 + (y2-y1)/2
                    
                    print(f"      区域分析:")
                    print(f"        中心位置: ({center_x:.1f}, {center_y:.1f})")
                    print(f"        相对中心: ({center_x/width:.3f}, {center_y/height:.3f})")
                    
                    # 检查是否检测到了人
                    if cls_name == 'person':
                        print(f"      ⚠️  检测到人员！")
                    elif cls_name in ['filter', 'filtername', 'nsplogo', 'qrcode']:
                        print(f"      ✅ 检测到滤芯相关目标: {cls_name}")
                        
                        # 分析检测区域是否合理
                        area_ratio = (x2-x1)*(y2-y1) / (width*height)
                        print(f"        检测区域占比: {area_ratio:.3f} ({area_ratio*100:.1f}%)")
                        
                        if area_ratio > 0.8:
                            print(f"        ⚠️  检测区域过大，可能误识别")
                        elif area_ratio < 0.01:
                            print(f"        ⚠️  检测区域过小，可能误识别")
                        else:
                            print(f"        ✅ 检测区域大小合理")
                    else:
                        print(f"      ❓ 检测到其他目标: {cls_name}")
            else:
                print("  未检测到任何目标")
        
        # 检查模型训练质量
        print(f"\n🔍 模型质量分析:")
        print(f"  模型类别数量: {len(model.names)}")
        print(f"  类别分布: {list(model.names.values())}")
        
        # 检查是否有足够的训练数据
        if len(model.names) == 4:
            print(f"  ✅ 模型包含预期的4个类别")
        else:
            print(f"  ⚠️  模型类别数量不符合预期")
        
        print("\n" + "=" * 60)
        print("分析完成")
        print("=" * 60)
        
    except Exception as e:
        print(f"❌ 分析失败: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    analyze_detection_details()
