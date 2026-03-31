#!/usr/bin/env python3
"""
最终EasyOCR功能确认测试
"""
import os
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import logging

# 设置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def create_test_image():
    """创建一个包含中英文文字的测试图片"""
    # 创建一个白色背景的图片
    img = Image.new('RGB', (600, 300), color='white')
    draw = ImageDraw.Draw(img)
    
    # 尝试使用系统字体
    try:
        font_large = ImageFont.truetype("/System/Library/Fonts/PingFang.ttc", 32)
        font_small = ImageFont.truetype("/System/Library/Fonts/PingFang.ttc", 20)
    except:
        try:
            font_large = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 32)
            font_small = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 20)
        except:
            font_large = ImageFont.load_default()
            font_small = ImageFont.load_default()
    
    # 绘制测试文字
    texts = [
        ("EasyOCR测试", (50, 50), font_large),
        ("EasyOCR Test", (50, 100), font_large),
        ("中文识别", (50, 150), font_small),
        ("English Recognition", (50, 180), font_small),
        ("123456", (50, 220), font_small),
        ("AI检测系统", (300, 50), font_large),
        ("AI Detection System", (300, 100), font_large),
    ]
    
    for text, position, font in texts:
        draw.text(position, text, fill='black', font=font)
    
    # 保存测试图片
    test_image_path = "final_test_image.png"
    img.save(test_image_path)
    print(f"✅ 测试图片已创建: {test_image_path}")
    return test_image_path

def test_easyocr_final():
    """最终EasyOCR功能测试"""
    print("🚀 开始最终EasyOCR功能确认测试...")
    
    try:
        import easyocr
        print("✅ EasyOCR导入成功！")
        
        # 设置模型路径
        model_dir = os.path.join(os.path.dirname(__file__), 'models', 'easyocr')
        print(f"📁 模型目录: {model_dir}")
        
        # 检查模型文件是否存在
        if os.path.exists(model_dir):
            model_files = os.listdir(model_dir)
            print(f"📄 模型文件: {model_files}")
            total_size = sum(os.path.getsize(os.path.join(model_dir, f)) for f in model_files if os.path.isfile(os.path.join(model_dir, f)))
            print(f"📊 模型总大小: {total_size / (1024*1024):.1f} MB")
        else:
            print("❌ 模型目录不存在")
            return False
        
        # 初始化EasyOCR
        print("🔄 正在初始化EasyOCR...")
        reader = easyocr.Reader(['ch_sim', 'en'], gpu=False, model_storage_directory=model_dir)
        print("✅ EasyOCR初始化成功！")
        
        # 创建测试图片
        test_image_path = create_test_image()
        
        # 进行OCR识别
        print("🔍 正在进行OCR识别...")
        results = reader.readtext(test_image_path)
        
        print("\n📋 EasyOCR识别结果:")
        print("=" * 60)
        
        if results:
            total_confidence = 0
            for i, (bbox, text, confidence) in enumerate(results, 1):
                total_confidence += confidence
                print(f"{i}. 文字: '{text}'")
                print(f"   置信度: {confidence:.3f}")
                print(f"   位置: {bbox}")
                print()
            
            avg_confidence = total_confidence / len(results)
            print(f"📊 平均置信度: {avg_confidence:.3f}")
            print(f"📊 识别文字数量: {len(results)}")
        else:
            print("❌ 未识别到任何文字")
            return False
        
        print("=" * 60)
        print("✅ EasyOCR功能测试完成！")
        
        # 清理测试文件
        if os.path.exists(test_image_path):
            os.remove(test_image_path)
            print(f"🗑️  已清理测试文件: {test_image_path}")
        
        return True
        
    except ImportError:
        print("❌ EasyOCR未安装")
        return False
    except Exception as e:
        print(f"❌ EasyOCR测试失败: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def test_ocr_service():
    """测试OCR服务类"""
    print("\n🔄 测试OCR服务类...")
    
    try:
        # 导入OCR服务
        from inspection.ocr_service import ocr_service
        print("✅ OCR服务导入成功！")
        
        # 检查服务可用性
        if ocr_service.is_available():
            print("✅ OCR服务可用！")
            return True
        else:
            print("❌ OCR服务不可用")
            return False
            
    except Exception as e:
        print(f"❌ OCR服务测试失败: {str(e)}")
        return False

def main():
    """主函数"""
    print("=" * 60)
    print("EasyOCR最终功能确认测试")
    print("=" * 60)
    
    # 检查Python环境
    print(f"Python版本: {sys.version}")
    print(f"工作目录: {os.getcwd()}")
    print()
    
    # 测试EasyOCR
    easyocr_success = test_easyocr_final()
    
    # 测试OCR服务
    service_success = test_ocr_service()
    
    print("\n" + "=" * 60)
    print("📊 测试结果总结:")
    print(f"  EasyOCR功能: {'✅ 正常' if easyocr_success else '❌ 异常'}")
    print(f"  OCR服务: {'✅ 正常' if service_success else '❌ 异常'}")
    
    if easyocr_success and service_success:
        print("\n🎉 EasyOCR功能完全正常！可以正常使用OCR功能。")
    else:
        print("\n⚠️  EasyOCR存在问题，请检查配置。")
    print("=" * 60)

if __name__ == '__main__':
    main()
