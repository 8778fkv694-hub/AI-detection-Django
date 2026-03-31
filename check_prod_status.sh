#!/bin/bash

# AI检测系统生产环境状态检查脚本

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

# 检查Docker服务状态
check_docker_services() {
    log_info "检查Docker服务状态..."
    
    if [ -f docker-compose.prod.yml ]; then
        echo "📊 Docker服务状态："
        docker-compose -f docker-compose.prod.yml ps
        echo ""
    else
        log_warning "docker-compose.prod.yml 文件不存在"
    fi
}

# 检查服务健康状态
check_health() {
    log_info "检查服务健康状态..."
    
    # 检查数据库
    if docker-compose -f docker-compose.prod.yml exec -T db pg_isready -U qainspect &>/dev/null; then
        log_success "✅ 数据库服务正常"
    else
        log_error "❌ 数据库服务异常"
    fi
    
    # 检查Redis
    if docker-compose -f docker-compose.prod.yml exec -T redis redis-cli ping &>/dev/null; then
        log_success "✅ Redis服务正常"
    else
        log_error "❌ Redis服务异常"
    fi
    
    # 检查应用API
    if curl -f http://localhost:8012/api/standards/ &>/dev/null; then
        log_success "✅ 应用API正常"
    else
        log_error "❌ 应用API异常"
    fi
    
    # 检查前端
    if curl -f https://localhost &>/dev/null; then
        log_success "✅ 前端服务正常"
    else
        log_warning "⚠️ 前端服务可能异常（HTTPS证书问题）"
    fi
}

# 检查资源使用情况
check_resources() {
    log_info "检查资源使用情况..."
    
    echo "💾 磁盘使用情况："
    df -h | grep -E "(Filesystem|/dev/)"
    echo ""
    
    echo "🧠 内存使用情况："
    free -h
    echo ""
    
    echo "🐳 Docker资源使用："
    docker system df
    echo ""
}

# 显示访问信息
show_access_info() {
    log_info "访问信息："
    echo "📱 前端界面: https://localhost"
    echo "🔧 后端API:  http://localhost:8012/api/"
    echo "⚙️ 管理后台: http://localhost:8012/admin"
    echo "📊 健康检查: http://localhost:8012/api/standards/"
    echo ""
}

# 显示日志信息
show_log_info() {
    log_info "日志查看命令："
    echo "📝 查看所有服务日志: docker-compose -f docker-compose.prod.yml logs -f"
    echo "📝 查看应用日志: docker-compose -f docker-compose.prod.yml logs -f app"
    echo "📝 查看数据库日志: docker-compose -f docker-compose.prod.yml logs -f db"
    echo "📝 查看Redis日志: docker-compose -f docker-compose.prod.yml logs -f redis"
    echo ""
}

# 主函数
main() {
    echo "🔍 AI检测系统生产环境状态检查"
    echo "================================"
    echo ""
    
    check_docker_services
    check_health
    check_resources
    show_access_info
    show_log_info
    
    log_success "状态检查完成"
}

# 执行主函数
main "$@"
