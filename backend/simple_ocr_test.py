#!/usr/bin/env python3
"""
简单的OCR测试
"""
import os
import sys
import django

# 设置Django环境
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from inspection.ocr_service import ocr_service

def test_ocr_import():
    """测试OCR导入和基本功能"""
    print("🔍 测试OCR服务导入...")
    
    try:
        # 检查服务是否可用
        if ocr_service.is_available():
            print("✅ OCR服务导入成功，服务可用")
            return True
        else:
            print("❌ OCR服务导入成功，但服务不可用")
            return False
    except Exception as e:
        print(f"❌ OCR服务导入失败: {str(e)}")
        return False

if __name__ == '__main__':
    test_ocr_import()
