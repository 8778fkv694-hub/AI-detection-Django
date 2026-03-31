# AI 智能视觉检测系统 (AI Inspection System)

## 项目简介

本项目是一个基于 **React + Django** 的工业级智能视觉检测系统，集成了 **YOLOv8/11** 实时目标检测、**PaddleOCR** 文字识别以及 **Vision LLM (Ollama)** 多模态语义分析技术。系统旨在解决传统工视觉难以处理的复杂外观缺陷检测（如不规则划痕、标签对齐等）和非结构化文字验证问题。

## 核心架构 (System Architecture)

系统采用微服务架构设计，主要包含以下核心组件：

*   **前端 (Frontend)**: React 18 + TypeScript + Vite + TailwindCSS
    *   提供实时视频流展示、检测结果可视化、多窗口管理及参数配置界面。
*   **后端 (Backend)**: Django REST Framework + Python
    *   负责业务逻辑、数据管理、模型调度 (YOLO/OCR) 及 API 服务。
*   **流媒体服务 (Stream Service)**: Node.js + Express + FFmpeg
    *   负责 RTSP/USB 摄像头视频流转码 (Websocket/HLS) 及代理转发。
*   **AI 引擎 (AI Engines)**:
    *   **Object Detection**: YOLOv8 / YOLO11 (Ultralytics)
    *   **OCR**: PaddleOCR (支持方向检测)
    *   **LLM**: Ollama (Llama3/Qwen2-VL) 用于复杂语义理解

---

## 核心功能 (Key Features)

### 1. 实时目标检测 (Real-time Object Detection)
*   支持 PPE（个人防护装备）检测：安全帽、反光衣、口罩等。
*   支持通用工业缺陷检测。
*   利用 WebSocket 实现毫秒级推理结果推送。

### 2. OCR 融合检测 (OCR Fusion Algorithm)
系统独创"双层融合架构"，大幅提升字符识别与内容验证的准确性：
*   **第一层：规则融合 (Rule Fusion)**
    *   基于 PaddleOCR 提取文字、置信度及方向。
    *   结合关键词匹配、排除清单（Negative List）及几何方向约束进行初筛。
*   **第二层：多模态 AI 融合 (AI Fusion)**
    *   将规则初筛结果送入 Vision LLM。
    *   利用大模型的语义理解能力，验证"标签粘贴是否端正"、"印刷是否清晰"等模糊标准。

### 3. 多窗口协同 (Multi-Window Support)
*   支持同时开启多个独立检测窗口。
*   每个窗口可绑定不同的摄像头设备及检测模型。
*   窗口间状态独立，互不干扰。

### 4. 智能硬件管理
*   自动扫描并列出可用摄像头设备。
*   支持断线重连与异常状态监控。

---

## 快速开始 (Getting Started)

### 环境要求
*   Python 3.8+
*   Node.js 18+
*   Ollama (如需开启 AI 融合模式)

### 1. 启动后端 (Django)
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python manage.py runserver 0.0.0.0:8000
```

### 2. 启动流媒体服务 (Node.js)
```bash
cd nodejs-stream-service
npm install
npm run start
# 服务运行在 3001 端口
```

### 3. 启动前端 (React)
```bash
# 在项目根目录
npm install
npm run dev
# 访问 http://localhost:3300
```

---

## 使用指南 (Usage Guide)

### 快捷键 (Shortcuts)
为了提高工业现场的操作效率，系统内置了全局快捷键：
*   **C (Camera)**: 开启/关闭摄像头
*   **Space (空格)**: 手动触发抓拍/单次检测
*   **R (Reset)**: 重置当前工作流状态
*   **Enter (回车)**: 确认不合格结果并继续（主要用于人工复核流程）
*   **F (Fullscreen)**: 切换全屏显示

### 融合模式配置
1.  在检测页面右侧面板中，开启"融合模式"开关。
2.  (可选) 选择或配置特定的"检测标准"（Prompt Template）。
3.  系统将自动在后台协调 OCR 与 LLM 的推理流程。
