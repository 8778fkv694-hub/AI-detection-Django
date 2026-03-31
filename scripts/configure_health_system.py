#!/usr/bin/env python3
"""
健康系统配置管理工具
用于配置局域网中的健康系统IP地址
"""

import json
import os
import sys
import requests
import socket
from concurrent.futures import ThreadPoolExecutor, as_completed

def load_config():
    """加载配置文件"""
    config_file = 'health_system_config.json'
    try:
        with open(config_file, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"❌ 配置文件 {config_file} 不存在")
        return None

def save_config(config):
    """保存配置文件"""
    config_file = 'health_system_config.json'
    try:
        with open(config_file, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        print(f"✅ 配置已保存到 {config_file}")
        return True
    except Exception as e:
        print(f"❌ 保存配置失败: {e}")
        return False

def scan_network():
    """扫描局域网中的健康系统"""
    print("🔍 正在扫描局域网中的健康系统...")
    
    # 获取本机IP地址段
    hostname = socket.gethostname()
    local_ip = socket.gethostbyname(hostname)
    ip_parts = local_ip.split('.')
    network_base = '.'.join(ip_parts[:3])
    
    print(f"扫描网络: {network_base}.x:4003")
    
    def check_ip(ip):
        try:
            url = f"http://{ip}:4003/api/status"
            response = requests.get(url, timeout=2)
            if response.status_code == 200:
                return ip
        except:
            pass
        return None
    
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
    
    return found_ips

def set_manual_ip(ip_address):
    """设置手动IP地址"""
    config = load_config()
    if not config:
        return False
    
    config['health_system']['manual_config']['enabled'] = True
    config['health_system']['manual_config']['ip_address'] = ip_address
    
    return save_config(config)

def enable_auto_discovery():
    """启用自动发现"""
    config = load_config()
    if not config:
        return False
    
    config['health_system']['manual_config']['enabled'] = False
    config['health_system']['discovery']['enabled'] = True
    
    return save_config(config)

def test_connection(ip_address):
    """测试连接"""
    try:
        url = f"http://{ip_address}:4003/api/status"
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            print(f"✅ 连接成功: {ip_address}:4003")
            return True
        else:
            print(f"❌ 连接失败: {ip_address}:4003 (状态码: {response.status_code})")
            return False
    except Exception as e:
        print(f"❌ 连接失败: {ip_address}:4003 (错误: {e})")
        return False

def main():
    """主函数"""
    print("🏥 健康系统配置管理工具")
    print("=" * 50)
    
    while True:
        print("\n请选择操作:")
        print("1. 扫描局域网中的健康系统")
        print("2. 手动设置健康系统IP地址")
        print("3. 启用自动发现模式")
        print("4. 测试连接")
        print("5. 查看当前配置")
        print("6. 退出")
        
        choice = input("\n请输入选项 (1-6): ").strip()
        
        if choice == '1':
            found_ips = scan_network()
            if found_ips:
                print(f"\n✅ 发现 {len(found_ips)} 个健康系统:")
                for i, ip in enumerate(found_ips, 1):
                    print(f"  {i}. {ip}:4003")
                
                if len(found_ips) == 1:
                    use_ip = input(f"\n是否使用 {found_ips[0]}:4003? (y/n): ").strip().lower()
                    if use_ip == 'y':
                        if set_manual_ip(found_ips[0]):
                            print("✅ 已设置为手动配置模式")
            else:
                print("❌ 未发现健康系统")
        
        elif choice == '2':
            ip = input("请输入健康系统IP地址: ").strip()
            if ip:
                if test_connection(ip):
                    if set_manual_ip(ip):
                        print("✅ 手动IP地址设置成功")
                else:
                    print("❌ 连接测试失败，请检查IP地址是否正确")
        
        elif choice == '3':
            if enable_auto_discovery():
                print("✅ 已启用自动发现模式")
        
        elif choice == '4':
            config = load_config()
            if config:
                manual_config = config['health_system']['manual_config']
                if manual_config.get('enabled') and manual_config.get('ip_address'):
                    test_connection(manual_config['ip_address'])
                else:
                    print("❌ 未设置手动IP地址，请先设置或扫描")
            else:
                print("❌ 配置文件不存在")
        
        elif choice == '5':
            config = load_config()
            if config:
                print("\n📋 当前配置:")
                health_config = config['health_system']
                print(f"  启用状态: {'✅' if health_config.get('enabled') else '❌'}")
                print(f"  自动发现: {'✅' if health_config.get('discovery', {}).get('enabled') else '❌'}")
                
                manual_config = health_config.get('manual_config', {})
                if manual_config.get('enabled'):
                    print(f"  手动配置: ✅ {manual_config.get('ip_address', 'N/A')}:{manual_config.get('port', 4003)}")
                else:
                    print("  手动配置: ❌ 未启用")
                
                print(f"  认证Token: {health_config.get('authentication', {}).get('token', 'N/A')}")
                print(f"  超时时间: {health_config.get('timeout', 30)}秒")
            else:
                print("❌ 配置文件不存在")
        
        elif choice == '6':
            print("👋 再见!")
            break
        
        else:
            print("❌ 无效选项，请重新选择")

if __name__ == "__main__":
    main()
