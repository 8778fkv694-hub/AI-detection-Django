#!/usr/bin/env python3
"""
下载EasyOCR模型文件
使用国内镜像源加速下载
"""
import os
import sys
import requests
from pathlib import Path

def download_file(url, filepath):
    """下载文件"""
    try:
        print(f"正在下载: {url}")
        response = requests.get(url, stream=True)
        response.raise_for_status()
        
        with open(filepath, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        print(f"✅ 下载完成: {filepath}")
        return True
    except Exception as e:
        print(f"❌ 下载失败: {e}")
        return False

def download_easyocr_models():
    """下载EasyOCR模型文件"""
    # 创建模型目录
    model_dir = Path(__file__).parent / 'models' / 'easyocr'
    model_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"模型保存目录: {model_dir}")
    
    # EasyOCR模型文件URL（使用GitHub镜像）
    models = {
        'craft_mlt_25k.pth': 'https://github.com/JaidedAI/EasyOCR/releases/download/v1.7.2/craft_mlt_25k.zip',
        'latin_g2.pth': 'https://github.com/JaidedAI/EasyOCR/releases/download/v1.7.2/latin_g2.zip',
        'chinese_g2.pth': 'https://github.com/JaidedAI/EasyOCR/releases/download/v1.7.2/chinese_g2.zip'
    }
    
    # 如果使用国内镜像，可以尝试这些URL
    china_mirrors = {
        'craft_mlt_25k.pth': 'https://gitee.com/mirrors/EasyOCR/releases/download/v1.7.2/craft_mlt_25k.zip',
        'latin_g2.pth': 'https://gitee.com/mirrors/EasyOCR/releases/download/v1.7.2/latin_g2.zip', 
        'chinese_g2.pth': 'https://gitee.com/mirrors/EasyOCR/releases/download/v1.7.2/chinese_g2.zip'
    }
    
    print("🚀 开始下载EasyOCR模型文件...")
    
    # 尝试使用国内镜像
    for model_name, url in china_mirrors.items():
        filepath = model_dir / model_name
        if not filepath.exists():
            if download_file(url, filepath):
                print(f"✅ {model_name} 下载成功")
            else:
                print(f"❌ {model_name} 下载失败，尝试备用源...")
                # 如果国内镜像失败，尝试原始源
                original_url = models[model_name]
                if download_file(original_url, filepath):
                    print(f"✅ {model_name} 从备用源下载成功")
                else:
                    print(f"❌ {model_name} 下载完全失败")
        else:
            print(f"✅ {model_name} 已存在，跳过下载")
    
    print("\n🎉 模型下载完成！")

if __name__ == '__main__':
    download_easyocr_models()
