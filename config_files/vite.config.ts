
    import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import fs from 'fs'

// 检查SSL证书是否存在
const sslKeyPath = './ssl/server.key';
const sslCertPath = './ssl/server.crt';
const hasSSL = true; // 启用HTTPS（macOS摄像头需要HTTPS）

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // 支持局域网访问
    port: 3303,
    ...(hasSSL && {
      https: {
        key: fs.readFileSync(sslKeyPath),
        cert: fs.readFileSync(sslCertPath),
      }
    }),
    cors: true,
    proxy: {
      // 特定AI分析请求转发到Node.js服务器
      '/api/ai/analyze': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('AI analyze proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('Sending AI Analyze Request to Node.js:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('Received AI Analyze Response from Node.js:', proxyRes.statusCode, req.url);
          });
        },
      },
      '/api/ai/enhance-analyze': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('AI enhance proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('Sending AI Enhance Request to Node.js:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('Received AI Enhance Response from Node.js:', proxyRes.statusCode, req.url);
          });
        },
      },
      '/api/ai/test': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('AI test proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('Sending AI Test Request to Node.js:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('Received AI Test Response from Node.js:', proxyRes.statusCode, req.url);
          });
        },
      },
      // AI配置相关请求转发到Node.js服务器
      '/api/ai-configs': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('AI configs proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('Sending AI Configs Request to Node.js:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('Received AI Configs Response from Node.js:', proxyRes.statusCode, req.url);
          });
        },
      },
      // RPA文件管理API请求转发到RPA服务器
      '/api/rpa': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
        secure: false,
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('RPA proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('Sending RPA Request to RPA Server:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('Received RPA Response from RPA Server:', proxyRes.statusCode, req.url);
          });
        },
      },
      // 所有其他API请求转发到Django后端
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('Django proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('Sending Request to Django:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('Received Response from Django:', proxyRes.statusCode, req.url);
          });
        },
      }
    },
    // 添加开发服务器配置
    open: false, // 不自动打开浏览器
    hmr: {
      overlay: false, // 禁用错误覆盖层
    }
  },
  preview: {
    host: '0.0.0.0', // 支持局域网访问
    port: 3303,
    ...(hasSSL && {
      https: {
        key: fs.readFileSync(sslKeyPath),
        cert: fs.readFileSync(sslCertPath),
      }
    }),
  },
  // 添加构建配置
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  // 添加解析配置
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
  