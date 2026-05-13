#!/bin/bash
#
# 同步前后端代码到 Jetson Nano
# 保留 Jetson 的 GPU/CUDA 相关配置
#

set -e

# Jetson 连接信息
JETSON_IP="192.168.55.1"
JETSON_USER="wenyili"
JETSON_PROJECT_PATH="/home/wenyili/projects/AI-Detection"

# 本地项目路径
LOCAL_PROJECT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SSH_CTL="$HOME/.ssh/control-${JETSON_USER}@${JETSON_IP}:22"

echo "╔════════════════════════════════════════════════════════╗"
echo "║     🚀 同步代码到 Jetson Nano                          ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
echo "📂 本地路径: $LOCAL_PROJECT"
echo "🎯 目标路径: $JETSON_USER@$JETSON_IP:$JETSON_PROJECT_PATH"
echo ""

# 检查 Jetson 连接
echo "🔍 检查 Jetson 连接..."
if ! ping -c 1 -W 2 $JETSON_IP > /dev/null 2>&1; then
    echo "❌ 无法连接到 Jetson ($JETSON_IP)"
    echo "请检查 USB 连接"
    exit 1
fi
echo "✅ Jetson 在线"
echo ""

# 清理 Mac 休眠后残留的 ControlMaster socket，避免同步/SSH 首次连接卡住
if [ -S "$SSH_CTL" ] && ! ssh -o ControlPath="$SSH_CTL" -O check "$JETSON_USER@$JETSON_IP" >/dev/null 2>&1; then
    echo "🧹 清理过期 SSH ControlMaster: $SSH_CTL"
    rm -f "$SSH_CTL"
fi

echo "🔍 检查 Jetson 磁盘..."
DISK_INFO=$(ssh "$JETSON_USER@$JETSON_IP" "df -h ~ 2>/dev/null | tail -1")
DISK_USAGE=$(echo "$DISK_INFO" | awk '{print $5}' | sed 's/%//')
DISK_AVAIL=$(echo "$DISK_INFO" | awk '{print $4}')
if [ -z "$DISK_USAGE" ]; then
    echo "❌ 无法获取 Jetson 磁盘信息，取消同步"
    rm -f "$EXCLUDE_FILE" 2>/dev/null || true
    exit 1
fi
echo "   Jetson 磁盘: ${DISK_USAGE}% (可用: ${DISK_AVAIL})"
if [ "$DISK_USAGE" -ge 95 ]; then
    echo "❌ Jetson 磁盘已满 (${DISK_USAGE}%)，同步取消"
    echo "   清理: ssh jetson '~/projects/AI-Detection/bin/cleanup_daily.sh'"
    exit 1
elif [ "$DISK_USAGE" -ge 85 ]; then
    echo "⚠️  Jetson 磁盘偏高 (${DISK_USAGE}%)"
    echo "   建议先运行: ssh jetson '~/projects/AI-Detection/bin/cleanup_daily.sh'"
    read -p "仍继续同步? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "已取消"
        exit 0
    fi
fi
echo ""

# 创建排除文件列表
EXCLUDE_FILE=$(mktemp)
cat > "$EXCLUDE_FILE" << 'EOF'
# Python 虚拟环境和缓存
venv/
__pycache__/
*.pyc
*.pyo
.pytest_cache/

# Node 相关
node_modules/
# dist/ (Now syncing local build to save time on Jetson)
# dist/

# 数据库和媒体
*.sqlite3
db.sqlite3
media/hls/
media/uploads/

# 环境配置 (保留 Jetson 自己的)
.env
.env.local
.env.production

# Python 依赖 (Jetson 有专门的 GPU 版本)
backend/requirements.txt

# Git 相关
.git/
.gitignore

# 模型文件 (太大，不需要同步)
models/*.pt
models/*.onnx
models/*.engine
*.pt
*.onnx
*.engine

# IDE 配置
.vscode/
.idea/
*.swp
*.swo

# 日志
*.log
logs/

# macOS 系统文件
.DS_Store
Thumbs.db

# 临时文件
*.tmp
*.bak
EOF

echo "📋 将同步以下内容:"
echo "   ✅ src/ (前端源码)"
echo "   ✅ backend/inspection/ (后端业务代码)"
echo "   ✅ backend/config/ (Django 配置)"
echo "   ✅ backend/templates/ (模板)"
echo "   ✅ serve_spa.py (SPA 服务器)"
echo "   ✅ run_jetson_*.sh (启动脚本)"
echo "   ✅ package.json (前端依赖定义)"
echo ""
echo "🚫 将排除的内容:"
echo "   ❌ node_modules/, venv/"
echo "   ❌ backend/requirements.txt (保留 GPU 版本)"
echo "   ❌ 数据库、媒体、模型文件"
echo "   ❌ .env 配置文件"
echo ""

read -p "确认开始同步? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "已取消"
    rm -f "$EXCLUDE_FILE"
    exit 0
fi

echo ""
echo "🔄 开始同步..."

# 使用 rsync 同步
# -a: 归档模式 (保持权限、时间戳等)
# -v: 详细输出
# -z: 压缩传输
# --progress: 显示进度
# --exclude-from: 排除文件列表
# --delete: 删除目标中多余的文件 (慎用，这里不启用)

rsync -avz --progress \
    --exclude-from="$EXCLUDE_FILE" \
    "$LOCAL_PROJECT/" \
    "$JETSON_USER@$JETSON_IP:$JETSON_PROJECT_PATH/"

# 清理临时文件
rm -f "$EXCLUDE_FILE"

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║     ✅ 同步完成!                                        ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
echo "📌 接下来在 Jetson 上执行:"
echo "   cd $JETSON_PROJECT_PATH"
echo "   npm install        # 安装前端依赖"
echo "   npm run build      # 构建前端"
echo "   ./run_jetson_production.sh  # 启动服务"
