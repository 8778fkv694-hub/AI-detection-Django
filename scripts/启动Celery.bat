@echo off
chcp 65001 >nul
echo ========================================
echo WYL视觉质检系统 - Celery工作进程启动脚本
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
    echo 错误：未找到Docker，无法启动Redis服务
    echo 请先安装Docker Desktop
    pause
    exit /b 1
)

echo.
echo 3. 启动Redis服务...
cd ..
docker-compose up -d redis
if errorlevel 1 (
    echo 错误：Redis服务启动失败
    pause
    exit /b 1
)
echo Redis服务启动成功

echo.
echo 4. 进入backend目录...
cd backend
if errorlevel 1 (
    echo 错误：未找到backend目录
    pause
    exit /b 1
)

echo.
echo 5. 检查依赖...
pip show celery
if errorlevel 1 (
    echo 错误：Celery未安装，请先运行 启动Django后端.bat
    pause
    exit /b 1
)

echo.
echo 6. 启动Celery工作进程...
echo Celery工作进程正在启动...
echo 按 Ctrl+C 停止工作进程
echo.
celery -A config worker --loglevel=info --concurrency=2

pause
