// Ollama代理服务器
// 解决HTTPS页面访问HTTP Ollama服务的CORS问题

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const app = express();
const HTTP_PORT = 11437; // HTTP端口
const HTTPS_PORT = 11438; // HTTPS端口

// 启用CORS
app.use(cors({
    origin: true, // 允许所有源
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// 代理到Ollama服务
app.use('/', createProxyMiddleware({
    target: 'http://localhost:11434',
    changeOrigin: true,
    timeout: 60000, // 60秒超时
    proxyTimeout: 60000, // 代理超时
    onError: (err, req, res) => {
        console.error('代理错误:', err);
        res.status(500).json({ error: '代理服务错误' });
    },
    onProxyReq: (proxyReq, req, res) => {
        console.log(`代理请求: ${req.method} ${req.url}`);
    },
    onProxyRes: (proxyRes, req, res) => {
        console.log(`代理响应: ${proxyRes.statusCode} ${req.url}`);
    }
}));

// 启动HTTP服务器（用于开发环境）
http.createServer(app).listen(HTTP_PORT, () => {
    console.log(`🚀 Ollama代理服务启动成功!`);
    console.log(`📡 HTTP代理地址: http://localhost:${HTTP_PORT}`);
    console.log(`🔗 目标地址: http://localhost:11434`);
    console.log(`🌐 支持HTTP页面访问`);
});

// 尝试启动HTTPS服务器（如果证书存在）
try {
    const sslPath = path.join(__dirname, 'ssl');
    const options = {
        key: fs.readFileSync(path.join(sslPath, 'server.key')),
        cert: fs.readFileSync(path.join(sslPath, 'server.crt'))
    };
    
    https.createServer(options, app).listen(HTTPS_PORT, () => {
        console.log(`📡 HTTPS代理地址: https://localhost:${HTTPS_PORT}`);
        console.log(`🌐 支持HTTPS页面访问`);
    });
} catch (error) {
    console.log(`⚠️  HTTPS服务启动失败: ${error.message}`);
    console.log(`💡 请使用HTTP代理: http://localhost:${HTTP_PORT}`);
}

// 优雅关闭
process.on('SIGINT', () => {
    console.log('\n🛑 停止Ollama代理服务...');
    process.exit(0);
});
