#!/usr/bin/env python3
"""
快速离线测试脚本
用于快速验证健康系统功能
"""

import requests
import json
import socket
from datetime import datetime

def quick_test():
    """快速测试"""
    print("🚀 快速离线测试")
    print("=" * 40)
    
    # 1. 检查AI检测系统
    print("1️⃣ 检查AI检测系统...")
    try:
        response = requests.get('http://localhost:8000/api/reports/health-system-config/', timeout=5)
        if response.status_code == 200:
            print("✅ AI检测系统正常")
        else:
            print("❌ AI检测系统异常")
            return
    except:
        print("❌ 无法连接到AI检测系统，请确保Django服务正在运行")
        return
    
    # 2. 扫描健康系统
    print("\n2️⃣ 扫描健康系统...")
    try:
        response = requests.post('http://localhost:8000/api/reports/scan-health-system/', timeout=10)
        if response.status_code == 200:
            data = response.json()
            found_ips = data.get('found_ips', [])
            if found_ips:
                print(f"✅ 发现健康系统: {found_ips[0]}:4003")
                health_ip = found_ips[0]
            else:
                print("❌ 未发现健康系统")
                return
        else:
            print("❌ 扫描失败")
            return
    except Exception as e:
        print(f"❌ 扫描异常: {e}")
        return
    
    # 3. 测试报告发送
    print("\n3️⃣ 测试报告发送...")
    test_report = {
        "reportInfo": {
            "title": "快速测试报告",
            "location": "测试地点",
            "startTime": "2025-01-01T00:00:00Z",
            "endTime": "2025-01-01T23:59:59Z",
            "description": "快速测试",
            "generatedAt": datetime.now().isoformat() + "Z",
            "generatedBy": "快速测试"
        },
        "statistics": {
            "totalInspections": 5,
            "qualifiedCount": 4,
            "unqualifiedCount": 1,
            "qualifiedRate": 80.0
        },
        "details": []
    }
    
    try:
        response = requests.post(
            'http://localhost:8000/api/reports/send-to-health-system/',
            json=test_report,
            headers={'Content-Type': 'application/json'},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            print("✅ 报告发送成功")
            print(f"   记录ID: {data.get('recordId', 'N/A')}")
        else:
            print("❌ 报告发送失败")
            try:
                error_data = response.json()
                print(f"   错误: {error_data.get('error', '未知')}")
            except:
                print(f"   响应: {response.text}")
    except Exception as e:
        print(f"❌ 发送异常: {e}")
    
    print("\n🎉 快速测试完成！")

if __name__ == "__main__":
    quick_test()
