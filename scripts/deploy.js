const express = require('express');
const cors = require('cors');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

// 导入 API 路由
const apiRouter = require('./src/server/api');

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件配置
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API 路由
app.use('/api', apiRouter);

// 代理到 Django 后端
const djangoProxy = createProxyMiddleware({
  target: 'http://localhost:8000',
  changeOrigin: true,
  pathRewrite: {
    '^/api/django': '/api'
  }
});

app.use('/api/django', djangoProxy);

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'Node.js Development Server'
  });
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
  console.log(`🚀 Node.js 开发服务器已启动`);
  console.log(`📡 端口: ${PORT}`);
  console.log(`🌐 健康检查: http://localhost:${PORT}/health`);
  console.log(`📊 API 端点: http://localhost:${PORT}/api`);
  console.log(`🔄 Django 代理: http://localhost:${PORT}/api/django`);
});
