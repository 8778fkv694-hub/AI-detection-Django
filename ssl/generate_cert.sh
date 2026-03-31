#!/bin/bash

echo "🔐 生成自签名SSL证书用于局域网HTTPS访问"
echo "=================================================="

# 获取本机局域网IP地址
LAN_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1)
if [ -z "$LAN_IP" ]; then
    LAN_IP="192.168.1.100"  # 默认IP
fi

echo "🌐 检测到局域网IP: $LAN_IP"
echo ""

# 生成私钥
echo "生成私钥..."
openssl genrsa -out server.key 2048

# 创建配置文件
cat > server.conf << EOF
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
C = CN
ST = Beijing
L = Beijing
O = WYL Inspection
OU = IT Department
CN = localhost

[v3_req]
keyUsage = keyEncipherment, dataEncipherment, digitalSignature
extendedKeyUsage = serverAuth, clientAuth
subjectAltName = @alt_names
basicConstraints = CA:FALSE

[alt_names]
DNS.1 = localhost
DNS.2 = $LAN_IP
DNS.3 = *.localhost
DNS.4 = *.local
IP.1 = 127.0.0.1
IP.2 = $LAN_IP
IP.3 = ::1
EOF

# 生成证书签名请求
echo "生成证书签名请求..."
openssl req -new -key server.key -out server.csr -config server.conf

# 生成自签名证书
echo "生成自签名证书..."
openssl x509 -req -in server.csr -signkey server.key -out server.crt -days 365 -extensions v3_req -extfile server.conf

# 清理临时文件
rm server.csr server.conf

echo ""
echo "✅ SSL证书生成完成！"
echo "=================================================="
echo "📁 生成的文件:"
echo "   - server.key (私钥)"
echo "   - server.crt (证书)"
echo ""
echo "🌐 证书信息:"
echo "   - 通用名称: localhost"
echo "   - 有效期: 365天"
echo "   - 支持地址: localhost, $LAN_IP, *.localhost, *.local"
echo "   - 密钥用途: 数字签名、密钥加密、数据加密"
echo "   - 扩展密钥用途: 服务器认证、客户端认证"
echo ""
echo "⚠️  注意："
echo "   - 这是自签名证书，浏览器会显示安全警告"
echo "   - 在局域网内使用时，可以手动信任此证书"
echo "   - 生产环境建议使用正式的SSL证书"