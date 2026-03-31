@echo off
chcp 65001 >nul
echo ========================================
echo WYL视觉质检系统 - Django后端API测试
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
echo 2. 进入backend目录...
cd backend
if errorlevel 1 (
    echo 错误：未找到backend目录
    pause
    exit /b 1
)

echo.
echo 3. 检查Django服务器是否运行...
echo 正在检查 http://localhost:8000 ...
timeout /t 2 /nobreak >nul

echo.
echo 4. 运行API测试...
python test_api.py
if errorlevel 1 (
    echo.
    echo 测试失败！请确保：
    echo 1. Django服务器正在运行
    echo 2. 数据库已初始化
    echo 3. 所有依赖已安装
    echo.
    echo 运行 启动Django后端.bat 来启动服务器
)

echo.
pause
