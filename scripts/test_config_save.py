#!/usr/bin/env python3
"""
测试健康系统配置保存功能
"""

import requests
import json

def test_config_save():
    """测试配置保存功能"""
    print("🧪 测试健康系统配置保存功能")
    print("=" * 40)
    
    # 测试配置数据
    test_config = {
        "health_system": {
            "enabled": True,
            "discovery": {
                "enabled": False
            },
            "manual_config": {
                "enabled": True,
                "ip_address": "192.168.1.100",
                "port": 4003
            },
            "endpoints": {
                "ppeReports": "/api/ppe-reports",
                "status": "/api/status"
            },
            "authentication": {
                "type": "bearer_token",
                "token": "test_token_123"
            },
            "timeout": 30,
            "retryAttempts": 3
        }
    }
    
    try:
        # 测试保存配置
        print("1️⃣ 测试保存配置...")
        response = requests.post(
            'http://localhost:8000/api/reports/health-system-config/',
            json=test_config,
            headers={'Content-Type': 'application/json'},
            timeout=10
        )
        
        print(f"响应状态码: {response.status_code}")
        print(f"响应内容: {response.text}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                print("✅ 配置保存成功")
            else:
                print(f"❌ 配置保存失败: {data.get('error', '未知错误')}")
        else:
            print(f"❌ 配置保存失败: HTTP {response.status_code}")
            
    except Exception as e:
        print(f"❌ 测试异常: {e}")
    
    # 测试获取配置
    print("\n2️⃣ 测试获取配置...")
    try:
        response = requests.get('http://localhost:8000/api/reports/health-system-config/', timeout=10)
        
        print(f"响应状态码: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                print("✅ 配置获取成功")
                config = data.get('config', {})
                print(f"   API URL: {config.get('apiUrl', 'N/A')}")
                print(f"   发现状态: {config.get('discovery', {}).get('status', 'N/A')}")
            else:
                print(f"❌ 配置获取失败: {data.get('error', '未知错误')}")
        else:
            print(f"❌ 配置获取失败: HTTP {response.status_code}")
            
    except Exception as e:
        print(f"❌ 测试异常: {e}")

if __name__ == "__main__":
    test_config_save()

