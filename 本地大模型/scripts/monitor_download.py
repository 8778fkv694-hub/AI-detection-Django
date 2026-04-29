#!/usr/bin/env python3
"""
监控模型下载进度
"""

import os
import time
from pathlib import Path

def get_dir_size(path):
    """获取目录大小（MB）"""
    total_size = 0
    for dirpath, dirnames, filenames in os.walk(path):
        for filename in filenames:
            filepath = os.path.join(dirpath, filename)
            if os.path.exists(filepath):
                total_size += os.path.getsize(filepath)
    return total_size / (1024 * 1024)  # 转换为MB

def monitor_download():
    """监控下载进度"""
    model_dir = Path(__file__).parent.parent / "models" / "Qwen2.5-VL-7B-Instruct"
    expected_size_gb = 14  # 预期大小约14GB
    
    print("=== 模型下载进度监控 ===")
    print(f"监控目录: {model_dir}")
    print(f"预期大小: {expected_size_gb} GB")
    print("按 Ctrl+C 停止监控")
    print()
    
    try:
        while True:
            if model_dir.exists():
                current_size_mb = get_dir_size(model_dir)
                current_size_gb = current_size_mb / 1024
                progress = (current_size_gb / expected_size_gb) * 100
                
                print(f"\r当前大小: {current_size_gb:.2f} GB / {expected_size_gb} GB ({progress:.1f}%)", end="", flush=True)
                
                # 检查是否下载完成
                if current_size_gb >= expected_size_gb * 0.95:  # 95%认为完成
                    print(f"\n✓ 模型下载基本完成！当前大小: {current_size_gb:.2f} GB")
                    break
            else:
                print("模型目录不存在，等待下载开始...")
            
            time.sleep(5)  # 每5秒检查一次
            
    except KeyboardInterrupt:
        print(f"\n监控已停止。当前大小: {get_dir_size(model_dir) / 1024:.2f} GB")

if __name__ == "__main__":
    monitor_download()
