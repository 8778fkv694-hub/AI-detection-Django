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

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 挂载主项目的 API 路由
const apiRouter = require('./src/server/api');
app.use('/api', apiRouter);

// 健康检查
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'Embedded Node.js Mobile Server',
    port: PORT
  });
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
