#!/usr/bin/env python3
"""
测试YOLO10X模型的所有类别检测功能
验证修改后的配置是否能正确显示所有检测类别
"""

import requests
import json
import base64
import os
from pathlib import Path

def test_yolo10x_all_categories():
    """测试YOLO10X模型的所有类别检测功能"""
    base_url = "http://localhost:8000/api/results"
    
    print("🔍 测试YOLO10X模型的所有类别检测功能...")
    print("=" * 60)
    
    # 1. 首先切换到yolo10x模型
    print("\n1️⃣ 切换到YOLO10X模型...")
    try:
        response = requests.post(
            f"{base_url}/switch-model/",
            json={"model_id": "yolo10x"},
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            data = response.json()
            print("✅ 切换成功")
            print(f"   当前模型: {data['current_model']}")
            print(f"   消息: {data['message']}")
        else:
            print(f"❌ 切换失败: {response.status_code}")
            print(f"   响应: {response.text}")
            return
    except Exception as e:
        print(f"❌ 切换异常: {e}")
        return
    
    # 2. 测试不同的图片
    test_images = [
        "mask_test_image.jpg",
        "no_mask_test.jpg", 
        "ppe_test_image.jpg",
        "realistic_mask_test.jpg",
        "simple_mask_test.jpg"
    ]
    
    print(f"\n2️⃣ 测试图片检测（共{len(test_images)}张）...")
    
    for i, image_file in enumerate(test_images, 1):
        image_path = Path(image_file)  # 直接在backend目录中查找
        
        if not image_path.exists():
            print(f"   {i}. ❌ 图片文件不存在: {image_file}")
            continue
            
        print(f"\n   {i}. 测试图片: {image_file}")
        
        try:
            # 读取图片并转换为base64
            with open(image_path, 'rb') as f:
                image_data = f.read()
                base64_image = base64.b64encode(image_data).decode('utf-8')
            
            # 调用检测API
            response = requests.post(
                f"{base_url}/yolo-detect/",
                json={"image": base64_image},
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 200:
                data = response.json()
                detections = data.get('detections', [])
                
                print(f"      ✅ 检测成功")
                print(f"      检测到 {len(detections)} 个对象")
                
                # 统计不同类别的检测结果
                category_counts = {}
                for detection in detections:
                    label = detection.get('label', 'unknown')
                    confidence = detection.get('confidence', 0)
                    category_counts[label] = category_counts.get(label, 0) + 1
                
                # 显示检测结果
                if category_counts:
                    print(f"      检测类别分布:")
                    for category, count in sorted(category_counts.items()):
                        print(f"        - {category}: {count} 个")
                else:
                    print(f"      未检测到任何对象")
                    
            else:
                print(f"      ❌ 检测失败: {response.status_code}")
                print(f"      响应: {response.text}")
                
        except Exception as e:
            print(f"      ❌ 检测异常: {e}")
    
    # 3. 验证模型配置
    print(f"\n3️⃣ 验证模型配置...")
    try:
        response = requests.get(f"{base_url}/available-models/")
        if response.status_code == 200:
            data = response.json()
            current_model = data.get('current_model', 'unknown')
            
            if current_model == 'yolo10x':
                print("✅ 当前模型确实是YOLO10X")
                
                # 查找yolo10x模型的配置
                yolo10x_config = None
                for model in data.get('models', []):
                    if model['id'] == 'yolo10x':
                        yolo10x_config = model
                        break
                
                if yolo10x_config:
                    print(f"   YOLO10X模型配置:")
                    print(f"     名称: {yolo10x_config['name']}")
                    print(f"     文件: {yolo10x_config['file']}")
                    print(f"     可用: {yolo10x_config['exists']}")
                    print(f"     类别数: {len(yolo10x_config['classes'])}")
                    print(f"     支持类别: {', '.join(yolo10x_config['classes'][:10])}...")
                    print(f"     置信度阈值: {yolo10x_config['confidence_threshold']}")
                    print(f"     IOU阈值: {yolo10x_config['iou_threshold']}")
                else:
                    print("❌ 未找到YOLO10X模型配置")
            else:
                print(f"❌ 当前模型不是YOLO10X: {current_model}")
        else:
            print(f"❌ 获取模型状态失败: {response.status_code}")
    except Exception as e:
        print(f"❌ 验证模型配置异常: {e}")
    
    print("\n" + "=" * 60)
    print("🎯 测试完成！")
    print("\n📋 测试总结:")
    print("1. 已切换到YOLO10X模型")
    print("2. 已测试多张图片的检测功能")
    print("3. 已验证模型配置")
    print("\n💡 如果检测结果显示更多类别，说明配置修改成功！")

if __name__ == "__main__":
    test_yolo10x_all_categories()
