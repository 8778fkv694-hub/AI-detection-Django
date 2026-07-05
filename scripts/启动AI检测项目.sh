#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "AI 检测项目启动器"
echo "项目目录: $PROJECT_ROOT"
echo
echo "1) 启动完整 Mac 开发栈"
echo "2) 仅启动 Django 后端"
echo "3) 仅启动 React 前端"
echo "4) 仅启动 Node API"
echo "5) 仅启动 RPA 服务"
echo "6) Mac production preview"
echo "7) 查看状态"
echo "8) 停止所有本机服务"
echo "9) 退出"
echo
read -r -p "请输入选项 (1-9): " choice

case "$choice" in
    1) ./start_mac.sh full ;;
    2) ./start_mac.sh django ;;
    3) ./start_mac.sh frontend ;;
    4) ./start_mac.sh node ;;
    5) ./start_mac.sh rpa ;;
    6) ./start_mac.sh production ;;
    7) ./start_mac.sh status ;;
    8) ./start_mac.sh stop ;;
    9) exit 0 ;;
    *) echo "无效选项"; exit 1 ;;
esac
