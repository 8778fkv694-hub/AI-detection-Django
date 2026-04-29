const express = require('express');
const cors = require('cors');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件配置
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 代理 /api 到 Django 后端
// 注意：使用 router 函数来保留完整路径
const apiProxy = createProxyMiddleware({
    target: 'http://localhost:8000',
    changeOrigin: true,
    pathRewrite: (path) => `/api${path}`,
    logLevel: 'warn'
});

app.use('/api', apiProxy);

// 健康检查端点
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'AI-Detection Production Server'
    });
});

// 提供静态文件 (生产模式)
app.use(express.static(path.join(__dirname, 'dist')));

// SPA 回退 - 所有未匹配的路由返回 index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// 错误处理中间件
app.use((err, req, res, next) => {
    console.error('服务器错误:', err);
    res.status(500).json({
        error: '内部服务器错误',
        message: err.message
    });
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`🚀 AI-Detection 生产服务器已启动`);
    console.log(`📡 端口: ${PORT}`);
    console.log(`🌐 健康检查: http://localhost:${PORT}/health`);
    console.log(`🔄 Django API 代理: /api/* -> http://localhost:8000/api/*`);
});
