# 失败修改记录 - 2026-05-20（两小时内）

> **结论**: 本次修改为"APK 离线端 + 原生 YOLO 推理 + 离线模型降级"的一整套尝试，涉及面过大、侵入性强，最终未达预期，决定整体回退。

## 修改文件汇总 (22 files, +1136/-226)

| 文件 | 主要改动 |
|------|---------|
| `android-app/android/app/build.gradle` | APK 依赖调整 |
| `android-app/.../MainActivity.java` | 入口修改 |
| `android-app/.../YoloNativeDetector.java` | 原生检测器重构 +103 |
| `android-app/.../YoloNativePlugin.java` | 原生插件扩展 (OCR/条码) +211 |
| `android-app/capacitor.config.ts` | Capacitor 配置 |
| `android-app/www/node-launcher.js` | Node 启动脚本调整 |
| `android-app/www/nodejs-project/src/server/api.js` | API 路由修改 |
| `src/components/HomeDashboard.tsx` | 仪表盘修改 +37 |
| `src/components/liveInspection/LiveCameraPanel.tsx` | 实时面板 |
| `src/hooks/liveInspection/useLiveYoloDetection.ts` | 离线端检测循环重写 +162 |
| `src/hooks/ocr/useOCRProcessing.ts` | OCR 离线降级 +75 |
| `src/hooks/ocr/useRealtimeDetectionLoop.ts` | 实时检测循环重构 (低分帧/高分段/APK自适应) +179 |
| `src/hooks/safetyEquipment/usePPEDetection.ts` | PPE 检测离线化 +101 |
| `src/lib/api.ts` | API 离线拦截层 +140 |
| `src/lib/barcodeDetector.ts` | 条码检测离线降级 +147 |
| `src/lib/ocr/detectionDrawer.ts` | 检测绘制增强 (加粗/持久化/归一化) +50 |
| `src/lib/onnxYoloDetector.ts` | 模型配置修正、debug 开关 +43 |
| `src/lib/yoloNativeBridge.ts` | 原生桥接扩展 (OCR/条码) +53 |
| `src/server/api.js` | 默认模型改为 yolov8n |
| `src/state/liveInspectionStore.ts` | 离线端阈值自动迁移 +12 |
| `src/state/ocrDetectionStore.ts` | 离线端阈值自动迁移 +23 |
| `src/lib/videoOverlayCanvas.ts` | **新文件**: 视频叠加画布同步工具 |

---

## 主要修改方向

### 1. 原生 Android YOLO 推理插件增强
- `YoloNativeDetector.java` / `YoloNativePlugin.java`: 扩展支持 OCR (ML Kit)、条码扫描
- `yoloNativeBridge.ts`: 新增 `detectTextNative`、`detectBarcodesNative` 函数

### 2. 前端离线模式拦截层 (`api.ts`)
- `getAvailableModels()` / `getModelConfig()` / `switchPPEModel()` 全部新增离线拦截分支
- 默认模型 ID 由 `ppe_detection` 改为 `yolov8n`

### 3. 实时检测循环重构 (`useRealtimeDetectionLoop.ts`)
- 引入双分辨率策略: 推理用低分辨 (320px, JPEG 50%)，ROI/抓拍取高清
- 新增 `captureVideoFrameData` / `scaleBackendDetections` / `getInferenceConfidence`
- 自适应模式间隔（APK 16ms vs 后端 33ms）
- 统计更新限流 (250ms)
- 检测框缩放 (帧尺寸不一致时自动修正)

### 4. 检测绘制优化 (`detectionDrawer.ts`)
- 边框加粗 (person: 6px, 其他: 4px)
- 归一化 bbox 支持 (0-1 → 像素坐标)
- 无新检测时保持上次绘制 (800ms)
- 标签实心背景 + 白色字体

### 5. 离线端置信度阈值自动迁移
- `liveInspectionStore.ts` / `ocrDetectionStore.ts`: APK 环境检测到旧阈值 ≥ 0.8 时自动降为 0.35

### 6. OCR/PPE 检测离线化
- OCR: `useOCRProcessing.ts` 离线分支绕过 Django API
- PPE: `usePPEDetection.ts` 截图缩放优化

### 7. 条码检测离线化
- `barcodeDetector.ts`: 新增 `detectWithNativeQR()` 完整方法

### 8. 模型配置修正 (`onnxYoloDetector.ts`)
- 未知模型不降级到 PPE，回退 yolov8n
- debug 日志由 `__YOLO_DEBUG__` 全局开关控制

---

## 回退原因

改动面太广 (APK Java + React 前端 + 状态管理 + API 拦截层)，多项修改耦合严重。试图在单次提交中完成离线化、原生推理、双分辨率、绘制优化、模型切换的完整重构，未经充分分模块验证，风险不可控。

---
基准 commit: `2602bb0 feat: 实现了安卓原生 Capacitor YOLO 推理插件并优化 APK 架构体积`
