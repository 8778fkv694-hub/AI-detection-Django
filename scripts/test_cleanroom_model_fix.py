#!/usr/bin/env python3
"""
测试洁净用品检测后模型不会自动切换的修复
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
from inspection.yolo import get_current_model_id

def test_cleanroom_detection_model_fix():
    """测试洁净用品检测后模型不会自动切换"""
    print("🧪 测试洁净用品检测后模型不会自动切换...")
    
    base_url = "http://localhost:8000/api"
    
    try:
        # 1. 检查当前模型
        print("\n1. 检查当前模型...")
        current_model = get_current_model_id()
        print(f"   当前模型: {current_model}")
        
        # 2. 模拟洁净用品检测请求
        print("\n2. 模拟洁净用品检测请求...")
        
        # 创建一个简单的测试图片（1x1像素的base64）
        test_image_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
        
        # 发送检测请求
        response = requests.post(
            f"{base_url}/results/yolo-detect/",
            json={
                "image": test_image_b64,
                "conf": 0.5
            },
            headers={'Content-Type': 'application/json'}
        )
        
        if response.status_code == 200:
            print("   ✅ 检测请求成功")
            result = response.json()
            print(f"   检测结果: {len(result.get('detections', []))} 个检测框")
        else:
            print(f"   ⚠️  检测请求失败: {response.status_code}")
            print(f"   响应: {response.text}")
        
        # 3. 检查检测后模型是否改变
        print("\n3. 检查检测后模型是否改变...")
        after_model = get_current_model_id()
        print(f"   检测后模型: {after_model}")
        
        if current_model == after_model:
            print("   ✅ 模型没有改变，修复成功！")
            return True
        else:
            print(f"   ❌ 模型改变了！从 {current_model} 变为 {after_model}")
            return False
            
    except requests.exceptions.ConnectionError:
        print("   ⚠️  无法连接到后端服务，请确保Django服务正在运行")
        return False
    except Exception as e:
        print(f"   ❌ 测试失败: {e}")
        return False

def test_model_switch_persistence():
    """测试模型切换的持久化"""
    print("\n🧪 测试模型切换持久化...")
    
    try:
        # 1. 切换到不同模型
        print("\n1. 切换到 yolo8x 模型...")
        from inspection.model_config import ppe_model_config
        success = ppe_model_config.set_default_model('yolo8x')
        
        if success:
            print("   ✅ 模型切换成功")
        else:
            print("   ❌ 模型切换失败")
            return False
        
        # 2. 验证切换结果
        print("\n2. 验证切换结果...")
        current_model = get_current_model_id()
        db_model = ModelConfig.get_current_model('PPE_YOLO')
        
        print(f"   内存中的模型: {current_model}")
        print(f"   数据库中的模型: {db_model}")
        
        if current_model == 'yolo8x' and db_model == 'yolo8x':
            print("   ✅ 模型切换持久化成功")
        else:
            print("   ❌ 模型切换持久化失败")
            return False
        
        # 3. 切换回 ppe_detection
        print("\n3. 切换回 ppe_detection 模型...")
        success = ppe_model_config.set_default_model('ppe_detection')
        
        if success:
            print("   ✅ 切换回 ppe_detection 成功")
        else:
            print("   ❌ 切换回 ppe_detection 失败")
            return False
        
        return True
        
    except Exception as e:
        print(f"   ❌ 测试失败: {e}")
        return False

def main():
    """主测试函数"""
    print("🚀 洁净用品检测模型切换修复测试")
    print("=" * 50)
    
    # 测试1: 洁净用品检测后模型不会自动切换
    test1_result = test_cleanroom_detection_model_fix()
    
    # 测试2: 模型切换持久化
    test2_result = test_model_switch_persistence()
    
    # 总结
    print("\n" + "=" * 50)
    print("📊 测试结果总结:")
    print(f"   洁净用品检测后模型不变: {'✅ 通过' if test1_result else '❌ 失败'}")
    print(f"   模型切换持久化: {'✅ 通过' if test2_result else '❌ 失败'}")
    
    if test1_result and test2_result:
        print("\n🎉 所有测试通过！洁净用品检测模型切换问题已修复！")
        return True
    else:
        print("\n⚠️  部分测试失败，需要进一步检查")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
