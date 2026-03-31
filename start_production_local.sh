#!/bin/bash

echo "🚀 启动AI检测系统本地生产环境"
echo "=================================================="
echo "端口配置："
echo "  前端HTTPS: 443"
echo "  前端HTTP:  80"
echo "  后端API:   8012"
echo "=================================================="

# 检查是否在正确的目录
if [ ! -f "package.json" ] || [ ! -d "backend" ]; then
    echo "❌ 错误：请在项目根目录运行此脚本"
    exit 1
fi

# 检查Python3是否安装
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 未安装，请先安装Python3"
    exit 1
fi

# 检查Node.js是否安装
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装，请先安装Node.js"
    exit 1
fi

echo "✅ 环境检查通过"

# 停止现有进程
echo "🛑 停止现有进程..."
pkill -f "manage.py runserver" 2>/dev/null
pkill -f "vite" 2>/dev/null
pkill -f "nginx" 2>/dev/null

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

# 设置后端环境
echo "🐍 设置后端环境..."
cd backend

# 检查虚拟环境是否存在
if [ ! -d "venv" ]; then
    echo "📦 创建Python虚拟环境..."
    python3 -m venv venv
fi

# 激活虚拟环境
echo "🔌 激活Python虚拟环境..."
source venv/bin/activate

# 安装依赖
echo "📥 安装Python依赖..."
pip install -r requirements.txt

# 运行数据库迁移
echo "🗄️ 运行数据库迁移..."
python manage.py migrate --noinput

# 创建超级用户（如果不存在）
echo "👤 检查超级用户..."
python manage.py shell -c "
from django.contrib.auth.models import User
if not User.objects.filter(is_superuser=True).exists():
    User.objects.create_superuser('admin', 'admin@example.com', 'admin123')
    print('超级用户已创建: admin/admin123')
else:
    print('超级用户已存在')
"

# 收集静态文件
echo "📁 收集静态文件..."
python manage.py collectstatic --noinput

# 启动Django后端（端口8012）
echo "🚀 启动Django后端服务器（端口8012）..."
python manage.py runserver 0.0.0.0:8012 > ../django.log 2>&1 &
DJANGO_PID=$!
echo $DJANGO_PID > ../django.pid

# 等待Django启动
echo "⏳ 等待Django后端启动..."
sleep 5

# 检查Django是否启动成功
if ! curl -s http://localhost:8012/api/ > /dev/null; then
    echo "❌ Django后端启动失败"
    exit 1
fi

echo "✅ Django后端启动成功，运行在 http://localhost:8012"

# 返回项目根目录
cd ..

# 创建Nginx配置
echo "🌐 配置Nginx反向代理..."
cat > nginx_production.conf << 'EOF'
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
    use epoll;
    multi_accept on;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # 日志格式
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;

    # 基本设置
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    client_max_body_size 100M;

    # Gzip压缩
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml+rss
        application/atom+xml
        image/svg+xml;

    # 上游服务器配置
    upstream django_backend {
        server 127.0.0.1:8012;
        keepalive 32;
    }

    # HTTP重定向到HTTPS
    server {
        listen 80;
        server_name _;
        return 301 https://$host$request_uri;
    }

    # 后端API直接访问端口 (8012)
    server {
        listen 8012;
        server_name _;
        
        # 允许跨域
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization' always;
        add_header 'Access-Control-Expose-Headers' 'Content-Length,Content-Range' always;
        
        if ($request_method = 'OPTIONS') {
            add_header 'Access-Control-Allow-Origin' '*';
            add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS';
            add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization';
            add_header 'Access-Control-Max-Age' 1728000;
            add_header 'Content-Type' 'text/plain; charset=utf-8';
            add_header 'Content-Length' 0;
            return 204;
        }

        # API代理
        location / {
            proxy_pass http://django_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_connect_timeout 30s;
            proxy_send_timeout 30s;
            proxy_read_timeout 30s;
            proxy_buffering off;
        }
    }

    # HTTPS服务器配置
    server {
        listen 443 ssl http2;
        server_name _;

        # SSL证书配置
        ssl_certificate /etc/nginx/ssl/server.crt;
        ssl_certificate_key /etc/nginx/ssl/server.key;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA384;
        ssl_prefer_server_ciphers off;
        ssl_session_cache shared:SSL:10m;
        ssl_session_timeout 10m;

        # 安全头
        add_header X-Frame-Options DENY;
        add_header X-Content-Type-Options nosniff;
        add_header X-XSS-Protection "1; mode=block";
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

        # 静态文件服务
        location /static/ {
            alias /var/www/static/;
            expires 1y;
            add_header Cache-Control "public, immutable";
        }

        location /media/ {
            alias /var/www/media/;
            expires 1y;
            add_header Cache-Control "public";
        }

        # API代理
        location /api/ {
            proxy_pass http://django_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_connect_timeout 30s;
            proxy_send_timeout 30s;
            proxy_read_timeout 30s;
            proxy_buffering off;
        }

        # 管理后台
        location /admin/ {
            proxy_pass http://django_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # 前端应用
        location / {
            root /var/www/frontend;
            index index.html;
            try_files $uri $uri/ /index.html;
            
            # 缓存控制
            location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
                expires 1y;
                add_header Cache-Control "public, immutable";
            }
        }

        # 健康检查
        location /health {
            access_log off;
            return 200 "healthy\n";
            add_header Content-Type text/plain;
        }
    }
}
EOF

# 检查Nginx是否安装
if ! command -v nginx &> /dev/null; then
    echo "⚠️  Nginx 未安装，将使用简单的HTTP服务器"
    
    # 使用Python HTTP服务器提供前端
    echo "🌐 启动前端HTTP服务器（端口80）..."
    cd dist
    python3 -m http.server 80 > ../frontend.log 2>&1 &
    FRONTEND_PID=$!
    echo $FRONTEND_PID > ../frontend.pid
    cd ..
    
    echo "✅ 前端HTTP服务器启动成功，运行在 http://localhost:80"
else
    # 创建SSL证书目录
    echo "📜 创建SSL证书目录..."
    sudo mkdir -p /etc/nginx/ssl
    
    # 检查SSL证书
    if [ ! -f "/etc/nginx/ssl/server.crt" ] || [ ! -f "/etc/nginx/ssl/server.key" ]; then
        echo "🔐 生成SSL证书..."
        if [ -f "ssl/generate_cert.sh" ]; then
            chmod +x ssl/generate_cert.sh
            ./ssl/generate_cert.sh
            sudo cp ssl/server.crt /etc/nginx/ssl/
            sudo cp ssl/server.key /etc/nginx/ssl/
            echo "✅ SSL证书已生成"
        else
            echo "⚠️  SSL证书生成脚本不存在，将使用HTTP"
        fi
    else
        echo "✅ SSL证书已存在"
    fi
    
    # 创建静态文件目录
    echo "📁 创建静态文件目录..."
    sudo mkdir -p /var/www/frontend
    sudo mkdir -p /var/www/static
    sudo mkdir -p /var/www/media
    
    # 复制前端文件
    echo "📋 复制前端文件..."
    sudo cp -r dist/* /var/www/frontend/
    sudo cp -r backend/static/* /var/www/static/ 2>/dev/null || true
    sudo cp -r backend/media/* /var/www/media/ 2>/dev/null || true
    
    # 设置权限
    sudo chown -R www-data:www-data /var/www/
    
    # 复制Nginx配置
    echo "⚙️ 配置Nginx..."
    sudo cp nginx_production.conf /etc/nginx/nginx.conf
    
    # 测试Nginx配置
    echo "🧪 测试Nginx配置..."
    if sudo nginx -t; then
        echo "✅ Nginx配置正确"
        
        # 启动Nginx
        echo "🚀 启动Nginx服务器..."
        sudo nginx -s reload 2>/dev/null || sudo nginx
        echo "✅ Nginx启动成功"
    else
        echo "❌ Nginx配置错误"
        echo "⚠️  将使用简单的HTTP服务器"
        
        # 使用Python HTTP服务器提供前端
        echo "🌐 启动前端HTTP服务器（端口80）..."
        cd dist
        python3 -m http.server 80 > ../frontend.log 2>&1 &
        FRONTEND_PID=$!
        echo $FRONTEND_PID > ../frontend.pid
        cd ..
        
        echo "✅ 前端HTTP服务器启动成功，运行在 http://localhost:80"
    fi
fi

# 检查服务状态
echo "🔍 检查服务状态..."

# 检查后端API
if curl -s http://localhost:8012/api/ > /dev/null 2>&1; then
    echo "✅ 后端API服务正常 (端口 8012)"
else
    echo "❌ 后端API服务异常"
fi

# 检查前端服务
if curl -s http://localhost:80/ > /dev/null 2>&1; then
    echo "✅ 前端HTTP服务正常 (端口 80)"
else
    echo "❌ 前端HTTP服务异常"
fi

# 检查HTTPS服务（如果Nginx可用）
if command -v nginx &> /dev/null; then
    if curl -k -s https://localhost:443/ > /dev/null 2>&1; then
        echo "✅ 前端HTTPS服务正常 (端口 443)"
    else
        echo "❌ 前端HTTPS服务异常"
    fi
fi

echo ""
echo "🎉 本地生产环境启动完成！"
echo "=================================================="
echo "🌐 访问地址："
echo "   前端界面 (HTTP):  http://localhost:80"
if command -v nginx &> /dev/null; then
    echo "   前端界面 (HTTPS): https://localhost:443"
fi
echo "   后端API:          http://localhost:8012/api/"
echo "   管理后台:         http://localhost:8012/admin/"
echo ""
echo "🔑 管理员账号: admin/admin123"
echo ""
echo "🔧 管理命令："
echo "   查看后端日志: tail -f django.log"
echo "   查看前端日志: tail -f frontend.log"
echo "   停止服务: ./stop_services.sh"
echo ""
echo "📊 服务状态："
if [ -f "django.pid" ]; then
    DJANGO_PID=$(cat django.pid)
    if ps -p $DJANGO_PID > /dev/null; then
        echo "   Django后端: 运行中 (PID: $DJANGO_PID)"
    else
        echo "   Django后端: 已停止"
    fi
fi

if [ -f "frontend.pid" ]; then
    FRONTEND_PID=$(cat frontend.pid)
    if ps -p $FRONTEND_PID > /dev/null; then
        echo "   前端服务:   运行中 (PID: $FRONTEND_PID)"
    else
        echo "   前端服务:   已停止"
    fi
fi

echo ""
echo "💡 提示："
echo "   1. 首次访问可能需要接受HTTPS证书"
echo "   2. 确保防火墙开放端口 80, 443, 8012"
echo "   3. 生产环境使用SQLite数据库"
echo "   4. 所有数据存储在本地文件中"
echo ""
