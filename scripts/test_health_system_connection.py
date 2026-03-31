#!/usr/bin/env python3
"""
健康系统连接测试脚本
用于验证AI检测系统与健康系统的连接
"""

import requests
import json
from datetime import datetime

def test_health_system_connection():
    """测试健康系统连接"""
    
    # 健康系统配置
    config = {
        'apiUrl': 'http://localhost:4003',
        'endpoints': {
            'ppeReports': '/api/ppe-reports',
            'status': '/api/status'
        },
        'authentication': {
            'type': 'bearer_token',
            'token': 'test_token_123'
        },
        'timeout': 30
    }
    
    print("🔍 开始测试健康系统连接...")
    print(f"健康系统地址: {config['apiUrl']}")
    print(f"认证Token: {config['authentication']['token']}")
    print("-" * 50)
    
    # 1. 测试基本连接
    print("1️⃣ 测试基本连接...")
    try:
        response = requests.get(f"{config['apiUrl']}{config['endpoints']['status']}", timeout=10)
        if response.status_code == 200:
            print("✅ 基本连接正常")
            print(f"   响应: {response.json()}")
        else:
            print(f"❌ 基本连接失败: {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print("❌ 无法连接到健康系统，请检查:")
        print("   - 健康系统是否运行在 http://localhost:4003")
        print("   - 网络连接是否正常")
        return False
    except Exception as e:
        print(f"❌ 连接测试失败: {e}")
        return False
    
    # 2. 测试认证
    print("\n2️⃣ 测试认证...")
    try:
        headers = {
            'Authorization': f"Bearer {config['authentication']['token']}",
            'Content-Type': 'application/json'
        }
        response = requests.get(f"{config['apiUrl']}{config['endpoints']['ppeReports']}", headers=headers, timeout=10)
        if response.status_code == 200:
            print("✅ 认证成功")
        else:
            print(f"❌ 认证失败: {response.status_code}")
            print(f"   响应: {response.text}")
            return False
    except Exception as e:
        print(f"❌ 认证测试失败: {e}")
        return False
    
    # 3. 测试报告发送
    print("\n3️⃣ 测试报告发送...")
    try:
        # 构造测试数据
        test_data = {
            'reportType': 'PPE_INSPECTION',
            'title': '连接测试报告',
            'location': '测试地点',
            'inspectionPeriod': {
                'startTime': '2025-01-01T00:00:00Z',
                'endTime': '2025-01-01T23:59:59Z'
            },
            'summary': {
                'totalInspections': 10,
                'qualifiedCount': 9,
                'unqualifiedCount': 1,
                'qualifiedRate': 90.0
            },
            'description': '这是一个连接测试报告',
            'generatedBy': 'AI检测系统',
            'generatedAt': datetime.now().isoformat() + 'Z'
        }
        
        headers = {
            'Authorization': f"Bearer {config['authentication']['token']}",
            'Content-Type': 'application/json'
        }
        
        print(f"   发送数据: {json.dumps(test_data, indent=2, ensure_ascii=False)}")
        
        response = requests.post(
            f"{config['apiUrl']}{config['endpoints']['ppeReports']}",
            json=test_data,
            headers=headers,
            timeout=config['timeout']
        )
        
        print(f"   响应状态码: {response.status_code}")
        print(f"   响应内容: {response.text}")
        
        if response.status_code == 200:
            result = response.json()
            print("✅ 报告发送成功")
            print(f"   报告ID: {result.get('id', 'N/A')}")
            print(f"   状态: {result.get('status', 'N/A')}")
            return True
        else:
            print(f"❌ 报告发送失败: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ 报告发送测试失败: {e}")
        return False

def test_ai_detection_system():
    """测试AI检测系统的健康系统配置API"""
    
    print("\n🔍 测试AI检测系统配置...")
    print("-" * 50)
    
    try:
        # 测试AI检测系统的健康系统配置API
        response = requests.get('http://localhost:8000/api/reports/health-system-config/', timeout=10)
        
        if response.status_code == 200:
            config = response.json()
            print("✅ AI检测系统配置API正常")
            print(f"   配置: {json.dumps(config, indent=2, ensure_ascii=False)}")
            return True
        else:
            print(f"❌ AI检测系统配置API失败: {response.status_code}")
            print(f"   响应: {response.text}")
            return False
            
    except requests.exceptions.ConnectionError:
        print("❌ 无法连接到AI检测系统，请检查:")
        print("   - AI检测系统是否运行在 http://localhost:8000")
        print("   - Django服务是否正常启动")
        return False
    except Exception as e:
        print(f"❌ AI检测系统配置测试失败: {e}")
        return False

def main():
    """主函数"""
    print("🚀 AI检测系统与健康系统连接测试")
    print("=" * 60)
    
    # 测试健康系统
    health_system_ok = test_health_system_connection()
    
    # 测试AI检测系统
    ai_system_ok = test_ai_detection_system()
    
    print("\n" + "=" * 60)
    print("📊 测试结果总结:")
    print(f"   健康系统连接: {'✅ 正常' if health_system_ok else '❌ 异常'}")
    print(f"   AI检测系统配置: {'✅ 正常' if ai_system_ok else '❌ 异常'}")
    
    if health_system_ok and ai_system_ok:
        print("\n🎉 所有测试通过！AI检测系统应该能够正常发送报告到健康系统。")
        print("\n💡 建议:")
        print("   1. 重新启动AI检测系统以应用新的配置")
        print("   2. 尝试发送一个测试报告")
        print("   3. 检查健康系统是否接收到报告")
    else:
        print("\n⚠️  存在问题，请根据上述错误信息进行修复。")
        
        if not health_system_ok:
            print("\n🔧 健康系统问题排查:")
            print("   1. 确保健康系统运行在 http://localhost:4003")
            print("   2. 检查健康系统API是否正常")
            print("   3. 验证认证token是否正确")
            
        if not ai_system_ok:
            print("\n🔧 AI检测系统问题排查:")
            print("   1. 确保AI检测系统运行在 http://localhost:8000")
            print("   2. 检查Django服务是否正常")
            print("   3. 验证健康系统配置API是否正常")

if __name__ == "__main__":
    main()
