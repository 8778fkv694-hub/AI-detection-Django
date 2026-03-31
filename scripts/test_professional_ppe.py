#!/usr/bin/env python3
import requests
import base64
import json
import time
from PIL import Image, ImageDraw
import io

def test_professional_ppe():
    """测试专业PPE检测功能"""
    print("🔧 测试专业PPE检测模型...")
    
    # 等待服务器启动
    time.sleep(3)
    
    # 创建一个包含人员和PPE的测试图片
    img = Image.new('RGB', (640, 480), color='lightblue')
    draw = ImageDraw.Draw(img)
    
    # 画一个戴着安全帽和口罩的工人
    # 头部（棕色）
    draw.ellipse([100, 50, 180, 130], fill='brown', outline='black', width=2)
    # 安全帽（黄色）
    draw.ellipse([95, 45, 185, 100], fill='yellow', outline='black', width=3)
    # 口罩（白色）
    draw.rectangle([120, 100, 160, 120], fill='white', outline='black', width=2)
    # 身体（蓝色工作服）
    draw.rectangle([80, 130, 200, 280], fill='darkblue', outline='black', width=2)
    # 安全背心（橙色）
    draw.rectangle([85, 140, 195, 220], fill='orange', outline='black', width=2)
    # 手臂
    draw.rectangle([50, 150, 80, 220], fill='darkblue', outline='black', width=2)
    draw.rectangle([200, 150, 230, 220], fill='darkblue', outline='black', width=2)
    # 手套（黄色）
    draw.ellipse([45, 210, 75, 235], fill='yellow', outline='black', width=2)
    draw.ellipse([205, 210, 235, 235], fill='yellow', outline='black', width=2)
    # 腿部
    draw.rectangle([90, 280, 120, 350], fill='darkblue', outline='black', width=2)
    draw.rectangle([160, 280, 190, 350], fill='darkblue', outline='black', width=2)
    
    # 添加第二个人员 - 没有完整PPE
    # 头部（棕色）
    draw.ellipse([350, 50, 430, 130], fill='brown', outline='black', width=2)
    # 没有安全帽
    # 身体（普通衣服）
    draw.rectangle([330, 130, 450, 280], fill='gray', outline='black', width=2)
    # 没有安全背心
    # 手臂
    draw.rectangle([300, 150, 330, 220], fill='gray', outline='black', width=2)
    draw.rectangle([450, 150, 480, 220], fill='gray', outline='black', width=2)
    # 腿部
    draw.rectangle([340, 280, 370, 350], fill='gray', outline='black', width=2)
    draw.rectangle([410, 280, 440, 350], fill='gray', outline='black', width=2)
    
    # 添加一些安全设备
    # 安全锥（橙色三角形）
    draw.polygon([(500, 300), (530, 300), (515, 260)], fill='orange', outline='black', width=2)
    # 机械设备（灰色矩形）
    draw.rectangle([50, 300, 150, 400], fill='gray', outline='black', width=3)
    
    buffer = io.BytesIO()
    img.save(buffer, format='JPEG')
    img_data = buffer.getvalue()
    img_base64 = base64.b64encode(img_data).decode('utf-8')
    
    print(f"📸 创建专业PPE测试图片，大小: {len(img_base64)} 字符")
    
    # 测试API端点
    url = "http://localhost:8000/api/results/yolo-detect/"
    payload = {
        "image": img_base64,
        "conf": 0.1  # 降低置信度阈值以检测更多目标
    }
    
    try:
        response = requests.post(url, json=payload, timeout=30)
        print(f"📡 响应状态码: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print("✅ 专业PPE检测成功！")
            print(f"🔍 检测结果: {json.dumps(result, indent=2, ensure_ascii=False)}")
            
            if 'detections' in result:
                detections = result['detections']
                print(f"🎯 检测到 {len(detections)} 个目标")
                
                # 统计专业PPE类别
                ppe_stats = {}
                for detection in detections:
                    label = detection.get('label', 'unknown')
                    confidence = detection.get('confidence', 0)
                    ppe_stats[label] = ppe_stats.get(label, 0) + 1
                    print(f"  目标: {label} (置信度: {confidence:.3f})")
                
                print("\n📊 专业PPE检测统计:")
                for label, count in ppe_stats.items():
                    print(f"  {label}: {count} 个")
                
                # 检查专业PPE类别
                print("\n🎯 专业PPE检测结果:")
                professional_ppe_classes = ['Person', 'Hardhat', 'Mask', 'NO-Hardhat', 'NO-Mask', 'NO-Safety Vest', 'Safety Vest', 'Safety Cone', 'machinery', 'vehicle']
                detected_classes = []
                missing_classes = []
                
                for ppe_class in professional_ppe_classes:
                    if ppe_class.lower() in [label.lower() for label in ppe_stats.keys()]:
                        detected_classes.append(ppe_class)
                        print(f"✅ 检测到 {ppe_class}")
                    else:
                        missing_classes.append(ppe_class)
                
                if missing_classes:
                    print(f"\n❌ 未检测到: {', '.join(missing_classes)}")
                
                # 计算专业PPE检测覆盖率
                coverage = len(detected_classes) / len(professional_ppe_classes) * 100
                print(f"\n📈 专业PPE检测覆盖率: {coverage:.1f}% ({len(detected_classes)}/{len(professional_ppe_classes)})")
                
                # 安全评估
                safety_score = 0
                total_safety_items = 0
                
                if 'person' in [label.lower() for label in ppe_stats.keys()]:
                    total_safety_items = 4  # Person, Hardhat, Mask, Safety Vest
                    
                    if 'hardhat' in [label.lower() for label in ppe_stats.keys()]:
                        safety_score += 1
                    if 'mask' in [label.lower() for label in ppe_stats.keys()]:
                        safety_score += 1
                    if 'safety vest' in [label.lower() for label in ppe_stats.keys()]:
                        safety_score += 1
                        
                    # 检查负面检测
                    negative_detections = []
                    if 'no-hardhat' in [label.lower() for label in ppe_stats.keys()]:
                        negative_detections.append("未戴安全帽")
                    if 'no-mask' in [label.lower() for label in ppe_stats.keys()]:
                        negative_detections.append("未戴口罩")
                    if 'no-safety vest' in [label.lower() for label in ppe_stats.keys()]:
                        negative_detections.append("未穿安全背心")
                    
                    if negative_detections:
                        print(f"\n⚠️  安全隐患: {', '.join(negative_detections)}")
                    
                    if total_safety_items > 0:
                        safety_percentage = (safety_score / total_safety_items) * 100
                        print(f"\n🛡️  安全评分: {safety_percentage:.1f}% ({safety_score}/{total_safety_items})")
                
            else:
                print("❌ 响应中没有找到 'detections' 字段")
        else:
            print("❌ 专业PPE检测失败！")
            print(f"错误信息: {response.text}")
            
    except requests.exceptions.ConnectionError:
        print("❌ 连接失败！Django服务器可能没有启动")
    except requests.exceptions.Timeout:
        print("❌ 请求超时！服务器响应太慢")
    except Exception as e:
        print(f"❌ 发生错误: {e}")

if __name__ == "__main__":
    test_professional_ppe()
