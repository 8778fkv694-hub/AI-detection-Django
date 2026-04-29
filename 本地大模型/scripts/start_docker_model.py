#!/usr/bin/env python3
"""
使用Docker启动Qwen2.5-VL-7B-Instruct模型服务
"""

import subprocess
import sys
import os
import time
import requests
from pathlib import Path

def check_docker():
    """检查Docker是否可用"""
    try:
        result = subprocess.run(["docker", "--version"], capture_output=True, text=True)
        if result.returncode == 0:
            print("✓ Docker 已安装")
            return True
        else:
            print("✗ Docker 未安装或不可用")
            return False
    except FileNotFoundError:
        print("✗ Docker 未安装，请先安装Docker Desktop")
        return False

def check_docker_compose():
    """检查Docker Compose是否可用"""
    try:
        result = subprocess.run(["docker-compose", "--version"], capture_output=True, text=True)
        if result.returncode == 0:
            print("✓ Docker Compose 已安装")
            return True
        else:
            print("✗ Docker Compose 未安装")
            return False
    except FileNotFoundError:
        print("✗ Docker Compose 未安装")
        return False

def start_docker_service():
    """启动Docker服务"""
    print("正在启动 Docker 模型服务...")
    print("服务将在 http://localhost:8000 上运行")
    print("按 Ctrl+C 停止服务")
    
    try:
        # 启动Docker Compose服务
        cmd = ["docker-compose", "up", "--build"]
        subprocess.run(cmd, check=True)
        
    except KeyboardInterrupt:
        print("\n正在停止服务...")
        # 停止Docker服务
        subprocess.run(["docker-compose", "down"])
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
    max_retries = 30
    retry_count = 0
    
    while retry_count < max_retries:
        try:
            response = requests.get("http://localhost:8000/v1/models", timeout=5)
            if response.status_code == 200:
                print("✓ 服务连接成功")
                return True
            else:
                print(f"等待服务启动... ({retry_count + 1}/{max_retries})")
                time.sleep(10)
                retry_count += 1
        except requests.exceptions.RequestException:
            print(f"等待服务启动... ({retry_count + 1}/{max_retries})")
            time.sleep(10)
            retry_count += 1
    
    print("✗ 服务启动超时")
    return False

if __name__ == "__main__":
    print("=== Docker本地大模型服务启动器 ===")
    
    # 检查Docker
    if not check_docker():
        print("请先安装Docker Desktop: https://www.docker.com/products/docker-desktop")
        sys.exit(1)
    
    # 检查Docker Compose
    if not check_docker_compose():
        print("请先安装Docker Compose")
        sys.exit(1)
    
    # 启动服务
    start_docker_service()
