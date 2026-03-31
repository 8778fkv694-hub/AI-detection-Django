#!/usr/bin/env python3
"""
测试Ollama API端点
"""

import requests
import json

def test_ollama_api():
    base_url = "http://localhost:8000"
    
    print("=== 测试Ollama API端点 ===")
    
    # 测试状态检查
    print("\n1. 测试状态检查...")
    try:
        response = requests.get(f"{base_url}/api/ollama/status/", timeout=10)
        print(f"状态码: {response.status_code}")
        if response.ok:
            data = response.json()
            print(f"响应: {json.dumps(data, indent=2, ensure_ascii=False)}")
        else:
            print(f"错误: {response.text}")
    except Exception as e:
        print(f"请求失败: {e}")
    
    # 测试启动服务
    print("\n2. 测试启动服务...")
    try:
        response = requests.post(f"{base_url}/api/ollama/start/", 
                               headers={'Content-Type': 'application/json'},
                               timeout=30)
        print(f"状态码: {response.status_code}")
        if response.ok:
            data = response.json()
            print(f"响应: {json.dumps(data, indent=2, ensure_ascii=False)}")
        else:
            print(f"错误: {response.text}")
    except Exception as e:
        print(f"请求失败: {e}")
    
    # 再次测试状态检查
    print("\n3. 再次测试状态检查...")
    try:
        response = requests.get(f"{base_url}/api/ollama/status/", timeout=10)
        print(f"状态码: {response.status_code}")
        if response.ok:
            data = response.json()
            print(f"响应: {json.dumps(data, indent=2, ensure_ascii=False)}")
        else:
            print(f"错误: {response.text}")
    except Exception as e:
        print(f"请求失败: {e}")

if __name__ == "__main__":
    test_ollama_api()
