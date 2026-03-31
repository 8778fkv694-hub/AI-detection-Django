#!/usr/bin/env python3
"""
简单EasyOCR测试
"""
import os
import sys

def test_easyocr_import():
    """测试EasyOCR导入"""
    print("🔍 测试EasyOCR导入...")
    
    try:
        # 先测试基础依赖
        import numpy as np
        print(f"✅ NumPy版本: {np.__version__}")
        
        import cv2
        print(f"✅ OpenCV版本: {cv2.__version__}")
        
        import PIL
        print(f"✅ PIL版本: {PIL.__version__}")
        
        # 测试EasyOCR导入
        import easyocr
        print(f"✅ EasyOCR版本: {easyocr.__version__}")
        
        return True
        
    except Exception as e:
        print(f"❌ 导入失败: {str(e)}")
        return False

def test_easyocr_basic():
    """测试EasyOCR基本功能"""
    print("\n🔍 测试EasyOCR基本功能...")
    
    try:
        import easyocr
        
        # 创建简单的测试图片
        from PIL import Image, ImageDraw, ImageFont
        import numpy as np
        
        # 创建白色背景图片
        img = Image.new('RGB', (200, 50), color='white')
        draw = ImageDraw.Draw(img)
        
        # 添加文字
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 20)
        except:
            font = ImageFont.load_default()
        
        draw.text((10, 15), "Hello", fill='black', font=font)
        
        # 转换为numpy数组
        img_array = np.array(img)
        
        # 初始化EasyOCR（只使用英文）
        print("🚀 初始化EasyOCR...")
        reader = easyocr.Reader(['en'], gpu=False)
        print("✅ EasyOCR初始化成功")
        
        # 执行OCR识别
        print("🔍 执行OCR识别...")
        results = reader.readtext(img_array)
        
        print("✅ OCR识别完成！")
        print(f"识别结果数量: {len(results)}")
        
        for i, (bbox, text, confidence) in enumerate(results):
            print(f"  {i+1}. 文字: '{text}', 置信度: {confidence:.2f}")
        
        return True
        
    except Exception as e:
        print(f"❌ 测试失败: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    print("🚀 开始简单EasyOCR测试...")
    
    if test_easyocr_import():
        test_easyocr_basic()
    
    print("\n✨ 测试完成！")
