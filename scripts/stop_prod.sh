#!/bin/bash

# AI检测系统生产环境停止脚本

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 停止服务
stop_services() {
    log_info "停止AI检测系统服务..."
    
    if [ -f docker-compose.prod.yml ]; then
        docker-compose -f docker-compose.prod.yml down --remove-orphans
        log_success "Docker服务已停止"
    else
        log_warning "docker-compose.prod.yml 文件不存在"
    fi
}

# 清理资源
cleanup() {
    log_info "清理Docker资源..."
    
    # 清理未使用的镜像
    docker image prune -f
    
    # 清理未使用的容器
    docker container prune -f
    
    # 清理未使用的网络
    docker network prune -f
    
    log_success "Docker资源清理完成"
}

# 显示状态
show_status() {
    log_info "当前Docker服务状态："
    docker-compose -f docker-compose.prod.yml ps 2>/dev/null || echo "没有运行的服务"
}

# 主函数
main() {
    echo "🛑 AI检测系统生产环境停止脚本"
    echo "================================"
    
    stop_services
    cleanup
    show_status
    
    log_success "系统已停止"
}

# 执行主函数
main "$@"
