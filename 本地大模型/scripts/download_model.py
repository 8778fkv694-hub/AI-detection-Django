#!/usr/bin/env python3
"""
下载Qwen2.5-VL-7B-Instruct模型文件
使用ModelScope作为下载源头
"""

import os
import sys
from pathlib import Path
from modelscope import snapshot_download
import requests

def check_disk_space():
    """检查磁盘空间"""
    import shutil
    
    # 检查可用空间（需要约15GB）
    total, used, free = shutil.disk_usage("/")
    free_gb = free // (1024**3)
    
    print(f"可用磁盘空间: {free_gb} GB")
    
    if free_gb < 15:
        print("⚠️  警告: 可用磁盘空间不足15GB，模型下载可能失败")
        return False
    else:
        print("✓ 磁盘空间充足")
        return True

def download_model():
    """下载模型文件"""
    print("=== 开始下载 Qwen2.5-VL-7B-Instruct 模型 ===")
    print("使用ModelScope作为下载源头")
    print("模型大小约14GB，下载可能需要较长时间...")
    
    # 设置模型缓存目录
    cache_dir = Path(__file__).parent.parent / "models"
    cache_dir.mkdir(exist_ok=True)
    
    try:
        print("正在从ModelScope下载模型文件...")
        model_path = snapshot_download(
            model_id="Qwen/Qwen2.5-VL-7B-Instruct",
            cache_dir=str(cache_dir),
            local_dir=str(cache_dir / "Qwen2.5-VL-7B-Instruct")
        )
        
        print(f"✓ 模型下载完成！")
        print(f"模型路径: {model_path}")
        return True
        
    except Exception as e:
        print(f"✗ 模型下载失败: {e}")
        print("请确保已安装ModelScope: pip install modelscope")
        return False

def verify_model():
    """验证模型文件"""
    print("验证模型文件...")
    
    model_dir = Path(__file__).parent.parent / "models" / "Qwen2.5-VL-7B-Instruct"
    
    if not model_dir.exists():
        print("✗ 模型目录不存在")
        return False
    
    # 检查关键文件
    required_files = [
        "config.json",
        "tokenizer.json",
        "tokenizer_config.json"
    ]
    
    for file in required_files:
        if not (model_dir / file).exists():
            print(f"✗ 缺少文件: {file}")
            return False
    
    print("✓ 模型文件验证通过")
    return True

def main():
    """主函数"""
    print("=== Qwen2.5-VL-7B-Instruct 模型下载器 ===")
    
    # 检查磁盘空间
    if not check_disk_space():
        response = input("是否继续下载？(y/N): ")
        if response.lower() != 'y':
            print("下载已取消")
            return
    
    # 下载模型
    if download_model():
        if verify_model():
            print("\n🎉 模型下载完成！现在可以启动服务了")
            print("运行: ./scripts/quick_start.sh")
        else:
            print("\n❌ 模型文件验证失败")
    else:
        print("\n❌ 模型下载失败")

if __name__ == "__main__":
    main()
