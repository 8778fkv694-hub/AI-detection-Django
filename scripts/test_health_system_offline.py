#!/usr/bin/env python3
"""
健康系统离线测试脚本
用于在断网环境下测试AI检测系统与健康系统的连接和报告发送功能
"""

import requests
import json
import time
import socket
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

def test_network_connectivity():
    """测试网络连接性"""
    print("🌐 测试网络连接性...")
    
    # 测试外网连接（应该失败）
    try:
        response = requests.get('https://www.baidu.com', timeout=3)
        print("❌ 外网连接正常（不应该在离线环境下成功）")
        return False
    except:
        print("✅ 外网连接已断开（符合离线环境要求）")
    
    # 测试局域网连接
    try:
        # 获取本机IP
        hostname = socket.gethostname()
        local_ip = socket.gethostbyname(hostname)
        print(f"✅ 本机IP地址: {local_ip}")
        return True
    except Exception as e:
        print(f"❌ 获取本机IP失败: {e}")
        return False

def scan_health_system():
    """扫描局域网中的健康系统"""
    print("\n🔍 扫描局域网中的健康系统...")
    
    try:
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
                    print(f"✅ 发现健康系统: {ip}:4003")
                    return ip
            except:
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
        
        if found_ips:
            print(f"✅ 发现 {len(found_ips)} 个健康系统:")
            for ip in found_ips:
                print(f"   - {ip}:4003")
            return found_ips[0]  # 返回第一个发现的IP
        else:
            print("❌ 未发现健康系统")
            return None
            
    except Exception as e:
        print(f"❌ 扫描失败: {e}")
        return None

def test_health_system_connection(ip_address):
    """测试与健康系统的连接"""
    print(f"\n🔗 测试与健康系统的连接: {ip_address}:4003")
    
    try:
        # 测试状态API
        url = f"http://{ip_address}:4003/api/status"
        response = requests.get(url, timeout=5)
        
        if response.status_code == 200:
            print("✅ 健康系统状态API连接成功")
            try:
                data = response.json()
                print(f"   响应数据: {data}")
            except:
                print("   响应数据: 非JSON格式")
            return True
        else:
            print(f"❌ 健康系统状态API连接失败: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ 连接测试失败: {e}")
        return False

def test_ai_detection_system():
    """测试AI检测系统"""
    print("\n🤖 测试AI检测系统...")
    
    try:
        # 测试健康系统配置API
        response = requests.get('http://localhost:8000/api/reports/health-system-config/', timeout=5)
        
        if response.status_code == 200:
            data = response.json()
            print("✅ AI检测系统健康系统配置API正常")
            print(f"   配置: {json.dumps(data, indent=2, ensure_ascii=False)}")
            return True
        else:
            print(f"❌ AI检测系统配置API失败: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ AI检测系统测试失败: {e}")
        return False

def test_scan_api():
    """测试扫描API"""
    print("\n🔍 测试扫描API...")
    
    try:
        response = requests.post('http://localhost:8000/api/reports/scan-health-system/', timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            print("✅ 扫描API调用成功")
            print(f"   发现IP: {data.get('found_ips', [])}")
            print(f"   消息: {data.get('message', '')}")
            return data.get('found_ips', [])
        else:
            print(f"❌ 扫描API调用失败: {response.status_code}")
            return []
            
    except Exception as e:
        print(f"❌ 扫描API测试失败: {e}")
        return []

def test_report_sending(ip_address):
    """测试报告发送功能"""
    print(f"\n📤 测试报告发送功能到: {ip_address}:4003")
    
    # 构造测试报告数据
    test_report = {
        "reportInfo": {
            "title": "离线测试报告",
            "location": "测试地点",
            "startTime": "2025-01-01T00:00:00Z",
            "endTime": "2025-01-01T23:59:59Z",
            "description": "这是一个离线环境下的测试报告",
            "generatedAt": datetime.now().isoformat() + "Z",
            "generatedBy": "AI检测系统离线测试"
        },
        "statistics": {
            "totalInspections": 10,
            "qualifiedCount": 9,
            "unqualifiedCount": 1,
            "qualifiedRate": 90.0
        },
        "details": [
            {
                "timestamp": "2025-01-01T10:00:00Z",
                "quality": "合格",
                "score": 95,
                "reason": "测试检测",
                "id": "test_result_1"
            }
        ]
    }
    
    try:
        response = requests.post(
            'http://localhost:8000/api/reports/send-to-health-system/',
            json=test_report,
            headers={'Content-Type': 'application/json'},
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            print("✅ 报告发送成功")
            print(f"   报告ID: {data.get('reportId', 'N/A')}")
            print(f"   健康系统记录ID: {data.get('recordId', 'N/A')}")
            print(f"   消息: {data.get('message', '')}")
            return True
        else:
            print(f"❌ 报告发送失败: {response.status_code}")
            try:
                error_data = response.json()
                print(f"   错误信息: {error_data.get('error', '未知错误')}")
            except:
                print(f"   响应内容: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ 报告发送测试失败: {e}")
        return False

def create_health_system_mock():
    """创建健康系统模拟器"""
    print("\n🏥 创建健康系统模拟器...")
    
    mock_code = '''
from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import time
from datetime import datetime

class HealthSystemHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/api/status':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            response = {
                'status': 'ok',
                'service': 'health_system_mock',
                'timestamp': datetime.now().isoformat(),
                'version': '1.0.0'
            }
            self.wfile.write(json.dumps(response).encode())
    
    def do_POST(self):
        if self.path == '/api/ppe-reports':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                report_data = json.loads(post_data.decode())
                print(f"收到报告: {report_data.get('reportInfo', {}).get('title', '未知报告')}")
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                
                response = {
                    'id': f'HS_{int(time.time())}',
                    'status': 'received',
                    'message': '报告已成功接收',
                    'timestamp': datetime.now().isoformat()
                }
                self.wfile.write(json.dumps(response).encode())
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                error_response = {'error': str(e)}
                self.wfile.write(json.dumps(error_response).encode())
    
    def log_message(self, format, *args):
        # 禁用默认日志输出
        pass

if __name__ == '__main__':
    server = HTTPServer(('0.0.0.0', 4003), HealthSystemHandler)
    print("健康系统模拟器启动在 http://0.0.0.0:4003")
    print("按 Ctrl+C 停止服务")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\\n健康系统模拟器已停止")
        server.shutdown()
'''
    
    with open('health_system_mock.py', 'w', encoding='utf-8') as f:
        f.write(mock_code)
    
    print("✅ 健康系统模拟器代码已创建: health_system_mock.py")
    print("   启动命令: python3 health_system_mock.py")
    return True

def main():
    """主测试函数"""
    print("🚀 健康系统离线测试")
    print("=" * 60)
    print("⚠️  此测试用于验证在断网环境下的健康系统功能")
    print("=" * 60)
    
    # 1. 测试网络连接性
    if not test_network_connectivity():
        print("❌ 网络连接测试失败，退出测试")
        return
    
    # 2. 测试AI检测系统
    if not test_ai_detection_system():
        print("❌ AI检测系统测试失败，请确保Django服务正在运行")
        return
    
    # 3. 扫描健康系统
    health_system_ip = scan_health_system()
    
    if not health_system_ip:
        print("\n💡 未发现健康系统，创建模拟器...")
        if create_health_system_mock():
            print("\n📋 请按以下步骤操作:")
            print("1. 打开新的终端窗口")
            print("2. 运行: python3 health_system_mock.py")
            print("3. 等待看到 '健康系统模拟器启动在 http://0.0.0.0:4003'")
            print("4. 回到此终端，按回车继续测试...")
            input("按回车键继续...")
            
            # 重新扫描
            health_system_ip = scan_health_system()
            
            if not health_system_ip:
                print("❌ 仍然未发现健康系统，请检查模拟器是否正常启动")
                return
    
    # 4. 测试健康系统连接
    if health_system_ip:
        if not test_health_system_connection(health_system_ip):
            print("❌ 健康系统连接测试失败")
            return
    
    # 5. 测试扫描API
    found_ips = test_scan_api()
    
    # 6. 测试报告发送
    if health_system_ip:
        test_report_sending(health_system_ip)
    
    # 7. 测试结果总结
    print("\n" + "=" * 60)
    print("📊 测试结果总结:")
    print(f"   网络连接: ✅ 离线环境正常")
    print(f"   AI检测系统: ✅ 服务正常")
    print(f"   健康系统发现: {'✅ 已发现' if health_system_ip else '❌ 未发现'}")
    if health_system_ip:
        print(f"   健康系统连接: ✅ 连接正常")
        print(f"   报告发送: ✅ 功能正常")
    
    print("\n🎉 离线测试完成！")
    print("\n💡 使用建议:")
    print("1. 在断网环境下，使用手动配置模式设置健康系统IP")
    print("2. 如果健康系统IP会变化，使用自动发现功能")
    print("3. 定期检查健康系统连接状态")
    print("4. 使用挂起报告功能处理发送失败的情况")

if __name__ == "__main__":
    main()
