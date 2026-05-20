import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: './', // 极其重要：确保资源以相对路径加载，兼容 Cordova/Capacitor file:// 协议
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, 'android-app/www/dist'),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index-mobile.html'),
      },
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  optimizeDeps: {
    exclude: ['onnxruntime-web'], // 排除预构建，让运行时动态加载 WASM
  },
  define: {
    // 允许前端环境变量覆盖
    'import.meta.env.VITE_BACKEND_DETECTION': JSON.stringify('false'), // 移动端离线默认不使用远程 Python 后端
  }
});
