#!/bin/bash

echo "🔍 SSL证书详细信息检查"
echo "=================================================="

if [ ! -f "server.crt" ] || [ ! -f "server.key" ]; then
    echo "❌ SSL证书文件不存在"
    exit 1
fi

echo "📋 证书文件信息:"
echo "   - 证书文件: server.crt"
echo "   - 私钥文件: server.key"
echo ""

echo "🔐 证书详细信息:"
openssl x509 -in server.crt -text -noout | grep -E "(Subject:|Issuer:|Not Before|Not After|DNS:|IP Address:|Key Usage:|Extended Key Usage:)" | head -20
echo ""

echo "🌐 证书支持的域名和IP:"
openssl x509 -in server.crt -text -noout | grep -A 10 "Subject Alternative Name" | grep -E "(DNS:|IP Address:)"
echo ""

echo "🔑 私钥信息:"
openssl rsa -in server.key -text -noout | grep -E "(RSA Private-Key|Public-Key|Modulus|Exponent)" | head -5
echo ""

echo "✅ 证书检查完成"
echo ""
echo "💡 如果证书配置正确，现在应该可以正常访问HTTPS页面"
echo "🌐 访问地址: https://172.20.10.10:8443/"
