#!/usr/bin/env python3
"""
安装项目依赖
"""

import subprocess
import sys
import os
from pathlib import Path

def install_requirements():
    """安装requirements.txt中的依赖"""
    print("正在安装项目依赖...")
    
    requirements_file = Path(__file__).parent.parent / "requirements.txt"
    
    if not requirements_file.exists():
        print("✗ requirements.txt 文件不存在")
        return False
    
    try:
        subprocess.run([
            sys.executable, "-m", "pip", "install", "-r", str(requirements_file)
        ], check=True)
        print("✓ 依赖安装完成")
        return True
    except subprocess.CalledProcessError as e:
        print(f"✗ 依赖安装失败: {e}")
        return False

def check_installation():
    """检查安装是否成功"""
    print("检查安装状态...")
    
    packages = ["vllm", "torch", "transformers", "requests"]
    
    for package in packages:
        try:
            __import__(package)
            print(f"✓ {package} 已安装")
        except ImportError:
            print(f"✗ {package} 未安装")
            return False
    
    return True

if __name__ == "__main__":
    print("=== 依赖安装脚本 ===")
    
    if install_requirements():
        if check_installation():
            print("\n✓ 所有依赖安装成功！")
            print("现在可以运行: python scripts/start_model.py")
        else:
            print("\n✗ 部分依赖安装失败，请检查错误信息")
    else:
        print("\n✗ 依赖安装失败")
