#!/usr/bin/env python3
"""
查找健康系统IP地址的脚本
"""

import requests
import socket
from concurrent.futures import ThreadPoolExecutor, as_completed

def find_health_system():
    """查找局域网中的健康系统"""
    print("🔍 查找局域网中的健康系统...")
    
    # 获取本机IP地址段
    hostname = socket.gethostname()
    local_ip = socket.gethostbyname(hostname)
    ip_parts = local_ip.split('.')
    network_base = '.'.join(ip_parts[:3])
    
    print(f"本机IP: {local_ip}")
    print(f"扫描网络: {network_base}.x:4003")
    print("-" * 50)
    
    def check_ip(ip):
        try:
            url = f"http://{ip}:4003/api/status"
            response = requests.get(url, timeout=2)
            if response.status_code == 200:
                print(f"✅ 发现健康系统: {ip}:4003")
                try:
                    data = response.json()
                    print(f"   响应数据: {data}")
                except:
                    print(f"   响应内容: {response.text}")
                return ip
        except Exception as e:
            # 静默处理连接失败
            pass
        return None
    
    # 并发扫描IP地址
    found_ips = []
    with ThreadPoolExecutor(max_workers=50) as executor:
        futures = []
        for i in range(1, 255):
            ip = f"{network_base}.{i}"
            futures.append(executor.submit(check_ip, ip))
        
        for future in as_completed(futures):
            result = future.result()
            if result:
                found_ips.append(result)
    
    print("-" * 50)
    if found_ips:
        print(f"✅ 发现 {len(found_ips)} 个健康系统:")
        for ip in found_ips:
            print(f"   - {ip}:4003")
        
        print(f"\n💡 建议配置:")
        print(f"   使用IP地址: {found_ips[0]}")
        print(f"   端口: 4003")
    else:
        print("❌ 未发现健康系统")
        print("\n💡 可能的原因:")
        print("   1. 健康系统未启动")
        print("   2. 健康系统运行在其他端口")
        print("   3. 网络连接问题")
        print("   4. 防火墙阻止连接")
        
        print(f"\n🔧 手动测试命令:")
        print(f"   curl -X GET http://[健康系统IP]:4003/api/status")

if __name__ == "__main__":
    find_health_system()

