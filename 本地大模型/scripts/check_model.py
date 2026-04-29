#!/usr/bin/env python3
"""
检查模型文件状态
"""

import os
from pathlib import Path

def check_model_status():
    """检查模型文件状态"""
    print("=== 模型文件状态检查 ===")
    
    model_dir = Path(__file__).parent.parent / "models" / "Qwen2.5-VL-7B-Instruct"
    
    if not model_dir.exists():
        print("❌ 模型目录不存在")
        print("请先运行: python3 scripts/download_model.py")
        return False
    
    print(f"📁 模型目录: {model_dir}")
    
    # 检查关键文件
    required_files = [
        "config.json",
        "tokenizer.json", 
        "tokenizer_config.json",
        "model.safetensors.index.json"
    ]
    
    missing_files = []
    total_size = 0
    
    for file in required_files:
        file_path = model_dir / file
        if file_path.exists():
            size = file_path.stat().st_size
            size_mb = size / (1024 * 1024)
            total_size += size
            print(f"✅ {file} ({size_mb:.1f} MB)")
        else:
            missing_files.append(file)
            print(f"❌ {file} (缺失)")
    
    # 检查其他模型文件
    model_files = list(model_dir.glob("*.safetensors"))
    if model_files:
        print(f"📦 模型权重文件: {len(model_files)} 个")
        for f in model_files:
            size_mb = f.stat().st_size / (1024 * 1024)
            print(f"   - {f.name} ({size_mb:.1f} MB)")
    
    total_size_gb = total_size / (1024 * 1024 * 1024)
    print(f"📊 总大小: {total_size_gb:.2f} GB")
    
    if missing_files:
        print(f"\n⚠️  缺少 {len(missing_files)} 个关键文件")
        print("请重新下载模型: python3 scripts/download_model.py")
        return False
    else:
        print("\n🎉 模型文件完整，可以启动服务！")
        return True

if __name__ == "__main__":
    check_model_status()
