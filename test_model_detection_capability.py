#!/usr/bin/env python3
"""
测试模型检测能力 - 检查为什么只检测到filter而没有检测到其他类别
"""

from ultralytics import YOLO
import cv2
import numpy as np
import os

def test_model_detection():
    """测试模型检测能力"""
    
    print("=== 测试模型检测能力 ===")
    
    # 加载模型
    model_path = 'best.pt'
    if not os.path.exists(model_path):
        print(f"❌ 模型文件不存在: {model_path}")
        return
    
    try:
        model = YOLO(model_path)
        print(f"✅ 模型加载成功: {model_path}")
        print(f"📋 模型类别: {model.names}")
        print(f"📊 类别数量: {len(model.names)}")
    except Exception as e:
        print(f"❌ 模型加载失败: {e}")
        return
    
    # 创建测试图像 - 模拟滤芯检测场景
    print("\n=== 创建测试图像 ===")
    
    # 创建一个包含多种元素的测试图像
    test_image = np.ones((480, 640, 3), dtype=np.uint8) * 255  # 白色背景
    
    # 绘制一些模拟的检测目标
    # 1. 绘制一个矩形（模拟filter）
    cv2.rectangle(test_image, (100, 100), (200, 200), (0, 0, 255), 2)
    cv2.putText(test_image, "FILTER", (110, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 1)
    
    # 2. 绘制一个圆形（模拟filtername）
    cv2.circle(test_image, (400, 150), 50, (255, 0, 0), 2)
    cv2.putText(test_image, "FILTERNAME", (350, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 0, 0), 1)
    
    # 3. 绘制一个三角形（模拟nsplogo）
    pts = np.array([[300, 300], [250, 350], [350, 350]], np.int32)
    cv2.polylines(test_image, [pts], True, (0, 255, 0), 2)
    cv2.putText(test_image, "NSPLOGO", (260, 290), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 0), 1)
    
    # 4. 绘制一个正方形（模拟qrcode）
    cv2.rectangle(test_image, (450, 300), (550, 400), (255, 0, 255), 2)
    cv2.putText(test_image, "QRCODE", (460, 320), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 0, 255), 1)
    
    # 保存测试图像
    cv2.imwrite('test_detection_image.jpg', test_image)
    print("✅ 测试图像已保存: test_detection_image.jpg")
    
    # 使用不同置信度阈值进行检测
    confidence_thresholds = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
    
    print("\n=== 不同置信度阈值检测结果 ===")
    
    for conf_threshold in confidence_thresholds:
        print(f"\n--- 置信度阈值: {conf_threshold} ---")
        
        try:
            # 进行检测
            results = model(test_image, conf=conf_threshold, verbose=False)
            
            if results and len(results) > 0:
                result = results[0]
                
                if result.boxes is not None and len(result.boxes) > 0:
                    detections = []
                    
                    for box in result.boxes:
                        conf = float(box.conf[0])
                        cls_id = int(box.cls[0])
                        label = model.names[cls_id]
                        
                        detections.append({
                            'label': label,
                            'confidence': conf,
                            'class_id': cls_id
                        })
                    
                    print(f"检测到 {len(detections)} 个目标:")
                    for det in detections:
                        print(f"  - {det['label']}: {det['confidence']:.3f}")
                else:
                    print("未检测到任何目标")
            else:
                print("检测失败")
                
        except Exception as e:
            print(f"检测出错: {e}")
    
    print("\n=== 检测完成 ===")

if __name__ == "__main__":
    test_model_detection()
