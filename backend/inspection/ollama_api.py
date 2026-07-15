# Ollama服务管理API
import subprocess
import psutil
import requests
import time
import os
from urllib.parse import urlsplit
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
import json


def normalize_ollama_host(host):
    """Return one canonical Ollama origin, rejecting paths and ambiguous URLs."""
    if not isinstance(host, str) or not host.strip():
        raise ValueError('Ollama 服务地址不能为空')

    parsed = urlsplit(host.strip())
    if parsed.scheme not in {'http', 'https'} or not parsed.hostname:
        raise ValueError('Ollama 服务地址必须是 http:// 或 https:// 开头的主机地址')
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError('Ollama 服务地址不能包含账号、查询参数或片段')
    if parsed.path not in {'', '/'}:
        raise ValueError('Ollama 服务地址不能包含路径')

    try:
        port = parsed.port
    except ValueError as exc:
        raise ValueError('Ollama 服务端口无效') from exc
    if port is not None and not 1 <= port <= 65535:
        raise ValueError('Ollama 服务端口无效')

    hostname = parsed.hostname.lower()
    # urlsplit removes IPv6 brackets; add them back when rebuilding the origin.
    if ':' in hostname and not hostname.startswith('['):
        hostname = f'[{hostname}]'
    return f'{parsed.scheme}://{hostname}{f":{port}" if port is not None else ""}'


OLLAMA_HOST = normalize_ollama_host(os.environ.get('OLLAMA_HOST', 'http://localhost:11434'))


def get_allowed_ollama_hosts():
    """Read explicitly trusted remote Ollama origins from the deployment environment."""
    configured_hosts = os.environ.get('OLLAMA_ALLOWED_HOSTS', '')
    allowed_hosts = {OLLAMA_HOST}
    for configured_host in configured_hosts.split(','):
        if configured_host.strip():
            allowed_hosts.add(normalize_ollama_host(configured_host))
    return frozenset(allowed_hosts)


OLLAMA_ALLOWED_HOSTS = get_allowed_ollama_hosts()


def resolve_ollama_host(requested_host):
    """Only let callers select an origin explicitly approved by the operator."""
    if requested_host is None or not str(requested_host).strip():
        return OLLAMA_HOST

    normalized_host = normalize_ollama_host(str(requested_host))
    if normalized_host not in OLLAMA_ALLOWED_HOSTS:
        raise ValueError('该 Ollama 服务地址未获服务器授权')
    return normalized_host

@csrf_exempt
@require_http_methods(["POST"])
def start_ollama_service(request):
    """启动Ollama服务"""
    try:
        # 检查Ollama是否已安装
        try:
            result = subprocess.run(['ollama', '--version'], capture_output=True, text=True, timeout=10)
            if result.returncode != 0:
                return JsonResponse({
                    'success': False,
                    'message': 'Ollama未安装或安装不正确'
                }, status=400)
        except (subprocess.TimeoutExpired, FileNotFoundError):
            return JsonResponse({
                'success': False,
                'message': 'Ollama未安装，请先安装Ollama'
            }, status=400)
        
        # 检查Ollama服务是否已在运行
        try:
            response = requests.get(f'{OLLAMA_HOST}/api/tags', timeout=5, allow_redirects=False)
            if response.status_code == 200:
                return JsonResponse({
                    'success': True,
                    'message': 'Ollama服务已在运行',
                    'status': 'running'
                })
        except requests.exceptions.RequestException:
            pass
        
        # 启动Ollama服务
        try:
            # 使用nohup在后台启动Ollama服务
            process = subprocess.Popen(
                ['nohup', 'ollama', 'serve'],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                preexec_fn=os.setsid if hasattr(os, 'setsid') else None
            )
            
            # 等待服务启动
            for i in range(30):  # 最多等待30秒
                time.sleep(1)
                try:
                    response = requests.get(f'{OLLAMA_HOST}/api/tags', timeout=2, allow_redirects=False)
                    if response.status_code == 200:
                        return JsonResponse({
                            'success': True,
                            'message': 'Ollama服务启动成功',
                            'status': 'started',
                            'pid': process.pid
                        })
                except requests.exceptions.RequestException:
                    continue
            
            return JsonResponse({
                'success': False,
                'message': 'Ollama服务启动超时'
            }, status=500)
            
        except Exception as e:
            return JsonResponse({
                'success': False,
                'message': f'启动Ollama服务失败: {str(e)}'
            }, status=500)
            
    except Exception as e:
        return JsonResponse({
            'success': False,
            'message': f'启动失败: {str(e)}'
        }, status=500)

@csrf_exempt
@require_http_methods(["POST"])
def stop_ollama_service(request):
    """停止Ollama服务"""
    try:
        # 查找Ollama进程
        ollama_processes = []
        for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
            try:
                if proc.info['name'] == 'ollama' and 'serve' in ' '.join(proc.info['cmdline'] or []):
                    ollama_processes.append(proc)
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue
        
        if not ollama_processes:
            return JsonResponse({
                'success': True,
                'message': 'Ollama服务未运行'
            })
        
        # 终止Ollama进程
        for proc in ollama_processes:
            try:
                proc.terminate()
                proc.wait(timeout=5)
            except (psutil.NoSuchProcess, psutil.TimeoutExpired):
                try:
                    proc.kill()
                except psutil.NoSuchProcess:
                    pass
        
        return JsonResponse({
            'success': True,
            'message': 'Ollama服务已停止'
        })
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'message': f'停止失败: {str(e)}'
        }, status=500)

@require_http_methods(["GET"])
def ollama_service_status(request):
    """获取Ollama服务状态"""
    try:
        # 远程 Ollama 必须由 OLLAMA_ALLOWED_HOSTS 显式授权，避免把本服务变成 SSRF 代理。
        host_url = resolve_ollama_host(request.GET.get('ollama_host'))

        # 检查Ollama服务是否运行
        try:
            response = requests.get(f'{host_url}/api/tags', timeout=5, allow_redirects=False)
            if response.status_code == 200:
                data = response.json()
                models = data.get('models', [])
                
                return JsonResponse({
                    'success': True,
                    'status': 'running',
                    'models': models,
                    'message': f'服务运行正常，发现{len(models)}个模型'
                })
            else:
                return JsonResponse({
                    'success': False,
                    'status': 'error',
                    'message': '服务响应异常'
                })
        except requests.exceptions.RequestException:
            return JsonResponse({
                'success': False,
                'status': 'stopped',
                'message': '服务未运行'
            })
            
    except ValueError as e:
        return JsonResponse({
            'success': False,
            'status': 'forbidden',
            'message': str(e)
        }, status=400)
    except Exception as e:
        return JsonResponse({
            'success': False,
            'status': 'error',
            'message': f'检查状态失败: {str(e)}'
        }, status=500)

@csrf_exempt
@require_http_methods(["POST"])
def ollama_chat(request):
    """Ollama聊天API代理"""
    try:
        # 获取请求数据
        data = json.loads(request.body)
        
        # 远程 Ollama 必须由 OLLAMA_ALLOWED_HOSTS 显式授权，避免把本服务变成 SSRF 代理。
        host_url = resolve_ollama_host(data.get('ollama_host'))
        ollama_url = f'{host_url}/api/chat'

        # 移除请求负载中的自定义字段再转交给 Ollama
        if 'ollama_host' in data:
            del data['ollama_host']
        
        response = requests.post(
            ollama_url,
            json=data,
            timeout=600,  # 与前端/生产代理的10分钟上限保持一致
            headers={'Content-Type': 'application/json'},
            allow_redirects=False
        )
        
        if response.status_code == 200:
            return JsonResponse(response.json())
        else:
            return JsonResponse({
                'error': f'Ollama API错误: {response.status_code}',
                'message': response.text
            }, status=response.status_code)
            
    except ValueError as e:
        return JsonResponse({
            'error': 'Ollama 服务地址未获授权',
            'message': str(e)
        }, status=400)
    except requests.exceptions.Timeout:
        return JsonResponse({
            'error': 'Ollama API超时',
            'message': '请求超时，请稍后重试'
        }, status=408)
    except requests.exceptions.ConnectionError:
        return JsonResponse({
            'error': 'Ollama服务连接失败',
            'message': '无法连接到Ollama服务，请检查服务是否运行'
        }, status=503)
    except json.JSONDecodeError:
        return JsonResponse({
            'error': '请求数据格式错误',
            'message': '请检查请求数据格式'
        }, status=400)
    except Exception as e:
        return JsonResponse({
            'error': '服务器内部错误',
            'message': f'处理请求失败: {str(e)}'
        }, status=500)
