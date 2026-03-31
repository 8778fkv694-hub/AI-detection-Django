#!/bin/bash

# AI检测系统生产部署脚本

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

# 检查Docker和Docker Compose
check_dependencies() {
    log_info "检查系统依赖..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker未安装，请先安装Docker"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose未安装，请先安装Docker Compose"
        exit 1
    fi
    
    log_success "系统依赖检查通过"
}

# 创建环境配置文件
create_env_file() {
    log_info "创建环境配置文件..."
    
    if [ ! -f .env ]; then
        cat > .env << EOF
# 数据库配置
POSTGRES_DB=qainspect
POSTGRES_USER=qainspect
POSTGRES_PASSWORD=qainspect123
DB_PORT=5432

# Redis配置
REDIS_PASSWORD=redis123
REDIS_PORT=6379

# 应用配置
SECRET_KEY=$(openssl rand -base64 32)
ALLOWED_HOSTS=localhost,127.0.0.1,0.0.0.0
CORS_ALLOWED_ORIGINS=http://localhost,https://localhost

# 端口配置
APP_PORT=8012
HTTP_PORT=80
HTTPS_PORT=443

# 生产环境
DEBUG=False
EOF
        log_success "环境配置文件已创建"
    else
        log_warning "环境配置文件已存在，跳过创建"
    fi
}

# 生成SSL证书
generate_ssl_cert() {
    log_info "生成SSL证书..."
    
    mkdir -p production/ssl
    
    if [ ! -f production/ssl/server.crt ] || [ ! -f production/ssl/server.key ]; then
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout production/ssl/server.key \
            -out production/ssl/server.crt \
            -subj "/C=CN/ST=State/L=City/O=Organization/CN=localhost"
        log_success "SSL证书已生成"
    else
        log_warning "SSL证书已存在，跳过生成"
    fi
}

# 构建和启动服务
deploy_services() {
    log_info "构建和启动服务..."
    
    # 停止现有服务
    log_info "停止现有服务..."
    docker-compose -f docker-compose.prod.yml down --remove-orphans
    
    # 构建镜像
    log_info "构建Docker镜像..."
    docker-compose -f docker-compose.prod.yml build --no-cache
    
    # 启动服务
    log_info "启动服务..."
    docker-compose -f docker-compose.prod.yml up -d
    
    log_success "服务启动完成"
}

# 等待服务就绪
wait_for_services() {
    log_info "等待服务就绪..."
    
    # 等待数据库
    log_info "等待数据库启动..."
    timeout 60 bash -c 'until docker-compose -f docker-compose.prod.yml exec -T db pg_isready -U qainspect; do sleep 2; done'
    
    # 等待Redis
    log_info "等待Redis启动..."
    timeout 60 bash -c 'until docker-compose -f docker-compose.prod.yml exec -T redis redis-cli ping; do sleep 2; done'
    
    # 等待应用
    log_info "等待应用启动..."
    timeout 120 bash -c 'until curl -f http://localhost:8012/api/standards/; do sleep 5; done'
    
    log_success "所有服务已就绪"
}

# 显示部署信息
show_deployment_info() {
    log_success "🎉 部署完成！"
    echo ""
    echo "📱 访问地址："
    echo "   前端界面: https://localhost"
    echo "   后端API:  http://localhost:8012/api/"
    echo "   管理后台: http://localhost:8012/admin"
    echo ""
    echo "🔑 默认管理员账户："
    echo "   用户名: admin"
    echo "   密码: admin123"
    echo ""
    echo "📊 服务状态："
    docker-compose -f docker-compose.prod.yml ps
    echo ""
    echo "📝 常用命令："
    echo "   查看日志: docker-compose -f docker-compose.prod.yml logs -f"
    echo "   停止服务: docker-compose -f docker-compose.prod.yml down"
    echo "   重启服务: docker-compose -f docker-compose.prod.yml restart"
    echo ""
}

# 主函数
main() {
    echo "🚀 AI检测系统生产部署脚本"
    echo "================================"
    
    check_dependencies
    create_env_file
    generate_ssl_cert
    deploy_services
    wait_for_services
    show_deployment_info
}

# 执行主函数
main "$@"
