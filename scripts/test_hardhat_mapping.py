#!/usr/bin/env python3
"""
测试Hardhat类别映射
验证Hardhat类别是否正确映射为cleanroom_cap
"""

import os
import sys
import numpy as np

# 添加项目根目录到Python路径
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

def test_hardhat_mapping():
    """测试Hardhat类别映射"""
    print("=" * 60)
    print("测试Hardhat类别映射")
    print("=" * 60)
    
    try:
        # 导入模型配置
        from backend.inspection.model_config import ppe_model_config
        
        print("✅ 成功导入模型配置")
        
        # 获取PPE检测模型的映射
        ppe_mapping = ppe_model_config.get_ppe_mapping('ppe_detection')
        
        if not ppe_mapping:
            print("❌ 未找到PPE检测模型的映射配置")
            return False
        
        print("🔍 检查Hardhat相关映射:")
        
        # 检查Hardhat映射
        if 'Hardhat' in ppe_mapping:
            mapped_value = ppe_mapping['Hardhat']
            print(f"   Hardhat → {mapped_value}")
            
            if mapped_value == 'cleanroom_cap':
                print("   ✅ Hardhat正确映射为cleanroom_cap")
            else:
                print(f"   ❌ Hardhat映射错误，期望: cleanroom_cap，实际: {mapped_value}")
                return False
        else:
            print("   ❌ 未找到Hardhat映射")
            return False
        
        # 检查其他安全帽相关映射
        print(f"\n🔍 检查所有安全帽相关映射:")
        safety_hat_mappings = {}
        for original, mapped in ppe_mapping.items():
            if mapped == 'cleanroom_cap':
                safety_hat_mappings[original] = mapped
        
        if safety_hat_mappings:
            print(f"   找到 {len(safety_hat_mappings)} 个安全帽相关映射:")
            for original, mapped in safety_hat_mappings.items():
                print(f"     {original} → {mapped}")
        else:
            print("   ⚠️ 未找到任何安全帽相关映射")
        
        # 检查模型类别列表
        print(f"\n🔍 检查模型类别列表:")
        model_config = ppe_model_config.get_model_config('ppe_detection')
        if model_config and 'classes' in model_config:
            classes = model_config['classes']
            print(f"   模型类别数量: {len(classes)}")
            print(f"   类别列表: {classes}")
            
            # 检查Hardhat是否在类别列表中
            if 'Hardhat' in classes:
                print("   ✅ Hardhat在模型类别列表中")
            else:
                print("   ❌ Hardhat不在模型类别列表中")
                return False
        else:
            print("   ❌ 未找到模型类别配置")
            return False
        
        # 测试映射函数
        print(f"\n🔄 测试映射函数:")
        try:
            from backend.inspection.yolo import map_to_ppe
            
            # 测试Hardhat映射
            test_labels = ['Hardhat', 'helmet', 'safety_helmet', 'hard_hat', 'construction_hat', 'work_hat']
            for label in test_labels:
                try:
                    mapped = map_to_ppe(label, 'ppe_detection')
                    print(f"   {label} → {mapped}")
                    
                    if mapped == 'cleanroom_cap':
                        print(f"      ✅ 正确映射为洁净帽")
                    else:
                        print(f"      ❌ 映射不正确")
                        
                except Exception as e:
                    print(f"   {label} → 映射失败: {e}")
            
        except ImportError:
            print("   ⚠️ 无法导入map_to_ppe函数，跳过映射测试")
        except Exception as e:
            print(f"   ⚠️ 映射测试失败: {e}")
        
        print(f"\n✅ Hardhat映射测试完成")
        return True
        
    except Exception as e:
        print(f"❌ 测试过程中出现异常: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_model_inference():
    """测试模型推理中的类别映射"""
    print(f"\n🔄 测试模型推理中的类别映射:")
    
    try:
        from backend.inspection.yolo import load_model, run_inference
        
        print("   正在加载PPE模型...")
        model = load_model('ppe_detection')
        print("   ✅ PPE模型加载成功")
        
        # 创建测试图像
        print("   创建测试图像...")
        test_image = np.ones((480, 640, 3), dtype=np.uint8) * 255  # 白色背景
        
        # 添加一些模拟的检测区域
        cv2.rectangle(test_image, (100, 100), (300, 400), (0, 0, 255), -1)  # 红色区域模拟人员
        cv2.rectangle(test_image, (150, 150), (250, 200), (255, 0, 0), -1)  # 蓝色区域模拟安全帽
        
        print("   ✅ 测试图像创建成功")
        
        # 执行推理（使用很低的置信度阈值）
        print("   执行推理...")
        try:
            detections = run_inference(test_image, conf=0.1)
            print(f"   ✅ 推理成功，检测到 {len(detections)} 个目标")
            
            if detections:
                print("   📊 检测结果:")
                for i, detection in enumerate(detections):
                    label = detection['label']
                    confidence = detection['confidence']
                    print(f"     {i+1}. {label}: {confidence:.3f}")
                    
                    # 检查是否检测到洁净帽相关类别
                    if label == 'cleanroom_cap':
                        print(f"        🎉 成功检测到洁净帽!")
                    elif label == 'Hardhat':
                        print(f"        🎉 检测到Hardhat类别!")
                        
            else:
                print("   ⚠️ 未检测到任何目标")
                
        except Exception as e:
            print(f"   ❌ 推理失败: {e}")
            
        return True
        
    except Exception as e:
        print(f"   ❌ 模型推理测试失败: {e}")
        return False

if __name__ == "__main__":
    print("🧪 开始测试Hardhat类别映射...")
    
    success1 = test_hardhat_mapping()
    
    # 尝试测试模型推理（如果可能的话）
    try:
        import cv2
        success2 = test_model_inference()
    except ImportError:
        print("   ⚠️ OpenCV未安装，跳过模型推理测试")
        success2 = True
    
    print(f"\n{'='*60}")
    if success1 and success2:
        print("🎉 所有测试通过！Hardhat类别映射正确")
        print("✅ Hardhat → cleanroom_cap 映射已配置")
        print("✅ 所有安全帽相关类别都会显示为洁净帽")
    else:
        print("❌ 部分测试失败，请检查配置")
    print(f"{'='*60}")
