#!/bin/bash

# AI检测系统生产部署包创建脚本

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

# 获取版本号
get_version() {
    if [ -f package.json ]; then
        VERSION=$(grep '"version"' package.json | cut -d'"' -f4)
    else
        VERSION="1.0.0"
    fi
    echo $VERSION
}

# 创建部署包目录
create_package_dir() {
    VERSION=$(get_version)
    PACKAGE_NAME="wyl-ai-detection-v${VERSION}-production"
    PACKAGE_DIR="/tmp/${PACKAGE_NAME}"
    
    log_info "创建部署包目录: ${PACKAGE_DIR}"
    
    # 清理旧目录
    rm -rf $PACKAGE_DIR
    mkdir -p $PACKAGE_DIR
    
    echo $PACKAGE_DIR
}

# 复制必要文件
copy_files() {
    PACKAGE_DIR=$1
    
    log_info "复制项目文件..."
    
    # 复制核心文件
    cp -r backend/ $PACKAGE_DIR/
    cp -r src/ $PACKAGE_DIR/
    cp -r production/ $PACKAGE_DIR/
    
    # 复制配置文件
    cp package.json $PACKAGE_DIR/
    cp package-lock.json $PACKAGE_DIR/
    cp vite.config.ts $PACKAGE_DIR/
    cp tsconfig*.json $PACKAGE_DIR/
    cp tailwind.config.js $PACKAGE_DIR/
    cp postcss.config.js $PACKAGE_DIR/
    cp index.html $PACKAGE_DIR/
    
    # 复制Docker文件
    cp Dockerfile $PACKAGE_DIR/
    cp docker-compose.prod.yml $PACKAGE_DIR/
    
    # 复制部署脚本
    cp deploy.sh $PACKAGE_DIR/
    cp stop_prod.sh $PACKAGE_DIR/
    cp check_prod_status.sh $PACKAGE_DIR/
    
    # 复制模型文件
    if [ -f yolo10x.pt ]; then
        cp yolo10x.pt $PACKAGE_DIR/
    fi
    if [ -f yolov8n.pt ]; then
        cp yolov8n.pt $PACKAGE_DIR/
    fi
    
    # 复制PPE模型
    if [ -d PPE_detection_YOLO ]; then
        cp -r PPE_detection_YOLO/ $PACKAGE_DIR/
    fi
    
    log_success "文件复制完成"
}

# 创建部署说明
create_deployment_guide() {
    PACKAGE_DIR=$1
    VERSION=$(get_version)
    
    log_info "创建部署说明文档..."
    
    cat > $PACKAGE_DIR/DEPLOYMENT_GUIDE.md << EOF
# AI检测系统生产部署指南

## 版本信息
- 版本: v${VERSION}
- 构建时间: $(date '+%Y-%m-%d %H:%M:%S')
- 部署包: wyl-ai-detection-v${VERSION}-production

## 系统要求
- 操作系统: Linux (Ubuntu 20.04+ / CentOS 8+)
- Docker: 20.10+
- Docker Compose: 2.0+
- 内存: 4GB+
- 磁盘: 20GB+
- CPU: 2核心+

## 快速部署

### 1. 解压部署包
\`\`\`bash
tar -xzf wyl-ai-detection-v${VERSION}-production.tar.gz
cd wyl-ai-detection-v${VERSION}-production
\`\`\`

### 2. 配置环境变量
\`\`\`bash
# 复制环境变量模板
cp production/env.example .env

# 编辑配置文件（重要：修改默认密码）
nano .env
\`\`\`

### 3. 一键部署
\`\`\`bash
# 给脚本执行权限
chmod +x deploy.sh stop_prod.sh check_prod_status.sh

# 执行部署
./deploy.sh
\`\`\`

### 4. 验证部署
\`\`\`bash
# 检查服务状态
./check_prod_status.sh

# 访问系统
# 前端: https://localhost
# 后端: http://localhost:8000/api/
# 管理: http://localhost:8000/admin
\`\`\`

## 默认账户
- 管理员用户名: admin
- 管理员密码: admin123
- **重要**: 首次登录后请立即修改密码

## 服务管理

### 启动服务
\`\`\`bash
docker-compose -f docker-compose.prod.yml up -d
\`\`\`

### 停止服务
\`\`\`bash
./stop_prod.sh
\`\`\`

### 查看日志
\`\`\`bash
docker-compose -f docker-compose.prod.yml logs -f
\`\`\`

### 重启服务
\`\`\`bash
docker-compose -f docker-compose.prod.yml restart
\`\`\`

## 配置说明

### 端口配置
- HTTP: 80
- HTTPS: 443
- API: 8000
- 数据库: 5432
- Redis: 6379

### 数据存储
- 数据库数据: Docker卷 \`postgres_data\`
- 媒体文件: Docker卷 \`app_media\`
- 日志文件: Docker卷 \`app_logs\`

## 安全建议

1. **修改默认密码**
   - 数据库密码
   - Redis密码
   - 管理员账户密码

2. **配置防火墙**
   - 只开放必要端口
   - 限制访问来源

3. **SSL证书**
   - 生产环境使用正式证书
   - 替换自签名证书

4. **定期备份**
   - 数据库备份
   - 媒体文件备份

## 故障排除

### 常见问题
1. 端口被占用: 检查端口使用情况
2. 权限问题: 确保脚本有执行权限
3. 内存不足: 增加系统内存
4. 磁盘空间: 清理不必要的文件

### 重置系统
\`\`\`bash
./stop_prod.sh
docker-compose -f docker-compose.prod.yml down -v
./deploy.sh
\`\`\`

## 技术支持
如遇到问题，请提供：
1. 系统环境信息
2. 错误日志
3. 部署步骤

联系开发团队获取技术支持。
EOF

    log_success "部署说明文档已创建"
}

# 创建启动脚本
create_startup_script() {
    PACKAGE_DIR=$1
    
    log_info "创建启动脚本..."
    
    cat > $PACKAGE_DIR/start.sh << 'EOF'
#!/bin/bash

# AI检测系统快速启动脚本

echo "🚀 启动AI检测系统..."

# 检查Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker未安装，请先安装Docker"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose未安装，请先安装Docker Compose"
    exit 1
fi

# 检查配置文件
if [ ! -f .env ]; then
    echo "📝 创建默认配置文件..."
    cp production/env.example .env
    echo "⚠️  请编辑 .env 文件修改默认密码"
fi

# 启动服务
echo "🔧 启动服务..."
docker-compose -f docker-compose.prod.yml up -d

# 等待服务启动
echo "⏳ 等待服务启动..."
sleep 30

# 检查服务状态
echo "🔍 检查服务状态..."
docker-compose -f docker-compose.prod.yml ps

echo ""
echo "🎉 系统启动完成！"
echo "📱 访问地址："
echo "   前端: https://localhost"
echo "   后端: http://localhost:8000/api/"
echo "   管理: http://localhost:8000/admin"
echo ""
echo "🔑 默认账户: admin / admin123"
echo "⚠️  请立即修改默认密码"
EOF

    chmod +x $PACKAGE_DIR/start.sh
    log_success "启动脚本已创建"
}

# 创建清理脚本
create_cleanup_script() {
    PACKAGE_DIR=$1
    
    log_info "创建清理脚本..."
    
    cat > $PACKAGE_DIR/cleanup.sh << 'EOF'
#!/bin/bash

# AI检测系统清理脚本

echo "🧹 清理AI检测系统..."

# 停止服务
echo "🛑 停止服务..."
docker-compose -f docker-compose.prod.yml down

# 清理容器
echo "🗑️ 清理容器..."
docker-compose -f docker-compose.prod.yml rm -f

# 清理镜像
echo "🗑️ 清理镜像..."
docker image prune -f

# 清理网络
echo "🗑️ 清理网络..."
docker network prune -f

# 清理数据卷（可选）
read -p "是否删除所有数据？(y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🗑️ 清理数据卷..."
    docker-compose -f docker-compose.prod.yml down -v
    docker volume prune -f
fi

echo "✅ 清理完成"
EOF

    chmod +x $PACKAGE_DIR/cleanup.sh
    log_success "清理脚本已创建"
}

# 打包部署包
create_package() {
    PACKAGE_DIR=$1
    VERSION=$(get_version)
    PACKAGE_NAME="wyl-ai-detection-v${VERSION}-production"
    
    log_info "创建部署包..."
    
    cd /tmp
    tar -czf "${PACKAGE_NAME}.tar.gz" $PACKAGE_NAME
    
    # 移动到当前目录
    mv "${PACKAGE_NAME}.tar.gz" "$(dirname "$0")/"
    
    log_success "部署包已创建: ${PACKAGE_NAME}.tar.gz"
    echo "📦 部署包大小: $(du -h "${PACKAGE_NAME}.tar.gz" | cut -f1)"
}

# 显示部署包信息
show_package_info() {
    VERSION=$(get_version)
    PACKAGE_NAME="wyl-ai-detection-v${VERSION}-production"
    
    log_success "🎉 部署包创建完成！"
    echo ""
    echo "📦 部署包信息："
    echo "   文件名: ${PACKAGE_NAME}.tar.gz"
    echo "   版本: v${VERSION}"
    echo "   大小: $(du -h "${PACKAGE_NAME}.tar.gz" | cut -f1)"
    echo ""
    echo "📋 部署包内容："
    echo "   ✅ Docker配置文件"
    echo "   ✅ 生产环境配置"
    echo "   ✅ 部署脚本"
    echo "   ✅ 启动脚本"
    echo "   ✅ 清理脚本"
    echo "   ✅ 部署说明文档"
    echo "   ✅ AI模型文件"
    echo ""
    echo "🚀 使用方法："
    echo "   1. 解压: tar -xzf ${PACKAGE_NAME}.tar.gz"
    echo "   2. 进入: cd ${PACKAGE_NAME}"
    echo "   3. 配置: cp production/env.example .env"
    echo "   4. 部署: ./deploy.sh"
    echo ""
}

# 主函数
main() {
    echo "📦 AI检测系统生产部署包创建脚本"
    echo "=================================="
    echo ""
    
    PACKAGE_DIR=$(create_package_dir)
    copy_files $PACKAGE_DIR
    create_deployment_guide $PACKAGE_DIR
    create_startup_script $PACKAGE_DIR
    create_cleanup_script $PACKAGE_DIR
    create_package $PACKAGE_DIR
    show_package_info
    
    # 清理临时目录
    rm -rf $PACKAGE_DIR
}

# 执行主函数
main "$@"
