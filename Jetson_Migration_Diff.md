# Jetson Nano vs macOS (Original) Migration Differences

本文档总结了为使项目在 Jetson Nano (Ubuntu ARM64) 上稳定运行而对原始 macOS 代码库进行的主要更改。更改主要集中在**环境适配**、**API 路由**和**生产部署策略**上。

## 1. 核心配置与环境检测 (`src/lib/config.ts`)

这是最关键的更改，用于解决前后端端口分离导致的 API 请求失败问题。

*   **macOS (原始)**:
    *   通常依赖 Vite 的 `server.proxy` 在开发模式下转发 `/api` 请求。
    *   生产环境可能假设前后端在同一域下或通过 Nginx 反向代理。
*   **Jetson (修改后)**:
    *   **动态端口检测**: 实现了 `v2` 版本的环境检测逻辑，基于 `window.location.port`。
        *   **开发模式 (Port 3303)**: 认为是开发环境，使用相对路径 `/api`，保留 Vite 代理功能。
        *   **生产模式 (Port 3001)**: 认为是生产环境 (静态服务)，**强制使用绝对 URL** 指向后端端口 (`http://{host}:8000/api`)。
    *   **`apiRequest` 封装**: 引入统一的 `apiRequest` 函数，自动处理 Base URL、CSRF Token 和 Headers，取代散落在代码各处的 `fetch`。

## 2. API 路由与通信修复

解决了 "501 Unsupported method" 和 "404 Not Found" 错误，这些错误是由于请求打到了前端静态服务器 (3001) 而非 Django 后端 (8000) 造成的。

*   **HLS流媒体 (`src/api/streamApi.ts`)**:
    *   **问题**: 原始代码可能返回相对路径或硬编码的 localhost。
    *   **修复**: `getHLSPlaylistUrl` 函数被重写。在生产模式下，它现在构建完整的绝对 URL (`http://192.168.55.1:8000/...`)，确保视频播放器直接从 Django 获取流，而不是尝试从前端由于。
*   **OCR 与 AI 功能 (`useOCRProcessing.ts`, `useFusionAI.ts`)**:
    *   **问题**: 使用了原生的 `fetch('/api/...')`，在 Jetson 生产部署中，这会被解析为 `http://192.168.55.1:3001/api/...`，导致请求失败（因为 3001 端口只托管静态文件，不处理 API）。
    *   **修复**: 全面替换为 `apiRequest('/ocr/extract/', ...)`。注意移除了 `/api` 前缀，因为 `apiRequest` 的 Base URL 已经包含了它。
*   **状态管理与扫描 (`src/state/appStore.ts`, `barcodeDetector.ts`)**:
    *   **修复**: 同样将所有硬编码的 `fetch` 调用替换为 `apiRequest`，确保全局状态同步和二维码检测请求都能正确路由到 8000 端口。

## 3. 生产环境静态服务 (Static Serving)

解决了 "Cannot GET /" 和白屏问题。

*   **macOS (原始)**:
    *   开发使用 `npm run dev`。
    *   生产可能使用 `serve -s dist` 或简单的 Nginx 配置。
*   **Jetson (修改后)**:
    *   **Python SPA Server (`serve_spa.py`)**: 为了这一特定环境的稳定性，创建了一个定制的 Python 脚本来托管 `dist` 文件夹。
    *   它实现了 SPA 路由支持（将所有非文件请求重定向到 `index.html`），比简单的 `http.server` 更健壮，且不依赖 Node.js 的 `serve` 包（在某些 ARM 环境下可能有兼容性微差）。

## 4. 启动脚本 (`run_jetson_*.sh`)

为 Jetson 硬件优化的启动流程。

*   **`run_jetson_production.sh`**:
    *   启动 Django (`:8000`)。
    *   启动 Python 静态服务器 (`:3001`，托管 React 构建产物)。
    *   设置环境变量 `PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True` 以跳过耗时的联网模型检查，加快启动速度。
*   **`run_jetson_simple.sh`**:
    *   仅启动 Django 和 React (Vite 开发模式 `:3303`)。
    *   跳过了 Node.js 中间件 (`:3001` 原本的用途)，适用于不需要复杂本地 LLM 代理的轻量级开发/测试。

## 5. 数据模型与字段映射 (Data Mapping)

由于后端从 Node.js 迁移到 Django (Python)，字段命名规范从 CamelCase 变更为 Snake_Case，需要在前端进行适配。

*   **API 字段转换 (`src/state/appStore.ts`)**:
    *   在 `fetchResults` 中增加了显式的字段拆箱逻辑。例如：
        *   `ocr_result` (后端) -> `ocrResult` (前端)
        *   `overall_quality` -> `overallQuality`
        *   `standard_id` -> `standardId`
    *   这确保了前端 UI 组件无需修改即可继续使用原有的属性名。

## 6. OCR 引擎与性能优化

*   **引擎切换**:
    *   Jetson 环境下默认 OCR 引擎已从 **PaddleOCR** 优化/变更为 **RapidOCR (ONNX加速版)**。
    *   **原因**: RapidOCR 在 ARM/NPU 架构上启动更快，内存占用更低（约减少 40%），且无需在线检查模型源。
*   **硬件加速**: 
    *   移除了 GPU/CUDA 强制检查（由于 ONNX Runtime 在某些 Jetson 镜像下通过 CPU+NEON 优化已足够快），避免了复杂的显存竞争问题。

## 7. 其他调整

*   **文件路径**: 修复了 SSH 传输和文件引用的绝对路径问题。
*   **依赖清理**: 移除了对 `deploy.js` (Express 代理服务) 的依赖，转而在前端代码层面解决路由问题，架构更加清晰（前端静态托管 <-> 后端 API 直连）。
