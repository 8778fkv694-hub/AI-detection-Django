#!/bin/bash
#
# Jetson Nano 生产环境启动脚本
# 启动 Django 后端 (:8000) 和 Python 静态服务器 (:3001)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
PROJECT_DIR="$SCRIPT_DIR"
BACKEND_DIR="$PROJECT_DIR/backend"
VENV_BIN="$PROJECT_DIR/venv/bin"

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
export DEBUG=False
export PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True
export HF_HUB_OFFLINE=1
export PYTHONUNBUFFERED=1
export VITE_BACKEND_DETECTION=true
export VITE_API_BASE_URL="http://192.168.55.1:8000/api"

echo -e "${YELLOW}检查 Jetson 运行环境...${NC}"
FAIL=0

if [ ! -x "$VENV_BIN/python3" ] && [ ! -x "$VENV_BIN/python" ]; then
    echo -e "${RED}❌ Python 虚拟环境不存在: $VENV_BIN${NC}"
    FAIL=1
fi

PYTHON_BIN="$VENV_BIN/python3"
[ -x "$PYTHON_BIN" ] || PYTHON_BIN="$VENV_BIN/python"

if [ ! -d "$BACKEND_DIR" ]; then
    echo -e "${RED}❌ 后端目录不存在: $BACKEND_DIR${NC}"
    FAIL=1
fi

NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
    echo -e "${RED}❌ Node.js 未找到${NC}"
    FAIL=1
else
    NODE_MAJOR="$("$NODE_BIN" -v 2>/dev/null | sed 's/^v//' | cut -d. -f1)"
    if [ "${NODE_MAJOR:-0}" -lt 18 ]; then
        echo -e "${RED}❌ Node.js 版本过旧: $("$NODE_BIN" -v 2>/dev/null)${NC}"
        FAIL=1
    fi
fi

if [ "$FAIL" -eq 0 ] && ! "$PYTHON_BIN" -m pip show django >/dev/null 2>&1; then
    echo -e "${RED}❌ Django 未安装在当前 venv${NC}"
    FAIL=1
fi

if [ -x "$PROJECT_DIR/scripts/verify_nms.sh" ]; then
    if ! "$PROJECT_DIR/scripts/verify_nms.sh"; then
        echo -e "${YELLOW}NMS 自检失败，尝试自动修复...${NC}"
        "$PROJECT_DIR/scripts/apply_nms_patch.sh" || true
        "$PROJECT_DIR/scripts/verify_nms.sh" || FAIL=1
    fi
fi

if [ "$FAIL" -ne 0 ]; then
    echo -e "${RED}❌ 环境自检失败，停止启动${NC}"
    exit 1
fi
echo -e "${GREEN}✅ 环境自检通过${NC}"

# 检查 dist 目录是否存在
if [ ! -d "dist" ] || [ ! -f "dist/index.html" ]; then
    echo -e "${YELLOW}⚠️  未找到 dist 目录，正在构建前端...${NC}"
    npm run build
fi

# 停止可能存在的旧进程
echo -e "${YELLOW}正在停止旧进程...${NC}"
pkill -f "manage.py runserver" 2>/dev/null || true
pkill -f "serve_production.py" 2>/dev/null || true
pkill -f "serve_spa.py" 2>/dev/null || true
fuser -k 8000/tcp 2>/dev/null || true
fuser -k 3005/tcp 2>/dev/null || true
sleep 2

# 启动 Django 后端
echo -e "${GREEN}启动 Django 后端 (:8000)...${NC}"
cd backend
"$PYTHON_BIN" serve_production.py --host 0.0.0.0 --port 8000 &
DJANGO_PID=$!
echo "Django PID: $DJANGO_PID"
cd ..

# 等待 Django 启动
sleep 3

# 启动 Python SPA 静态服务器
echo -e "${GREEN}启动 Python SPA 服务器 (:3005)...${NC}"
SPA_ARGS=(--port 3005 --dir ./dist --backend http://127.0.0.1:8000)
if [ -f "$PROJECT_DIR/server.crt" ] && [ -f "$PROJECT_DIR/server.key" ]; then
    SPA_ARGS+=(--cert "$PROJECT_DIR/server.crt" --key "$PROJECT_DIR/server.key")
fi
"$PYTHON_BIN" serve_spa.py "${SPA_ARGS[@]}" &
SPA_PID=$!
echo "SPA Server PID: $SPA_PID"

# 获取本机 IP
IP=$(hostname -I | awk '{print $1}')

echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════╗"
echo "║     ✅ 服务启动成功                                     ║"
echo "╠════════════════════════════════════════════════════════╣"
if [ -f "$PROJECT_DIR/server.crt" ] && [ -f "$PROJECT_DIR/server.key" ]; then
echo "║  前端访问: https://${IP}:3005                           "
else
echo "║  前端访问: http://${IP}:3005                            "
fi
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
