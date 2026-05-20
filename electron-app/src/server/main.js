'use strict';

console.log('[desktop-node] main.js starting, Node version:', process.version);

const express = require('express');
const cors = require('cors');

const PORT = Number(process.env.ELECTRON_API_PORT || 5001);
const HOST = process.env.ELECTRON_API_HOST || '127.0.0.1';

const app = express();

app.use(cors({
  origin: (origin, cb) => cb(null, true),
  credentials: true,
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const apiRouter = require('./src/server/api');
app.use('/api', apiRouter);

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Embedded Node.js Desktop Server',
    port: PORT
  });
});

app.use((err, req, res, next) => {
  console.error('[desktop-node] Server error:', err);
  res.status(500).json({
    error: '内部服务器错误',
    message: err.message
  });
});

const server = app.listen(PORT, HOST, () => {
  console.log('[desktop-node] listening on http://' + HOST + ':' + PORT);
});

server.on('error', (err) => {
  console.error('[desktop-node] failed to listen on port ' + PORT + ':', err);
});

module.exports = server;
