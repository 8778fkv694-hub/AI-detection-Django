# Jetson 重构方案：单摄像头 Worker 架构

日期：2026-05-13

## 背景

当前 Jetson Orin Nano 上的摄像头链路已经修过多轮，但根本风险仍然存在：

- OCR、PPE、实时检测、设置页预览都可能同时消费同一个摄像头流。
- 多个页面同时拉 `/mjpeg/` 时，后端会重复 JPEG 编码同一帧。
- `/frame/` 路径存在 JPEG + base64 + canvas/video 中转，CPU 与延迟成本高。
- YOLO 检测循环、显示流、截图接口共享 StreamReader，但边界还不够清晰。
- Jetson CPU/GPU/内存资源有限，重复采集、重复编码、重复推理会直接造成卡顿。

重构目标不是继续局部补丁，而是把摄像头和推理改成 Jetson 友好的单生产者架构。

## 总目标

Jetson 上应满足：

1. 摄像头只被一个后端 worker 打开。
2. 原始帧只采集一次，存入 latest-frame/ring buffer。
3. YOLO 后端直接从最新帧推理，不依赖前端 canvas 抓帧。
4. 显示流只负责低成本预览，不参与检测数据闭环。
5. 前端只订阅视频流和检测框 metadata。
6. 页面切换不重启摄像头、不重载模型、不重复编码。

推荐最终形态：

```text
USB/CSI 摄像头
   ↓
Jetson Camera Worker
   ↓
Latest Frame / Ring Buffer
   ├── Inference Worker：TensorRT YOLO，只处理最新帧
   ├── Display Stream：WebRTC/H.264 优先，MJPEG fallback
   ├── Snapshot API：按需取最新帧
   └── Metrics API：fps、latency、drop、CPU/GPU/RAM
   ↓
Django + React
   ├── 页面显示视频流
   ├── WebSocket/SSE 接收 boxes
   └── Django 保存业务结果
```

## 推荐架构

### 1. Camera Worker

职责：

- 独占 `/dev/video*` 或 CSI 摄像头。
- 使用 V4L2 或 GStreamer 采集。
- 统一设置采集格式，例如 `1280x720 MJPG 30fps` 或 Jetson 更适合的 NV12/H.264 管线。
- 维护最新帧缓存和小型 ring buffer。
- 输出帧版本号、采集 FPS、丢帧数、最后帧时间。

原则：

- 任何页面或接口都不能直接重新打开摄像头。
- 摄像头断开后由 Camera Worker 统一重连。
- 慢消费者不能阻塞采集线程。

### 2. Inference Worker

职责：

- 从 Camera Worker 读取最新帧。
- YOLO 只处理最新帧，慢了直接跳过旧帧，不排队。
- TensorRT `.engine` 优先，避免 Jetson 上 `.pt` 临时加载造成卡顿。
- 输出 boxes、class、confidence、inference_ms、detect_fps、frame_version。

原则：

- 推理线程不做 JPEG 编码。
- 模型只由 ModelManager 加载一次。
- 模型切换必须有容量检查和明确状态。

### 3. Display Stream

优先方案：

- WebRTC/H.264，使用 Jetson 硬件编码。
- 前端 `<video>` 播放。
- 检测框由前端根据 metadata overlay 绘制。

Fallback：

- MJPEG 仅用于兼容或排查。
- MJPEG 默认限制分辨率、质量、帧率。
- 多客户端必须走广播或共享编码结果，不能每个客户端单独 `cv2.imencode`。

不推荐长期依赖：

- `/frame/` 轮询。
- base64 图片流。
- 前端 canvas `captureStream()` 作为主显示管线。

### 4. Metadata Channel

推荐使用 WebSocket 或 SSE。

输出示例：

```json
{
  "stream_id": "camera_1",
  "frame_version": 1024,
  "frame_width": 1280,
  "frame_height": 720,
  "inference_ms": 32.5,
  "detect_fps": 18.2,
  "boxes": [
    {
      "label": "hardhat",
      "confidence": 0.91,
      "bbox": { "x1": 120, "y1": 80, "x2": 240, "y2": 300 }
    }
  ]
}
```

前端职责：

- 播放视频。
- 按 `frame_width/frame_height` 把 boxes 映射到显示区域。
- 页面切换时只订阅/取消订阅 metadata，不重启后端 worker。

## Django 保留职责

Django 不需要被推翻，保留业务层：

- 流媒体源配置。
- 模型管理。
- 检测标准、ROI、业务模板。
- 质检记录保存。
- OCR、条码、二维码和 LLM 分析。
- 用户界面 API。

Django 应减少承担：

- 高频视频帧轮询。
- 多客户端 JPEG 编码。
- 直接摄像头竞争管理。

## 新模块建议

建议新增：

```text
backend/jetson_runtime/
  camera_worker.py
  frame_buffer.py
  inference_worker.py
  model_runtime.py
  display_stream.py
  metrics.py
  runtime_manager.py
```

模块边界：

- `camera_worker.py`：采集和重连。
- `frame_buffer.py`：latest frame、ring buffer、frame_version。
- `inference_worker.py`：最新帧推理和 boxes 缓存。
- `model_runtime.py`：TensorRT/YOLO 模型加载、卸载、状态。
- `display_stream.py`：WebRTC/H.264/MJPEG fallback。
- `metrics.py`：运行指标。
- `runtime_manager.py`：统一生命周期管理。

## API 草案

### Runtime 状态

```text
GET /api/jetson/runtime/status/
```

返回：

- camera_connected
- capture_fps
- frame_version
- inference_fps
- inference_ms
- display_clients
- dropped_frames
- duplicate_frame_skips
- model_id
- model_backend: tensorrt | pytorch
- cpu_usage
- gpu_usage
- memory_usage

### 启动/停止摄像头

```text
POST /api/jetson/runtime/start/
POST /api/jetson/runtime/stop/
POST /api/jetson/runtime/restart/
```

### 检测 metadata

```text
GET /api/jetson/runtime/detections/latest/
GET /api/jetson/runtime/detections/events/  # SSE
```

### 显示流

```text
GET /api/jetson/runtime/stream/webrtc/
GET /api/jetson/runtime/stream/mjpeg/
```

## 分阶段实施

### 阶段 1：稳定性重构

目标：先消除重复打开摄像头、重复推理、重复编码。

任务：

1. 新增 `CameraWorker`，后端唯一打开 `/dev/video0`。
2. 新增 latest-frame buffer。
3. 现有 `StreamReader` 改为调用 `CameraWorker`，不直接持有摄像头。
4. `DetectionLoop` 从 latest-frame buffer 取帧。
5. 所有页面共享同一个 stream runtime。
6. 保留现有 MJPEG 输出，但默认单路/限速/降分辨率。

验收：

- 页面切换不导致摄像头重连。
- 同一时间只有一个摄像头采集线程。
- `active_loops` 不会因页面切换残留。
- Jetson 上摄像头预览连续 30 分钟无明显卡顿。

### 阶段 2：推理和显示解耦

目标：前端不再参与 YOLO 输入链路。

任务：

1. 前端停止从 `<video>` canvas 抓帧给 YOLO。
2. 后端持续推理并缓存 boxes。
3. 前端通过 SSE/WebSocket 获取 boxes。
4. 前端 overlay 绘制 boxes。
5. Snapshot API 从 frame buffer 取最新帧。

验收：

- 浏览器刷新不影响 YOLO 推理线程。
- 关闭前端页面后，后端可继续检测或按配置暂停。
- boxes 延迟稳定，不随页面数量线性增加。

### 阶段 3：TensorRT 固定化

目标：Jetson 推理速度和内存稳定。

任务：

1. 固定 `.engine` 模型优先。
2. 启动时预加载默认 PPE 模型。
3. 模型切换走显式状态机：loading、ready、failed。
4. 禁止高频模型加载/卸载。

验收：

- 推理延迟稳定。
- 模型池不会反复驱逐/重载。
- Jetson 内存占用可预测。

### 阶段 4：WebRTC/H.264 显示流

目标：替换长期 MJPEG 显示，降低 CPU。

任务：

1. 评估 GStreamer 硬件编码管线。
2. 建立 WebRTC 或 H.264 low-latency 输出。
3. MJPEG 降级为 fallback/debug。
4. 设置页显示实际 transport 和编码耗时。

验收：

- 720p 20-30fps 预览 CPU 占用显著低于 MJPEG。
- 多页面预览不重复编码。
- YOLO 推理不被显示流拖慢。

## 指标与告警

必须长期展示这些指标：

- `capture_fps`
- `display_fps`
- `inference_fps`
- `inference_ms`
- `encode_ms`
- `dropped_frames`
- `duplicate_frame_skips`
- `active_clients`
- `active_loops`
- `model_backend`
- Jetson CPU/GPU/RAM
- 摄像头最后帧时间

首页“服务状态”不应只显示转圈，应有：

- 后端存活
- Camera Worker 状态
- 模型状态
- 显示流状态
- 最近错误信息

## 风险控制

### 风险 1：一次性重构影响现有业务

控制：

- 新 runtime 并行实现。
- 先用 feature flag 开启。
- 保留旧接口 fallback。

### 风险 2：WebRTC/GStreamer 调试时间不可控

控制：

- 阶段 1 和阶段 2 仍可用 cv2 MJPEG fallback。
- WebRTC 放到阶段 4，不阻塞稳定性重构。

### 风险 3：TensorRT engine 环境差异

控制：

- 保留 PyTorch fallback。
- engine 生成脚本和版本记录入文档。
- 启动时明确输出当前 backend。

## 最小可行重构范围

如果只做最小版本，优先做：

1. `CameraWorker` 单摄像头 producer。
2. latest-frame buffer。
3. `DetectionLoop` 从 buffer 取帧。
4. 前端 boxes metadata overlay。
5. MJPEG 单路限速 fallback。

这五项完成后，即使还没上 WebRTC，也能从架构上解决大部分 Jetson 卡顿和重复推理问题。

## 判断是否成功

实机验收建议：

1. Jetson 开机后自动启动 runtime。
2. 打开首页、设置页、PPE、实时检测、OCR，反复切换 30 次。
3. 确认摄像头不重连、不黑屏、不被抢占。
4. 同一时间只有一个 camera worker。
5. `duplicate_frame_skips` 正常增长，但 `frame_id` 不超过真实新帧数量太多。
6. YOLO boxes 稳定显示。
7. 预览帧率接近设置值，CPU 不长期满载。
8. 连续运行 30-60 分钟无明显卡顿、无 ffmpeg/cv2 残留进程、无 active loop 泄漏。

## 结论

适合 Jetson 的重构方向是：

```text
单摄像头 Worker
+ 最新帧缓存
+ 后端推理
+ 硬件显示流
+ metadata overlay
+ 明确 metrics
```

这比继续优化多个 MJPEG/JPEG 接口更稳。它能从架构上消除重复采集、重复编码、重复推理和页面互相抢流的问题。
