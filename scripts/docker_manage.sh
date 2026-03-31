#!/bin/bash

# Docker管理脚本 - AI检测系统
COMPOSE_FILE="docker-compose.aliyun.yml"
PROJECT_NAME="wyl-ai-detection"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 显示帮助信息
show_help() {
    echo -e "${BLUE}🐳 AI检测系统Docker管理脚本${NC}"
    echo ""
    echo "用法: $0 [命令]"
    echo ""
    echo "命令:"
    echo "  build     构建Docker镜像"
    echo "  start     启动服务"
    echo "  stop      停止服务"
    echo "  restart   重启服务"
    echo "  status    查看服务状态"
    echo "  logs      查看日志"
    echo "  clean     清理Docker资源"
    echo "  shell     进入应用容器"
    echo "  help      显示帮助信息"
    echo ""
}

# 构建镜像
build_images() {
    echo -e "${YELLOW}🔨 构建Docker镜像...${NC}"
    docker-compose -f $COMPOSE_FILE build --no-cache
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ 镜像构建成功！${NC}"
    else
        echo -e "${RED}❌ 镜像构建失败！${NC}"
        exit 1
    fi
}

# 启动服务
start_services() {
    echo -e "${YELLOW}🚀 启动服务...${NC}"
    docker-compose -f $COMPOSE_FILE up -d
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ 服务启动成功！${NC}"
        echo ""
        echo -e "${BLUE}📱 访问地址：${NC}"
        echo "   前端界面: http://localhost"
        echo "   后端API:  http://localhost:8012/api/"
        echo "   管理后台: http://localhost:8012/admin"
        echo ""
        show_status
    else
        echo -e "${RED}❌ 服务启动失败！${NC}"
        exit 1
    fi
}

# 停止服务
stop_services() {
    echo -e "${YELLOW}🛑 停止服务...${NC}"
    docker-compose -f $COMPOSE_FILE down
    echo -e "${GREEN}✅ 服务已停止${NC}"
}

# 重启服务
restart_services() {
    echo -e "${YELLOW}🔄 重启服务...${NC}"
    docker-compose -f $COMPOSE_FILE restart
    echo -e "${GREEN}✅ 服务已重启${NC}"
}

# 查看状态
show_status() {
    echo -e "${BLUE}📊 服务状态：${NC}"
    docker-compose -f $COMPOSE_FILE ps
    echo ""
    echo -e "${BLUE}💾 磁盘使用：${NC}"
    docker system df
}

# 查看日志
show_logs() {
    echo -e "${BLUE}📝 服务日志：${NC}"
    docker-compose -f $COMPOSE_FILE logs -f --tail=100
}

# 清理资源
clean_resources() {
    echo -e "${YELLOW}🧹 清理Docker资源...${NC}"
    read -p "确定要清理所有未使用的Docker资源吗？(y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker system prune -f
        docker volume prune -f
        echo -e "${GREEN}✅ 清理完成${NC}"
    else
        echo "取消清理"
    fi
}

# 进入容器
enter_shell() {
    echo -e "${YELLOW}🐚 进入应用容器...${NC}"
    docker-compose -f $COMPOSE_FILE exec app bash
}

# 主逻辑
case "$1" in
    build)
        build_images
        ;;
    start)
        start_services
        ;;
    stop)
        stop_services
        ;;
    restart)
        restart_services
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs
        ;;
    clean)
        clean_resources
        ;;
    shell)
        enter_shell
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo -e "${RED}❌ 未知命令: $1${NC}"
        echo ""
        show_help
        exit 1
        ;;
esac
