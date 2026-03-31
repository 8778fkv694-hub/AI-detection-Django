#!/usr/bin/env python3
import requests
import base64
import json
import time
from PIL import Image, ImageDraw
import io

def test_detection():
    """测试PPE检测功能"""
    print("🧪 测试PPE检测功能...")
    
    # 等待服务器启动
    time.sleep(3)
    
    # 创建一个简单的测试图片
    img = Image.new('RGB', (640, 480), color='white')
    draw = ImageDraw.Draw(img)
    
    # 画一个人形轮廓
    # 头部（圆形）
    draw.ellipse([280, 100, 360, 180], fill='brown', outline='black')
    # 身体（矩形）
    draw.rectangle([300, 180, 340, 300], fill='blue', outline='black')
    # 腿部
    draw.rectangle([305, 300, 320, 400], fill='black', outline='black')
    draw.rectangle([325, 300, 340, 400], fill='black', outline='black')
    # 手臂
    draw.rectangle([280, 200, 300, 250], fill='brown', outline='black')
    draw.rectangle([340, 200, 360, 250], fill='brown', outline='black')
    
    buffer = io.BytesIO()
    img.save(buffer, format='JPEG')
    img_data = buffer.getvalue()
    img_base64 = base64.b64encode(img_data).decode('utf-8')
    
    print(f"📸 创建测试图片，大小: {len(img_base64)} 字符")
    
    # 测试API端点
    url = "http://localhost:8000/api/results/yolo-detect/"
    payload = {
        "image": img_base64,
        "conf": 0.1  # 降低置信度阈值
    }
    
    try:
        response = requests.post(url, json=payload, timeout=30)
        print(f"📡 响应状态码: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print("✅ 检测成功！")
            print(f"🔍 检测结果: {json.dumps(result, indent=2, ensure_ascii=False)}")
            
            if 'detections' in result:
                detections = result['detections']
                print(f"🎯 检测到 {len(detections)} 个目标")
                
                # 统计PPE类别
                ppe_stats = {}
                for detection in detections:
                    label = detection.get('label', 'unknown')
                    confidence = detection.get('confidence', 0)
                    ppe_stats[label] = ppe_stats.get(label, 0) + 1
                    print(f"  目标: {label} (置信度: {confidence:.3f})")
                
                print("\n📊 PPE检测统计:")
                for label, count in ppe_stats.items():
                    print(f"  {label}: {count} 个")
                
            else:
                print("❌ 响应中没有找到 'detections' 字段")
        else:
            print("❌ 检测失败！")
            print(f"错误信息: {response.text}")
            
    except requests.exceptions.ConnectionError:
        print("❌ 连接失败！Django服务器可能没有启动")
    except requests.exceptions.Timeout:
        print("❌ 请求超时！服务器响应太慢")
    except Exception as e:
        print(f"❌ 发生错误: {e}")

if __name__ == "__main__":
    test_detection()
