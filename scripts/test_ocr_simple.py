#!/usr/bin/env python3
"""
简单的OCR测试脚本
"""
import os
import sys
import base64
import requests
from PIL import Image, ImageDraw, ImageFont

def create_test_image():
    """创建测试图片"""
    # 创建一个白色背景的图片
    img = Image.new('RGB', (400, 200), color='white')
    draw = ImageDraw.Draw(img)
    
    try:
        # 尝试使用系统字体
        font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 24)
    except:
        font = ImageFont.load_default()
    
    # 绘制文字
    draw.text((20, 50), "Hello World", fill='black', font=font)
    draw.text((20, 100), "OCR Test 123", fill='black', font=font)
    draw.text((20, 150), "测试中文", fill='black', font=font)
    
    # 保存图片
    img.save('test_image.png')
    print("✅ 测试图片已创建: test_image.png")
    return img

def test_ocr_api(image_path, model='easyocr'):
    """测试OCR API"""
    try:
        # 读取图片并转换为base64
        with open(image_path, 'rb') as f:
            image_data = f.read()
            base64_data = base64.b64encode(image_data).decode('utf-8')
        
        # 调用OCR API
        url = 'http://localhost:8000/api/ocr/extract/'
        data = {
            'image': base64_data,
            'model': model
        }
        
        print(f"🔍 使用 {model} 模型测试OCR...")
        response = requests.post(url, json=data)
        
        if response.status_code == 200:
            result = response.json()
            if result['success']:
                print(f"✅ {model} 识别成功!")
                print(f"   识别文字: {result['full_text']}")
                print(f"   文字数量: {result['text_count']}")
                print(f"   使用模型: {result.get('model_used', model)}")
            else:
                print(f"❌ {model} 识别失败: {result['error']}")
        else:
            print(f"❌ API请求失败: {response.status_code}")
            print(f"   响应: {response.text}")
            
    except Exception as e:
        print(f"❌ 测试失败: {str(e)}")

def main():
    print("🚀 开始OCR功能测试...")
    
    # 创建测试图片
    create_test_image()
    
    # 测试EasyOCR
    test_ocr_api('test_image.png', 'easyocr')
    print()
    
    # 测试Tesseract
    test_ocr_api('test_image.png', 'tesseract')
    print()
    
    # 检查OCR服务状态
    try:
        response = requests.get('http://localhost:8000/api/ocr/status/')
        if response.status_code == 200:
            status = response.json()
            print("📊 OCR服务状态:")
            print(f"   可用: {status['available']}")
            print(f"   支持模型: {status['available_models']}")
            print(f"   当前模型: {status['current_model']}")
        else:
            print("❌ 无法获取OCR服务状态")
    except Exception as e:
        print(f"❌ 检查服务状态失败: {str(e)}")

if __name__ == '__main__':
    main()
