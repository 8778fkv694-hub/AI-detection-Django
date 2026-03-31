#!/bin/bash

# AI检测系统生产环境启动脚本

set -e

echo "🚀 启动AI检测系统生产环境..."

# 等待数据库就绪
echo "⏳ 等待数据库连接..."
python3 -c "
import time
import psycopg2
import os

max_retries = 30
retry_count = 0

while retry_count < max_retries:
    try:
        conn = psycopg2.connect(
            host=os.environ.get('DB_HOST', 'db'),
            port=os.environ.get('DB_PORT', '5432'),
            database=os.environ.get('POSTGRES_DB', 'qainspect'),
            user=os.environ.get('POSTGRES_USER', 'qainspect'),
            password=os.environ.get('POSTGRES_PASSWORD', 'qainspect123')
        )
        conn.close()
        print('✅ 数据库连接成功')
        break
    except psycopg2.OperationalError:
        retry_count += 1
        print(f'⏳ 等待数据库连接... ({retry_count}/{max_retries})')
        time.sleep(2)
else:
    print('❌ 数据库连接失败')
    exit(1)
"

# 等待Redis就绪
echo "⏳ 等待Redis连接..."
python3 -c "
import time
import redis
import os

max_retries = 30
retry_count = 0

while retry_count < max_retries:
    try:
        r = redis.Redis(
            host=os.environ.get('REDIS_HOST', 'redis'),
            port=os.environ.get('REDIS_PORT', '6379'),
            password=os.environ.get('REDIS_PASSWORD', 'redis123'),
            decode_responses=True
        )
        r.ping()
        print('✅ Redis连接成功')
        break
    except redis.ConnectionError:
        retry_count += 1
        print(f'⏳ 等待Redis连接... ({retry_count}/{max_retries})')
        time.sleep(2)
else:
    print('❌ Redis连接失败')
    exit(1)
"

# 进入后端目录
cd /app/backend

# 收集静态文件
echo "📦 收集静态文件..."
python3 manage.py collectstatic --noinput

# 数据库迁移
echo "🗄️ 执行数据库迁移..."
python3 manage.py migrate --noinput

# 创建超级用户（如果不存在）
echo "👤 检查超级用户..."
python3 manage.py shell -c "
from django.contrib.auth import get_user_model
User = get_user_model()
if not User.objects.filter(username='admin').exists():
    User.objects.create_superuser('admin', 'admin@example.com', 'admin123')
    print('✅ 创建默认超级用户: admin/admin123')
else:
    print('✅ 超级用户已存在')
"

# 创建必要的目录
mkdir -p /app/logs
mkdir -p /var/www/static
mkdir -p /var/www/media
mkdir -p /var/www/frontend

# 复制前端构建文件
echo "📁 复制前端文件..."
cp -r /app/frontend/dist/* /var/www/frontend/

# 设置权限
chown -R app:app /app/logs
chown -R app:app /var/www

echo "✅ 初始化完成，启动服务..."

# 启动supervisor
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
