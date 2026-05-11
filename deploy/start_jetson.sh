#!/usr/bin/env bash
# 统一 Jetson 生产启动脚本
#
# 设计：
#   - Backend: gunicorn HTTP（仅监听 localhost），重模型，跑 1 worker + 8 threads
#   - Frontend: serve_spa.py HTTPS（对外），代理 /api/* 到本地 8000
#   - 浏览器只看到 HTTPS，因此 getUserMedia / WebRTC 可用
#
# 用法（手动）：
#   bash deploy/start_jetson.sh
# 或通过 systemd（推荐）：systemctl --user start ai-backend ai-frontend
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

VENV="${PROJECT_ROOT}/venv"
[[ -d "$VENV" ]] || { echo "❌ venv not found at $VENV"; exit 1; }

CERT="${PROJECT_ROOT}/server.crt"
KEY="${PROJECT_ROOT}/server.key"
[[ -f "$CERT" && -f "$KEY" ]] || { echo "❌ SSL cert/key missing (server.crt/server.key)"; exit 1; }

DIST="${PROJECT_ROOT}/dist"
[[ -d "$DIST" ]] || { echo "❌ Frontend dist/ missing — run 'npm run build' first"; exit 1; }

BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-3005}"

# 释放可能残留的端口占用
fuser -k "${BACKEND_PORT}/tcp" 2>/dev/null || true
fuser -k "${FRONTEND_PORT}/tcp" 2>/dev/null || true
sleep 1

# Jetson 性能档拉满（如果有权限）
if command -v nvpmodel >/dev/null 2>&1; then
    sudo -n nvpmodel -m 0 2>/dev/null && echo "✅ nvpmodel MAXN" || echo "⚠️  nvpmodel needs sudo, skipped"
fi
if command -v jetson_clocks >/dev/null 2>&1; then
    sudo -n jetson_clocks 2>/dev/null && echo "✅ jetson_clocks set" || true
fi

LOCAL_IP="$(hostname -I | awk '{print $1}')"
echo "📍 Local IP: ${LOCAL_IP}"
echo "🔧 Backend:  http://127.0.0.1:${BACKEND_PORT}  (internal)"
echo "🌐 Frontend: https://${LOCAL_IP}:${FRONTEND_PORT}"

# 启动 backend（gunicorn）
cd "${PROJECT_ROOT}/backend"
DJANGO_SETTINGS_MODULE=config.settings \
DEBUG=False \
PYTHONUNBUFFERED=1 \
PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True \
HF_HUB_OFFLINE=1 \
"${VENV}/bin/python" serve_production.py --host 127.0.0.1 --port "${BACKEND_PORT}" \
    > "${PROJECT_ROOT}/backend.log" 2>&1 &
BACKEND_PID=$!
echo "✅ Backend started (pid ${BACKEND_PID})"

# 等 backend 就绪
for i in {1..30}; do
    sleep 1
    if curl -sf "http://127.0.0.1:${BACKEND_PORT}/api/streams/manager/status/" >/dev/null 2>&1; then
        echo "✅ Backend ready after ${i}s"
        break
    fi
    [[ $i -eq 30 ]] && { echo "❌ Backend did not become ready in 30s"; kill ${BACKEND_PID} 2>/dev/null; exit 1; }
done

# 启动 frontend SPA (HTTPS)
cd "${PROJECT_ROOT}"
"${VENV}/bin/python" serve_spa.py \
    --port "${FRONTEND_PORT}" \
    --dir "${DIST}" \
    --cert "${CERT}" \
    --key "${KEY}" \
    --backend "http://127.0.0.1:${BACKEND_PORT}" \
    > "${PROJECT_ROOT}/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "✅ Frontend started (pid ${FRONTEND_PID})"

echo
echo "✅ All services up."
echo "   访问: https://${LOCAL_IP}:${FRONTEND_PORT}"
echo "   日志: tail -f backend.log frontend.log"
echo
echo "停止: kill ${BACKEND_PID} ${FRONTEND_PID}"

# 不要立即退出，systemd 单元也可以靠这个保持
trap "kill ${BACKEND_PID} ${FRONTEND_PID} 2>/dev/null; exit 0" SIGINT SIGTERM
wait
