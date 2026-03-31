#!/bin/bash
#
# Jetson Nano 简化开发启动脚本
# 仅启动 Django 后端 (:8000) 和 React Vite (:3303)
# 适用于轻量级开发/测试
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
echo "║     🔧 Jetson Nano 开发模式启动脚本                     ║"
echo "╚════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# 设置环境变量
export PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True
export PYTHONUNBUFFERED=1

# 停止可能存在的旧进程
echo -e "${YELLOW}正在停止旧进程...${NC}"
pkill -f "manage.py runserver" 2>/dev/null || true
pkill -f "manage.py runserver" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
pkill -f "rpa-server.js" 2>/dev/null || true
sleep 2

# 启动 Django 后端
echo -e "${GREEN}启动 Django 后端 (:8000)...${NC}"
cd backend
python3 manage.py runserver 0.0.0.0:8000 &
DJANGO_PID=$!
echo "Django PID: $DJANGO_PID"
cd ..

# 等待 Django 启动
sleep 3

# 启动 React 开发服务器
echo -e "${GREEN}启动 React Vite 开发服务器 (:3303)...${NC}"
# 启动 React Client
npm run dev:client -- --host 0.0.0.0 &
VITE_PID=$!
echo "Vite PID: $VITE_PID"

# 启动 RPA 服务
echo -e "${GREEN}启动 RPA 服务...${NC}"
node rpa-server.js &
RPA_PID=$!
echo "RPA PID: $RPA_PID"

# 获取本机 IP
IP=$(hostname -I | awk '{print $1}')

echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════╗"
echo "║     ✅ 开发服务启动成功                                 ║"
echo "╠════════════════════════════════════════════════════════╣"
echo "║  前端访问: http://${IP}:3303                            "
echo "║  后端 API: http://${IP}:8000/api                        "
echo "╠════════════════════════════════════════════════════════╣"
echo "║  Django PID: $DJANGO_PID                                "
echo "║  Vite PID: $VITE_PID                                    "
echo "║  RPA PID: $RPA_PID                                      "
echo "╠════════════════════════════════════════════════════════╣"
echo "║  按 Ctrl+C 停止所有服务                                 ║"
echo "╚════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# 等待任意进程退出
wait
