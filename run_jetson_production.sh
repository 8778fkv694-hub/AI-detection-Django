#!/bin/bash
#
# Jetson Nano 生产环境启动脚本
# 启动 Django 后端 (:8000) 和 Python 静态服务器 (:3001)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════╗"
echo "║     🚀 Jetson Nano 生产环境启动脚本                     ║"
echo "╚════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# 设置环境变量
export PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True
export HF_HUB_OFFLINE=1
export PYTHONUNBUFFERED=1
export VITE_BACKEND_DETECTION=true
export VITE_API_BASE_URL="http://192.168.55.1:8000/api"

# 检查 dist 目录是否存在
if [ ! -d "dist" ] || [ ! -f "dist/index.html" ]; then
    echo -e "${YELLOW}⚠️  未找到 dist 目录，正在构建前端...${NC}"
    npm run build
fi

# 停止可能存在的旧进程
echo -e "${YELLOW}正在停止旧进程...${NC}"
pkill -f "manage.py runserver" 2>/dev/null || true
pkill -f "serve_spa.py" 2>/dev/null || true
sleep 2

# 启动 Django 后端
echo -e "${GREEN}启动 Django 后端 (:8000)...${NC}"
cd backend
../venv/bin/python3 manage.py runserver 0.0.0.0:8000 &
DJANGO_PID=$!
echo "Django PID: $DJANGO_PID"
cd ..

# 等待 Django 启动
sleep 3

# 启动 Python SPA 静态服务器
echo -e "${GREEN}启动 Python SPA 服务器 (:3005)...${NC}"
venv/bin/python3 serve_spa.py --port 3005 --dir ./dist &
SPA_PID=$!
echo "SPA Server PID: $SPA_PID"

# 获取本机 IP
IP=$(hostname -I | awk '{print $1}')

echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════╗"
echo "║     ✅ 服务启动成功                                     ║"
echo "╠════════════════════════════════════════════════════════╣"
echo "║  前端访问: http://${IP}:3005                            "
echo "║  后端 API: http://${IP}:8000/api                        "
echo "╠════════════════════════════════════════════════════════╣"
echo "║  Django PID: $DJANGO_PID                                "
echo "║  SPA PID: $SPA_PID                                      "
echo "╠════════════════════════════════════════════════════════╣"
echo "║  按 Ctrl+C 停止所有服务                                 ║"
echo "╚════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# 等待任意进程退出
wait
