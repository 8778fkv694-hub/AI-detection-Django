#!/usr/bin/env python3
"""
初始化EasyOCR模型
第一次运行时会自动下载模型文件
"""
import os
import sys
import django

# 设置Django环境
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

def init_ocr_models():
    """初始化OCR模型"""
    print("🚀 开始初始化EasyOCR模型...")
    print("注意：首次运行会下载模型文件，请耐心等待...")
    
    try:
        from inspection.ocr_service import ocr_service
        
        # 检查服务是否可用
        if ocr_service.is_available():
            print("✅ OCR模型初始化成功！")
            print("✅ 服务可用，可以开始使用OCR功能")
            return True
        else:
            print("❌ OCR模型初始化失败")
            return False
            
    except Exception as e:
        print(f"❌ 初始化过程中出现错误: {str(e)}")
        return False

if __name__ == '__main__':
    init_ocr_models()
