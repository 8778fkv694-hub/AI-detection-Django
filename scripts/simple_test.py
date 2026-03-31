#!/usr/bin/env python3
"""
简单的图片检测测试
"""

import requests
import base64
import json

def test_simple_detection():
    """简单的图片检测测试"""
    print("🔍 简单图片检测测试...")
    
    # 读取一张测试图片
    try:
        with open('mask_test_image.jpg', 'rb') as f:
            image_data = f.read()
            base64_image = base64.b64encode(image_data).decode('utf-8')
        
        print(f"✅ 图片读取成功，大小: {len(image_data)} bytes")
        
        # 调用检测API
        url = "http://localhost:8000/api/results/yolo-detect/"
        payload = {"image": base64_image, "conf": 0.01}  # 使用极低的阈值
        
        print("📡 调用检测API...")
        response = requests.post(url, json=payload, headers={"Content-Type": "application/json"})
        
        print(f"📊 响应状态: {response.status_code}")
        print(f"📄 响应内容: {response.text[:500]}...")
        
        if response.status_code == 200:
            data = response.json()
            detections = data.get('detections', [])
            print(f"🎯 检测到 {len(detections)} 个对象")
            
            if detections:
                print("📋 检测结果:")
                for i, detection in enumerate(detections, 1):
                    label = detection.get('label', 'unknown')
                    confidence = detection.get('confidence', 0)
                    bbox = detection.get('bbox', {})
                    print(f"   {i}. {label} (置信度: {confidence:.3f})")
                    print(f"      边界框: x1={bbox.get('x1', 0):.1f}, y1={bbox.get('y1', 0):.1f}, x2={bbox.get('x2', 0):.1f}, y2={bbox.get('y2', 0):.1f}")
            else:
                print("❌ 未检测到任何对象")
        else:
            print(f"❌ API调用失败")
            
    except Exception as e:
        print(f"❌ 测试异常: {e}")

if __name__ == "__main__":
    test_simple_detection()
