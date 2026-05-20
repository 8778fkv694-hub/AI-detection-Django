import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import AppMobile from './AppMobile';
import './index.css';

// 标记移动端环境，供全局或组件内部判断
(window as any).__IS_MOBILE_APP__ = true;

function mountReact() {
  if ((window as any).__REACT_MOUNTED__) return;
  (window as any).__REACT_MOUNTED__ = true;
  console.log('[main-mobile] mountReact called');
  
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <AppMobile />
      </BrowserRouter>
    </StrictMode>
  );
}

// 在 Capacitor APK 内：等本地 Node 服务就绪再挂载，避免首次 fetch 触发 "Failed to fetch"
const isCapacitor = typeof (window as any).cordova !== 'undefined';
if (isCapacitor) {
  if ((window as any).__NODE_SERVER_READY) {
    console.log('[main-mobile] node already ready, mounting React immediately');
    mountReact();
  } else {
    console.log('[main-mobile] waiting for node-server-ready...');
    window.addEventListener('node-server-ready', () => {
      console.log('[main-mobile] node ready, mounting React');
      mountReact();
    }, { once: true });
    
    // 兜底：45 秒后强行挂载
    setTimeout(() => {
      if (!(window as any).__REACT_MOUNTED__) {
        console.warn('[main-mobile] timeout 45s, mounting anyway');
        mountReact();
      }
    }, 45000);
  }
} else {
  mountReact();
}
