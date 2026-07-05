#!/bin/bash

echo "🚀 WYL检测法完整项目启动脚本（HTTP + 局域网访问）"
echo "===================================================="
echo "此脚本将启动Django后端和HTTP前端，支持局域网访问"
echo "注意：HTTP访问可能限制某些浏览器功能（如摄像头）"
echo ""

# 检查是否在正确的目录
if [ ! -f "package.json" ] || [ ! -d "backend" ]; then
    echo "❌ 错误：请在项目根目录运行此脚本"
    exit 1
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
pkill -f "vite" 2>/dev/null
pkill -f "nodemon" 2>/dev/null

# 检查并安装Node.js依赖
echo "📦 检查前端依赖..."
if [ ! -d "node_modules" ]; then
    echo "安装前端依赖..."
    npm install
fi

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

# 等待Django启动
echo "等待后端启动..."
sleep 5

# 启动前端（HTTP + 局域网访问）
echo "启动前端服务（HTTP + 局域网访问）..."
npm run dev:client &
FRONTEND_PID=$!

# 等待服务启动
sleep 5

echo ""
echo "✅ 完整项目启动完成（HTTP + 局域网访问）！"
echo "===================================================="
echo "🌐 本机访问地址:"
echo "   前端界面: http://localhost:3002"
echo "   后端API: http://localhost:8000/api/"
echo "   管理界面: http://localhost:8000/admin"
echo ""
echo "🌐 局域网访问地址:"
echo "   前端界面: http://$LAN_IP:3002"
echo "   后端API: http://$LAN_IP:8000/api/"
echo "   管理界面: http://$LAN_IP:8000/admin"
echo ""
echo "🔑 管理员账号: admin/admin123"
echo ""
echo "⚠️  重要提示："
echo "   - 使用HTTP访问，某些浏览器功能可能受限"
echo "   - 如果摄像头功能有问题，请使用HTTPS版本"
echo "   - 本版本主要用于快速测试和开发"
echo ""
echo "按 Ctrl+C 停止所有服务"

# 等待用户中断
wait
