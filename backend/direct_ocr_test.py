#!/usr/bin/env python3
"""
直接测试OCR服务
不通过Django，直接测试EasyOCR功能
"""
import os
import sys
import base64
import io
from PIL import Image, ImageDraw, ImageFont

def test_easyocr_direct():
    """直接测试EasyOCR"""
    print("🔍 直接测试EasyOCR...")
    
    try:
        import easyocr
        print("✅ EasyOCR导入成功")
        
        # 创建测试图片
        print("\n📷 创建测试图片...")
        img = Image.new('RGB', (300, 100), color='white')
        draw = ImageDraw.Draw(img)
        
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 24)
        except:
            font = ImageFont.load_default()
        
        draw.text((20, 30), "Hello OCR Test", fill='black', font=font)
        img.save('test_ocr_direct.png')
        print("✅ 测试图片已保存为 test_ocr_direct.png")
        
        # 初始化EasyOCR
        print("\n🚀 初始化EasyOCR...")
        reader = easyocr.Reader(['en'], gpu=False)
        print("✅ EasyOCR初始化成功")
        
        # 执行OCR识别
        print("\n🔍 执行OCR识别...")
        results = reader.readtext(img)
        
        print("✅ OCR识别完成！")
        print(f"识别结果数量: {len(results)}")
        
        for i, (bbox, text, confidence) in enumerate(results):
            print(f"  {i+1}. 文字: '{text}', 置信度: {confidence:.2f}")
        
        return True
        
    except Exception as e:
        print(f"❌ 测试失败: {str(e)}")
        return False

if __name__ == '__main__':
    print("🚀 开始直接OCR测试...")
    test_easyocr_direct()
    print("\n✨ 测试完成！")
