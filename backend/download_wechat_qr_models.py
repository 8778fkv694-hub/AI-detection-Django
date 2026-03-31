#!/usr/bin/env python3
"""
微信二维码检测模型下载脚本
从官方仓库下载WeChatQRCode所需的模型文件
"""
import os
import requests
import logging
from pathlib import Path

# 设置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 模型文件配置 - 使用正确的下载地址
MODEL_FILES = {
    'detect.prototxt': 'https://raw.githubusercontent.com/WeChatCV/opencv_3rdparty/wechat_qrcode/detect.prototxt',
    'detect.caffemodel': 'https://raw.githubusercontent.com/WeChatCV/opencv_3rdparty/wechat_qrcode/detect.caffemodel',
    'sr.prototxt': 'https://raw.githubusercontent.com/WeChatCV/opencv_3rdparty/wechat_qrcode/sr.prototxt',
    'sr.caffemodel': 'https://raw.githubusercontent.com/WeChatCV/opencv_3rdparty/wechat_qrcode/sr.caffemodel'
}

def download_file(url: str, filepath: str) -> bool:
    """下载文件"""
    try:
        logger.info(f"正在下载: {url}")
        response = requests.get(url, stream=True)
        response.raise_for_status()
        
        with open(filepath, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        logger.info(f"下载完成: {filepath}")
        return True
        
    except Exception as e:
        logger.error(f"下载失败 {url}: {str(e)}")
        return False

def main():
    """主函数"""
    # 创建模型目录
    model_dir = Path(__file__).parent / 'models' / 'wechat_qr'
    model_dir.mkdir(parents=True, exist_ok=True)
    
    logger.info(f"模型文件将保存到: {model_dir}")
    
    # 下载所有模型文件
    success_count = 0
    total_count = len(MODEL_FILES)
    
    for filename, url in MODEL_FILES.items():
        filepath = model_dir / filename
        
        # 检查文件是否已存在
        if filepath.exists():
            logger.info(f"文件已存在，跳过: {filename}")
            success_count += 1
            continue
        
        # 下载文件
        if download_file(url, str(filepath)):
            success_count += 1
    
    # 输出结果
    logger.info(f"下载完成: {success_count}/{total_count} 个文件")
    
    if success_count == total_count:
        logger.info("✅ 所有微信二维码模型文件下载完成！")
        logger.info("现在可以使用微信二维码检测功能了。")
    else:
        logger.warning(f"⚠️  有 {total_count - success_count} 个文件下载失败")
        logger.info("请检查网络连接或手动下载模型文件")
        logger.info("模型文件下载地址: https://github.com/WeChatCV/opencv_3rdparty")

if __name__ == '__main__':
    main()
