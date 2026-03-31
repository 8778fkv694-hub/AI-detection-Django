#!/bin/bash

# HTTPS生产环境启动脚本
# 支持局域网访问

echo "🚀 启动HTTPS生产环境..."

# 检查SSL证书
if [ ! -f "ssl/server.key" ] || [ ! -f "ssl/server.crt" ]; then
    echo "❌ SSL证书不存在，正在生成..."
    if [ -f "ssl/generate_cert.sh" ]; then
        chmod +x ssl/generate_cert.sh
        ./ssl/generate_cert.sh
    else
        echo "❌ 证书生成脚本不存在，请手动生成SSL证书"
        exit 1
    fi
fi

# 获取本机IP地址
LOCAL_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}')
echo "📍 本机IP地址: $LOCAL_IP"

# 停止现有服务
echo "🛑 停止现有服务..."
pkill -f "python.*http.server" 2>/dev/null || true
pkill -f "gunicorn" 2>/dev/null || true

# 等待端口释放
sleep 2

# 启动后端服务
echo "🔧 启动后端服务..."
cd backend
source venv/bin/activate

# 检查数据库迁移
echo "📊 检查数据库迁移..."
python manage.py migrate --noinput

# 收集静态文件
echo "📁 收集静态文件..."
python manage.py collectstatic --noinput

# 启动Django服务
echo "🚀 启动Django HTTPS服务..."
gunicorn config.wsgi:application \
    --bind 0.0.0.0:8012 \
    --workers 4 \
    --timeout 120 \
    --access-logfile ../backend.log \
    --error-logfile ../backend_error.log \
    --daemon

cd ..

# 启动前端HTTPS服务
echo "🌐 启动前端HTTPS服务..."
cd dist

# 使用Python启动HTTPS服务器
python3 -c "
import http.server
import ssl
import socketserver
import os

class HTTPSHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        super().end_headers()

PORT = 443
Handler = HTTPSHandler

with socketserver.TCPServer(('0.0.0.0', PORT), Handler) as httpd:
    # 加载SSL证书
    httpd.socket = ssl.wrap_socket(httpd.socket,
                                   certfile='../ssl/server.crt',
                                   keyfile='../ssl/server.key',
                                   server_side=True)
    print(f'🌐 HTTPS服务器启动在端口 {PORT}')
    print(f'📍 本地访问: https://localhost:{PORT}')
    hostname_ip = os.popen('hostname -I').read().strip()
    print(f'🌍 局域网访问: https://{hostname_ip}:{PORT}')
    print(f'🌍 局域网访问: https://$LOCAL_IP:{PORT}')
    print('按 Ctrl+C 停止服务')
    httpd.serve_forever()
" > ../frontend_https.log 2>&1 &

# 保存进程ID
echo $! > ../frontend_https.pid

cd ..

# 等待服务启动
echo "⏳ 等待服务启动..."
sleep 3

# 检查服务状态
echo "🔍 检查服务状态..."

# 检查后端
if curl -s -k https://localhost:8012/api/ > /dev/null 2>&1; then
    echo "✅ 后端HTTPS服务运行正常 (端口 8012)"
else
    echo "❌ 后端HTTPS服务启动失败"
fi

# 检查前端
if curl -s -k https://localhost:443/ > /dev/null 2>&1; then
    echo "✅ 前端HTTPS服务运行正常 (端口 443)"
else
    echo "❌ 前端HTTPS服务启动失败"
fi

echo ""
echo "🎉 HTTPS生产环境启动完成！"
echo ""
echo "📍 访问地址："
echo "   本地访问:"
echo "   - 前端: https://localhost:443"
echo "   - 后端API: https://localhost:8012/api/"
echo ""
echo "   🌍 局域网访问:"
echo "   - 前端: https://$LOCAL_IP:443"
echo "   - 后端API: https://$LOCAL_IP:8012/api/"
echo ""
echo "📝 日志文件："
echo "   - 后端日志: backend.log"
echo "   - 前端日志: frontend_https.log"
echo ""
echo "🛑 停止服务: ./stop_production.sh"
echo ""
echo "⚠️  注意: 由于使用自签名证书，浏览器会显示安全警告，请点击'高级'->'继续访问'"
