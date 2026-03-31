#!/usr/bin/env python3
"""
测试EasyOCR中文识别功能
"""
import os
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import logging

# 设置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def create_chinese_test_image():
    """创建一个专门测试中文识别的图片"""
    # 创建一个白色背景的图片
    img = Image.new('RGB', (800, 600), color='white')
    draw = ImageDraw.Draw(img)
    
    # 尝试使用中文字体
    try:
        font_large = ImageFont.truetype("/System/Library/Fonts/PingFang.ttc", 48)
        font_medium = ImageFont.truetype("/System/Library/Fonts/PingFang.ttc", 36)
        font_small = ImageFont.truetype("/System/Library/Fonts/PingFang.ttc", 24)
    except:
        try:
            font_large = ImageFont.truetype("/System/Library/Fonts/STHeiti Light.ttc", 48)
            font_medium = ImageFont.truetype("/System/Library/Fonts/STHeiti Light.ttc", 36)
            font_small = ImageFont.truetype("/System/Library/Fonts/STHeiti Light.ttc", 24)
        except:
            font_large = ImageFont.load_default()
            font_medium = ImageFont.load_default()
            font_small = ImageFont.load_default()
    
    # 绘制中文测试文字
    chinese_texts = [
        # 大字体
        ("人工智能检测系统", (50, 50), font_large),
        ("AI检测项目", (50, 120), font_large),
        ("文字识别测试", (50, 190), font_large),
        
        # 中等字体
        ("中文识别功能验证", (50, 260), font_medium),
        ("图像处理与分析", (50, 310), font_medium),
        ("深度学习模型", (50, 360), font_medium),
        
        # 小字体
        ("测试数据", (50, 420), font_small),
        ("识别准确率", (50, 450), font_small),
        ("性能评估", (50, 480), font_small),
        
        # 右侧文字
        ("安全防护", (400, 50), font_large),
        ("质量检测", (400, 120), font_large),
        ("智能分析", (400, 190), font_large),
        
        # 数字和符号
        ("2024年", (400, 260), font_medium),
        ("版本1.0", (400, 310), font_medium),
        ("测试版", (400, 360), font_medium),
        
        # 混合内容
        ("AI检测系统v1.0", (400, 420), font_small),
        ("中文+English", (400, 450), font_small),
        ("123456789", (400, 480), font_small),
        
        # 底部长文本
        ("这是一个专门用于测试中文文字识别功能的测试图片", (50, 520), font_small),
    ]
    
    for text, position, font in chinese_texts:
        draw.text(position, text, fill='black', font=font)
    
    # 保存测试图片
    test_image_path = "chinese_test_image.png"
    img.save(test_image_path)
    print(f"✅ 中文测试图片已创建: {test_image_path}")
    return test_image_path

def test_chinese_ocr():
    """测试中文OCR识别功能"""
    print("🚀 开始测试EasyOCR中文识别功能...")
    
    try:
        import easyocr
        
        # 设置模型路径
        model_dir = os.path.join(os.path.dirname(__file__), 'models', 'easyocr')
        print(f"📁 模型目录: {model_dir}")
        
        # 初始化EasyOCR，专门使用中文模型
        print("🔄 正在初始化EasyOCR（中文模式）...")
        reader = easyocr.Reader(['ch_sim'], gpu=False, model_storage_directory=model_dir)
        print("✅ EasyOCR中文模式初始化成功！")
        
        # 创建中文测试图片
        test_image_path = create_chinese_test_image()
        
        # 进行OCR识别
        print("🔍 正在进行中文OCR识别...")
        results = reader.readtext(test_image_path)
        
        print("\n📋 中文OCR识别结果:")
        print("=" * 80)
        
        if results:
            chinese_count = 0
            total_confidence = 0
            high_confidence_count = 0
            
            for i, (bbox, text, confidence) in enumerate(results, 1):
                total_confidence += confidence
                
                # 判断是否为中文
                has_chinese = any('\u4e00' <= char <= '\u9fff' for char in text)
                if has_chinese:
                    chinese_count += 1
                
                # 统计高置信度结果
                if confidence > 0.8:
                    high_confidence_count += 1
                
                confidence_emoji = "🟢" if confidence > 0.8 else "🟡" if confidence > 0.5 else "🔴"
                chinese_emoji = "🇨🇳" if has_chinese else "🌐"
                
                print(f"{i:2d}. {confidence_emoji} {chinese_emoji} 文字: '{text}'")
                print(f"     置信度: {confidence:.3f}")
                print(f"     位置: {bbox}")
                print()
            
            avg_confidence = total_confidence / len(results)
            chinese_ratio = chinese_count / len(results) * 100
            
            print("=" * 80)
            print("📊 中文识别统计:")
            print(f"  📝 总识别文字数量: {len(results)}")
            print(f"  🇨🇳 中文文字数量: {chinese_count}")
            print(f"  📈 中文识别比例: {chinese_ratio:.1f}%")
            print(f"  🎯 平均置信度: {avg_confidence:.3f}")
            print(f"  ⭐ 高置信度(>0.8)数量: {high_confidence_count}")
            print(f"  📊 高置信度比例: {high_confidence_count/len(results)*100:.1f}%")
            
        else:
            print("❌ 未识别到任何文字")
            return False
        
        print("=" * 80)
        print("✅ 中文OCR功能测试完成！")
        
        # 清理测试文件
        if os.path.exists(test_image_path):
            os.remove(test_image_path)
            print(f"🗑️  已清理测试文件: {test_image_path}")
        
        return True
        
    except ImportError:
        print("❌ EasyOCR未安装")
        return False
    except Exception as e:
        print(f"❌ 中文OCR测试失败: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def test_mixed_language():
    """测试中英文混合识别"""
    print("\n🔄 测试中英文混合识别...")
    
    try:
        import easyocr
        
        # 创建混合语言测试图片
        img = Image.new('RGB', (600, 200), color='white')
        draw = ImageDraw.Draw(img)
        
        try:
            font = ImageFont.truetype("/System/Library/Fonts/PingFang.ttc", 32)
        except:
            font = ImageFont.load_default()
        
        mixed_texts = [
            ("AI检测系统", (50, 50), font),
            ("AI Detection System", (50, 100), font),
            ("中文English混合", (50, 150), font),
        ]
        
        for text, position, font in mixed_texts:
            draw.text(position, text, fill='black', font=font)
        
        test_image_path = "mixed_test.png"
        img.save(test_image_path)
        
        # 使用中英文模型
        model_dir = os.path.join(os.path.dirname(__file__), 'models', 'easyocr')
        reader = easyocr.Reader(['ch_sim', 'en'], gpu=False, model_storage_directory=model_dir)
        
        results = reader.readtext(test_image_path)
        
        print("📋 中英文混合识别结果:")
        print("-" * 50)
        
        for i, (bbox, text, confidence) in enumerate(results, 1):
            print(f"{i}. 文字: '{text}' (置信度: {confidence:.3f})")
        
        # 清理测试文件
        if os.path.exists(test_image_path):
            os.remove(test_image_path)
        
        return True
        
    except Exception as e:
        print(f"❌ 混合语言测试失败: {str(e)}")
        return False

def main():
    """主函数"""
    print("=" * 80)
    print("EasyOCR中文识别功能专项测试")
    print("=" * 80)
    
    # 检查Python环境
    print(f"Python版本: {sys.version}")
    print(f"工作目录: {os.getcwd()}")
    print()
    
    # 测试中文OCR
    chinese_success = test_chinese_ocr()
    
    # 测试混合语言
    mixed_success = test_mixed_language()
    
    print("\n" + "=" * 80)
    print("📊 中文识别测试结果总结:")
    print(f"  🇨🇳 中文识别: {'✅ 正常' if chinese_success else '❌ 异常'}")
    print(f"  🌐 混合语言: {'✅ 正常' if mixed_success else '❌ 异常'}")
    
    if chinese_success and mixed_success:
        print("\n🎉 EasyOCR中文识别功能完全正常！")
        print("💡 可以准确识别中文、英文和混合语言文本。")
    else:
        print("\n⚠️  中文识别存在问题，请检查配置。")
    print("=" * 80)

if __name__ == '__main__':
    main()
