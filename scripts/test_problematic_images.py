#!/usr/bin/env python3
"""
测试可能导致Tesseract识别为0的图片
"""
import requests
import base64
from PIL import Image, ImageDraw, ImageFont
import io

def create_problematic_images():
    """创建可能导致识别问题的图片"""
    images = {}
    
    # 1. 空白图片
    img1 = Image.new('RGB', (400, 100), color='white')
    images['blank'] = img1
    
    # 2. 纯色图片
    img2 = Image.new('RGB', (400, 100), color='black')
    images['black'] = img2
    
    # 3. 模糊文字
    img3 = Image.new('RGB', (400, 100), color='white')
    draw3 = ImageDraw.Draw(img3)
    try:
        font = ImageFont.truetype('/System/Library/Fonts/Arial.ttf', 8)  # 很小的字体
    except:
        font = ImageFont.load_default()
    draw3.text((20, 30), 'Blurry Text', fill='gray', font=font)
    images['blurry'] = img3
    
    # 4. 低对比度
    img4 = Image.new('RGB', (400, 100), color='lightgray')
    draw4 = ImageDraw.Draw(img4)
    try:
        font = ImageFont.truetype('/System/Library/Fonts/Arial.ttf', 24)
    except:
        font = ImageFont.load_default()
    draw4.text((20, 30), 'Low Contrast', fill='gray', font=font)
    images['low_contrast'] = img4
    
    # 5. 复杂背景
    img5 = Image.new('RGB', (400, 100), color='white')
    draw5 = ImageDraw.Draw(img5)
    # 添加背景噪音
    for i in range(0, 400, 10):
        for j in range(0, 100, 10):
            draw5.rectangle([i, j, i+5, j+5], fill='lightgray')
    try:
        font = ImageFont.truetype('/System/Library/Fonts/Arial.ttf', 24)
    except:
        font = ImageFont.load_default()
    draw5.text((20, 30), 'Noisy Background', fill='black', font=font)
    images['noisy'] = img5
    
    # 6. 旋转文字
    img6 = Image.new('RGB', (400, 100), color='white')
    draw6 = ImageDraw.Draw(img6)
    try:
        font = ImageFont.truetype('/System/Library/Fonts/Arial.ttf', 24)
    except:
        font = ImageFont.load_default()
    draw6.text((20, 30), 'Rotated Text', fill='black', font=font)
    # 旋转图片
    img6 = img6.rotate(15, expand=True)
    images['rotated'] = img6
    
    # 7. 单像素图片
    img7 = Image.new('RGB', (1, 1), color='white')
    images['single_pixel'] = img7
    
    return images

def image_to_base64(image):
    """将PIL图片转换为base64"""
    img_bytes = io.BytesIO()
    image.save(img_bytes, format='PNG')
    return base64.b64encode(img_bytes.getvalue()).decode('utf-8')

def test_ocr_api(image, image_name, model):
    """测试OCR API"""
    try:
        base64_data = image_to_base64(image)
        
        url = 'http://localhost:8000/api/ocr/extract/'
        data = {
            'image': base64_data,
            'model': model
        }
        
        print(f"🔍 测试 {image_name} 使用 {model}...")
        response = requests.post(url, json=data)
        
        if response.status_code == 200:
            result = response.json()
            if result['success']:
                print(f"✅ 识别成功!")
                print(f"   识别文字: '{result['full_text']}'")
                print(f"   文字数量: {result['text_count']}")
                print(f"   使用模型: {result.get('model_used', model)}")
                if result['detailed_results']:
                    print(f"   详细结果: {len(result['detailed_results'])} 项")
                else:
                    print(f"   ⚠️ 详细结果为空!")
            else:
                print(f"❌ 识别失败: {result['error']}")
        else:
            print(f"❌ API请求失败: {response.status_code}")
            print(f"   响应: {response.text}")
            
    except Exception as e:
        print(f"❌ 测试失败: {str(e)}")

def main():
    print("🚀 开始问题图片测试...")
    
    # 创建问题图片
    images = create_problematic_images()
    
    # 测试每种图片
    for image_name, image in images.items():
        print(f"\n📸 测试图片: {image_name}")
        print("=" * 50)
        
        # 测试Tesseract
        test_ocr_api(image, image_name, 'tesseract')
        print()
    
    # 保存测试图片供检查
    print("💾 保存测试图片...")
    for name, img in images.items():
        img.save(f'problematic_{name}.png')
        print(f"   保存: problematic_{name}.png")

if __name__ == '__main__':
    main()
