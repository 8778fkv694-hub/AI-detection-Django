@echo off
chcp 65001 >nul
echo ========================================
echo WYL视觉质检系统 - Django后端启动脚本
echo ========================================
echo.

echo 1. 检查Python环境...
python --version
if errorlevel 1 (
    echo 错误：未找到Python，请先安装Python 3.8+
    pause
    exit /b 1
)

echo.
echo 2. 检查Docker环境...
docker --version
if errorlevel 1 (
    echo 警告：未找到Docker，将使用SQLite数据库
    set USE_DOCKER=false
) else (
    echo Docker已安装
    set USE_DOCKER=true
)

echo.
echo 3. 进入backend目录...
cd backend
if errorlevel 1 (
    echo 错误：未找到backend目录
    pause
    exit /b 1
)

echo.
echo 4. 安装Python依赖...
pip install -r requirements.txt
if errorlevel 1 (
    echo 错误：依赖安装失败
    pause
    exit /b 1
)

echo.
if "%USE_DOCKER%"=="true" (
    echo 5. 启动数据库服务...
    cd ..
    docker-compose up -d db redis
    if errorlevel 1 (
        echo 警告：Docker服务启动失败，将使用SQLite
        set USE_DOCKER=false
    ) else (
        echo 数据库服务启动成功
    )
    cd backend
) else (
    echo 5. 跳过数据库服务启动（使用SQLite）
)

echo.
echo 6. 初始化数据库...
python manage.py migrate
if errorlevel 1 (
    echo 错误：数据库迁移失败
    pause
    exit /b 1
)

echo.
echo 7. 创建超级用户（如果不存在）...
python manage.py shell -c "
from django.contrib.auth.models import User
if not User.objects.filter(is_superuser=True).exists():
    User.objects.create_superuser('admin', 'admin@example.com', 'admin123')
    print('超级用户已创建: admin/admin123')
else:
    print('超级用户已存在')
"

echo.
echo 8. 启动Django开发服务器...
echo 服务器将在 http://localhost:8000 运行
echo 管理界面: http://localhost:8000/admin
echo API文档: http://localhost:8000/api/
echo 按 Ctrl+C 停止服务器
echo.
python manage.py runserver 0.0.0.0:8000

pause
