#!/usr/bin/env python3
"""
测试模型切换修复的脚本
验证模型切换后是否能持久化保存，重启后不会自动变回滤芯检测模型
"""

import os
import sys
import django
import requests
import time
import json

# 添加Django项目路径
sys.path.append('/Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django/backend')

# 设置Django环境
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from inspection.models import ModelConfig
from inspection.model_config import ppe_model_config

def test_model_switch_persistence():
    """测试模型切换的持久化功能"""
    print("🧪 开始测试模型切换持久化功能...")
    
    # 1. 测试获取当前模型
    print("\n1. 获取当前模型配置...")
    current_model = ppe_model_config.get_default_model()
    print(f"   当前模型: {current_model}")
    
    # 2. 测试切换到不同模型
    print("\n2. 测试模型切换...")
    available_models = ppe_model_config.get_available_models()
    print(f"   可用模型: {[m['id'] for m in available_models]}")
    
    # 选择一个不同的模型进行切换测试
    target_model = None
    for model in available_models:
        if model['id'] != current_model and model['exists']:
            target_model = model['id']
            break
    
    if not target_model:
        print("   ❌ 没有找到可切换的模型")
        return False
    
    print(f"   切换到模型: {target_model}")
    
    # 3. 执行模型切换
    success = ppe_model_config.set_default_model(target_model)
    if not success:
        print("   ❌ 模型切换失败")
        return False
    
    print("   ✅ 模型切换成功")
    
    # 4. 验证数据库中的配置
    print("\n3. 验证数据库配置...")
    try:
        db_model = ModelConfig.get_current_model('PPE_YOLO')
        print(f"   数据库中的模型: {db_model}")
        
        if db_model == target_model:
            print("   ✅ 数据库配置正确")
        else:
            print("   ❌ 数据库配置不正确")
            return False
    except Exception as e:
        print(f"   ❌ 数据库验证失败: {e}")
        return False
    
    # 5. 验证内存中的配置
    print("\n4. 验证内存配置...")
    memory_model = ppe_model_config.get_default_model()
    print(f"   内存中的模型: {memory_model}")
    
    if memory_model == target_model:
        print("   ✅ 内存配置正确")
    else:
        print("   ❌ 内存配置不正确")
        return False
    
    # 6. 测试重启后的持久化
    print("\n5. 测试重启后的持久化...")
    print("   模拟重启：重新创建配置对象...")
    
    # 重新创建配置对象（模拟重启）
    from inspection.model_config import PPEModelConfig
    new_config = PPEModelConfig()
    
    # 检查重启后是否能正确读取配置
    restart_model = new_config.get_default_model()
    print(f"   重启后的模型: {restart_model}")
    
    if restart_model == target_model:
        print("   ✅ 重启后配置持久化成功")
        return True
    else:
        print("   ❌ 重启后配置丢失")
        return False

def test_api_model_switch():
    """测试API模型切换功能"""
    print("\n🌐 测试API模型切换功能...")
    
    base_url = "http://localhost:8000/api"
    
    try:
        # 1. 获取可用模型列表
        print("\n1. 获取可用模型列表...")
        response = requests.get(f"{base_url}/results/available-models/")
        if response.status_code != 200:
            print(f"   ❌ 获取模型列表失败: {response.status_code}")
            return False
        
        data = response.json()
        models = data.get('models', [])
        current_model = data.get('current_model', '')
        
        print(f"   当前模型: {current_model}")
        print(f"   可用模型数量: {len(models)}")
        
        # 2. 选择一个不同的模型进行切换
        target_model = None
        for model in models:
            if model['id'] != current_model and model['exists']:
                target_model = model['id']
                break
        
        if not target_model:
            print("   ❌ 没有找到可切换的模型")
            return False
        
        print(f"   切换到模型: {target_model}")
        
        # 3. 执行模型切换
        print("\n2. 执行模型切换...")
        switch_data = {"model_id": target_model}
        response = requests.post(
            f"{base_url}/results/switch-model/",
            json=switch_data,
            headers={'Content-Type': 'application/json'}
        )
        
        if response.status_code != 200:
            print(f"   ❌ 模型切换失败: {response.status_code}")
            print(f"   响应: {response.text}")
            return False
        
        result = response.json()
        print(f"   ✅ 模型切换成功: {result.get('message', '')}")
        print(f"   当前模型: {result.get('current_model', '')}")
        
        # 4. 验证切换结果
        print("\n3. 验证切换结果...")
        response = requests.get(f"{base_url}/results/available-models/")
        if response.status_code != 200:
            print(f"   ❌ 验证失败: {response.status_code}")
            return False
        
        data = response.json()
        new_current_model = data.get('current_model', '')
        
        if new_current_model == target_model:
            print("   ✅ API模型切换验证成功")
            return True
        else:
            print(f"   ❌ API模型切换验证失败: 期望 {target_model}, 实际 {new_current_model}")
            return False
            
    except requests.exceptions.ConnectionError:
        print("   ⚠️  无法连接到后端服务，请确保Django服务正在运行")
        return False
    except Exception as e:
        print(f"   ❌ API测试失败: {e}")
        return False

def main():
    """主测试函数"""
    print("🚀 模型切换持久化修复测试")
    print("=" * 50)
    
    # 测试1: 模型切换持久化
    test1_result = test_model_switch_persistence()
    
    # 测试2: API模型切换
    test2_result = test_api_model_switch()
    
    # 总结
    print("\n" + "=" * 50)
    print("📊 测试结果总结:")
    print(f"   模型切换持久化: {'✅ 通过' if test1_result else '❌ 失败'}")
    print(f"   API模型切换: {'✅ 通过' if test2_result else '❌ 失败'}")
    
    if test1_result and test2_result:
        print("\n🎉 所有测试通过！模型切换持久化修复成功！")
        return True
    else:
        print("\n⚠️  部分测试失败，需要进一步检查")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
