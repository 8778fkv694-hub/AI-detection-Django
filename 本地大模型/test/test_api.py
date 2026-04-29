#!/usr/bin/env python3
"""
测试本地大模型API
"""

import requests
import json
import base64
from pathlib import Path

def test_text_only():
    """测试纯文本对话"""
    print("=== 测试纯文本对话 ===")
    
    url = "http://localhost:8000/v1/chat/completions"
    
    data = {
        "model": "Qwen/Qwen2.5-VL-7B-Instruct",
        "messages": [
            {
                "role": "user",
                "content": "你好，请介绍一下你自己。"
            }
        ],
        "max_tokens": 100
    }
    
    try:
        response = requests.post(url, json=data, timeout=30)
        if response.status_code == 200:
            result = response.json()
            print("✓ 文本对话测试成功")
            print(f"回复: {result['choices'][0]['message']['content']}")
            return True
        else:
            print(f"✗ 文本对话测试失败: {response.status_code}")
            print(response.text)
            return False
    except Exception as e:
        print(f"✗ 文本对话测试出错: {e}")
        return False

def test_image_analysis():
    """测试图像分析"""
    print("\n=== 测试图像分析 ===")
    
    url = "http://localhost:8000/v1/chat/completions"
    
    # 使用在线图片URL
    image_url = "https://cdn.britannica.com/61/93061-050-99147DCE/Statue-of-Liberty-Island-New-York-Bay.jpg"
    
    data = {
        "model": "Qwen/Qwen2.5-VL-7B-Instruct",
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "请用一句话描述这张图片。"
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": image_url
                        }
                    }
                ]
            }
        ],
        "max_tokens": 100
    }
    
    try:
        response = requests.post(url, json=data, timeout=60)
        if response.status_code == 200:
            result = response.json()
            print("✓ 图像分析测试成功")
            print(f"分析结果: {result['choices'][0]['message']['content']}")
            return True
        else:
            print(f"✗ 图像分析测试失败: {response.status_code}")
            print(response.text)
            return False
    except Exception as e:
        print(f"✗ 图像分析测试出错: {e}")
        return False

def test_models_list():
    """测试获取模型列表"""
    print("\n=== 测试模型列表 ===")
    
    url = "http://localhost:8000/v1/models"
    
    try:
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            result = response.json()
            print("✓ 模型列表获取成功")
            print(f"可用模型: {[model['id'] for model in result['data']]}")
            return True
        else:
            print(f"✗ 模型列表获取失败: {response.status_code}")
            return False
    except Exception as e:
        print(f"✗ 模型列表获取出错: {e}")
        return False

def main():
    """主测试函数"""
    print("=== 本地大模型API测试 ===")
    
    # 测试模型列表
    if not test_models_list():
        print("请确保模型服务正在运行 (python scripts/start_model.py)")
        return
    
    # 测试文本对话
    test_text_only()
    
    # 测试图像分析
    test_image_analysis()
    
    print("\n=== 测试完成 ===")

if __name__ == "__main__":
    main()
