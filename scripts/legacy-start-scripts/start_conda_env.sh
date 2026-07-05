#!/bin/bash

# AI检测项目 - Conda环境启动脚本
# 使用新的Conda环境启动项目

echo "🚀 启动AI检测项目 (Conda环境)"
echo "================================"

# 检查Conda是否安装
if ! command -v conda &> /dev/null; then
    echo "❌ 错误: Conda未安装或未在PATH中"
    exit 1
fi

# 激活Conda环境
echo "📦 激活Conda环境: ai-detection"
source $(conda info --base)/etc/profile.d/conda.sh
conda activate ai-detection

# 检查环境是否激活成功
if [[ "$CONDA_DEFAULT_ENV" != "ai-detection" ]]; then
    echo "❌ 错误: 无法激活ai-detection环境"
    exit 1
fi

echo "✅ Conda环境已激活: $CONDA_DEFAULT_ENV"
echo "🐍 Python版本: $(python --version)"
echo "📁 工作目录: $(pwd)"

# 检查必要的包
echo "🔍 检查依赖包..."
python -c "
import sys
try:
    import cv2, torch, numpy, django, paddleocr, ultralytics
    print('✅ 所有依赖包检查通过')
except ImportError as e:
    print(f'❌ 依赖包检查失败: {e}')
    sys.exit(1)
"

if [ $? -ne 0 ]; then
    echo "❌ 依赖包检查失败，请重新安装"
    exit 1
fi

echo ""
echo "🎯 选择启动模式:"
echo "1) 完整项目 (Django + React + AI服务)"
echo "2) 仅Django后端"
echo "3) 仅React前端"
echo "4) 仅AI服务"
echo "5) 开发模式 (热重载)"
echo ""

read -p "请选择 (1-5): " choice

case $choice in
    1)
        echo "🚀 启动完整项目..."
        # 启动Django后端
        echo "📡 启动Django后端..."
        cd backend && python manage.py runserver 0.0.0.0:8000 &
        DJANGO_PID=$!
        echo $DJANGO_PID > ../django.pid
        
        # 启动React前端
        echo "🎨 启动React前端..."
        cd .. && npm run dev &
        REACT_PID=$!
        echo $REACT_PID > react.pid
        
        # 启动AI服务
        echo "🤖 启动AI服务..."
        python -c "
import sys
sys.path.append('PPE_detection_YOLO')
from app import app
app.run(host='0.0.0.0', port=5000, debug=False)
" &
        AI_PID=$!
        echo $AI_PID > ai.pid
        
        echo "✅ 所有服务已启动"
        echo "🌐 Django后端: http://localhost:8000"
        echo "🎨 React前端: http://localhost:5173"
        echo "🤖 AI服务: http://localhost:5000"
        ;;
    2)
        echo "📡 启动Django后端..."
        cd backend && python manage.py runserver 0.0.0.0:8000
        ;;
    3)
        echo "🎨 启动React前端..."
        npm run dev
        ;;
    4)
        echo "🤖 启动AI服务..."
        cd PPE_detection_YOLO && python app.py
        ;;
    5)
        echo "🔄 启动开发模式..."
        npm run dev:full
        ;;
    *)
        echo "❌ 无效选择"
        exit 1
        ;;
esac

echo ""
echo "🎉 项目启动完成！"
echo "💡 提示: 使用 Ctrl+C 停止服务"
