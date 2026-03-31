#!/usr/bin/env python3
"""
调试Tesseract识别问题
"""
import requests
import base64
from PIL import Image, ImageDraw, ImageFont
import io

def create_test_images():
    """创建多种测试图片"""
    images = {}
    
    # 1. 简单英文文字
    img1 = Image.new('RGB', (400, 100), color='white')
    draw1 = ImageDraw.Draw(img1)
    try:
        font = ImageFont.truetype('/System/Library/Fonts/Arial.ttf', 24)
    except:
        font = ImageFont.load_default()
    draw1.text((20, 30), 'Hello World', fill='black', font=font)
    images['simple_english'] = img1
    
    # 2. 中文文字
    img2 = Image.new('RGB', (400, 100), color='white')
    draw2 = ImageDraw.Draw(img2)
    try:
        font = ImageFont.truetype('/System/Library/Fonts/Arial.ttf', 24)
    except:
        font = ImageFont.load_default()
    draw2.text((20, 30), 'Test Chinese', fill='black', font=font)
    images['chinese'] = img2
    
    # 3. 中英文混合
    img3 = Image.new('RGB', (400, 100), color='white')
    draw3 = ImageDraw.Draw(img3)
    try:
        font = ImageFont.truetype('/System/Library/Fonts/Arial.ttf', 24)
    except:
        font = ImageFont.load_default()
    draw3.text((20, 30), 'Hello Test', fill='black', font=font)
    images['mixed'] = img3
    
    # 4. 数字
    img4 = Image.new('RGB', (400, 100), color='white')
    draw4 = ImageDraw.Draw(img4)
    try:
        font = ImageFont.truetype('/System/Library/Fonts/Arial.ttf', 24)
    except:
        font = ImageFont.load_default()
    draw4.text((20, 30), '123456789', fill='black', font=font)
    images['numbers'] = img4
    
    # 5. 小字体
    img5 = Image.new('RGB', (400, 100), color='white')
    draw5 = ImageDraw.Draw(img5)
    try:
        font = ImageFont.truetype('/System/Library/Fonts/Arial.ttf', 12)
    except:
        font = ImageFont.load_default()
    draw5.text((20, 30), 'Small Text', fill='black', font=font)
    images['small_font'] = img5
    
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
                    print(f"   详细结果:")
                    for i, item in enumerate(result['detailed_results']):
                        print(f"     {i+1}. '{item['text']}' (置信度: {item['confidence']:.2f})")
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
    print("🚀 开始Tesseract调试测试...")
    
    # 创建测试图片
    images = create_test_images()
    
    # 测试每种图片
    for image_name, image in images.items():
        print(f"\n📸 测试图片: {image_name}")
        print("=" * 50)
        
        # 测试EasyOCR
        test_ocr_api(image, image_name, 'easyocr')
        print()
        
        # 测试Tesseract
        test_ocr_api(image, image_name, 'tesseract')
        print()
    
    # 保存测试图片供检查
    print("💾 保存测试图片...")
    for name, img in images.items():
        img.save(f'test_{name}.png')
        print(f"   保存: test_{name}.png")

if __name__ == '__main__':
    main()
