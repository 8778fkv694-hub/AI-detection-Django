/**
 * WYL AI 检测系统移动端 Node 服务入口
 * 监听 0.0.0.0:5001，前端 WebView 通过 localhost 访问
 */
'use strict';

console.log('[mobile-node] main.js starting, Node version:', process.version);

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const PORT = 5001;
const HOST = '0.0.0.0';

const app = express();

// CORS：允许本机 WebView 访问
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return cb(null, true);
    if (origin === 'file://' || origin.startsWith('capacitor://')) return cb(null, true);
    return cb(null, true); // 移动端调试和运行期间允许多源
  },
  credentials: true,
}));

// 跨域隔离 (COOP/COEP) 核心中间件：允许前端 WebView 在启用 Cross-Origin Isolation 下拉取数据
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 挂载主项目的 API 路由
const apiRouter = require('./src/server/api');
app.use('/api', apiRouter);

// 跨域隔离 (COOP/COEP) 核心中间件：使整个 WebView 运行在安全隔离上下文，完美激活 SharedArrayBuffer
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});

// 静态前端文件托管
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  console.log('[mobile-node] Static dist directory found, registering express.static:', distPath);
  app.use(express.static(distPath));
} else {
  console.warn('[mobile-node] Static dist directory NOT found:', distPath);
}

// 健康检查
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'Embedded Node.js Mobile Server',
    port: PORT
  });
});

// SPA 页面路由回退：对于任何非 API/Health 且非静态资源的请求，返回 index.html 供前端路由接管
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/health')) {
    return next();
  }
  const indexHtml = path.join(distPath, 'index.html');
  if (fs.existsSync(indexHtml)) {
    res.sendFile(indexHtml);
  } else {
    res.status(404).send('React Build Assets Not Found');
  }
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('[mobile-node] Server error:', err);
  res.status(500).json({ 
    error: '内部服务器错误',
    message: err.message 
  });
});

// 启动服务器
function start() {
  app.listen(PORT, HOST, () => {
    console.log('[mobile-node] listening on http://' + HOST + ':' + PORT);

    // 通知前端 Node 已就绪
    try {
      const cordova = require('cordova-bridge');
      if (cordova && cordova.channel) {
        cordova.channel.post('server-ready', { port: PORT, host: HOST });
      }
    } catch (e) { }
  });
}

start();
