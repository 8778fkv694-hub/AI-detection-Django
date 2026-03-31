#!/bin/bash

echo "🔐 WYL检测法HTTPS后端启动脚本（支持局域网访问）"
echo "=================================================="
echo "此脚本将启动Django后端和HTTPS服务器，支持局域网内其他设备访问"
echo "前端需要在其他设备上运行"
echo ""

# 检查是否在正确的目录
if [ ! -f "package.json" ] || [ ! -d "backend" ]; then
    echo "❌ 错误：请在项目根目录运行此脚本"
    exit 1
fi

# 检查SSL证书是否存在
if [ ! -f "ssl/server.key" ] || [ ! -f "ssl/server.crt" ]; then
    echo "❌ SSL证书不存在，正在生成..."
    chmod +x ssl/generate_cert.sh
    ./ssl/generate_cert.sh
    if [ $? -ne 0 ]; then
        echo "❌ SSL证书生成失败"
        exit 1
    fi
fi

# 获取本机局域网IP地址
LAN_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1)
if [ -z "$LAN_IP" ]; then
    LAN_IP="192.168.1.100"  # 默认IP
fi

echo "🌐 检测到局域网IP: $LAN_IP"
echo ""

# 停止可能存在的进程
echo "🛑 停止现有进程..."
pkill -f "manage.py runserver" 2>/dev/null
pkill -f "https-server.js" 2>/dev/null

# 检查并设置Python环境
echo "🐍 设置Python环境..."
cd backend

# 检查虚拟环境是否存在
if [ ! -d "venv" ]; then
    echo "创建虚拟环境..."
    python3 -m venv venv
fi

# 激活虚拟环境
echo "激活虚拟环境..."
source venv/bin/activate

# 升级pip
echo "升级pip..."
pip install --upgrade pip

# 安装Python依赖
echo "安装Python依赖..."
pip install -r requirements.txt

# 运行数据库迁移
echo "运行数据库迁移..."
python manage.py migrate --noinput

# 创建超级用户（如果不存在）
echo "检查超级用户..."
python manage.py shell -c "
from django.contrib.auth.models import User
if not User.objects.filter(is_superuser=True).exists():
    User.objects.create_superuser('admin', 'admin@example.com', 'admin123')
    print('超级用户已创建: admin/admin123')
else:
    print('超级用户已存在')
"

# 启动Django后端（绑定到所有网络接口）
echo "启动Django后端（支持局域网访问）..."
python manage.py runserver 0.0.0.0:8000 &
DJANGO_PID=$!

cd ..

# 等待Django启动并检查状态
echo "等待后端启动..."
sleep 8

# 检查Django是否启动成功
if ! curl -s http://localhost:8000/api/ > /dev/null; then
    echo "❌ Django后端启动失败，请检查错误信息"
    exit 1
fi
echo "✅ Django后端启动成功"

# 启动HTTPS服务器
echo "启动HTTPS服务器..."
NODE_ENV=production node server/https-server.js &
HTTPS_PID=$!

# 等待HTTPS服务器启动并检查状态
echo "等待HTTPS服务器启动..."
sleep 5

# 检查HTTPS服务器是否启动成功
if ! curl -k -s ndan slihttps://localhost:8443/api/ > /dev/null; then
    echo "❌ HTTPS服务器启动失败，请检查错误信息"
    echo "💡 可能的原因："
    echo "   - SSL证书文件路径错误"
    echo "   - 端口8443被占用"
    echo "   - Node.js模块缺失"
    echo ""
    echo "🔧 手动启动HTTPS服务器："
    echo "   NODE_ENV=production node server/https-server.js"
    exit 1
fi
echo "✅ HTTPS服务器启动成功"

echo ""
echo "✅ HTTPS后端启动完成（支持局域网访问）！"
echo "=================================================="
echo "🌐 本机访问地址:"
echo "   后端API: http://localhost:8000/api/"
echo "   HTTPS API: https://localhost:8443/api/"
echo "   管理界面: http://localhost:8000/admin"
echo ""
echo "🌐 局域网访问地址:"
echo "   后端API: http://$LAN_IP:8000/api/"
echo "   HTTPS API: https://$LAN_IP:8443/api/"
echo "   管理界面: http://$LAN_IP:8000/admin"
echo ""
echo "🔑 管理员账号: admin/admin123"
echo ""
echo "💡 前端配置说明："
echo "   - 前端需要在其他设备上运行"
echo "   - 前端API地址应设置为: https://$LAN_IP:8443/api/"
echo "   - 确保防火墙允许端口 8000 和 8443 的访问"
echo "   - 如果无法访问，请检查网络配置和防火墙设置"
echo ""
echo "🔧 服务状态检查："
echo "   Django后端: http://localhost:8000/api/"
echo "   HTTPS服务器: https://localhost:8443/api/"
echo ""
echo "按 Ctrl+C 停止所有服务"

# 等待用户中断
wait
