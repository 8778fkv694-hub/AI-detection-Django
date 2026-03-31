#!/usr/bin/env python3
"""
Python SPA Server for Jetson Nano Production
托管 React 构建产物并支持 SPA 路由（HTML5 History Mode）
支持 API 代理到 Django 后端

用法:
    python3 serve_spa.py [--port PORT] [--dir DIST_DIR] [--backend BACKEND_URL]

默认设置:
    端口: 3005
    目录: ./dist
    后端: http://localhost:8000
"""

import http.server
import socketserver
import os
import sys
import argparse
from urllib.parse import urlparse, urljoin
import urllib.request
import urllib.error

# 全局后端 URL
BACKEND_URL = "http://localhost:8000"

class SPAHandler(http.server.SimpleHTTPRequestHandler):
    """
    SPA 静态文件服务器处理器
    - 对于存在的静态文件，直接返回
    - 对于不存在的路径，返回 index.html（支持前端路由）
    """
    
    def __init__(self, *args, directory=None, **kwargs):
        self.spa_directory = directory or os.getcwd()
        super().__init__(*args, directory=self.spa_directory, **kwargs)
    
    def do_GET(self):
        # 解析请求路径
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        
        # API 和 media 请求代理到 Django 后端
        if path.startswith('/api/') or path.startswith('/media/'):
            return self._proxy_request('GET')
        
        # 构建完整的文件路径
        file_path = os.path.join(self.spa_directory, path.lstrip('/'))
        
        # 如果请求的是目录，尝试返回 index.html
        if os.path.isdir(file_path):
            file_path = os.path.join(file_path, 'index.html')
        
        # 如果文件存在，直接返回
        if os.path.isfile(file_path):
            return super().do_GET()
        
        # 如果文件不存在，检查是否是静态资源请求
        # 静态资源通常有文件扩展名（.js, .css, .png 等）
        _, ext = os.path.splitext(path)
        if ext and ext != '.html':
            # 静态资源不存在，返回 404
            self.send_error(404, "File not found")
            return
        
        # 对于其他请求（前端路由），返回 index.html
        self.path = '/index.html'
        return super().do_GET()
    
    def do_POST(self):
        """处理 POST 请求 - 代理到后端"""
        if self.path.startswith('/api/'):
            return self._proxy_request('POST')
        self.send_error(404, "Not Found")
    
    def do_PUT(self):
        """处理 PUT 请求 - 代理到后端"""
        if self.path.startswith('/api/'):
            return self._proxy_request('PUT')
        self.send_error(404, "Not Found")
    
    def do_DELETE(self):
        """处理 DELETE 请求 - 代理到后端"""
        if self.path.startswith('/api/'):
            return self._proxy_request('DELETE')
        self.send_error(404, "Not Found")
    
    def do_PATCH(self):
        """处理 PATCH 请求 - 代理到后端"""
        if self.path.startswith('/api/'):
            return self._proxy_request('PATCH')
        self.send_error(404, "Not Found")
    
    def _proxy_request(self, method):
        """代理请求到 Django 后端"""
        backend_url = BACKEND_URL + self.path
        
        try:
            # 读取请求体（如果有）
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length) if content_length > 0 else None
            
            # 创建代理请求
            req = urllib.request.Request(backend_url, data=body, method=method)
            
            # 复制请求头（排除 Host）
            for header, value in self.headers.items():
                if header.lower() not in ('host', 'content-length'):
                    req.add_header(header, value)
            
            # 发送请求到后端
            with urllib.request.urlopen(req, timeout=30) as response:
                # 发送响应状态
                self.send_response(response.status)
                
                # 复制响应头
                for header, value in response.getheaders():
                    if header.lower() not in ('transfer-encoding', 'connection'):
                        self.send_header(header, value)
                self.end_headers()
                
                # 发送响应体
                self.wfile.write(response.read())
                
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            for header, value in e.headers.items():
                if header.lower() not in ('transfer-encoding', 'connection'):
                    self.send_header(header, value)
            self.end_headers()
            self.wfile.write(e.read())
        except urllib.error.URLError as e:
            self.send_error(502, f"Backend unavailable: {e.reason}")
        except Exception as e:
            self.send_error(500, f"Proxy error: {str(e)}")
    
    def log_message(self, format, *args):
        """自定义日志格式"""
        print(f"[SPA Server] {self.address_string()} - {format % args}")

def run_server(port: int = 3005, directory: str = "./dist"):
    """启动 SPA 服务器"""
    # 切换到指定目录
    if not os.path.isdir(directory):
        print(f"❌ 错误: 目录 '{directory}' 不存在")
        print("请先运行 'npm run build' 构建前端项目")
        sys.exit(1)
    
    # 检查 index.html 是否存在
    index_path = os.path.join(directory, 'index.html')
    if not os.path.isfile(index_path):
        print(f"❌ 错误: '{index_path}' 不存在")
        print("请先运行 'npm run build' 构建前端项目")
        sys.exit(1)
    
    # 创建处理器
    handler = lambda *args, **kwargs: SPAHandler(*args, directory=os.path.abspath(directory), **kwargs)
    
    # 允许地址重用
    socketserver.TCPServer.allow_reuse_address = True
    
    print(f"""
╔════════════════════════════════════════════════════════╗
║       🚀 Jetson SPA Server (Production Mode)           ║
╠════════════════════════════════════════════════════════╣
║  静态目录: {directory.ljust(43)} ║
║  访问地址: http://0.0.0.0:{str(port).ljust(30)} ║
║  后端地址: http://localhost:8000/api                   ║
╠════════════════════════════════════════════════════════╣
║  按 Ctrl+C 停止服务器                                   ║
╚════════════════════════════════════════════════════════╝
""")
    
    with socketserver.TCPServer(("0.0.0.0", port), handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n👋 服务器已停止")
            sys.exit(0)

def main():
    parser = argparse.ArgumentParser(description='Python SPA Server for Jetson Nano')
    parser.add_argument('--port', '-p', type=int, default=3005, help='服务器端口 (默认: 3005)')
    parser.add_argument('--dir', '-d', type=str, default='./dist', help='静态文件目录 (默认: ./dist)')
    
    args = parser.parse_args()
    run_server(port=args.port, directory=args.dir)

if __name__ == '__main__':
    main()
