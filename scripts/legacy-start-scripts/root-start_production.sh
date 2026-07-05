#!/bin/zsh

# AI 检测系统 - 生产环境启动脚本
# 用途: 一键启动后端、流媒体服务和前端生产服务器

# 基础路径配置
BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$BASE_DIR"

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "${BLUE}==============================================${NC}"
echo "${BLUE}   🚀 AI 检测系统 - 生产环境启动器 (macOS)   ${NC}"
echo "${BLUE}==============================================${NC}"

# 1. 清理现有进程
echo "${YELLOW}1. 正在清理旧进程...${NC}"
pkill -f "manage.py|serve_spa.py|node src/index.js" > /dev/null 2>&1
sleep 1
# 强制清理端口占用
lsof -ti:8000,3000,3005 | xargs kill -9 > /dev/null 2>&1
echo "   ✅ 清理完成"

# 2. 前端构建 (可选)
if [ ! -d "dist" ]; then
    echo "${YELLOW}2. 未检测到构建目录，正在运行 npm run build...${NC}"
    npm run build
fi

# 3. 启动后台服务
echo "${YELLOW}2. 启动核心服务...${NC}"

# 启动 Django 后端
echo "   -> 启动 Django Backend (Port 8000)..."
if [ -x "backend/venv/bin/python3" ]; then
    cd backend
    # 使用 --noreload 减少资源占用，强制使用 venv 的 Python
    # 使用 --noreload 减少资源占用
    nohup ./venv/bin/python3 manage.py runserver 0.0.0.0:8000 --noreload > ../django.log 2>&1 &
    cd ..
else
    echo "${RED}   ❌ 错误: 未找到 backend/venv/bin/python3${NC}"
fi

sleep 3

# 启动 Node.js 流服务
echo "   -> 启动 Node.js Stream Service (Port 3000)..."
if [ -d "nodejs-stream-service/node_modules" ]; then
    cd nodejs-stream-service
    nohup npm run start > ../nodejs.log 2>&1 &
    cd ..
else
    echo "${RED}   ❌ 错误: 未找到 nodejs-stream-service/node_modules${NC}"
fi

sleep 2

# 启动前端生产服务 (支持代理)
echo "   -> 启动 Frontend SPA Server (Port 3005)..."
nohup python3 serve_spa.py --port 3005 --dir ./dist > frontend_prod.log 2>&1 &

sleep 2

# 4. 状态检查
echo "${BLUE}==============================================${NC}"
echo "${GREEN}   ✨ 系统已在后台启动！${NC}"
echo "${BLUE}==============================================${NC}"
echo "访问地址: ${GREEN}http://localhost:3005${NC}"
echo ""
echo "进程状态:"
ps -ef | grep -E "manage.py|serve_spa.py|node src/index.js" | grep -v grep | awk '{printf "  - %-20s (PID: %s)\n", $NF, $2}'
echo ""
echo "查看配置日志:"
echo "  - 后端日志: tail -f django.log"
echo "  - 前端日志: tail -f frontend_prod.log"
echo "  - 流服日志: tail -f nodejs.log"
echo "${BLUE}==============================================${NC}"
