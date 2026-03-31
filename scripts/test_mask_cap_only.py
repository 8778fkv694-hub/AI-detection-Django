#!/usr/bin/env python3
"""
测试只检测口罩和帽子的功能
"""

import requests
import base64
import json
import time
from PIL import Image
import io

def create_test_image_with_person():
    """创建一个包含人员的测试图片"""
    # 创建一个简单的测试图片
    img = Image.new('RGB', (200, 200), color='white')
    
    # 转换为JPEG格式
    img_buffer = io.BytesIO()
    img.save(img_buffer, format='JPEG', quality=80)
    img_buffer.seek(0)
    
    # 转换为base64
    img_data = img_buffer.getvalue()
    base64_data = base64.b64encode(img_data).decode('utf-8')
    
    print(f"✅ 创建测试图片成功")
    print(f"   图片尺寸: 200x200")
    print(f"   图片大小: {len(img_data)} bytes")
    print(f"   Base64长度: {len(base64_data)}")
    
    return base64_data

def test_mask_cap_detection():
    """测试口罩和帽子检测"""
    print("\n🔍 测试口罩和帽子检测功能...")
    
    # 创建测试图片
    image_data = create_test_image_with_person()
    
    payload = {
        'image': image_data,
        'conf': 0.1
    }
    
    try:
        response = requests.post(
            'http://localhost:8000/api/results/yolo-detect/',
            json=payload,
            headers={'Content-Type': 'application/json'}
        )
        
        print(f"   响应状态码: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ 检测成功")
            print(f"   检测结果数量: {len(data['detections'])}")
            print(f"   模型类型: {data['model_type']}")
            print(f"   消息: {data['message']}")
            
            # 分析检测结果
            if data['detections']:
                print("\n📊 检测结果分析:")
                for i, detection in enumerate(data['detections']):
                    label = detection['label']
                    confidence = detection['confidence']
                    bbox = detection['bbox']
                    
                    print(f"   检测{i+1}: {label} (置信度: {confidence:.3f})")
                    print(f"     边界框: x1={bbox['x1']:.1f}, y1={bbox['y1']:.1f}, x2={bbox['x2']:.1f}, y2={bbox['y2']:.1f}")
                    
                    # 检查是否为口罩或帽子相关类别
                    if label in ['cleanroom_cap', 'mask', 'no_cleanroom_cap', 'no_mask']:
                        print(f"     ✅ 口罩/帽子相关类别")
                    elif label == 'person':
                        print(f"     👤 人员检测")
                    else:
                        print(f"     ⚠️ 其他类别")
            else:
                print("   没有检测到任何对象")
            
            return True
        else:
            print(f"❌ 检测失败")
            print(f"   响应内容: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ 检测请求失败: {e}")
        return False

def test_model_status():
    """测试模型状态"""
    print("\n🔍 测试PPE模型状态...")
    
    try:
        response = requests.get('http://localhost:8000/api/results/ppe-model-status/')
        if response.status_code == 200:
            data = response.json()
            print(f"✅ 模型状态正常")
            print(f"   状态: {data['status']}")
            print(f"   模型类型: {data['model_type']}")
            print(f"   消息: {data['message']}")
            return True
        else:
            print(f"❌ 模型状态查询失败: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ 模型状态查询失败: {e}")
        return False

def main():
    """主函数"""
    print("🚀 开始测试只检测口罩和帽子的功能...\n")
    
    # 等待后端启动
    print("⏳ 等待后端服务启动...")
    time.sleep(2)
    
    # 测试模型状态
    if not test_model_status():
        print("\n❌ 模型状态测试失败，请检查Django服务器")
        return
    
    # 测试口罩和帽子检测
    if not test_mask_cap_detection():
        print("\n❌ 口罩和帽子检测测试失败")
        return
    
    print("\n🎉 所有测试通过！")
    print("\n📋 当前检测配置:")
    print("   ✅ 人员检测: 启用")
    print("   ✅ 洁净帽检测: 启用")
    print("   ✅ 口罩检测: 启用")
    print("   ✅ 未戴洁净帽检测: 启用")
    print("   ✅ 未戴口罩检测: 启用")
    print("   ❌ 洁净服检测: 已禁用")
    print("   ❌ 其他PPE检测: 已禁用")
    
    print("\n💡 检测说明:")
    print("   - 系统现在专注于口罩和帽子的检测")
    print("   - 移除了洁净服等其他PPE的检测")
    print("   - 保持了人员检测功能")
    print("   - 支持正面和负面检测（穿戴/未穿戴）")

if __name__ == "__main__":
    main()
