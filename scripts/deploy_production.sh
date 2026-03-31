#!/bin/bash

echo "🚀 AI检测系统生产环境部署脚本"
echo "=================================================="

# 检查是否在正确的目录
if [ ! -f "docker-compose.prod.yml" ] || [ ! -d "production" ]; then
    echo "❌ 错误：请在项目根目录运行此脚本"
    exit 1
fi

# 检查Docker是否安装
if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安装，请先安装Docker"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose 未安装，请先安装Docker Compose"
    exit 1
fi

echo "✅ 环境检查通过"

# 创建生产环境配置
echo "📝 配置生产环境..."

# 创建.env文件
if [ ! -f "production/.env" ]; then
    echo "创建生产环境配置文件..."
    cp production/env.example production/.env
    
    # 生成随机密钥
    SECRET_KEY=$(openssl rand -base64 32)
    POSTGRES_PASSWORD=$(openssl rand -base64 16)
    REDIS_PASSWORD=$(openssl rand -base64 16)
    
    # 更新.env文件
    sed -i.bak "s/your_secret_key_here/$SECRET_KEY/g" production/.env
    sed -i.bak "s/your_secure_password_here/$POSTGRES_PASSWORD/g" production/.env
    sed -i.bak "s/your_redis_password_here/$REDIS_PASSWORD/g" production/.env
    
    echo "✅ 生产环境配置文件已创建"
    echo "📋 生成的配置："
    echo "   SECRET_KEY: $SECRET_KEY"
    echo "   POSTGRES_PASSWORD: $POSTGRES_PASSWORD"
    echo "   REDIS_PASSWORD: $REDIS_PASSWORD"
    echo ""
    echo "⚠️  请妥善保存这些配置信息！"
    echo ""
else
    echo "✅ 生产环境配置文件已存在"
fi

# 创建SSL证书目录
if [ ! -d "production/ssl" ]; then
    echo "📜 创建SSL证书目录..."
    mkdir -p production/ssl
fi

# 检查SSL证书
if [ ! -f "production/ssl/server.crt" ] || [ ! -f "production/ssl/server.key" ]; then
    echo "🔐 生成SSL证书..."
    if [ -f "ssl/generate_cert.sh" ]; then
        chmod +x ssl/generate_cert.sh
        ./ssl/generate_cert.sh
        cp ssl/server.crt production/ssl/
        cp ssl/server.key production/ssl/
        echo "✅ SSL证书已生成"
    else
        echo "⚠️  SSL证书生成脚本不存在，请手动配置SSL证书"
        echo "   将证书文件放置在 production/ssl/ 目录下："
        echo "   - server.crt"
        echo "   - server.key"
    fi
else
    echo "✅ SSL证书已存在"
fi

# 构建前端
echo "🎨 构建前端应用..."
if [ ! -d "node_modules" ]; then
    echo "📥 安装前端依赖..."
    npm install
fi

echo "🔨 构建前端..."
npm run build

if [ ! -d "dist" ]; then
    echo "❌ 前端构建失败"
    exit 1
fi

echo "✅ 前端构建完成"

# 停止现有容器
echo "🛑 停止现有容器..."
docker-compose -f docker-compose.prod.yml down

# 清理旧镜像
echo "🧹 清理旧镜像..."
docker system prune -f

# 构建并启动生产环境
echo "🚀 构建并启动生产环境..."
docker-compose -f docker-compose.prod.yml up -d --build

# 等待服务启动
echo "⏳ 等待服务启动..."
sleep 30

# 运行数据库迁移
echo "🗄️ 运行数据库迁移..."
docker-compose -f docker-compose.prod.yml exec -T app python manage.py migrate

# 创建超级用户
echo "👤 创建超级用户..."
docker-compose -f docker-compose.prod.yml exec -T app python manage.py shell -c "
from django.contrib.auth.models import User
if not User.objects.filter(is_superuser=True).exists():
    User.objects.create_superuser('admin', 'admin@example.com', 'admin123')
    print('超级用户已创建: admin/admin123')
else:
    print('超级用户已存在')
"

# 收集静态文件
echo "📁 收集静态文件..."
docker-compose -f docker-compose.prod.yml exec -T app python manage.py collectstatic --noinput

# 检查服务状态
echo "🔍 检查服务状态..."

# 检查数据库
if docker-compose -f docker-compose.prod.yml exec -T db pg_isready -U qainspect -d qainspect > /dev/null 2>&1; then
    echo "✅ 数据库服务正常"
else
    echo "❌ 数据库服务异常"
fi

# 检查Redis
if docker-compose -f docker-compose.prod.yml exec -T redis redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis服务正常"
else
    echo "❌ Redis服务异常"
fi

# 检查后端API
if curl -s http://localhost:8012/api/ > /dev/null 2>&1; then
    echo "✅ 后端API服务正常 (端口 8012)"
else
    echo "❌ 后端API服务异常"
fi

# 检查前端HTTPS
if curl -k -s https://localhost:443/ > /dev/null 2>&1; then
    echo "✅ 前端HTTPS服务正常 (端口 443)"
else
    echo "❌ 前端HTTPS服务异常"
fi

# 检查前端HTTP
if curl -s http://localhost:80/ > /dev/null 2>&1; then
    echo "✅ 前端HTTP服务正常 (端口 80)"
else
    echo "❌ 前端HTTP服务异常"
fi

echo ""
echo "🎉 生产环境部署完成！"
echo "=================================================="
echo "🌐 访问地址："
echo "   前端界面 (HTTPS): https://localhost:443"
echo "   前端界面 (HTTP):  http://localhost:80"
echo "   后端API:          http://localhost:8012/api/"
echo "   管理后台:         http://localhost:8012/admin/"
echo ""
echo "🔑 管理员账号: admin/admin123"
echo ""
echo "🔧 管理命令："
echo "   查看日志: docker-compose -f docker-compose.prod.yml logs -f"
echo "   停止服务: docker-compose -f docker-compose.prod.yml down"
echo "   重启服务: docker-compose -f docker-compose.prod.yml restart"
echo "   进入容器: docker-compose -f docker-compose.prod.yml exec app bash"
echo ""
echo "📊 服务状态："
docker-compose -f docker-compose.prod.yml ps
echo ""
echo "💡 提示："
echo "   1. 首次访问可能需要接受HTTPS证书"
echo "   2. 确保防火墙开放端口 80, 443, 8012"
echo "   3. 生产环境使用PostgreSQL数据库"
echo "   4. 所有数据持久化存储在Docker卷中"
echo "   5. 定期备份数据库和媒体文件"
echo ""
