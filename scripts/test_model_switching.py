#!/usr/bin/env python3
"""
测试模型切换功能
验证YOLO检测API是否支持自由切换模型
"""

import requests
import base64
import json
from PIL import Image
import io

def create_test_image():
    """创建一个测试图片"""
    # 创建一个简单的测试图片
    img = Image.new('RGB', (640, 480), color='white')
    # 在图片上画一个简单的矩形
    from PIL import ImageDraw
    draw = ImageDraw.Draw(img)
    draw.rectangle([100, 100, 200, 200], fill='blue', outline='red')
    
    # 转换为base64
    buffer = io.BytesIO()
    img.save(buffer, format='JPEG')
    img_bytes = buffer.getvalue()
    img_base64 = base64.b64encode(img_bytes).decode('utf-8')
    
    return img_base64

def test_yolo_detection_with_different_models():
    """测试不同模型下的YOLO检测"""
    base_url = "http://localhost:8000"
    
    # 创建测试图片
    test_image = create_test_image()
    
    # 测试数据
    test_data = {
        "image": test_image,
        "conf": 0.5
    }
    
    print("🧪 测试YOLO检测API的模型切换功能...")
    print("=" * 50)
    
    try:
        # 调用YOLO检测API
        response = requests.post(
            f"{base_url}/api/results/yolo-detect/",
            json=test_data,
            headers={'Content-Type': 'application/json'},
            timeout=30
        )
        
        print(f"📡 API响应状态码: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print("✅ YOLO检测成功!")
            print(f"📊 检测结果:")
            print(f"   - 模型类型: {result.get('model_type', 'unknown')}")
            print(f"   - 消息: {result.get('message', 'no message')}")
            print(f"   - 检测数量: {len(result.get('detections', []))}")
            
            # 显示检测结果
            detections = result.get('detections', [])
            if detections:
                print("🔍 检测到的物体:")
                for i, detection in enumerate(detections):
                    print(f"   {i+1}. {detection.get('label', 'unknown')} "
                          f"(置信度: {detection.get('confidence', 0):.2f})")
            else:
                print("   - 未检测到任何物体")
                
        elif response.status_code == 503:
            error_data = response.json()
            print("❌ 模型不可用错误:")
            print(f"   - 错误类型: {error_data.get('error_type', 'unknown')}")
            print(f"   - 错误信息: {error_data.get('error', 'no error message')}")
            print("💡 建议: 请检查模型配置或切换到其他可用模型")
            
        else:
            print(f"❌ API调用失败: {response.status_code}")
            try:
                error_data = response.json()
                print(f"   错误信息: {error_data}")
            except:
                print(f"   响应内容: {response.text}")
                
    except requests.exceptions.ConnectionError:
        print("❌ 无法连接到后端服务")
        print("💡 请确保Django后端服务正在运行 (python manage.py runserver)")
    except requests.exceptions.Timeout:
        print("❌ 请求超时")
    except Exception as e:
        print(f"❌ 测试过程中发生错误: {e}")

def test_model_switching_api():
    """测试模型切换API"""
    base_url = "http://localhost:8000"
    
    print("\n🔄 测试模型切换API...")
    print("=" * 50)
    
    # 获取可用模型列表
    try:
        response = requests.get(f"{base_url}/api/results/available-models/")
        if response.status_code == 200:
            models_data = response.json()
            print("✅ 获取模型列表成功!")
            print(f"📋 可用模型数量: {len(models_data.get('models', []))}")
            print(f"🎯 当前模型: {models_data.get('current_model', 'unknown')}")
            
            # 显示模型列表
            models = models_data.get('models', [])
            if models:
                print("📝 模型列表:")
                for model in models:
                    status = "✅ 可用" if model.get('exists', False) else "❌ 不可用"
                    default = " (默认)" if model.get('is_default', False) else ""
                    print(f"   - {model.get('name', 'unknown')} ({model.get('id', 'unknown')}) {status}{default}")
                    
        else:
            print(f"❌ 获取模型列表失败: {response.status_code}")
            
    except Exception as e:
        print(f"❌ 获取模型列表时发生错误: {e}")

if __name__ == "__main__":
    print("🚀 开始测试模型切换功能...")
    
    # 测试模型切换API
    test_model_switching_api()
    
    # 测试YOLO检测
    test_yolo_detection_with_different_models()
    
    print("\n✨ 测试完成!")
