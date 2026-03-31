#!/usr/bin/env python3
"""
口罩识别问题诊断和修复脚本
"""

import os
import sys
import requests
import numpy as np
from PIL import Image
import base64
import io

def create_mask_test_image():
    """创建一个包含口罩的测试图像"""
    # 创建一个640x480的图像
    img = np.zeros((480, 640, 3), dtype=np.uint8)
    
    # 背景设为浅灰色
    img[:] = [200, 200, 200]
    
    # 添加一个人物轮廓，重点突出口罩
    # 头部（圆形）
    center_x, center_y = 320, 120
    for y in range(480):
        for x in range(640):
            dist = ((x - center_x) ** 2 + (y - center_y) ** 2) ** 0.5
            if dist < 60:  # 头部半径
                img[y, x] = [255, 200, 150]  # 肤色
    
    # 身体（矩形）
    img[180:400, 280:360] = [100, 150, 255]  # 蓝色工作服
    
    # 手臂
    img[200:300, 240:280] = [255, 200, 150]  # 左臂
    img[200:300, 360:400] = [255, 200, 150]  # 右臂
    
    # 重点：添加明显的口罩区域（白色矩形）
    img[90:140, 300:340] = [255, 255, 255]  # 白色口罩
    # 添加口罩带子
    img[85:95, 295:345] = [100, 100, 100]  # 深灰色带子
    img[135:145, 295:345] = [100, 100, 100]  # 深灰色带子
    
    return img

def test_mask_detection():
    """测试口罩检测"""
    print("=" * 60)
    print("口罩检测问题诊断")
    print("=" * 60)
    
    try:
        # 创建测试图像
        print("创建口罩测试图像...")
        test_image = create_mask_test_image()
        
        # 保存图像用于查看
        test_image_pil = Image.fromarray(test_image)
        test_image_pil.save("mask_test_image.jpg")
        print("✅ 测试图像已保存为 mask_test_image.jpg")
        
        # 转换为base64
        buffer = io.BytesIO()
        test_image_pil.save(buffer, format='JPEG')
        img_base64 = base64.b64encode(buffer.getvalue()).decode()
        
        # 发送到YOLO检测API
        print("发送图像到PPE检测API...")
        response = requests.post(
            'http://localhost:8000/api/results/yolo-detect/',
            json={'image': img_base64, 'conf': 0.1}  # 降低置信度阈值
        )
        
        if response.status_code == 200:
            result = response.json()
            detections = result.get('detections', [])
            
            print(f"✅ PPE检测完成，检测到 {len(detections)} 个目标")
            
            if detections:
                print("\n检测结果详情:")
                for i, detection in enumerate(detections):
                    label = detection.get('label', 'unknown')
                    confidence = detection.get('confidence', 0)
                    bbox = detection.get('bbox', {})
                    
                    print(f"  目标 {i+1}:")
                    print(f"    类别: {label}")
                    print(f"    置信度: {confidence:.3f}")
                    print(f"    位置: x1={bbox.get('x1', 0):.1f}, y1={bbox.get('y1', 0):.1f}, x2={bbox.get('x2', 0):.1f}, y2={bbox.get('y2', 0):.1f}")
                    
                    # 分析问题
                    if label == 'cleanroom_cap':
                        print(f"    ❌ 问题：口罩被错误识别为洁净帽")
                        print(f"    💡 建议：需要调整模型分类或映射逻辑")
                    elif label == 'mask':
                        print(f"    ✅ 正确：口罩被正确识别")
                    else:
                        print(f"    ⚠️ 其他类别：{label}")
                    print()
            else:
                print("❌ 未检测到任何目标")
                
            return detections
        else:
            print(f"❌ PPE检测失败: {response.status_code}")
            print(f"错误信息: {response.text}")
            return []
            
    except Exception as e:
        print(f"❌ 口罩检测测试失败: {e}")
        return []

def analyze_model_classification():
    """分析模型分类问题"""
    print("\n" + "=" * 60)
    print("模型分类问题分析")
    print("=" * 60)
    
    try:
        # 设置Django环境
        os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
        import django
        django.setup()
        
        from inspection.yolo import load_model
        
        model = load_model()
        names = model.model.names
        
        print("模型类别信息:")
        for i, name in names.items():
            print(f"  {i}: {name}")
        
        print("\n问题分析:")
        print("1. 模型有正确的类别：Mask (类别1)")
        print("2. 但实际检测中，口罩被识别为Hardhat (类别0)")
        print("3. 然后Hardhat被映射为cleanroom_cap")
        print("4. 这是模型分类错误，不是映射问题")
        
        print("\n可能的解决方案:")
        print("1. 重新训练模型，提高口罩识别准确性")
        print("2. 调整模型置信度阈值")
        print("3. 添加后处理逻辑，根据位置判断类别")
        print("4. 使用多个模型进行投票")
        
        return names
        
    except Exception as e:
        print(f"❌ 模型分析失败: {e}")
        return {}

def suggest_fixes():
    """建议修复方案"""
    print("\n" + "=" * 60)
    print("修复建议")
    print("=" * 60)
    
    print("方案1: 调整映射逻辑（临时解决）")
    print("  在map_to_ppe函数中添加位置判断:")
    print("  - 如果检测到Hardhat但位置在面部区域，可能是口罩")
    print("  - 根据置信度和位置进行二次判断")
    
    print("\n方案2: 模型微调（根本解决）")
    print("  - 收集更多口罩样本")
    print("  - 重新训练模型")
    print("  - 提高口罩识别准确性")
    
    print("\n方案3: 多模型集成")
    print("  - 使用专门的口罩检测模型")
    print("  - 结合现有PPE模型")
    print("  - 投票决定最终类别")
    
    print("\n方案4: 后处理优化")
    print("  - 添加形状分析")
    print("  - 颜色特征判断")
    print("  - 上下文信息利用")

def main():
    """主函数"""
    print("开始口罩识别问题诊断...")
    
    # 测试口罩检测
    detections = test_mask_detection()
    
    # 分析模型分类
    model_names = analyze_model_classification()
    
    # 提供修复建议
    suggest_fixes()
    
    # 总结
    print("\n" + "=" * 60)
    print("诊断总结")
    print("=" * 60)
    
    if detections:
        mask_detected = any(d.get('label') == 'mask' for d in detections)
        cap_detected = any(d.get('label') == 'cleanroom_cap' for d in detections)
        
        if mask_detected:
            print("✅ 口罩被正确识别")
        elif cap_detected:
            print("❌ 口罩被错误识别为洁净帽")
            print("💡 需要实施修复方案")
        else:
            print("⚠️ 未检测到口罩相关目标")
    else:
        print("❌ 检测失败")
    
    return True

if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)
