/**
 * Node Launcher — 移动端嵌入式 Node 启动器
 * 
 * 职责：
 * 1. 检测是否在 Capacitor APK 环境（有 cordova 对象）
 * 2. 启动 nodejs-mobile 运行时
 * 3. 轮询健康检查，确认 Node 服务就绪
 * 4. 就绪后隐藏 loading，通知前端可以开始 fetch API
 */
(function () {
  'use strict';

  var NODE_PORT = 5001;
  var HEALTH_URL = 'http://127.0.0.1:' + NODE_PORT + '/health';
  var MAX_RETRY = 60;
  var RETRY_INTERVAL = 500;

  // 不在 Capacitor 环境（浏览器开发调试）— 直接跳过
  if (typeof cordova === 'undefined') {
    console.log('[NodeLauncher] Not in Capacitor environment, skipping node bootstrap');
    setTimeout(function() {
      if (window._hideAppLoading) window._hideAppLoading();
    }, 100);
    return;
  }

  console.log('[NodeLauncher] Capacitor detected, starting embedded Node...');

  // 监听 Node 就绪事件
  document.addEventListener('deviceready', onDeviceReady, false);

  function onDeviceReady() {
    console.log('[NodeLauncher] device ready');

    // nodejs-mobile-cordova 通过 plugin.xml clobbers="nodejs" 挂到 window.nodejs
    var nodejs = window.nodejs;
    if (!nodejs || typeof nodejs.start !== 'function') {
      console.error('[NodeLauncher] NodeJS plugin not found on window.nodejs');
      showError('NodeJS 插件未找到');
      return;
    }

    // 监听 server-ready 事件
    nodejs.channel.on('server-ready', function (msg) {
      console.log('[NodeLauncher] Received server-ready:', msg);
      startHealthCheck();
    });

    // 监听错误
    nodejs.channel.on('error', function (err) {
      console.error('[NodeLauncher] Node error:', err);
    });

    // 启动 Node
    nodejs.start('main.js', function (err) {
      if (err) {
        console.error('[NodeLauncher] Failed to start Node:', err);
        showError('启动本地服务失败: ' + err);
      } else {
        console.log('[NodeLauncher] Node process started, polling health...');
        startHealthCheck();
      }
    });
  }

  function startHealthCheck() {
    var attempts = 0;
    function check() {
      attempts++;
      var xhr = new XMLHttpRequest();
      xhr.open('GET', HEALTH_URL, true);
      xhr.timeout = 2000;
      xhr.onload = function () {
        if (xhr.status === 200) {
          try {
            var data = JSON.parse(xhr.responseText);
            console.log('[NodeLauncher] Health check OK:', data);
            window.__NODE_SERVER_READY = true;
            window.__NODE_SERVER_PORT = NODE_PORT;
            if (window._hideAppLoading) window._hideAppLoading();
            // 触发前端就绪事件
            window.dispatchEvent(new CustomEvent('node-server-ready', { detail: data }));
          } catch (e) {
            console.error('[NodeLauncher] Health parse error:', e);
            retry();
          }
        } else {
          retry();
        }
      };
      xhr.onerror = retry;
      xhr.ontimeout = retry;
      xhr.send();

      function retry() {
        if (attempts >= MAX_RETRY) {
          showError('本地服务启动超时，请重启应用');
          return;
        }
        setTimeout(check, RETRY_INTERVAL);
      }
    }
    check();
  }

  function showError(msg) {
    var txt = document.getElementById('app-loading-text');
    if (txt) txt.textContent = msg;
    console.error('[NodeLauncher]', msg);
  }
})();
