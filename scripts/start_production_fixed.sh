#!/bin/bash

# 修复的生产环境启动脚本
# 前端HTTP (80) + 后端HTTP (8012) + API代理

echo "🚀 启动修复的生产环境..."

# 停止现有服务
echo "🛑 停止现有服务..."
pkill -f "python.*http.server" 2>/dev/null || true
pkill -f "gunicorn" 2>/dev/null || true

# 等待端口释放
sleep 2

# 启动后端HTTP服务
echo "🔧 启动后端HTTP服务..."
cd backend
source venv/bin/activate

# 检查数据库迁移
echo "📊 检查数据库迁移..."
python manage.py migrate --noinput

# 收集静态文件
echo "📁 收集静态文件..."
python manage.py collectstatic --noinput

# 启动Django HTTP服务
echo "🚀 启动Django HTTP服务..."
gunicorn config.wsgi:application \
    --bind 0.0.0.0:8012 \
    --workers 4 \
    --timeout 120 \
    --access-logfile ../backend.log \
    --error-logfile ../backend_error.log \
    --daemon

cd ..

# 等待后端启动
echo "⏳ 等待后端启动..."
sleep 3

# 检查后端是否启动成功
if ! curl -s http://localhost:8012/api/ > /dev/null; then
    echo "❌ 后端HTTP服务启动失败"
    exit 1
fi

echo "✅ 后端HTTP服务启动成功，运行在 http://localhost:8012"

# 启动前端HTTP服务（带API代理）
echo "🌐 启动前端HTTP服务（带API代理）..."
cd dist

# 创建带API代理的HTTP服务器
python3 -c "
import http.server
import socketserver
import urllib.request
import urllib.parse
import json
import os
from urllib.error import HTTPError, URLError

class ProxyHTTPHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        if self.path.startswith('/api/'):
            self.proxy_api_request()
        else:
            super().do_GET()

    def do_POST(self):
        if self.path.startswith('/api/'):
            self.proxy_api_request()
        else:
            super().do_POST()

    def do_PUT(self):
        if self.path.startswith('/api/'):
            self.proxy_api_request()
        else:
            super().do_PUT()

    def do_DELETE(self):
        if self.path.startswith('/api/'):
            self.proxy_api_request()
        else:
            super().do_DELETE()

    def proxy_api_request(self):
        try:
            # 构建后端API URL
            backend_url = f'http://localhost:8012{self.path}'
            print(f'代理请求: {self.path} -> {backend_url}')
            
            # 读取请求体
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = None
            if content_length > 0:
                post_data = self.rfile.read(content_length)
            
            # 创建请求
            req = urllib.request.Request(backend_url, data=post_data)
            
            # 复制请求头
            for header, value in self.headers.items():
                if header.lower() not in ['host', 'content-length']:
                    req.add_header(header, value)
            
            # 发送请求到后端
            with urllib.request.urlopen(req, timeout=30) as response:
                # 设置响应状态码
                self.send_response(response.getcode())
                
                # 复制响应头
                for header, value in response.headers.items():
                    if header.lower() not in ['content-encoding', 'transfer-encoding']:
                        self.send_header(header, value)
                
                self.end_headers()
                
                # 复制响应体
                self.wfile.write(response.read())
                
        except HTTPError as e:
            print(f'HTTP错误: {e.code} - {e.reason}')
            self.send_response(e.code)
            self.end_headers()
            self.wfile.write(f'API Error: {e.reason}'.encode())
        except URLError as e:
            print(f'连接错误: {e.reason}')
            self.send_response(500)
            self.end_headers()
            self.wfile.write(f'Connection Error: {e.reason}'.encode())
        except Exception as e:
            print(f'服务器错误: {str(e)}')
            self.send_response(500)
            self.end_headers()
            self.wfile.write(f'Server Error: {str(e)}'.encode())

PORT = 80
Handler = ProxyHTTPHandler

with socketserver.TCPServer(('0.0.0.0', PORT), Handler) as httpd:
    print(f'🌐 HTTP服务器启动在端口 {PORT}')
    print(f'📍 本地访问: http://localhost:{PORT}')
    print(f'🔗 API代理: /api/* -> http://localhost:8012/api/*')
    print('按 Ctrl+C 停止服务')
    httpd.serve_forever()
" > ../frontend.log 2>&1 &

# 保存进程ID
echo $! > ../frontend.pid

cd ..

# 等待服务启动
echo "⏳ 等待服务启动..."
sleep 3

# 检查服务状态
echo "🔍 检查服务状态..."

# 检查后端
if curl -s http://localhost:8012/api/ > /dev/null 2>&1; then
    echo "✅ 后端HTTP服务运行正常 (端口 8012)"
else
    echo "❌ 后端HTTP服务启动失败"
fi

# 检查前端
if curl -s http://localhost:80/ > /dev/null 2>&1; then
    echo "✅ 前端HTTP服务运行正常 (端口 80)"
else
    echo "❌ 前端HTTP服务启动失败"
fi

# 测试API代理
if curl -s http://localhost:80/api/results/ppe-model-status/ > /dev/null 2>&1; then
    echo "✅ API代理工作正常"
else
    echo "❌ API代理工作异常"
fi

echo ""
echo "🎉 修复的生产环境启动完成！"
echo ""
echo "📍 访问地址："
echo "   本地访问:"
echo "   - 前端: http://localhost:80"
echo "   - 后端API: http://localhost:8012/api/"
echo ""
echo "🔗 API代理配置:"
echo "   - 前端HTTP: http://localhost:80/api/*"
echo "   - 代理到: http://localhost:8012/api/*"
echo ""
echo "📝 日志文件："
echo "   - 后端日志: backend.log"
echo "   - 前端日志: frontend.log"
echo ""
echo "🛑 停止服务: ./stop_services.sh"
echo ""
echo "💡 提示："
echo "   1. 现在模型应该能正常显示在前端界面"
echo "   2. 所有API调用都会通过前端代理到后端"
echo "   3. 支持跨域请求"
