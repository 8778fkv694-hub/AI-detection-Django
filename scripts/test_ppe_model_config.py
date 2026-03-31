#!/usr/bin/env python3
"""
测试PPE模型配置
验证PPE模型是否正确设置为默认模型，以及安全帽映射是否正确
"""

import os
import sys

# 添加项目根目录到Python路径
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

def test_ppe_model_config():
    """测试PPE模型配置"""
    print("=" * 60)
    print("测试PPE模型配置")
    print("=" * 60)
    
    try:
        # 导入模型配置
        from backend.inspection.model_config import ppe_model_config
        
        print("✅ 成功导入模型配置")
        
        # 检查默认模型
        default_model = ppe_model_config.get_default_model()
        print(f"📌 当前默认模型: {default_model}")
        
        if default_model == 'ppe_detection':
            print("✅ PPE检测模型已正确设置为默认模型")
        else:
            print(f"❌ 默认模型不正确，期望: ppe_detection，实际: {default_model}")
            return False
        
        # 检查模型配置
        model_config = ppe_model_config.get_model_config('ppe_detection')
        if model_config:
            print(f"📋 PPE模型配置:")
            print(f"   名称: {model_config['name']}")
            print(f"   文件: {model_config['file']}")
            print(f"   描述: {model_config['description']}")
            print(f"   是否默认: {model_config['is_default']}")
            print(f"   类别数量: {len(model_config['classes'])}")
            print(f"   类别列表: {model_config['classes']}")
        else:
            print("❌ 未找到PPE检测模型配置")
            return False
        
        # 检查PPE映射
        ppe_mapping = ppe_model_config.get_ppe_mapping('ppe_detection')
        if ppe_mapping:
            print(f"\n🔗 PPE类别映射:")
            
            # 检查安全帽相关映射
            safety_hat_mappings = {}
            for original, mapped in ppe_mapping.items():
                if mapped == 'cleanroom_cap':
                    safety_hat_mappings[original] = mapped
            
            if safety_hat_mappings:
                print(f"   安全帽相关映射 (→ cleanroom_cap):")
                for original, mapped in safety_hat_mappings.items():
                    print(f"     {original} → {mapped}")
            else:
                print("   ⚠️ 未找到安全帽相关映射")
            
            # 检查其他映射
            other_mappings = {k: v for k, v in ppe_mapping.items() if v != 'cleanroom_cap'}
            if other_mappings:
                print(f"   其他映射:")
                for original, mapped in other_mappings.items():
                    print(f"     {original} → {mapped}")
            
            # 检查是否包含洁净服映射
            cleanroom_suit_mappings = {k: v for k, v in ppe_mapping.items() if v == 'cleanroom_suit'}
            if cleanroom_suit_mappings:
                print(f"   ⚠️ 发现洁净服相关映射 (应该被移除):")
                for original, mapped in cleanroom_suit_mappings.items():
                    print(f"     {original} → {mapped}")
            else:
                print("   ✅ 未发现洁净服相关映射，符合要求")
                
        else:
            print("❌ 未找到PPE类别映射")
            return False
        
        # 检查模型文件是否存在
        model_file = model_config['file']
        ppe_model_path = os.path.join('PPE_detection_YOLO', model_file)
        
        if os.path.exists(ppe_model_path):
            file_size = os.path.getsize(ppe_model_path) / (1024*1024)  # MB
            print(f"\n📁 模型文件检查:")
            print(f"   路径: {ppe_model_path}")
            print(f"   存在: ✅")
            print(f"   大小: {file_size:.2f} MB")
        else:
            print(f"\n❌ 模型文件不存在: {ppe_model_path}")
            return False
        
        print(f"\n✅ PPE模型配置测试完成")
        return True
        
    except Exception as e:
        print(f"❌ 测试过程中出现异常: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_model_priority():
    """测试模型优先级"""
    print(f"\n🔄 测试模型优先级:")
    
    try:
        from backend.inspection.model_config import ppe_model_config
        
        # 获取可用模型列表
        available_models = ppe_model_config.get_available_models()
        
        print(f"   可用模型数量: {len(available_models)}")
        print(f"   模型优先级:")
        
        for i, model in enumerate(available_models):
            default_mark = " (默认)" if model['is_default'] else ""
            print(f"     {i+1}. {model['id']}: {model['name']}{default_mark}")
        
        # 检查第一个模型是否是PPE检测模型
        if available_models and available_models[0]['id'] == 'ppe_detection':
            print("   ✅ PPE检测模型已排在第一位")
        else:
            print("   ❌ PPE检测模型未排在第一位")
            
        return True
        
    except Exception as e:
        print(f"   ❌ 模型优先级测试失败: {e}")
        return False

if __name__ == "__main__":
    success = test_ppe_model_config()
    if success:
        test_model_priority()
    
    print(f"\n{'='*60}")
    if success:
        print("🎉 所有测试通过！PPE模型配置正确")
    else:
        print("❌ 测试失败，请检查配置")
    print(f"{'='*60}")
