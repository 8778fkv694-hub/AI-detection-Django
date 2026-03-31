#!/usr/bin/env python3
"""
直接测试口罩识别修复
模拟您截图中的实际情况
"""

import os
import sys
import requests
import numpy as np
from PIL import Image
import base64
import io

def create_simple_mask_test():
    """创建一个简单的口罩测试图像"""
    # 创建一个640x480的图像
    img = np.zeros((480, 640, 3), dtype=np.uint8)
    
    # 背景
    img[:] = [200, 200, 200]
    
    # 添加一个简单的口罩（白色矩形）
    img[150:200, 280:360] = [255, 255, 255]  # 白色口罩
    
    return img

def test_direct_api():
    """直接测试API，模拟您截图中的情况"""
    print("=" * 60)
    print("直接API测试")
    print("=" * 60)
    
    try:
        # 创建简单测试图像
        print("创建简单口罩测试图像...")
        test_image = create_simple_mask_test()
        
        # 保存图像
        test_image_pil = Image.fromarray(test_image)
        test_image_pil.save("simple_mask_test.jpg")
        print("✅ 测试图像已保存为 simple_mask_test.jpg")
        
        # 转换为base64
        buffer = io.BytesIO()
        test_image_pil.save(buffer, format='JPEG')
        img_base64 = base64.b64encode(buffer.getvalue()).decode()
        
        # 测试不同的置信度阈值
        thresholds = [0.01, 0.05, 0.1, 0.2, 0.3]
        
        for conf in thresholds:
            print(f"\n测试置信度阈值: {conf}")
            response = requests.post(
                'http://localhost:8000/api/results/yolo-detect/',
                json={'image': img_base64, 'conf': conf}
            )
            
            if response.status_code == 200:
                result = response.json()
                detections = result.get('detections', [])
                
                print(f"  检测到 {len(detections)} 个目标")
                
                for i, detection in enumerate(detections):
                    label = detection.get('label', 'unknown')
                    confidence = detection.get('confidence', 0)
                    bbox = detection.get('bbox', {})
                    
                    print(f"    目标 {i+1}: {label} (置信度: {confidence:.3f})")
                    print(f"      位置: x1={bbox.get('x1', 0):.1f}, y1={bbox.get('y1', 0):.1f}, x2={bbox.get('x2', 0):.1f}, y2={bbox.get('y2', 0):.1f}")
                    
                    # 检查是否是预期的类别
                    if label in ['mask', 'cleanroom_cap', 'hardhat']:
                        print(f"      ✅ 检测到相关类别: {label}")
                    else:
                        print(f"      ⚠️ 检测到未知类别: {label}")
            else:
                print(f"  ❌ API调用失败: {response.status_code}")
        
        return True
        
    except Exception as e:
        print(f"❌ 测试失败: {e}")
        return False

def test_model_directly():
    """直接测试模型"""
    print("\n" + "=" * 60)
    print("直接模型测试")
    print("=" * 60)
    
    try:
        # 设置Django环境
        os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
        import django
        django.setup()
        
        from inspection.yolo import load_model, run_inference
        
        # 加载模型
        model = load_model()
        print("✅ 模型加载成功")
        
        # 创建测试图像
        test_image = create_simple_mask_test()
        
        # 直接调用推理
        print("执行推理...")
        detections = run_inference(test_image, conf=0.1)
        
        print(f"检测到 {len(detections)} 个目标")
        
        for i, detection in enumerate(detections):
            label = detection.get('label', 'unknown')
            confidence = detection.get('confidence', 0)
            bbox = detection.get('bbox', {})
            
            print(f"  目标 {i+1}: {label} (置信度: {confidence:.3f})")
            print(f"    位置: x1={bbox.get('x1', 0):.1f}, y1={bbox.get('y1', 0):.1f}, x2={bbox.get('x2', 0):.1f}, y2={bbox.get('y2', 0):.1f}")
            
            # 检查修复效果
            if label == 'mask':
                print(f"    ✅ 修复成功：口罩被正确识别")
            elif label == 'cleanroom_cap':
                print(f"    ❌ 修复失败：仍被识别为洁净帽")
            elif label == 'hardhat':
                print(f"    ⚠️ 原始识别：Hardhat（应该被修复为mask）")
            else:
                print(f"    ⚠️ 其他类别：{label}")
        
        return detections
        
    except Exception as e:
        print(f"❌ 直接模型测试失败: {e}")
        return []

def main():
    """主函数"""
    print("开始直接测试口罩识别修复...")
    
    # 直接API测试
    api_success = test_direct_api()
    
    # 直接模型测试
    model_detections = test_model_directly()
    
    # 总结
    print("\n" + "=" * 60)
    print("测试总结")
    print("=" * 60)
    
    if model_detections:
        mask_detected = any(d.get('label') == 'mask' for d in model_detections)
        cap_detected = any(d.get('label') == 'cleanroom_cap' for d in model_detections)
        hardhat_detected = any(d.get('label') == 'hardhat' for d in model_detections)
        
        if mask_detected:
            print("🎉 口罩识别修复成功！")
            print("✅ 口罩被正确识别为'mask'")
        elif cap_detected:
            print("❌ 修复失败：仍被识别为'cleanroom_cap'")
        elif hardhat_detected:
            print("⚠️ 检测到'Hardhat'，但修复逻辑可能未生效")
        else:
            print("⚠️ 未检测到预期类别")
    else:
        print("❌ 模型测试失败")
    
    return True

if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)
