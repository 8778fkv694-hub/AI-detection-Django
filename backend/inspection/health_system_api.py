"""
健康系统集成API模块
用于发送洁净用品检测报告到健康系统
"""

import json
import time
import os
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone


@csrf_exempt
def send_report_to_health_system(request):
    """
    发送洁净用品检测报告到健康系统
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    
    try:
        data = json.loads(request.body)
        
        # 验证必要字段
        required_fields = ['reportInfo', 'statistics', 'details']
        for field in required_fields:
            if field not in data:
                return JsonResponse({'error': f'Missing required field: {field}'}, status=400)
        
        report_info = data['reportInfo']
        statistics = data['statistics']
        details = data['details']
        
        # 验证报告信息
        if not report_info.get('location'):
            return JsonResponse({'error': '检查地点不能为空'}, status=400)
        
        # 生成报告记录
        report_record = {
            'report_id': f"PPE_{int(timezone.now().timestamp())}",
            'title': report_info.get('title', '洁净用品穿戴检查记录'),
            'location': report_info['location'],
            'start_time': report_info.get('startTime'),
            'end_time': report_info.get('endTime'),
            'description': report_info.get('description', ''),
            'generated_at': report_info.get('generatedAt'),
            'generated_by': report_info.get('generatedBy', 'AI检测系统'),
            'statistics': statistics,
            'total_records': len(details),
            'status': 'pending'  # pending, sent, failed
        }
        
        # 调用真实健康系统的API
        health_system_response = send_to_real_health_system(report_record)
        
        if health_system_response['success']:
            # 记录发送成功的日志
            print(f"报告发送成功: {report_record['report_id']}")
            print(f"健康系统记录ID: {health_system_response.get('recordId', 'N/A')}")
            
            return JsonResponse({
                'success': True,
                'message': '报告发送成功',
                'reportId': report_record['report_id'],
                'recordId': health_system_response.get('recordId'),
                'timestamp': timezone.now().isoformat()
            })
        else:
            return JsonResponse({
                'success': False,
                'error': health_system_response.get('error', '发送失败'),
                'timestamp': timezone.now().isoformat()
            }, status=500)
            
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON data'}, status=400)
    except Exception as e:
        print(f"发送报告到健康系统失败: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': f'发送失败: {str(e)}',
            'timestamp': timezone.now().isoformat()
        }, status=500)


def simulate_health_system_api(report_record):
    """
    模拟健康系统API调用
    在实际部署时，这里应该替换为真实的健康系统API调用
    """
    try:
        # 模拟API调用延迟
        time.sleep(1)
        
        # 模拟健康系统响应
        # 在实际实现中，这里应该是真实的HTTP请求到健康系统
        health_system_url = "https://health-system.example.com/api/ppe-reports"
        
        # 构造发送到健康系统的数据格式
        health_system_data = {
            'reportType': 'PPE_INSPECTION',
            'title': report_record['title'],
            'location': report_record['location'],
            'inspectionPeriod': {
                'startTime': report_record['start_time'],
                'endTime': report_record['end_time']
            },
            'summary': {
                'totalInspections': report_record['statistics']['totalInspections'],
                'qualifiedCount': report_record['statistics']['qualifiedCount'],
                'unqualifiedCount': report_record['statistics']['unqualifiedCount'],
                'qualifiedRate': report_record['statistics']['qualifiedRate']
            },
            'description': report_record['description'],
            'generatedBy': report_record['generated_by'],
            'generatedAt': report_record['generated_at']
        }
        
        # 在实际实现中，使用requests库发送HTTP请求
        # import requests
        # response = requests.post(health_system_url, json=health_system_data, timeout=30)
        # if response.status_code == 200:
        #     return {'success': True, 'recordId': response.json().get('id')}
        # else:
        #     return {'success': False, 'error': f'健康系统返回错误: {response.status_code}'}
        
        # 模拟成功响应
        return {
            'success': True,
            'recordId': f"HS_{int(timezone.now().timestamp())}",
            'message': '报告已成功发送到健康系统'
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': f'健康系统API调用失败: {str(e)}'
        }


@csrf_exempt
def get_health_system_config(request):
    """
    获取和保存健康系统配置信息
    支持动态发现局域网中的健康系统
    """
    if request.method == 'GET':
        # 获取配置
        try:
            # 尝试发现健康系统
            health_system_ip = discover_health_system()
            
            if health_system_ip:
                api_url = f'http://{health_system_ip}:4003'
                status = 'connected'
                message = f'已连接到健康系统: {health_system_ip}:4003'
            else:
                api_url = 'http://localhost:4003'  # 默认值
                status = 'disconnected'
                message = '未发现健康系统，将使用默认配置'
            
            # 健康系统配置
            config = {
                'enabled': True,
                'apiUrl': api_url,
                'endpoints': {
                    'ppeReports': '/api/ppe-reports',
                    'status': '/api/status'
                },
                'authentication': {
                    'type': 'bearer_token',
                    'token': 'test_token_123'
                },
                'timeout': 30,
                'retryAttempts': 3,
                'discovery': {
                    'enabled': True,
                    'status': status,
                    'message': message
                }
            }
            
            return JsonResponse({
                'success': True,
                'config': config,
                'timestamp': timezone.now().isoformat()
            })
            
        except Exception as e:
            return JsonResponse({
                'success': False,
                'error': str(e),
                'timestamp': timezone.now().isoformat()
            }, status=500)
    
    elif request.method == 'POST':
        # 保存配置
        try:
            data = json.loads(request.body)
            print(f"收到配置保存请求: {data}")
            
            # 保存配置到文件
            config_file = os.path.join(os.path.dirname(__file__), '../../health_system_config.json')
            
            with open(config_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            
            print(f"配置已保存到: {config_file}")
            
            return JsonResponse({
                'success': True,
                'message': '配置保存成功',
                'timestamp': timezone.now().isoformat()
            })
            
        except json.JSONDecodeError:
            return JsonResponse({'error': 'Invalid JSON data'}, status=400)
        except Exception as e:
            print(f"保存配置失败: {str(e)}")
            return JsonResponse({
                'success': False,
                'error': f'保存配置失败: {str(e)}',
                'timestamp': timezone.now().isoformat()
            }, status=500)
    
    else:
        return JsonResponse({'error': 'Method not allowed'}, status=405)


@csrf_exempt
def scan_health_system(request):
    """
    扫描局域网中的健康系统
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    
    try:
        # 调用发现函数
        found_ips = []
        
        # 获取本机IP地址段
        import socket
        hostname = socket.gethostname()
        local_ip = socket.gethostbyname(hostname)
        ip_parts = local_ip.split('.')
        network_base = '.'.join(ip_parts[:3])
        
        print(f"扫描网络 {network_base}.x:4003 寻找健康系统...")
        
        def check_ip(ip):
            try:
                import requests
                url = f"http://{ip}:4003/api/status"
                response = requests.get(url, timeout=2)
                if response.status_code == 200:
                    print(f"✅ 发现健康系统: {ip}:4003")
                    return ip
            except:
                pass
            return None
        
        # 并发扫描IP地址
        from concurrent.futures import ThreadPoolExecutor, as_completed
        
        with ThreadPoolExecutor(max_workers=50) as executor:
            futures = []
            for i in range(1, 255):
                ip = f"{network_base}.{i}"
                futures.append(executor.submit(check_ip, ip))
            
            for future in as_completed(futures):
                result = future.result()
                if result:
                    found_ips.append(result)
        
        return JsonResponse({
            'success': True,
            'found_ips': found_ips,
            'network_base': network_base,
            'message': f'扫描完成，发现 {len(found_ips)} 个健康系统',
            'timestamp': timezone.now().isoformat()
        })
        
    except Exception as e:
        print(f"扫描健康系统失败: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': f'扫描失败: {str(e)}',
            'timestamp': timezone.now().isoformat()
        }, status=500)


def load_health_system_config():
    """
    加载健康系统配置文件
    """
    import json
    import os
    
    config_file = os.path.join(os.path.dirname(__file__), '../../health_system_config.json')
    
    try:
        with open(config_file, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        # 返回默认配置
        return {
            "health_system": {
                "enabled": True,
                "discovery": {"enabled": True, "timeout": 2, "max_workers": 50},
                "manual_config": {"enabled": False, "ip_address": "", "port": 4003},
                "endpoints": {"ppeReports": "/api/ppe-reports", "status": "/api/status"},
                "authentication": {"type": "bearer_token", "token": "test_token_123"},
                "timeout": 30,
                "retryAttempts": 3
            }
        }


def discover_health_system():
    """
    自动发现局域网中的健康系统
    支持手动配置和自动发现两种模式
    """
    import requests
    import socket
    from concurrent.futures import ThreadPoolExecutor, as_completed
    
    # 加载配置
    config = load_health_system_config()
    health_config = config.get('health_system', {})
    
    # 检查是否启用手动配置
    manual_config = health_config.get('manual_config', {})
    if manual_config.get('enabled', False) and manual_config.get('ip_address'):
        manual_ip = manual_config['ip_address']
        manual_port = manual_config.get('port', 4003)
        print(f"使用手动配置的健康系统: {manual_ip}:{manual_port}")
        
        try:
            url = f"http://{manual_ip}:{manual_port}/api/status"
            response = requests.get(url, timeout=health_config.get('timeout', 30))
            if response.status_code == 200:
                print(f"✅ 手动配置的健康系统连接成功: {manual_ip}:{manual_port}")
                return manual_ip
        except Exception as e:
            print(f"❌ 手动配置的健康系统连接失败: {e}")
    
    # 自动发现模式
    discovery_config = health_config.get('discovery', {})
    if not discovery_config.get('enabled', True):
        return None
    
    # 获取本机IP地址段
    hostname = socket.gethostname()
    local_ip = socket.gethostbyname(hostname)
    ip_parts = local_ip.split('.')
    network_base = '.'.join(ip_parts[:3])  # 例如: 192.168.1
    
    print(f"正在扫描网络 {network_base}.x:4003 寻找健康系统...")
    
    def check_ip(ip):
        try:
            url = f"http://{ip}:4003/api/status"
            response = requests.get(url, timeout=discovery_config.get('timeout', 2))
            if response.status_code == 200:
                print(f"✅ 发现健康系统: {ip}:4003")
                return ip
        except:
            pass
        return None
    
    # 并发扫描IP地址
    found_ips = []
    max_workers = discovery_config.get('max_workers', 50)
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = []
        for i in range(1, 255):  # 扫描1-254
            ip = f"{network_base}.{i}"
            futures.append(executor.submit(check_ip, ip))
        
        for future in as_completed(futures):
            result = future.result()
            if result:
                found_ips.append(result)
    
    return found_ips[0] if found_ips else None


def send_to_real_health_system(report_record):
    """
    发送到真实健康系统的函数
    优先使用已保存的配置，如果没有则自动发现
    """
    try:
        import requests
        
        # 首先尝试从配置文件获取健康系统IP
        config = load_health_system_config()
        health_config = config.get('health_system', {})
        health_system_ip = None
        
        # 检查是否有手动配置的IP
        manual_config = health_config.get('manual_config', {})
        if manual_config.get('enabled', False) and manual_config.get('ip_address'):
            health_system_ip = manual_config['ip_address']
            print(f"使用手动配置的健康系统IP: {health_system_ip}")
        else:
            # 如果没有手动配置，尝试自动发现
            print("未找到手动配置，尝试自动发现健康系统...")
            health_system_ip = discover_health_system()
        
        if not health_system_ip:
            return {
                'success': False,
                'error': '无法在局域网中发现健康系统，请检查健康系统是否运行在端口4003，或使用手动配置'
            }
        
        # 测试健康系统连接
        try:
            test_url = f"http://{health_system_ip}:4003/api/status"
            test_response = requests.get(test_url, timeout=5)
            if test_response.status_code != 200:
                return {
                    'success': False,
                    'error': f'健康系统连接失败: {health_system_ip}:4003 (状态码: {test_response.status_code})'
                }
        except requests.exceptions.ConnectionError:
            return {
                'success': False,
                'error': f'无法连接到健康系统: {health_system_ip}:4003，请检查网络连接和健康系统状态'
            }
        except requests.exceptions.Timeout:
            return {
                'success': False,
                'error': f'连接健康系统超时: {health_system_ip}:4003，请检查网络连接'
            }
        except Exception as e:
            return {
                'success': False,
                'error': f'健康系统连接测试失败: {str(e)}'
            }
        
        # 健康系统配置
        config = {
            'apiUrl': f'http://{health_system_ip}:4003',
            'endpoints': {
                'ppeReports': '/api/ppe-reports'
            },
            'authentication': {
                'type': 'bearer_token',
                'token': 'test_token_123'
            },
            'timeout': 30
        }
        
        # 构造发送到健康系统的数据格式
        health_system_data = {
            'reportType': 'PPE_INSPECTION',
            'title': report_record['title'],
            'location': report_record['location'],
            'inspectionPeriod': {
                'startTime': report_record['start_time'],
                'endTime': report_record['end_time']
            },
            'summary': {
                'totalInspections': report_record['statistics']['totalInspections'],
                'qualifiedCount': report_record['statistics']['qualifiedCount'],
                'unqualifiedCount': report_record['statistics']['unqualifiedCount'],
                'qualifiedRate': report_record['statistics']['qualifiedRate']
            },
            'description': report_record['description'],
            'generatedBy': report_record['generated_by'],
            'generatedAt': report_record['generated_at']
        }
        
        # 构造请求头
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f"Bearer {config['authentication']['token']}",
            'User-Agent': 'AI-Detection-System/1.0'
        }
        
        # 发送请求
        url = f"{config['apiUrl']}{config['endpoints']['ppeReports']}"
        print(f"发送报告到健康系统: {url}")
        print(f"请求数据: {health_system_data}")
        
        response = requests.post(
            url, 
            json=health_system_data, 
            headers=headers, 
            timeout=config['timeout']
        )
        
        print(f"健康系统响应状态码: {response.status_code}")
        print(f"健康系统响应内容: {response.text}")
        
        if response.status_code == 200:
            result = response.json()
            return {
                'success': True,
                'recordId': result.get('id'),
                'message': '报告已成功发送到健康系统'
            }
        else:
            return {
                'success': False,
                'error': f'健康系统返回错误: {response.status_code} - {response.text}'
            }
            
    except requests.exceptions.Timeout:
        return {
            'success': False,
            'error': '请求超时，请检查网络连接'
        }
    except requests.exceptions.ConnectionError:
        return {
            'success': False,
            'error': '无法连接到健康系统，请检查网络配置'
        }
    except Exception as e:
        return {
            'success': False,
            'error': f'发送失败: {str(e)}'
        }
