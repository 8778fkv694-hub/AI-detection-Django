#!/usr/bin/env python3
"""
启动Qwen2.5-VL-7B-Instruct模型服务
"""

import subprocess
import sys
import os
import time
import requests
from pathlib import Path

def check_dependencies():
    """检查必要的依赖是否已安装"""
    try:
        import vllm
        print("✓ vLLM 已安装")
        return True
    except ImportError:
        print("✗ vLLM 未安装，请运行: pip install vllm")
        return False

def start_model_server():
    """启动模型服务器"""
    print("正在启动 Qwen2.5-VL-7B-Instruct 模型服务...")
    print("服务将在 http://localhost:8000 上运行")
    print("按 Ctrl+C 停止服务")
    
    try:
        # 启动vLLM服务
        cmd = [
            "vllm", "serve", 
            "Qwen/Qwen2.5-VL-7B-Instruct",
            "--host", "0.0.0.0",
            "--port", "8000",
            "--trust-remote-code"
        ]
        
        subprocess.run(cmd, check=True)
        
    except KeyboardInterrupt:
        print("\n正在停止服务...")
    except subprocess.CalledProcessError as e:
        print(f"启动失败: {e}")
        return False
    except Exception as e:
        print(f"发生错误: {e}")
        return False
    
    return True

def test_connection():
    """测试服务连接"""
    print("测试服务连接...")
    try:
        response = requests.get("http://localhost:8000/v1/models", timeout=10)
        if response.status_code == 200:
            print("✓ 服务连接成功")
            return True
        else:
            print(f"✗ 服务连接失败: {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"✗ 无法连接到服务: {e}")
        return False

if __name__ == "__main__":
    print("=== 本地大模型服务启动器 ===")
    
    # 检查依赖
    if not check_dependencies():
        sys.exit(1)
    
    # 启动服务
    start_model_server()
