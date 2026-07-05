# 检测架构重构 — 行动文档（Web 主线 + APK 二线落地）

> **文档性质**：交给 AI 编码助手执行的实施指令书。执行前通读全文，重点是第 1 章（上次失败的死因）和第 4 章（硬骨头清单）。
> **审计日期**：2026-07-04。基于对本项目源码、`docs/APK端详细审计_2026-05-20.md`、`docs/APK待完成事项.md`、`docs/FAILED_CHANGES_2026-05-20.md` 的实际核查。
> **姊妹项目经验**：checklist 项目（`../checklist 持续改造（web端）0906`）已验证「Capacitor 原生插件 + 双引擎自动切换」模式可行（ML Kit OCR），本方案大量复用该模式，两个项目的 `AGENTS.md` 构建约束互通。

---

## 0. 战略定位与一句话结论

**战略定位（2026-07-04 定版）**：本项目的主战场是 **Web 端**（Jetson/服务器部署的生产系统），权重更高；**APK 是二线场景的离线方案之一**。因此实施顺序是：**第一梯队 = Web 端源头治理与检测架构收口**（本身就是 web 的质量升级，同时天然为 APK 留好接缝）；**第二梯队 = APK 落地**（在治理完成的地基上，以小 diff 方式接入原生引擎）。第二梯队可以推迟、可以按需启动，但第一梯队不做，web 和 APK 都会继续烂。

**APK 技术结论**：上次 APK 卡，不是因为"手机跑不动 YOLO"，而是因为"YOLO 跑在了 WebView 的 WASM 里"。把推理放到安卓原生层（项目里**已经有一个可复用的 ONNX Runtime 原生插件**，见 1.6），nano 模型在中端手机上完全可以做到单帧 100ms 级。OCR 与 checklist 项目同方案（ML Kit 端侧中文识别，已真机验证）；LLM 融合按既有独立方案处理，不构成阻塞项。

**核心教训**：2026-05-20 的二次尝试（原生推理+离线化）整体回退，根源不在安卓端，而在 **web 端源头没有抽象接缝**——离线化被迫一次改 22 个文件（见 1.5）。治源头，两端同时受益。

---

## 1. 上次 APK 尝试的死因分析（必读，防止重蹈覆辙）

### 1.1 上次的架构

Capacitor 6 WebView + nodejs-mobile 内嵌 Express（`android-app/`），推理放在**前端 JS**：`src/lib/yoloDetector.ts` 用 `onnxruntime-web` 跑 ONNX。APK 能构建（1.2GB），能启动，但检测不工作/极卡（`docs/APK待完成事项.md` P0 记录在案）。

### 1.2 五个死因（全部有代码证据）

| # | 死因 | 证据 | 影响 |
|---|---|---|---|
| D1 | **WASM 纯 CPU 推理** | `yoloDetector.ts:139`：`executionProviders: ['wasm']`。WebView 里的 WASM 拿不到 NEON 全部性能、拿不到 GPU/NPU，比原生慢 5–10 倍 | 这是"卡"的主因 |
| D2 | **640×640 float32 输入 + JS 三重像素循环** | `yoloDetector.ts:221-251`：canvas 取 ImageData 后用 JS 嵌套循环逐像素搬进 Float32Array（640×640×3 ≈ 120 万次循环/帧） | 每帧几十毫秒纯浪费在 JS 搬运上 |
| D3 | **图像直接拉伸，没做 letterbox** | `yoloDetector.ts:223`：`drawImage(img, 0, 0, 640, 640)` 把任意宽高比硬拉成正方形 | 目标变形 → 精度下降，检测框坐标还原也是错的 |
| D4 | **APK 1.2GB** | 审计文档记录：`.pt`（84–167MB 的大模型）、`.onnx`、WASM 全部打入 assets，手机根本用不上 | 安装慢、更新慢、用户体验差 |
| D5 | **实时帧过桥** | getUserMedia → canvas → 张量全在 WebView 里，视频渲染与推理抢同一个 JS 主线程/Worker | 预览掉帧 + 检测更慢，恶性循环 |

### 1.3 上次留下的正资产（保留，不要重做）

- `android-app/scripts/build-apk.sh` 全链路构建脚本（12 步，含 nodejs-mobile gradle 补丁、libnode.so 处理）——继续用。
- nodejs-mobile 内嵌 Express + LowDB 数据层、`node-launcher.js` 启动链、`/health` 就绪探测——继续用（数据/记录归它，**推理不归它**）。
- 移动端入口三件套 `index-mobile.html` / `src/main-mobile.tsx` / `src/AppMobile.tsx`、摄像头前后置折叠逻辑——继续用。
- 已踩平的坑：nodejs-mobile 不支持 `?.`（已修复记录在案）——新代码继续遵守。

### 1.4 作废声明

`docs/APK待完成事项.md` 中「端侧模型推理」小节规划的 **前端 ONNX/WASM 路线（ppe.onnx + ONNX Runtime WASM 打入 APK）整体作废**，由本文档第 2、3 章替代。执行模型不要再沿着那个清单做。

### 1.5 二次尝试的失败复盘（2026-05-20）——真正的病根在 web 端源头

`docs/FAILED_CHANGES_2026-05-20.md` 记录了一次两小时内 **22 个文件、+1136/-226** 的整体回退：原生推理、API 离线拦截、双分辨率、绘制优化、阈值迁移全部塞进一次改造。回退原因原文写的是"改动面太广、耦合严重"——但**为什么一个"离线化"需求会被迫改 22 个文件？** 这是 web 源头的结构问题（本次源头审计实测）：

| 源头问题 | 证据 | 后果 |
|---|---|---|
| **没有检测引擎抽象层** | 检测调用散在 `useLiveYoloDetection` / `usePPEDetection` / `useOCRProcessing` / `useRealtimeDetectionLoop` / `barcodeDetector` 各自实现 | 加"离线分支"= 每个 hook 都改一遍 |
| **API 调用无统一出口** | `src/` 下 66 处裸 `fetch(`，其中 20 个 screen 文件直连 API | 离线拦截只能做成侵入式补丁（上次 `api.ts` +140 行拦截层） |
| **阈值/配置多头管理** | `src/state/` 下 15+ 个 zustand store，`liveInspectionStore` / `ocrDetectionStore` / `ppeDetectionStore` 各存各的置信度阈值 | 上次被迫写"阈值自动迁移"补丁散到多个 store |
| **巨型页面** | `KitMatchingScreen.tsx` 1816 行、`OCRDetectionScreen.tsx` 1664 行，screens 目录共 2.07 万行 | 任何流程改动 diff 巨大、无法局部验证 |
| **类型体系失守** | 根目录 `tsc_errors.log` 298 行未清 | 改动的连锁破坏无法被机器发现 |
| **三套后端实现并存** | Django（真后端）、`src/server/api.js`（Node 版 API）、`android-app/www/nodejs-project`（APK 内嵌版） | 同一接口三处语义漂移，离线端行为对不上 |
| 工程卫生 | 26 个 `start_*.sh` 启动脚本；`.bak/.backup` 文件进 src；md 文档混在 `src/` 里；84 个二进制/日志文件被 git 跟踪 | 执行模型（和人）定位成本高 |

**结论**：不先在 web 端建立接缝，任何 APK 尝试都会重演"22 文件大爆炸"。这就是 Phase W 存在的理由。

### 1.6 重大发现：原生 ONNX 插件已经存在（方案修订）

commit `2602bb0`（保留未回退）已实现并留在代码里：

- `android-app/.../YoloNativeDetector.java`（327 行，**ONNX Runtime for Android**，`ai.onnxruntime.*`）
- `android-app/.../YoloNativePlugin.java`（106 行，Capacitor 插件壳）
- `src/lib/yoloNativeBridge.ts`（前端桥接）+ `useLiveYoloDetection.ts` 已有接入点

**因此第 2.1 节的引擎决策修订为：首选"修复/复用现有 ONNX Runtime Android 插件"，而不是从零写 LiteRT 插件。** ORT Android（XNNPACK CPU）与 LiteRT 同量级，且省去模型重导出（现有 `yolov8n.onnx` 12MB 可直接用，best.pt 一行命令导出 ONNX）。Phase 0 的基准直接在这个插件上测；LiteRT/NCNN 降级为"基准不达标时"的备选。上次失败回退的是**围绕它的 22 文件前端改造**，插件本体是干净资产。

---

## 2. 技术决策

### 2.1 推理引擎选型

| 方案 | 评估 | 结论 |
|---|---|---|
| WebView + onnxruntime-web (WASM) | 上次路线，死因 D1/D2/D5 | ❌ 禁止 |
| **ONNX Runtime for Android（现有 `YoloNativeDetector.java` 插件）+ XNNPACK 多线程 CPU** | **代码已存在**（见 1.6）；无 NDK；`yolov8n.onnx` 可直接加载，best.pt 一行导出；nano @320–416 中端机预期 50–200ms/帧 | ✅ **首选主路：修复复用，不重写** |
| LiteRT（原 TFLite）int8 | 与 ORT CPU 同量级；但要重导出模型、重写插件，收益不明确 | 🔄 备选一（ORT 基准不达标时） |
| LiteRT GPU delegate | **已知大坑**：YOLO 检测头在 GPU delegate 上有多起崩溃/兼容 issue（打包缺类、SIGSEGV） | ⚠️ 禁用 |
| NNAPI | Android 15 起已被 Google 弃用 | ❌ 不碰 |
| NCNN + Vulkan（腾讯，ARM 最优） | 最快，Ultralytics 官方 `format='ncnn'` 导出；需 NDK/C++/JNI | 🔄 备选二（追求极致时） |

**决策**：Phase 0 直接在**现有 ORT 插件**上测真机数字，达标（见 5.1）就走到底；不达标按 备选一 → 备选二 逐级升级。**禁止**在没有基准数字的情况下重写引擎——上次的插件本体是好的，坏的是围绕它的前端改造方式。

### 2.2 模型资产策略（治 D4）

现有模型盘点（实测大小）：

| 模型 | 大小 | 类别 | 端侧可行性 |
|---|---|---|---|
| `model_package/best.pt` | **6.0MB (nano)** | filter/filtername/nsplogo/qrcode 4类，mAP50=74.6% | ✅ 端侧主力，转 int8 tflite 后约 2–3MB |
| `models/yolov8n.pt` | 6.2MB (nano) | COCO 80类 | ✅ 通用检测演示用 |
| `models/ppe.pt` | 84MB (≈v8l) | PPE 10类 | ❌ 端侧不可能。要端侧 PPE 就用 `train2/` 数据重训 yolo11n；否则 PPE 留服务器 |
| 其余 (`yolo8x/10x/filter/waterprifer/ppe_large.onnx`) | 61–167MB | — | ❌ 一律不进 APK |

**铁律**：APK assets 里**只放 nano 级模型**（`best.onnx` / `yolov8n.onnx`，必要时量化，每个 3–12MB）+ 对应 `classes.txt`；**禁止** `.pt`、任何 ≥20MB 的模型、以及 onnxruntime-web 的 WASM 文件。APK 目标体积 ≤ 150MB（从 1.2GB 降一个数量级）。

### 2.3 帧管线三级设计（治 D5，按 Phase 递进）

| 级别 | 设计 | 桥接成本 | 适用 |
|---|---|---|---|
| A 拍照单帧 | WebView 拍照/抓拍 → base64 过桥一次 → 原生推理 → 返回 JSON 框 | 一次性，无所谓 | 质检/点检工作流（本项目主场景），Phase 1 |
| B 半实时 | 预览仍在 WebView（getUserMedia），定时抓 320px JPEG 过桥（~40KB/帧），原生推理，5–10fps 回框 | 每帧 5–15ms，可接受 | 巡检取景辅助，Phase 2 |
| C 全原生 | CameraX 原生预览 + ImageAnalysis 原生推理，WebView 透明浮层只画框（插件事件流） | 帧不过桥，0 成本 | 需要 15fps+ 连续检测才做，Phase 4 可选 |

**关键认知**：本项目的业务是"检验"不是"监控"——绝大多数场景 A 级就够了，B 级是锦上添花。不要为了实时而实时。

### 2.4 双引擎架构（复制 checklist 已验证模式）

```
src/services/detect.ts               ← 统一抽象层（新增，web 与 APK 共用！）
  ├─ NativeEngine  : 现有 YoloNative 插件（nano onnx，离线可用）
  └─ ServerEngine  : 现有 Django API（服务器大模型检测）
  切换逻辑：Capacitor 环境且插件就绪 → Native；否则/用户手选 → Server
  返回结构：统一为现有 BackendYoloDetection[]，上层组件零改动

src/services/ocr.ts                  ← OCR 同构抽象层（新增）
  ├─ NativeEngine  : ML Kit 中文识别插件（移植 checklist 的 TextRecognitionPlugin.java，已真机验证）
  └─ ServerEngine  : 现有 Django OCR API（保留作为 web 端路径）
```

- **OCR 方案定版**：与 checklist 项目**同一方案**——端侧 ML Kit 中文 bundled 模型（离线、免 Play 服务、+4MB）。**PaddleOCR 不再是 APK 的依赖**，仅作为服务器端 web 路径保留。
- **LLM 融合**：已有独立解决方案，**不在本文档设计范围**。抽象层只需保证：检测/OCR 结果结构里预留 `source: 'native' | 'server'` 字段，供融合环节区分数据来源即可。

---

## 3. 分阶段实施

## 第一梯队 — Web 主线（权重更高，独立成立，先做）

### Phase W — Web 端源头治理（3–5 天，治 1.5 的病根）

> 原则：这一阶段**全部在 web 端完成并在 web 端验证**，不碰 android-app。它本身就是 web 生产系统的质量升级（可维护性、类型安全、配置一致性）；副产品是给 APK 留好了接缝——之后 APK 接入从"22 文件大爆炸"变成"给抽象层加一个分支"。

- [ ] **W1 建立检测抽象层**：新增 `src/services/detect.ts`（接口见 2.4），先只实现 ServerEngine（包住现有 Django 调用）；把 `useLiveYoloDetection` / `usePPEDetection` / `useRealtimeDetectionLoop` / 各 screen 的检测调用**全部收口**到它。web 端行为不变（回归标准：改造前后同图检测结果一致）。
- [ ] **W2 OCR 同构收口**：新增 `src/services/ocr.ts`，`useOCRProcessing` 及 OCR 相关 screen 收口；条码同理（`barcodeDetector.ts` 包进 `src/services/barcode.ts`）。
- [ ] **W3 阈值/模型配置单一真源**：新建 `detectionConfigStore`（或并入 appStore），置信度阈值、当前模型 ID、检测目标选择集中管理；`liveInspectionStore` / `ocrDetectionStore` / `ppeDetectionStore` 里的重复配置字段迁移并删除。
- [ ] **W4 tsc 清零**：清掉 `tsc_errors.log` 里的 298 行错误（多为 null/undefined 类型不一致），并把 `tsc --noEmit` 加入构建脚本，防止再腐化。
- [ ] **W5 API 出口收口**：66 处裸 `fetch(` 中，检测/OCR/模型相关的先收进 W1/W2 的服务层；其余业务 fetch 至少收进 `src/lib/api.ts` 统一函数（一次机械替换）。
- [ ] **W6 卫生**（半天）：删 `src/` 内的 `.bak/.backup` 文件和 md 文档（移到 docs/）；`start_*.sh` 26 个脚本归并为 `scripts/` 下 3–4 个带参数入口（保留原文件为兼容软链或提示）。
- **验收**：web 端全功能回归正常；`grep -rn "fetch(" src/screens | wc -l` 显著归零；tsc 零错误；检测阈值只有一处定义。

### Phase W+ — Web 深度改进（选做，按需排期，与 APK 无依赖关系）

- [ ] **W7 巨型页面拆分**：`KitMatchingScreen.tsx`（1816 行）、`OCRGuidedTestScreen.tsx`（1805 行）、`OCRDetectionScreen.tsx`（1664 行）等 1000+ 行页面，按「取景面板 / 结果面板 / 参数面板 / 流程状态机 hook」四件套拆分，每文件 < 600 行。有 W4 的 tsc 和回归护航后再动。
- [ ] **W8 三套后端收敛**：明确 `src/server/api.js`（Node 版 API）的定位——它与 Django 的接口语义漂移是离线端行为不一致的根源。策略：以 Django 为唯一契约真源，写一份 `docs/api-contract.md`（接口/参数/响应），Node 版与 APK 内嵌版按契约对齐并补上契约测试（同一请求打两端比对响应结构）。
- [ ] **W9 仓库卫生**：84 个被 git 跟踪的二进制/日志出库（`.gitignore` 补齐）；根目录 200+ 条目归档（一次性脚本进 `scripts/one-off/`，历史 md 进 `docs/history/`）——参照 checklist 项目路线图台阶 1 的做法。

---

## 第二梯队 — APK 落地（二线离线方案，在第一梯队完成后按需启动）

### Phase 0 — 真机基准（0.5–1 天，先拿数字再写代码）

- [ ] 模型准备：`yolo export model=model_package/best.pt format=onnx imgsz=320`（fp32 先测；不达标再做 ORT int8 量化，校准用本项目图片，见 H2）。`models/yolov8n.onnx` 已有可直接用。
- [ ] 在**现有** `YoloNativePlugin.java` 上加 `benchmark()` 方法：加载模型 → 同一张测试图跑 50 次 → 返回 p50/p95（XNNPACK 4 线程）。
- [ ] 真机（目标交付机型）实测并记录到附录 A。
- **决策门**：p50 ≤ 200ms @320 → 沿用 ORT 插件；200–300ms → ORT int8 量化再测；仍 > 300ms → 切 NCNN（任务同构，仅插件内实现换掉）。

### Phase 1 — 拍照检测闭环（2–3 天，P0）

- [ ] **修复现有插件**而非重写 `YoloNativeDetector.java`（327 行已在），逐项核对并补齐：
  - EXIF 旋转矫正、**letterbox**（不是拉伸！修 D3，见 H3）、输出解析（v8/v11 head `(1, 4+nc, N)` 需转置）、按类 NMS、坐标还原（减 pad 除 scale）、返回**归一化坐标**（见 H5）。
  - 接口对齐 2.4：`initialize({...})` / `detect({ image }) → { detections, inferMs, source:'native' }`。
- [ ] `detect.ts` 加 NativeEngine 分支（Phase W 已收口，**此处应只改 detect.ts 和 yoloNativeBridge.ts 两个文件**——如果发现要改更多文件，说明 Phase W 没做干净，停下来先补）。
- [ ] 结果落 LowDB（沿用现有内嵌 Node 数据层），字段与服务器模式对齐。
- **验收**：飞行模式下，拍照 → 出框 → 出记录，端到端 ≤ 1.5s；同一张图与 PC 端 `best.pt` 检测结果框匹配率 ≥ 90%（IoU>0.5）。

### Phase 2 — 半实时检测（2–3 天）

- [ ] WebView 侧：`requestVideoFrameCallback` + OffscreenCanvas 缩到 320px → JPEG base64 → 插件；节流：上一帧推理未返回则丢帧（背压，禁止排队）。
- [ ] 框叠加：预览尺寸→模型输入的坐标映射统一封装（这是上次"Canvas 画框未通过"的病根，见 H5）。
- **验收**：中端机检测帧率 ≥ 5fps，预览 ≥ 25fps 不掉，连续运行 10 分钟无内存增长。

### Phase 3 — OCR 端侧化（1–2 天）

- [ ] 移植 checklist 的 `TextRecognitionPlugin.java`（ML Kit 中文 bundled 模型，含 EXIF 矫正），注册进 android-app。
- [ ] `ocr.ts` 加 NativeEngine 分支（同 Phase 1 的"只改抽象层"纪律）；`OCRDetectionScreen` 零改动。
- [ ] 条码：现有 `barcodeDetector.ts` 若在 APK 表现不佳，可同插件加 ML Kit Barcode（依赖项目已在用）。
- [ ] LLM 融合按既有独立方案接入，本阶段只保证结果结构带 `source` 字段。
- **验收**：飞行模式完成 检测+OCR+条码+记录 全流程；中文标签识别可用。

### Phase 4 — 体积与发布工程（1–2 天）

- [ ] 清理 assets：删全部 `.pt/.onnx/wasm`；`build-apk.sh` 的模型同步步骤改为只拷 `.tflite`。
- [ ] `abiFilters "arm64-v8a"`（不打 x86/armeabi-v7a，除非有老设备需求）；release 开 R8 混淆（LiteRT keep 规则见 H4）。
- [ ] （可选）Capacitor 6 → 8 统一（根项目已是 8，见 H7），趁重构一次升掉。
- **验收**：release APK ≤ 150MB；安装→冷启动→首次检测 ≤ 15s。

### 明确不做

- WebView 内任何形式的模型推理（WASM/WebGPU/tfjs 一律不做）。
- 端侧跑 84MB 级模型、端侧跑 LLM。
- 首期 GPU delegate / NNAPI。
- Django 塞进手机（继续用内嵌 Node 做数据层）。

---

## 4. 疑难技术细节 — 硬骨头清单（执行模型必读）

### H1. YOLO 输出解析的版本与格式陷阱

Ultralytics v8/v11 的 ONNX 输出是 `(1, 4+nc, N)`（如 best.pt 4 类 @320 → `(1, 8, 2100)`），**通道在前，需要转置**；坐标是 **xywh 中心制、输入像素单位**（注意：若日后切 TFLite，坐标变为 0–1 归一化——两种格式解析不能混用）。老代码注释里的 `(1, 14, 8400)` 是 ppe 10 类 @640 的形状，别照抄维度。核对现有 `YoloNativeDetector.java` 的解析逻辑是否与此一致（它当初是对着哪个模型写的要先查清）。**自检**：Java 解析结果与 Python `YOLO('best.onnx').predict()` 同图对比，框一致才算通过。

### H2. 量化（如需要）的校准数据决定精度生死

Phase 0 若 fp32 不达标需 int8 量化：用 onnxruntime 的静态量化（QDQ），校准集必须用 `model_package/data.yaml` 指向的本项目真实图片。用通用图片（如 coco8）校准，工业场景（白色过滤器、金属反光）的激活分布对不上，掉点可能 10%+ 且无报错。**自检**：验证集上 量化模型 与 pt 的 mAP50 差 ≤ 3%，否则退回 fp32 或改 fp16。

### H3. letterbox 与坐标还原必须一体实现

上次 D3 的教训：预处理拉伸 → 精度损失；坐标还原不考虑 pad → 框漂移。正确链路：`scale = min(inW/imgW, inH/imgH)` 等比缩放 + 灰边填充，推理后 `x = (x*inW - padX) / scale`。把 letterbox 参数（scale, padX, padY）作为一个对象在预处理/后处理间显式传递，禁止两头各算一遍。

### H4. LiteRT 的两个工程坑

① **GPU delegate 对 YOLO 检测头目前不可靠**（LiteRT 打包缺 `GpuDelegateFactory$Options`、SIGSEGV 崩溃均有官方 issue 在案）——首期代码里不要留 GPU 分支，免得执行模型"顺手优化"。② R8/ProGuard 会剥 LiteRT 的 JNI 类，release 必须加 keep 规则（`-keep class org.tensorflow.** { *; }` 或按官方文档），否则 debug 正常 release 闪退。

### H5. 三套坐标系的映射是"画框不显示"的病根

上次"Canvas 画框未通过"大概率死在这：**视频原始分辨率**（如 1280×720）、**WebView 显示尺寸**（CSS 像素 + objectFit 裁剪）、**模型输入**（320 letterbox）是三套坐标系。统一做法：插件只返回**相对原图的归一化坐标（0–1）**，前端画框时只乘以显示尺寸并处理 `object-fit: cover` 的裁剪偏移。写一个 `mapBoxToView()` 纯函数 + 单元测试，禁止在组件里散落换算。

### H6. 过桥带宽预算（Phase 2 的红线）

base64 编解码 + Capacitor 消息序列化的成本与字符串长度线性相关。**必须先缩图再过桥**：320px JPEG(q=0.7) ≈ 30–50KB ≈ 每帧 5–15ms；如果偷懒传 1080p 原帧（~500KB）就回到 D5 的老路。背压策略：`inflight` 标志位丢帧，绝不排队。

### H7. Capacitor 版本分裂

`android-app/` 是 Capacitor **6**，根项目 `package.json` 已装 Capacitor **8** 的 core——两者插件 API（`@CapacitorPlugin` 注解等）有差异。checklist 项目的插件是 8 的写法，移植 OCR 插件时若 android-app 还在 6 需按 6 的注册方式微调，或者按 Phase 4 先统一到 8。**执行时先 `grep '"@capacitor/core"' android-app/package.json` 确认版本再写插件代码。**

### H8. nodejs-mobile 的 Node 版本语法约束（老坑，已咬过一次）

内嵌 Node 是老版本运行时：`?.`、`??`、`Promise.allSettled` 会让服务直接起不来（本项目已有崩溃修复记录，checklist 的 `AGENTS.md` 同款教训）。所有进 `www/nodejs-project/` 的代码写 ES2018 兼容语法；自检：`grep -rn '?\.' android-app/www/nodejs-project --include='*.js' | grep -v node_modules` 为空。

### H9. 双引擎结果必须"同构同义"

端侧 tflite 与服务器 Django 返回的类别 ID/名称、置信度含义、坐标制式必须统一（以现有 `BackendYoloDetection[]` 为准）：类别名以 `classes.txt` 为唯一真源随模型一起分发；置信度阈值在抽象层统一应用，不要端侧 0.25、服务器 0.5 各玩各的——否则"手机测合格、电脑测不合格"的工单会淹死你。

### H10. 相机帧的旋转与镜像

CameraX/WebView 拿到的帧方向随设备旋转变化，前置摄像头还有镜像。Phase 1 拍照路径：解码后按 EXIF 矫正（同 checklist H5）；Phase 2 视频帧路径：WebView getUserMedia 的 canvas 帧已是正向（浏览器处理过），**但**若 Phase 4 走 CameraX 原生帧则必须自己处理 `imageInfo.rotationDegrees`。两条路径的旋转责任方不同，代码里写清注释。

---

## 5. 量化验收标准

### 5.1 性能（中端真机，以 Phase 0 基准机型为准）

| 指标 | 目标 |
|---|---|
| nano int8 @320 推理本体 p50 | ≤ 200ms（Phase 0 决策门） |
| 拍照检测端到端（点拍→框显示） | ≤ 1.5s |
| 半实时检测帧率 / 预览帧率 | ≥ 5fps / ≥ 25fps |
| 连续检测 10 分钟 | 无 OOM、无内存持续增长、机身不烫到降频崩溃 |
| release APK 体积 | ≤ 150MB |

### 5.2 精度

| 指标 | 目标 |
|---|---|
| tflite-int8 vs pt 验证集 mAP50 | 差值 ≤ 3% |
| 端侧 vs 服务器同图检测框匹配（IoU>0.5） | ≥ 90% |

### 5.3 功能

- 飞行模式：拍照检测 + OCR + 记录全流程可用。
- 联网：云端复核（LLM 融合）可用，结果与本机结果并列展示、标注来源。
- 断网→联网切换无需重启 App。

---

## 6. 给执行模型的开工顺序

1. 读本文档 + `docs/FAILED_CHANGES_2026-05-20.md`（上次怎么死的）+ `docs/APK端详细审计_2026-05-20.md`（构建链）。
2. **从 Phase W 开始，一次一个 W 任务，每个任务在 web 端独立验证并单独 commit**——这是主线。禁止把多个 W 任务合并成一次大改（那正是上次回退的原因）。
3. 第二梯队（APK）只有在 Phase W 验收通过后才启动；启动时严格从 Phase 0 基准开始——**没有真机数字之前，不写任何插件业务代码**。
4. 每个 Phase 完成后在 `docs/APK待完成事项.md` 追加记录（沿用其状态图例），并注明"H几 已自检"。
5. APK 构建一律 `bash android-app/scripts/build-apk.sh debug`；commit 不带 `.pt/.onnx` 模型文件（走手动同步，同 AGENTS.md 大文件策略）。
6. 改动纪律红线：**单次 commit 涉及文件 > 8 个就停下来拆分**；Phase 1 接入原生引擎时如果发现要改的不止 `detect.ts` + `yoloNativeBridge.ts`，说明 Phase W 没做干净，回头补 W 而不是硬推。

---

## 附录 A — Phase 0 基准记录（执行时填写）

| 日期 | 机型 | 模型 | imgsz | 量化 | 线程 | p50 | p95 | 结论 |
|---|---|---|---|---|---|---|---|---|
| 2026-07-05 | Xiaomi Device | yolov8n.onnx | 320 | FP32 | 4 | 37ms | 66ms | p50 远低于 200ms，无需换 NCNN 引擎 |
| 2026-07-05 | Xiaomi Device | best.onnx | 320 | FP32 | 4 | 30ms | 39ms | opset=12，性能表现极佳，满足 Phase 1 条件 |
