// scripts/copy-assets.js
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../..');
const ELECTRON_DIR = path.resolve(__dirname, '..');
const NODE_PORT = 5001;

// Helper to copy directory recursively
function copyDirRecursiveSync(src, dest) {
  if (!fs.existsSync(src)) return;
  const exists = fs.existsSync(dest);
  const stats = fs.statSync(src);
  const isDirectory = stats.isDirectory();
  
  if (isDirectory) {
    if (!exists) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyDirRecursiveSync(
        path.join(src, childItemName),
        path.join(dest, childItemName)
      );
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Ensure clean destination directories
function setupDirectory(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

function patchElectronIndexHtml(wwwDest) {
  const indexPath = path.join(wwwDest, 'index.html');
  if (!fs.existsSync(indexPath)) {
    console.warn('  -> Electron index.html not found, skipping desktop patch.');
    return;
  }

  let html = fs.readFileSync(indexPath, 'utf8');

  if (!html.includes('http-equiv="Content-Security-Policy"')) {
    html = html.replace(
      /<head>/i,
      `<head>
    <meta http-equiv="Content-Security-Policy" content="default-src 'self' file:; script-src 'self' 'unsafe-inline' file:; style-src 'self' 'unsafe-inline' file:; img-src 'self' data: blob: file: http://127.0.0.1:${NODE_PORT}; font-src 'self' data: file:; connect-src 'self' file: http://127.0.0.1:${NODE_PORT} ws://127.0.0.1:${NODE_PORT}; worker-src 'self' blob: file:; media-src 'self' blob: file: http://127.0.0.1:${NODE_PORT}; object-src 'none'; base-uri 'self';">`
    );
  }

  html = html.replace(
    /<script>\s*window\.__IS_MOBILE_APP__\s*=\s*true;\s*<\/script>\s*<script src="\.\/node-launcher\.js"><\/script>/,
    `<script>
      var __electronIndexUrl = window.location.href.split('#')[0];
      window.__ELECTRON_ASSET_BASE__ = __electronIndexUrl.substring(0, __electronIndexUrl.lastIndexOf('/') + 1);
      try { window.__IS_ELECTRON__ = true; } catch (e) {}
      window.__IS_MOBILE_APP__ = false;
      window.__NODE_SERVER_PORT = ${NODE_PORT};
    </script>
    <script src="./electron-launcher.js"></script>`
  );

  html = html.replace('正在启动本地离线服务...', '正在启动桌面端本地服务...');
  html = html.replace('移动端离线客户端 v1.0.0', 'Electron 桌面端 v1.0.0');

  fs.writeFileSync(indexPath, html);
  console.log('  -> Patched Electron desktop index.html.');
}

function writeElectronLauncher(wwwDest) {
  const launcher = `/**
 * Electron Launcher - waits for the embedded desktop API server.
 */
(function () {
  'use strict';

  var NODE_PORT = window.__NODE_SERVER_PORT || ${NODE_PORT};
  var HEALTH_URL = 'http://127.0.0.1:' + NODE_PORT + '/health';
  var MAX_RETRY = 80;
  var RETRY_INTERVAL = 250;

  try { window.__IS_ELECTRON__ = true; } catch (e) {}
  try { window.__IS_MOBILE_APP__ = false; } catch (e) {}
  if (!window.__ELECTRON_ASSET_BASE__) {
    var electronIndexUrl = window.location.href.split('#')[0];
    window.__ELECTRON_ASSET_BASE__ = electronIndexUrl.substring(0, electronIndexUrl.lastIndexOf('/') + 1);
  }

  var API_ORIGIN = 'http://127.0.0.1:' + NODE_PORT;
  window.__LOCAL_API_ORIGIN__ = API_ORIGIN;

  if (!window.__ELECTRON_FETCH_PATCHED__) {
    var originalFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      if (typeof input === 'string') {
        if (input.indexOf('/api/') === 0 || input === '/api') {
          input = API_ORIGIN + input;
        } else if (input.indexOf('file:///api/') === 0) {
          input = API_ORIGIN + input.substring('file://'.length);
        }
      } else if (input && typeof input.url === 'string') {
        var nextUrl = input.url;
        if (nextUrl.indexOf('/api/') === 0 || nextUrl === '/api') {
          nextUrl = API_ORIGIN + nextUrl;
        } else if (nextUrl.indexOf('file:///api/') === 0) {
          nextUrl = API_ORIGIN + nextUrl.substring('file://'.length);
        }
        if (nextUrl !== input.url) {
          input = new Request(nextUrl, input);
        }
      }
      return originalFetch(input, init);
    };
    window.__ELECTRON_FETCH_PATCHED__ = true;
  }

  function setLoadingText(message) {
    var txt = document.getElementById('app-loading-text');
    if (txt) txt.textContent = message;
  }

  function hideLoadingWhenReady(data) {
    window.__NODE_SERVER_READY = true;
    window.__NODE_SERVER_PORT = NODE_PORT;
    window.dispatchEvent(new CustomEvent('node-server-ready', { detail: data }));

    var attempts = 0;
    function tryHide() {
      attempts++;
      if (typeof window._hideAppLoading === 'function') {
        window._hideAppLoading();
        return;
      }
      if (attempts < 80) {
        setTimeout(tryHide, 50);
      }
    }
    tryHide();
  }

  function startHealthCheck() {
    var attempts = 0;

    function check() {
      attempts++;
      var xhr = new XMLHttpRequest();
      xhr.open('GET', HEALTH_URL, true);
      xhr.timeout = 1500;
      xhr.onload = function () {
        if (xhr.status === 200) {
          try {
            var data = JSON.parse(xhr.responseText);
            console.log('[ElectronLauncher] Health check OK:', data);
            setLoadingText('本地服务已就绪，正在进入系统...');
            hideLoadingWhenReady(data);
          } catch (e) {
            retry();
          }
        } else {
          retry();
        }
      };
      xhr.onerror = retry;
      xhr.ontimeout = retry;
      xhr.send();
    }

    function retry() {
      if (attempts >= MAX_RETRY) {
        setLoadingText('桌面端本地服务启动超时，请重启应用');
        console.error('[ElectronLauncher] Local API server startup timeout:', HEALTH_URL);
        return;
      }
      if (attempts === 8) setLoadingText('正在等待本地 API 服务...');
      if (attempts === 24) setLoadingText('本地服务启动较慢，继续等待...');
      setTimeout(check, RETRY_INTERVAL);
    }

    check();
  }

  startHealthCheck();
})();`;

  fs.writeFileSync(path.join(wwwDest, 'electron-launcher.js'), launcher);
  console.log('  -> Wrote Electron desktop launcher.');
}

function writeDesktopServerMain(serverDest) {
  const serverMain = `'use strict';

console.log('[desktop-node] main.js starting, Node version:', process.version);

const express = require('express');
const cors = require('cors');

const PORT = Number(process.env.ELECTRON_API_PORT || ${NODE_PORT});
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
`;

  fs.writeFileSync(path.join(serverDest, 'main.js'), serverMain);
  console.log('     + main.js (Electron desktop Express bootloader)');
}

function runSync() {
  console.log('📦 Starting Electron Asset Synchronization...');

  // 1. Setup destinations
  const wwwDest = path.join(ELECTRON_DIR, 'www');
  const serverDest = path.join(ELECTRON_DIR, 'src/server');
  setupDirectory(wwwDest);
  setupDirectory(serverDest);

  // 2. Copy compiled React mobile pages
  const mobileDistSource = path.join(ROOT_DIR, 'android-app/www/dist');
  if (fs.existsSync(mobileDistSource)) {
    console.log('  -> Copying React web assets...');
    copyDirRecursiveSync(mobileDistSource, wwwDest);
    patchElectronIndexHtml(wwwDest);
    writeElectronLauncher(wwwDest);
  } else {
    console.error('  ❌ Error: React build folder not found! Run npm run build:mobile first.');
    process.exit(1);
  }

  // 3. Copy ONNX Runtime WASM binaries
  console.log('  -> Copying ONNX Runtime WASM binaries...');
  const wasmSrc = path.join(ROOT_DIR, 'node_modules/onnxruntime-web/dist');
  if (fs.existsSync(wasmSrc)) {
    const files = fs.readdirSync(wasmSrc);
    files.forEach(file => {
      if (file.endsWith('.wasm')) {
        fs.copyFileSync(path.join(wasmSrc, file), path.join(wwwDest, file));
        console.log(`     + ${file}`);
      }
    });
  }

  // 4. Copy ONNX models to frontend www/models
  console.log('  -> Copying ONNX models...');
  const modelsDest = path.join(wwwDest, 'models');
  fs.mkdirSync(modelsDest, { recursive: true });
  
  const modelsSrc = path.join(ROOT_DIR, 'models');
  if (fs.existsSync(modelsSrc)) {
    const files = fs.readdirSync(modelsSrc);
    files.forEach(file => {
      if (file.endsWith('.onnx')) {
        fs.copyFileSync(path.join(modelsSrc, file), path.join(modelsDest, file));
        const sizeMb = (fs.statSync(path.join(modelsDest, file)).size / (1024 * 1024)).toFixed(1);
        console.log(`     + ${file} (${sizeMb} MB)`);
      }
    });
  }

  // 5. Copy Express server backend files
  console.log('  -> Copying local API server files...');
  const serverSrcDest = path.join(serverDest, 'src/server');
  fs.mkdirSync(serverSrcDest, { recursive: true });

  const databaseJs = path.join(ROOT_DIR, 'src/server/database.js');
  const apiJs = path.join(ROOT_DIR, 'src/server/api.js');
  
  if (fs.existsSync(databaseJs)) {
    fs.copyFileSync(databaseJs, path.join(serverSrcDest, 'database.js'));
  }
  if (fs.existsSync(apiJs)) {
    fs.copyFileSync(apiJs, path.join(serverSrcDest, 'api.js'));
  }

  // Copy or generate DB seed file
  const dbSeedDest = path.join(serverSrcDest, 'db-seed.json');
  const localDb = path.join(ROOT_DIR, 'data/db.json');
  if (fs.existsSync(localDb)) {
    fs.copyFileSync(localDb, dbSeedDest);
    console.log('     + src/server/db-seed.json (from existing data)');
  } else {
    const defaultDb = {
      results: [],
      standards: [],
      modelVersions: [],
      ppeModelStatus: { isLoaded: false, lastUpdated: null, version: '1.0.0' }
    };
    fs.writeFileSync(dbSeedDest, JSON.stringify(defaultDb, null, 2));
    console.log('     + src/server/db-seed.json (generated default)');
  }

  writeDesktopServerMain(serverDest);

  console.log('🎉 Asset synchronization completed successfully!');
}

runSync();
