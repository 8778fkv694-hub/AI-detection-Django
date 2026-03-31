#!/usr/bin/env python3
"""
检查模型检测的详细结果 - 包括低置信度的检测
"""

from ultralytics import YOLO
import os

def check_detailed_detection():
    """检查详细的检测结果"""
    
    print("=== 检查模型详细检测结果 ===")
    
    # 加载模型
    model = YOLO('best.pt')
    print(f"模型类别: {model.names}")
    
    # 检查是否有真实的摄像头图像
    test_images = [
        'test_detection_image.jpg',
        'realistic_test_image.jpg'
    ]
    
    for img_path in test_images:
        if os.path.exists(img_path):
            print(f"\n--- 测试图像: {img_path} ---")
            
            # 使用极低的置信度阈值进行检测
            results = model(img_path, conf=0.01, verbose=False)
            
            if results and len(results) > 0:
                result = results[0]
                
                if result.boxes is not None and len(result.boxes) > 0:
                    print(f"检测到 {len(result.boxes)} 个目标:")
                    
                    for i, box in enumerate(result.boxes):
                        conf = float(box.conf[0])
                        cls_id = int(box.cls[0])
                        label = model.names[cls_id]
                        
                        print(f"  {i+1}. {label}: {conf:.4f}")
                        
                        # 检查边界框坐标
                        xyxy = box.xyxy[0].cpu().numpy()
                        print(f"     边界框: [{xyxy[0]:.1f}, {xyxy[1]:.1f}, {xyxy[2]:.1f}, {xyxy[3]:.1f}]")
                else:
                    print("未检测到任何目标")
            else:
                print("检测失败")
        else:
            print(f"图像不存在: {img_path}")

if __name__ == "__main__":
    check_detailed_detection()
