#!/usr/bin/env python3
"""
测试所有图片的检测功能
"""

import requests
import base64
import json
import os
from pathlib import Path

def test_all_images():
    """测试所有图片的检测功能"""
    print("🔍 测试所有图片的检测功能...")
    print("=" * 60)
    
    # 获取所有jpg图片
    image_files = [f for f in os.listdir('.') if f.endswith('.jpg')]
    print(f"找到 {len(image_files)} 张测试图片")
    
    # 首先切换到yolo10x模型
    print("\n1️⃣ 切换到YOLO10X模型...")
    try:
        response = requests.post(
            "http://localhost:8000/api/results/switch-model/",
            json={"model_id": "yolo10x"},
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            data = response.json()
            print("✅ 切换成功")
            print(f"   当前模型: {data['current_model']}")
        else:
            print(f"❌ 切换失败: {response.status_code}")
            return
    except Exception as e:
        print(f"❌ 切换异常: {e}")
        return
    
    # 测试每张图片
    print(f"\n2️⃣ 测试图片检测（共{len(image_files)}张）...")
    
    for i, image_file in enumerate(image_files, 1):
        print(f"\n   {i}. 测试图片: {image_file}")
        
        try:
            # 读取图片并转换为base64
            with open(image_file, 'rb') as f:
                image_data = f.read()
                base64_image = base64.b64encode(image_data).decode('utf-8')
            
            print(f"     图片大小: {len(image_data)} bytes")
            
            # 调用检测API，使用极低的阈值
            response = requests.post(
                "http://localhost:8000/api/results/yolo-detect/",
                json={"image": base64_image, "conf": 0.01},
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 200:
                data = response.json()
                detections = data.get('detections', [])
                
                print(f"     ✅ 检测成功")
                print(f"     检测到 {len(detections)} 个对象")
                
                if detections:
                    print(f"     📋 检测结果:")
                    for j, detection in enumerate(detections, 1):
                        label = detection.get('label', 'unknown')
                        confidence = detection.get('confidence', 0)
                        bbox = detection.get('bbox', {})
                        print(f"        {j}. {label} (置信度: {confidence:.3f})")
                        print(f"           边界框: x1={bbox.get('x1', 0):.1f}, y1={bbox.get('y1', 0):.1f}, x2={bbox.get('x2', 0):.1f}, y2={bbox.get('y2', 0):.1f}")
                else:
                    print(f"     ❌ 未检测到任何对象")
                    
            else:
                print(f"     ❌ 检测失败: {response.status_code}")
                print(f"     响应: {response.text}")
                
        except Exception as e:
            print(f"     ❌ 检测异常: {e}")
    
    print("\n" + "=" * 60)
    print("🎯 测试完成！")

if __name__ == "__main__":
    test_all_images()
