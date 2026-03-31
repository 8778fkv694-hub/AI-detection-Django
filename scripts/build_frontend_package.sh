#!/bin/bash

echo "📦 WYL检测法前端部署包构建脚本"
echo "=================================================="
echo "此脚本将构建前端部署包，供其他设备使用"
echo ""

# 检查是否在正确的目录
if [ ! -f "package.json" ]; then
    echo "❌ 错误：请在项目根目录运行此脚本"
    exit 1
fi

# 获取本机局域网IP地址
LAN_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1)
if [ -z "$LAN_IP" ]; then
    LAN_IP="192.168.1.100"  # 默认IP
fi

echo "🌐 检测到局域网IP: $LAN_IP"
echo ""

# 检查并安装Node.js依赖
echo "📦 检查前端依赖..."
if [ ! -d "node_modules" ]; then
    echo "安装前端依赖..."
    npm install
fi

# 更新前端配置文件中的IP地址
echo "🔧 更新前端配置..."
sed -i.bak "s/192.168.1.100/$LAN_IP/g" frontend-config.js
sed -i.bak "s/192.168.1.100/$LAN_IP/g" frontend-config.js

# 构建前端
echo "🏗️  构建前端..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ 前端构建失败"
    exit 1
fi

# 创建部署包目录
echo "📁 创建部署包..."
DEPLOY_DIR="frontend-deploy-package-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DEPLOY_DIR"

# 复制构建文件
echo "📋 复制构建文件..."
cp -r dist/* "$DEPLOY_DIR/"
cp frontend-config.js "$DEPLOY_DIR/"

# 创建启动脚本
echo "📝 创建启动脚本..."
cat > "$DEPLOY_DIR/start_frontend.sh" << EOF
#!/bin/bash

echo "🚀 WYL检测法前端启动脚本"
echo "=================================================="
echo "此脚本用于在其他设备上启动前端服务"
echo ""

# 检查是否安装了Python3
if ! command -v python3 &> /dev/null; then
    echo "❌ 错误：未安装Python3，请先安装Python3"
    exit 1
fi

# 启动HTTP服务器
echo "🌐 启动HTTP服务器..."
echo "前端将在以下地址可用："
echo "   http://localhost:8080"
echo "   http://0.0.0.0:8080 (局域网访问)"
echo ""

# 启动Python HTTP服务器
cd "\$(dirname "\$0")"
python3 -m http.server 8080 --bind 0.0.0.0

echo ""
echo "✅ 前端服务已启动！"
echo "🌐 访问地址: http://localhost:8080"
echo "🌐 局域网地址: http://0.0.0.0:8080"
echo ""
echo "按 Ctrl+C 停止服务"
EOF

# 创建Windows启动脚本
cat > "$DEPLOY_DIR/start_frontend.bat" << EOF
@echo off
echo 🚀 WYL检测法前端启动脚本
echo ==================================================
echo 此脚本用于在其他设备上启动前端服务
echo.

REM 检查是否安装了Python3
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ 错误：未安装Python，请先安装Python
    pause
    exit /b 1
)

REM 启动HTTP服务器
echo 🌐 启动HTTP服务器...
echo 前端将在以下地址可用：
echo    http://localhost:8080
echo    http://0.0.0.0:8080 (局域网访问)
echo.

REM 启动Python HTTP服务器
cd /d "%~dp0"
python -m http.server 8080 --bind 0.0.0.0

echo.
echo ✅ 前端服务已启动！
echo 🌐 访问地址: http://localhost:8080
echo 🌐 局域网地址: http://0.0.0.0:8080
echo.
pause
EOF

# 创建README文件
echo "📖 创建说明文档..."
cat > "$DEPLOY_DIR/README.md" << EOF
# WYL检测法前端部署包

## 📋 部署说明

### 1. 环境要求
- Python 3.6+ 或 Node.js 14+
- 现代浏览器（Chrome、Firefox、Safari、Edge）

### 2. 快速启动

#### 方法一：使用Python（推荐）
\`\`\`bash
# Linux/Mac
chmod +x start_frontend.sh
./start_frontend.sh

# Windows
start_frontend.bat
\`\`\`

#### 方法二：使用Node.js
\`\`\`bash
# 安装http-server
npm install -g http-server

# 启动服务
http-server -p 8080 -a 0.0.0.0
\`\`\`

### 3. 访问地址
- 本机访问: http://localhost:8080
- 局域网访问: http://[本机IP]:8080

### 4. 配置说明
- 后端API地址已在 \`frontend-config.js\` 中配置
- 默认指向: https://$LAN_IP:8443/api
- 如需修改，请编辑 \`frontend-config.js\` 文件

### 5. 注意事项
- 确保部署设备已启动后端服务
- 确保网络连接正常
- 首次访问可能需要信任自签名SSL证书

## 🔧 故障排除

### 无法访问前端
1. 检查端口8080是否被占用
2. 检查防火墙设置
3. 确认启动脚本执行成功

### 无法连接后端
1. 检查后端服务是否启动
2. 检查IP地址配置是否正确
3. 检查网络连接

## 📞 技术支持
如有问题，请联系系统管理员。
EOF

# 创建压缩包
echo "🗜️  创建压缩包..."
tar -czf "${DEPLOY_DIR}.tar.gz" "$DEPLOY_DIR"

# 清理临时文件
rm -rf "$DEPLOY_DIR"

echo ""
echo "✅ 前端部署包构建完成！"
echo "=================================================="
echo "📦 部署包文件: ${DEPLOY_DIR}.tar.gz"
echo "🌐 后端IP地址: $LAN_IP"
echo "🔑 后端端口: 8443 (HTTPS)"
echo ""
echo "💡 使用说明："
echo "   1. 将 ${DEPLOY_DIR}.tar.gz 复制到其他设备"
echo "   2. 解压文件: tar -xzf ${DEPLOY_DIR}.tar.gz"
echo "   3. 进入目录: cd ${DEPLOY_DIR}"
echo "   4. 启动前端: ./start_frontend.sh (Linux/Mac) 或 start_frontend.bat (Windows)"
echo "   5. 在浏览器中访问: http://localhost:8080"
echo ""
echo "🔒 安全提醒："
echo "   - 确保在可信的局域网环境中使用"
echo "   - 定期更新SSL证书"
echo "   - 监控网络访问日志"
