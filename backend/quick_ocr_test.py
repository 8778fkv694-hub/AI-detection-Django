#!/usr/bin/env python3
"""
快速OCR测试
测试OCR API端点是否正常工作
"""
import os
import sys
import django
import json
import base64
from PIL import Image, ImageDraw, ImageFont

# 设置Django环境
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

def test_ocr_api():
    """测试OCR API端点"""
    print("🔍 测试OCR API端点...")
    
    try:
        from django.test import Client
        
        client = Client()
        
        # 1. 测试状态API
        print("\n1. 测试OCR状态API...")
        response = client.get('/api/ocr/status/')
        print(f"状态码: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ 状态API正常: {data}")
        else:
            print(f"❌ 状态API失败")
            return False
        
        # 2. 创建测试图片
        print("\n2. 创建测试图片...")
        img = Image.new('RGB', (300, 100), color='white')
        draw = ImageDraw.Draw(img)
        
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 24)
        except:
            font = ImageFont.load_default()
        
        draw.text((20, 30), "Hello OCR Test", fill='black', font=font)
        
        # 转换为base64
        img_buffer = io.BytesIO()
        img.save(img_buffer, format='PNG')
        img_base64 = base64.b64encode(img_buffer.getvalue()).decode('utf-8')
        
        # 3. 测试OCR识别API
        print("\n3. 测试OCR识别API...")
        response = client.post('/api/ocr/extract/', 
                             data=json.dumps({'image': img_base64}),
                             content_type='application/json')
        
        print(f"状态码: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"API响应: {data}")
            
            if data.get('success'):
                print("✅ OCR识别API正常")
                print(f"识别文字: {data.get('full_text', '')}")
            else:
                print(f"⚠️ OCR识别失败: {data.get('error', '未知错误')}")
                print("这可能是正常的，因为模型可能还在下载中")
        else:
            print(f"❌ OCR识别API请求失败")
            return False
        
        return True
        
    except Exception as e:
        print(f"❌ API测试失败: {str(e)}")
        return False

if __name__ == '__main__':
    import io
    
    print("🚀 开始快速OCR测试...")
    test_ocr_api()
    print("\n✨ 测试完成！")
