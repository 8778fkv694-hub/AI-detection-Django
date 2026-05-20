/**
 * Electron Launcher - waits for the embedded desktop API server.
 */
(function () {
  'use strict';

  var NODE_PORT = window.__NODE_SERVER_PORT || 5001;
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
})();