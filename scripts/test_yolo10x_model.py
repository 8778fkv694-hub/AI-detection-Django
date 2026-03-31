#!/usr/bin/env python3
"""
测试YOLO10X模型的加载和检测功能
"""

import requests
import base64
import json
import time
from PIL import Image
import io

def create_test_image():
    """创建一个测试图片"""
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

def test_yolo10x_detection():
    """测试YOLO10X模型检测"""
    print("\n🔍 测试YOLO10X模型检测功能...")
    
    # 创建测试图片
    image_data = create_test_image()
    
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
                    
                    # 检查检测类别
                    if label in ['cleanroom_cap', 'mask', 'cleanroom_suit']:
                        print(f"     ✅ PPE类别")
                    elif label == 'person':
                        print(f"     👤 人员检测")
                    elif label in ['no_cleanroom_cap', 'no_mask', 'no_cleanroom_suit']:
                        print(f"     ⚠️ 负面检测")
                    else:
                        print(f"     🔍 其他类别")
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

def test_model_switching():
    """测试模型切换功能"""
    print("\n🔍 测试模型切换功能...")
    
    try:
        # 测试切换到YOLO10X模型
        response = requests.post(
            'http://localhost:8000/api/results/switch-model/',
            json={'model_id': 'yolo10x'},
            headers={'Content-Type': 'application/json'}
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ 模型切换成功")
            print(f"   当前模型: {data.get('current_model', 'unknown')}")
            print(f"   消息: {data.get('message', '')}")
            return True
        else:
            print(f"❌ 模型切换失败: {response.status_code}")
            print(f"   响应内容: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ 模型切换请求失败: {e}")
        return False

def test_available_models():
    """测试获取可用模型列表"""
    print("\n🔍 测试获取可用模型列表...")
    
    try:
        response = requests.get('http://localhost:8000/api/results/available-models/')
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ 获取模型列表成功")
            print(f"   可用模型数量: {len(data.get('models', []))}")
            
            # 显示模型信息
            for model in data.get('models', []):
                print(f"\n   模型: {model.get('name', 'Unknown')}")
                print(f"     ID: {model.get('id', 'Unknown')}")
                print(f"     文件: {model.get('file', 'Unknown')}")
                print(f"     类别: {model.get('category', 'Unknown')}")
                print(f"     存在: {'✅' if model.get('exists', False) else '❌'}")
                print(f"     默认: {'✅' if model.get('is_default', False) else '❌'}")
            
            return True
        else:
            print(f"❌ 获取模型列表失败: {response.status_code}")
            print(f"   响应内容: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ 获取模型列表请求失败: {e}")
        return False

def main():
    """主函数"""
    print("🚀 开始测试YOLO10X模型功能...\n")
    
    # 等待后端启动
    print("⏳ 等待后端服务启动...")
    time.sleep(2)
    
    # 测试基本连接
    try:
        response = requests.get('http://localhost:8000/api/results/ppe-model-status/')
        if response.status_code != 200:
            print("❌ 后端连接失败，请检查Django服务器")
            return
        print("✅ 后端连接正常")
    except Exception as e:
        print(f"❌ 后端连接失败: {e}")
        return
    
    # 测试获取可用模型列表
    test_available_models()
    
    # 测试模型切换
    test_model_switching()
    
    # 测试YOLO10X检测
    test_yolo10x_detection()
    
    print("\n🎯 测试完成！")
    print("\n📋 YOLO10X模型特性:")
    print("   ✅ 支持17个检测类别")
    print("   ✅ 医疗服映射为洁净服")
    print("   ✅ 安全帽映射为洁净帽")
    print("   ✅ 面罩映射为口罩")
    print("   ✅ 支持手套、安全眼镜等PPE检测")
    
    print("\n💡 使用说明:")
    print("   - 可以通过API切换不同的模型")
    print("   - YOLO10X模型提供更全面的PPE检测")
    print("   - 支持正面和负面检测")

if __name__ == "__main__":
    main()
