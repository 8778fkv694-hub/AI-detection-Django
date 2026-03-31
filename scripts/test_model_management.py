#!/usr/bin/env python3
"""
测试模型管理功能
验证yolo10x模型是否能正确显示和切换
"""

import requests
import json
import time

def test_model_management():
    """测试模型管理功能"""
    base_url = "http://localhost:8000/api/results"
    
    print("🔍 测试模型管理功能...")
    print("=" * 50)
    
    # 1. 测试获取可用模型列表
    print("\n1️⃣ 测试获取可用模型列表...")
    try:
        response = requests.get(f"{base_url}/available-models/")
        if response.status_code == 200:
            data = response.json()
            print("✅ 获取模型列表成功")
            print(f"   当前模型: {data['current_model']}")
            print(f"   模型数量: {len(data['models'])}")
            
            # 显示所有模型
            for i, model in enumerate(data['models'], 1):
                print(f"   {i}. {model['name']} ({model['id']})")
                print(f"      文件: {model['file']}")
                print(f"      大小: {model['file_size'] / 1024 / 1024:.1f} MB")
                print(f"      类别数: {len(model['classes'])}")
                print(f"      可用: {model['exists']}")
                print()
        else:
            print(f"❌ 获取模型列表失败: {response.status_code}")
            print(f"   响应: {response.text}")
    except Exception as e:
        print(f"❌ 获取模型列表异常: {e}")
    
    # 2. 测试模型切换
    print("\n2️⃣ 测试模型切换...")
    models_to_test = ["yolo10x", "ppe_detection", "yolov8l"]
    
    for model_id in models_to_test:
        print(f"\n   切换到模型: {model_id}")
        try:
            response = requests.post(
                f"{base_url}/switch-model/",
                json={"model_id": model_id},
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 200:
                data = response.json()
                print(f"   ✅ 切换成功")
                print(f"      当前模型: {data['current_model']}")
                print(f"      消息: {data['message']}")
            else:
                print(f"   ❌ 切换失败: {response.status_code}")
                print(f"      响应: {response.text}")
        except Exception as e:
            print(f"   ❌ 切换异常: {e}")
        
        # 等待一下再切换下一个
        time.sleep(1)
    
    # 3. 验证最终状态
    print("\n3️⃣ 验证最终状态...")
    try:
        response = requests.get(f"{base_url}/available-models/")
        if response.status_code == 200:
            data = response.json()
            print(f"✅ 最终状态验证成功")
            print(f"   当前模型: {data['current_model']}")
            
            # 检查yolo10x模型是否存在
            yolo10x_model = next((m for m in data['models'] if m['id'] == 'yolo10x'), None)
            if yolo10x_model:
                print(f"   yolo10x模型状态:")
                print(f"     名称: {yolo10x_model['name']}")
                print(f"     文件: {yolo10x_model['file']}")
                print(f"     可用: {yolo10x_model['exists']}")
                print(f"     类别数: {len(yolo10x_model['classes'])}")
                print(f"     支持类别: {', '.join(yolo10x_model['classes'][:5])}...")
            else:
                print("   ❌ yolo10x模型未找到")
        else:
            print(f"❌ 最终状态验证失败: {response.status_code}")
    except Exception as e:
        print(f"❌ 最终状态验证异常: {e}")
    
    print("\n" + "=" * 50)
    print("🎯 测试完成！")

if __name__ == "__main__":
    test_model_management()
