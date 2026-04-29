#!/usr/bin/env python3
"""
测试Ollama多模态功能
"""

import requests
import base64
import json
from PIL import Image
import io

def create_test_image():
    """创建测试图片"""
    # 创建一个简单的测试图片
    img = Image.new('RGB', (200, 200), color='red')
    img.save('test_red_square.jpg')
    print("✅ 测试图片已创建: test_red_square.jpg")
    return 'test_red_square.jpg'

def image_to_base64(image_path):
    """将图片转换为base64"""
    with open(image_path, 'rb') as f:
        img_data = f.read()
        img_base64 = base64.b64encode(img_data).decode('utf-8')
    return img_base64

def test_text_only():
    """测试纯文本对话"""
    print("🧪 测试纯文本对话...")
    
    data = {
        "model": "qwen2.5-vl-7b",
        "messages": [
            {
                "role": "user",
                "content": "你好，请介绍一下你自己"
            }
        ],
        "stream": False
    }
    
    try:
        response = requests.post(
            'http://localhost:11434/api/chat',
            json=data,
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            print("✅ 文本对话测试成功!")
            print(f"AI回复: {result['message']['content']}")
            return True
        else:
            print(f"❌ 文本对话测试失败: {response.text}")
            return False
    except Exception as e:
        print(f"❌ 文本对话测试出错: {e}")
        return False

def test_image_text():
    """测试图文对话"""
    print("🧪 测试图文对话...")
    
    # 创建测试图片
    image_path = create_test_image()
    img_base64 = image_to_base64(image_path)
    
    data = {
        "model": "qwen2.5-vl-7b",
        "messages": [
            {
                "role": "user",
                "content": f"data:image/jpeg;base64,{img_base64}",
                "images": [img_base64]
            },
            {
                "role": "user", 
                "content": "这是什么颜色的图片？"
            }
        ],
        "stream": False
    }
    
    try:
        response = requests.post(
            'http://localhost:11434/api/chat',
            json=data,
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            print("✅ 图文对话测试成功!")
            print(f"AI回复: {result['message']['content']}")
            return True
        else:
            print(f"❌ 图文对话测试失败: {response.text}")
            return False
    except Exception as e:
        print(f"❌ 图文对话测试出错: {e}")
        return False

def test_ollama_vision_api():
    """测试Ollama视觉API"""
    print("🧪 测试Ollama视觉API...")
    
    # 创建测试图片
    image_path = create_test_image()
    img_base64 = image_to_base64(image_path)
    
    # 使用Ollama的视觉API格式
    data = {
        "model": "qwen2.5-vl-7b",
        "prompt": "这是什么颜色的图片？",
        "images": [img_base64],
        "stream": False
    }
    
    try:
        response = requests.post(
            'http://localhost:11434/api/generate',
            json=data,
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            print("✅ 视觉API测试成功!")
            print(f"AI回复: {result['response']}")
            return True
        else:
            print(f"❌ 视觉API测试失败: {response.text}")
            return False
    except Exception as e:
        print(f"❌ 视觉API测试出错: {e}")
        return False

def main():
    """主函数"""
    print("=== Ollama多模态功能测试 ===")
    print()
    
    # 检查Ollama服务
    try:
        response = requests.get('http://localhost:11434/api/tags', timeout=5)
        if response.status_code != 200:
            print("❌ Ollama服务未运行，请先启动服务")
            return
    except:
        print("❌ 无法连接到Ollama服务，请先启动服务")
        return
    
    print("✅ Ollama服务运行正常")
    print()
    
    # 测试纯文本
    test_text_only()
    print()
    
    # 测试图文对话
    test_image_text()
    print()
    
    # 测试视觉API
    test_ollama_vision_api()
    print()
    
    print("🎉 测试完成!")

if __name__ == "__main__":
    main()
