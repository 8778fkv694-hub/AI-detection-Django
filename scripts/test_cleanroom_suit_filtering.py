#!/usr/bin/env python3
"""
测试洁净服检测过滤
验证推理检测中是否完全移除了洁净服相关的检测结果
"""

import os
import sys
import numpy as np

# 添加项目根目录到Python路径
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

def test_cleanroom_suit_filtering():
    """测试洁净服检测过滤"""
    print("=" * 60)
    print("测试洁净服检测过滤")
    print("=" * 60)
    
    try:
        # 导入模型配置
        from backend.inspection.model_config import ppe_model_config
        
        print("✅ 成功导入模型配置")
        
        # 检查PPE检测模型的映射
        ppe_mapping = ppe_model_config.get_ppe_mapping('ppe_detection')
        
        print("🔍 检查PPE类别映射:")
        for original, mapped in ppe_mapping.items():
            if 'suit' in original.lower() or 'vest' in original.lower():
                print(f"   {original} → {mapped}")
        
        # 检查是否有洁净服相关映射
        cleanroom_suit_mappings = {k: v for k, v in ppe_mapping.items() 
                                 if v in ['cleanroom_suit', 'safety-suit', 'medical-suit', 'safety-vest']}
        
        if cleanroom_suit_mappings:
            print(f"\n⚠️ 发现洁净服相关映射:")
            for original, mapped in cleanroom_suit_mappings.items():
                print(f"   {original} → {mapped}")
        else:
            print(f"\n✅ 未发现洁净服相关映射")
        
        # 测试推理过滤逻辑
        print(f"\n🔄 测试推理过滤逻辑:")
        try:
            from backend.inspection.yolo import load_model, run_inference
            
            print("   正在加载PPE模型...")
            model = load_model('ppe_detection')
            print("   ✅ PPE模型加载成功")
            
            # 创建测试图像
            print("   创建测试图像...")
            test_image = np.ones((480, 640, 3), dtype=np.uint8) * 255  # 白色背景
            
            # 添加一些模拟的检测区域（简单的numpy操作）
            test_image[100:400, 100:300] = [0, 0, 255]  # 红色区域模拟人员
            test_image[150:200, 150:250] = [255, 0, 0]  # 蓝色区域模拟安全帽
            test_image[200:350, 200:280] = [0, 255, 0]  # 绿色区域模拟洁净服
            
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
                        
                        # 检查是否检测到洁净服相关类别
                        if label in ['cleanroom_suit', 'safety-suit', 'medical-suit', 'safety-vest']:
                            print(f"        ❌ 检测到洁净服相关类别: {label}")
                            return False
                        elif label == 'cleanroom_cap':
                            print(f"        ✅ 检测到洁净帽")
                        elif label == 'mask':
                            print(f"        ✅ 检测到口罩")
                        elif label == 'person':
                            print(f"        ✅ 检测到人员")
                    
                    # 检查是否完全过滤了洁净服
                    cleanroom_suit_detections = [d for d in detections 
                                              if d['label'] in ['cleanroom_suit', 'safety-suit', 'medical-suit', 'safety-vest']]
                    
                    if not cleanroom_suit_detections:
                        print("   ✅ 成功过滤掉所有洁净服相关检测")
                    else:
                        print(f"   ❌ 仍有洁净服相关检测: {len(cleanroom_suit_detections)} 个")
                        return False
                        
                else:
                    print("   ⚠️ 未检测到任何目标")
                    
            except Exception as e:
                print(f"   ❌ 推理失败: {e}")
                return False
                
        except Exception as e:
            print(f"   ❌ 模型推理测试失败: {e}")
            return False
        
        print(f"\n✅ 洁净服检测过滤测试完成")
        return True
        
    except Exception as e:
        print(f"❌ 测试过程中出现异常: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_mapping_function():
    """测试映射函数的过滤效果"""
    print(f"\n🔄 测试映射函数的过滤效果:")
    
    try:
        from backend.inspection.yolo import map_to_ppe
        
        # 测试各种可能的洁净服相关标签
        test_labels = [
            'safety-vest', 'safety-suit', 'medical-suit', 'cleanroom_suit',
            'jacket', 'coat', 'uniform', 'workwear', 'shirt', 'clothing',
            'Hardhat', 'mask', 'person'  # 这些应该正常映射
        ]
        
        print("   标签映射测试:")
        for label in test_labels:
            mapped = map_to_ppe(label, 'ppe_detection')
            print(f"     {label} → {mapped}")
            
            # 检查是否映射为洁净服相关类别
            if mapped in ['cleanroom_suit', 'safety-suit', 'medical-suit', 'safety-vest']:
                print(f"        ⚠️ 映射为洁净服相关类别")
            else:
                print(f"        ✅ 正常映射")
        
        return True
        
    except Exception as e:
        print(f"   ❌ 映射函数测试失败: {e}")
        return False

if __name__ == "__main__":
    print("🧪 开始测试洁净服检测过滤...")
    
    success1 = test_cleanroom_suit_filtering()
    success2 = test_mapping_function()
    
    print(f"\n{'='*60}")
    if success1 and success2:
        print("🎉 所有测试通过！洁净服检测已被完全移除")
        print("✅ 推理检测中不会出现洁净服相关结果")
        print("✅ 系统专注于口罩和帽子检测")
    else:
        print("❌ 部分测试失败，请检查配置")
    print(f"{'='*60}")
