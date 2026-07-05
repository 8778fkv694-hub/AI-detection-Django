# HANDOFF 交接文档 — 检测架构重构（Web 主线 + APK 第二梯队）

> **最后更新**：2026-07-05
> **总纲领**：`docs/检测架构重构-行动文档-Web主线与APK落地.md`（先读它，再读本文档）
> **战略**：Web 端权重更高（主线）；APK 是二线离线方案，第一梯队（Phase W）全部完成前不启动。
> **本文档分区**：第 1 节 = Phase W 完成明细；**第 2 节 = APK 第二梯队现状审计与缺口**（接手 APK 必读，不要再按行动文档 Phase 0 从零做）；**第 3 节 = 下一阶段（全屏检测反馈 A1）的具体方案**。
> **接手规则**：一次只做一个任务，单独 commit，commit message 以任务编号开头（如 `W6: `/`P1: `/`A1.3: `）；单次 commit 涉及文件 > 8 个就停下拆分；每次改完跑 `npx tsc --noEmit` 必须零错误。

---

## 1. 当前进度（Phase W：全部完成）

| 任务 | 状态 | Commit | 说明 |
|---|---|---|---|
| W1 检测抽象层 | ✅ 已完成已推送 | `6367b73` | `src/services/detect.ts`（194 行）：server / local-onnx / native / stream-loop 四引擎收口，业务层禁止直连 onnxYoloDetector / yoloNativeBridge |
| W2 OCR/条码抽象层 | ✅ 已完成已推送 | `99f91eb` | `src/services/ocr.ts`（95 行） |
| W4 tsc 清零 | ✅ 已完成已推送 | `edd8a05` | 159→0 错误，tsc 已纳入构建门禁 |
| W3 阈值单一真源 | ✅ 已完成已推送 | `8fdf88e` | `src/state/detectionDefaults.ts` 集中全部默认阈值；三个 store 字面量清零；PPEThresholds 类型迁入并在 ppeDetectionStore 兼容性再导出 |
| B1 模型文件错配 | ✅ 已完成已推送 | `6a3e044` | `yolo8_general` 权重从 `yolo10x.pt`（实为PPE模型）改指 `yolov8n.pt` |
| W5 API 出口收口 | ✅ 已完成已推送 | `4ddd492`~`8426676`~`ae62250` | 见下方 1.1，7 个子提交 |
| B2 存量 bug | ✅ 已完成已推送 | `c2b9f5d` | `LiveInspectionScreen` 临时文件夹保存改为复用 `rpa.ts`，见下方说明 |
| **W6 仓库/代码卫生** | ✅ **已完成** | `f7179a4`~本轮收尾 | 见下方 1.2；`start_*.sh` 已收敛为三端明确入口 |

**🔴 安全事故（已止损，用户决定自行处理后续）**：排查中发现 `production/.env.bak` 泄露进 git 历史（commit `5686144`），其中 Django `SECRET_KEY` 与当前生产 `production/.env` 完全一致——即这把密钥泄露后仍在生产环境活跃使用。已执行止损（`git rm --cached` + `.gitignore` 加固为 `.env.*` 通配，commit `1d20410`）。**用户已确认知晓，自行安排**：①生产环境轮换 SECRET_KEY ②是否用 `git filter-repo` 彻底清洗历史。接手者不需要也不应该代为处理这两项，除非用户明确要求。

### 1.1 W5 完成明细（7 个子提交，每个独立验证）

| 子任务 | Commit | 内容 |
|---|---|---|
| W5.1 | `4ddd492` | 新增 `src/lib/rpa.ts`，收口 `useTempFolder.ts`/`useFolderOperations.ts` 重复的 `/api/rpa/*` 三个调用 |
| W5.2 | `ed94537` | `CleanroomInspectionResultsScreen` 6 处健康系统对接 fetch → api.ts 薄封装；`probeHealthSystemStatus` 单独处理（探测第三方IP，不走 baseURL） |
| W5.3 | `55e67d3` | **架构级发现**：`useRealtimeDetectionLoop.ts` 是与 `useLiveYoloDetection` 平行、W1 当初漏收口的检测循环实现（提取自 OCRDetectionScreen），仍直接 `import yoloDetectBackend` + 6 处裸 fetch。并入 `detect.ts`；新增 `fetchStreamSnapshot()` |
| W5.4 | `3c69e66` | 同型问题：`usePPEDetection.ts` 也是独立实现，5 处并入。**发现真实差异**：需要 `frame_width/frame_height` 算 `sourceSize`（坐标缩放用），`FrameDetectionResult` 补充该可选字段 |
| W5.5 | `e276373` | 补齐 `useLiveYoloDetection.ts` 自动抓拍分支里漏收口的 1 处快照 fetch |
| W5.6 | `8426676` | `ResultsDebugScreen`/`KitMatchingScreen`/`EnhancedInspectionScreen` 三处；`clearCleanroomResults` 加可选 `reason` 参数（原文案不同，未强行统一） |
| W5.7 | `ae62250` | `usePPEScreenController`/`useBatchProcessingManager`；新增 `cacheRoiToBackend`（原调用是裸相对路径未走 buildApiUrl，顺带修复自定义 API_SERVER_URL 场景下路由不到的潜在问题）|

**跳过/豁免的裸 fetch（有据可查，非遗漏）**：
- `GuidedWeChatQRTestScreen.tsx`（3处）、`OCRGuidedTestScreen.tsx`（2处）：`fetch(dataUrl).blob()` 是 base64→File 的浏览器技巧，与后端 API 无关。
- `InspectionScreen.tsx`、`ResultsScreen.tsx`、`ProductionBatchScreen.tsx`：未挂载路由的死文件，**已在 W6.2 物理删除**（见下）。

**✅ B2 存量 bug 已修复（`c2b9f5d`）**：
`LiveInspectionScreen.tsx` 的 `handleSaveToTempFolder`/`handleClearTempFolder` 原调用 `/api/save-images`、`/api/clear-folder`（**没有** `/rpa/` 前缀），全仓库搜索确认这两个路由从未在后端存在过，长期 404（被 catch 静默吞掉，只提示"保存失败"）。**决策依据**：该功能在 `SafetyEquipmentScreen`/`KitMatchingScreen` 两个姐妹实现里都是真实工作的需求（抓拍后导出到本地文件夹供归档/复核），判定为"该修的真实功能"而非"该删的死代码"——LiveInspectionScreen 这边只是复制实现时接口抄错了（批量数组接口而非已验证的单张循环接口）。**修复**：改为复用 `rpa.ts` 的 `saveImageToFolder`/`clearTempFolder`（W5.1 已验证），逐张保存并统计成功数。硬编码的开发者本机绝对路径 `tempFolderPath` 未改动（不确定其业务含义，只修接口层）。验证：tsc 零错误 + vite dev 冒烟正常渲染零错误。

### 1.2 W6 完成明细（7 个子提交）

| 子任务 | Commit | 内容 |
|---|---|---|
| W6.1 | `f7179a4` | 删除 4 个已被 gitignore 排除但历史仍跟踪的死 `.bak` 文件；归档 5 个混入 `src/` 根目录的历史总结 md 文档到 `docs/` |
| W6.2 | `f42e8f5` | 精确匹配确认无引用后，删除 3 个自项目最初提交起就从未被路由挂载过的死 screen 文件（`InspectionScreen`/`ResultsScreen`/`ProductionBatchScreen`），顺手清理 `App.tsx` 里对应的僵尸注释 |
| W6.3 | `bc17b6b` | 删除 2 个内容为空的占位启动脚本（`start_docker.sh`/`start_lan_frontend.sh`） |
| W6.4 | `c406714` | 归档 13 个无任何文档引用的历史启动脚本变体到 `scripts/legacy-start-scripts/`（`git mv`，内容未改，可追溯）；保留 10 个（3 个官方推荐入口 + 7 个被专门功能文档引用的脚本，见该目录 README.md 判定依据），未擅自合并 |
| W6.5 | `ecd2aa9` | 出库 `backend/staticfiles/`（161 文件，Django `collectstatic` 构建产物，`STATIC_ROOT` 配置确认；三处部署脚本已含 `collectstatic` 调用，出库不影响部署） |
| W6.6 | `40696b9` | 清理 18 个无代码/测试依赖的调试图片和检测结果截图（逐一交叉核查排除真实测试夹具，如 `edge_test_ocr.py` 依赖的 `problematic_*.png` 系列予以保留） |
| W6.7 | 本轮收尾 | `start_*.sh` 深度整合完成：Mac 开发机统一为 `start_mac.sh` + `/Users/yiliwen/项目快速启动/4启动AI检测项目.command`；Jetson 统一为 `deploy/start_jetson.sh`/systemd；Android 统一为 `android-app/scripts/build-apk.sh`；历史脚本全部归档到 `scripts/legacy-start-scripts/` |

**W6.7 启动入口最终决策**：
- Mac 开发机：用户指定 `/Users/yiliwen/项目快速启动/4启动AI检测项目.command` 为真实入口；该文件已从旧路径 Finder alias 改为真实 shell 脚本，进入当前仓库并调用 `./启动AI检测项目.command` → `./start_mac.sh full`。这是开发机入口，保持终端窗口打开；按 `Ctrl+C` 或 `./start_mac.sh stop` 停止。
- Mac 命令行：`./start_mac.sh full|django|frontend|node|rpa|ollama|ollama-proxy|moondream|production|status|stop`。
- 兼容入口：`./start_full_project.sh`、`./start_django_only.sh` 保留为薄包装。
- Jetson：`bash deploy/start_jetson.sh` 或 `bash deploy/install_systemd_jetson.sh`（systemd），底层为 `serve_production.py` + `serve_spa.py`。
- Android：`cd android-app && bash scripts/build-apk.sh debug`。
- 真实 Web 验证（2026-07-05）：直接执行 `/Users/yiliwen/项目快速启动/4启动AI检测项目.command` / `./start_mac.sh full` 成功启动 Django `8000`、Node API `3001`、RPA `3002`、Vite `3303`；内置浏览器验证 `/`、`/live-inspection`、`/safety-equipment`、`/ocr`、`/kit-matching`、`/stream-management` 均正常渲染，console error 为 0；`/api/results/` 与 `/api/streams/manager/status/` 经 Vite 代理可访问，`curl http://127.0.0.1:3001/health` 返回 OK。

**W3 的一个决策记录**（避免后人重做）：`ocrDetectionStore.currentModelId` 是 OCR 页面级的持久化模型记忆，`useCurrentModel` 是从后端拉的全局当前模型，**语义不同，刻意不合并**。

**验证状态（2026-07-05 已完成运行时冒烟，非仅类型级）**：

| 验证项 | 结果 |
|---|---|
| `tsc --noEmit` / `npm run build` 生产构建 | ✅ 零错误、构建通过 |
| 前端运行时冒烟（vite dev + 无后端） | ✅ 首页 + `/live-inspection` `/safety-equipment` `/ocr` `/ocr-guided` `/kit-matching` `/wechat-qr-guided` 6 页全部正常渲染，**零非网络类 console 错误**（仅预期的 Failed to fetch 噪音）；首页看板的引擎状态（W1 `getLocalEngineInfo`）显示正常 |
| Django 后端 + 检测接口端到端 | ✅ `manage.py check` 通过；`POST /api/results/yolo-detect/` 200，模型池加载/切换正常（ppe_detection → yolo8_general 动态入池） |
| 端侧主力模型 `model_package/best.pt` | ✅ 对 `train2/val_batch1_labels.jpg` 检出 7 目标（filter/filtername/nsplogo），模型本体健康——APK 第二梯队的前提成立 |
| W1 行为等价复查 | ✅ 逐 hunk 对比：引擎阶梯/320 过桥/0.45 NMS/置信度过滤语义一致；发现并修复一处差异（见下） |

**冒烟中修复的一处行为差异**：`fetchStreamDetections` 在轮询响应非 200 时，旧内联实现是"跳过本帧、保留上次性能指标"，W1 版本会把 FPS/耗时闪成空——已改为 throw 交由调用方 catch 跳过，恢复旧语义（commit 见下）。

**✅ B1（存量 bug）已修复（2026-07-05，commit 见下）**：

- **诊断修正**：最初怀疑"`yolo10x.pt` 权重损坏/零检出"，深入排查后结论不同——`models/yolo10x.pt` 本体健康，但它**根本不是通用 COCO 模型**。裸读 checkpoint 显示 `nc=17`，17 个类别（person/face/helmet/gloves/safety-vest 等）与配置中另一条目 `yolo8x`（标注"PPE检测"、17类）**完全同集合**，`train_args` 指向 `safe_human.yaml`。用含人物的图（`test_hik_101_normal.jpg` 等）验证，该文件对 `person` 类正常检出（置信度 0.91）。结论：这是历史模型文件错放——`yolo8_general` 配置槽的 `file` 字段被错误指向了一个 PPE/人体安全模型的权重文件，而其 `name`/`description`/`classes` 却声明"通用检测支持80类物体"，两者完全对不上。
- **修复**：`backend/inspection/model_config.py` 第 85 行 `yolo8_general.file` 从 `yolo10x.pt` 改为 `yolov8n.pt`（已验证的 80 类 COCO 权重，仓库已有）。未删除/未改动 `yolo10x.pt` 文件本身，避免制造新的错配。
- **验证**：HTTP 端到端重测——`IMG_1677.JPG` 从 0 detections 变为检出 `laptop`；`test_hik_101_normal.jpg` 检出 `person`(0.91)、`boat`(0.38)。`map_to_ppe()` 的 fallback 逻辑（未匹配则原样返回标签，不抛异常）确认改动无副作用。
- **顺手核查（只读，未改动）**：`filter_core_detection`→`filter.pt`（15类）、`waterprifer_detection`→`waterprifer.pt`（10类），用生产实际加载路径 `YOLO()` 读取，**类别列表与配置声明完全一致，无错配**，无需处理。
- **遗留**：`models/yolo10x.pt` 现在没有任何配置条目引用它（游离文件，17类PPE模型，可能是 `yolo8x.pt` 的另一版本/checkpoint）。是否需要给它建一个独立的 `model_id` 收编，或直接归档删除，留给后续按需决定——不阻塞任何当前任务。

---

## 2. 第二梯队（APK）现状审计（2026-07-05）

> 行动文档 `docs/检测架构重构-行动文档-Web主线与APK落地.md` 把 APK 分 Phase 0–4。Phase W 全部完成后，第二梯队工作量集中在 Phase 0–3，已有 8 个 APK commit 落地（见下表）。本节是对落地情况的实测审计，作为接手者的真实起点——**不要再按行动文档 Phase 0 从零做，按本节缺口表续做**。

### 2.1 APK 已落地的 8 个 commit（时间序）

| Commit | 说明 | Phase |
|---|---|---|
| `f0d9b14` | native `benchmark()` 接口 + 5001 重定向桥 + 真机基准记录 | P0 |
| `8d2f053` | 等比 letterbox 预处理 + 高精度逆映射 + 拍照走原生引擎 | P1 |
| `237e6cf` | 共享 canvas 防 GC 卡顿 + 100ms 背压冷却 | P2 |
| `a80914f` | 集成离线 ML Kit 中文 OCR 插件 + 前端路由 | P3 |
| `3a4bf4e` | 严格 ONNX assets 白名单，APK 体积 734→216MB | P4 |
| `091324f` | 默认客户端模型改 best.onnx + 工业标签 + 平台识别强化 | P1/P3 |
| `15159fa` | 等比 native 检测坐标 + canvas `object-contain` + PPE 模型预加载 | P2 |
| `56db0d2` | **容器 aspect-ratio 跟随视频原始比例**（H5 规范化解法，竖屏框不再变形） | P2 |

### 2.2 各 Phase 实测状态与缺口

| Phase | 状态 | 关键证据（file:line） | 待补缺口 |
|---|---|---|---|
| **P0 基准** | ✅ 基本完成 | `YoloNativePlugin.java:100-175`；附录 A 有真机数字 | `benchmark()` 未在 `yoloNativeBridge.ts:14-27` 里暴露 TS 方法，无法从 app 内复测。**接手者**想再测就把桥方法加上 |
| **P1 拍照检测闭环** | ⚠️ 大体完成，有缺口 | `YoloNativeDetector.java:140-262`；`detect.ts:96-114`；`android-app/.../api.js:125-134` 低 DB 落地 | ①**缺 EXIF 拉伸矫正**（H10）：`YoloNativePlugin.java:77-86` 无 `ExifInterface` / `rotationDegrees`，竖拍会被拉错 ②**缺 per-class NMS**：现行整体 NMS 会跨类抑制 ③**`inferMs` / `source` 未从 native 返回**：双引擎结果不相等（H9 只是类型 cast，非真同构） |
| **P2 半实时检测** | ⚠️ 部分完成，路径不一致 | `detect.ts:121-193`（共享 canvas + 320 letterbox + 逆映射）；`useLiveYoloDetection.ts:181-220` 走 `detectVideoFrame` | **PPE（`usePPEDetection.ts:396-413`）和 OCR（`useRealtimeDetectionLoop.ts:405-456`）绕开了 `detectVideoFrame`，还在直传原生分辨率**——竖屏框形变在 PPE/OCR 可能复发。**接手者**：把这两条线也走 `detectVideoFrame`，统一背压与逆映射。后续建议用 `requestVideoFrameCallback` 代替 setTimeout 节流 |
| **P3 OCR 端侧化** | ⚠️ 部分完成 | `TextRecognitionPlugin.java` 已移植注册（`MainActivity.java:11`）；`ocr.ts:25-32` 有 NativeEngine 分支 | ①**条码未走 ML Kit**：现有并行 QR 检测在离线模式 404（`useRealtimeDetectionLoop.ts:278-282` 调用 `/wechat-qr/detect/`，APK node 端无该路由）。需补 `BarcodeScanner` 原生插件 ②**`source: 'native'\|'server'` 字段未加** YOLO/OCR 结果上，LLM 融合阶段无法区分来源（H9 缺口落地） |
| **P4 体积/发布** | ❌ 未达目标 | `build-apk.sh:153,166-194`；`build.gradle:13-15,23-27` | ①体积 **216MB > 150MB 目标**。**已知原因**：ONNX 模型文件被复制到 5 个目录（`build-apk.sh` 的多目标拷贝未收敛）。建议先合并为 ≤2 处 ②**R8 未启用**（`minifyEnabled false`）③冷启动未记录 |
| **H1 v8/v11 解析** | ✅ 无问题 | `YoloNativeDetector.java:205-225` 已正确转置 `(1,4+nc,N)` | — |
| **H5 三坐标系映射** | ✅ Live 路径无问题；**PPE 路径未用逆映射** | `detect.ts:156-166`；`useLiveYoloDetection.ts:526-527`；`usePPEDetection.ts:295-318` 自己用 `sourceSize.scaleX/Y` | 与 P2 同根：PPE 绕过 `detectVideoFrame` → 逆映射不复用。统一到 `detectVideoFrame` 后自动解决 |
| **H8 nodejs-mobile 语法** | ✅ 无问题 | grep `nodejs-project/src/` 与 `main.js` 无 `?.` / `??` | — |
| **H10 旋转/镜像** | ❌ 缺失 | `YoloNativePlugin.java:77-86`、`TextRecognitionPlugin.java:47` 均**无** `ExifInterface` / `rotationDegrees` | 与 P1 同一缺。前置摄像头自拍镜像处理也未做。**接手者**视为 P1 子任务 |

### 2.3 已发现的明确 bug（不阻塞当前需求，记录在案）

1. **离线模式下并行 QR 检测 = 死代码**：`useRealtimeDetectionLoop.ts:278-282` 调 `/wechat-qr/detect/`，APK 内嵌 Node 服务无此路由 → 404 → `fireParallelQrDetection` 静默 `.catch()`（`:313`）。P3 接 ML Kit Barcode 后自然解决。
2. **离线 OCR 推理时间/`source` 不在结果上**：`ocr.ts` NativeEngine 分支返回结构与 server 版字面对齐但没加 `source`，融合层没法判别。P3 收尾前补。

### 2.4 接手优先级（按建议执行顺序，每项独立 commit）

1. **P4 急救**（最先做，体积不达标纯属工程问题）：开 R8 + ONNX 文件去重重定向 ≤2 处。预期一轮就能降到 ≤150MB。纯 `build-apk.sh` + `build.gradle` 改动，≤3 文件。
2. **P3 收尾**：加 ML Kit `BarcodeScanner` 插件 OR 把离线并行 QR 改为 stub/丢弃；`detect.ts` / `ocr.ts` 在结果上补 `source` 字段。
3. **P1 EXIF + per-class NMS + `inferMs/source` 返回**：飞行模式拍照距 PC `best.pt` 对齐率达标的关键。改 `YoloNativeDetector.java` / `YoloNativePlugin.java` / `yoloNativeBridge.ts` 三个文件。
4. **P2 路径统一**：把 PPE (`usePPEDetection.ts`) 与 OCR (`useRealtimeDetectionLoop.ts`) 的检测循环也走 `detectVideoFrame`，复用 320 letterbox + 背压 + 逆映射；后续 `requestVideoFrameCallback` 替换 setTimeout。
5. **H10 旋转**：拍照与实时都加 EXIF 矫正。
6. **全屏检测反馈**（下一节详细方案）。

---

## 3. 全屏检测反馈（下一阶段，A1）

> **用户原话**：手机屏幕小，检测最好全屏看；全屏反馈要简单，不要复杂。

### 3.1 现状（2026-07-05 审计）

- 三大视频面板（`RealtimeDetectionPanel.tsx` / `SafetyCameraPanel.tsx` / `LiveCameraPanel.tsx`）都已有全屏切换逻辑。`SafetyCameraPanel` 用 Fullscreen API（`document.fullscreenElement`，`:78-95`）；`RealtimeDetectionPanel` 同。`LiveCameraPanel.tsx:152-155,164-166` 仅 CSS `flex-1` 拉满，**不是 Fullscreen API**——需核对/统一。
- 全屏下能看到的东西：
  - 检测框 + 每框 `label: confidence%`：三个面板都有（`RealtimeDetectionPanel.tsx:295-298`、`SafetyCameraPanel.tsx:124-130`、`LiveCameraPanel.tsx:174-188`）。
  - 推理耗时/FPS HUD：OCR（`detectionDrawer.ts:96-118`）与 Live（`useLiveYoloDetection.ts:570-593`）有；**PPE 缺**（`usePPEDetection.ts:277-328` 的 `drawDetections` 没传 `perfStats`）。
  - 大字「合格/存疑/需复检」verdict：**仅 OCR**（`RealtimeDetectionPanel.tsx:318-348`）。PPE 与 Live 全屏只有框 + 文字标签，没有简化 verdict。
  - `VideoOverlayIndicators` 的人员/装备 chip 等小信息块：全屏下也显示，造成噪音。

### 3.2 设计目标（与用户要求对齐）

**全屏 = 视频铺满 + 框 + 一个一眼可见的合格判定**。其余控件移出全屏或隐藏。

具体清单：
- **保留**：检测框 + 框上的 `label: confidence%`；右上角一个简洁的 `合格`/`存疑`/`需复检` 大色块徽章（绿/黄/红）。
- **保留**：底部一条极简 HUD（推理耗时 + FPS）——只在 Live/OCR 已有的 `perfStats` 渲染基础上打通到 PPE，不动布局。
- **隐藏**：人员/装备数量 chip、键盘提示、设置按钮、所有不属于"判断结果"的 HUD。
- **不增**：不加测距、不加多结果列表、不加图例、不加复杂控件。

### 3.3 执行计划（A1 任务编号，与 Phase W/Pxx 隔离，单独成段）

- [ ] **A1.1 共享全屏反馈组件**：新建 `src/components/detection/FullscreenVerdictBadge.tsx`（接收 `overallQuality`/`score` 两个 prop），渲染 `合格`/`存疑`/`需复检` 的大色块徽章。三个面板共用，避免各自手写。≤80 行。
- [ ] **A1.2 OCR 面板迁移到共享组件**：`RealtimeDetectionPanel.tsx:318-348` 现有内联 verdict 改为 `<FullscreenVerdictBadge>`；行为不变，只是抽组件。验收：OCR 全屏下视觉一致。
- [ ] **A1.3 PPE 面板加 verdict**：`usePPEDetection.ts:277-328` 的 `drawDetections` 第 7 参照 OCR 那样接收 `perfStats`，画底部 HUD；`SafetyCameraPanel.tsx` 在全屏下渲染 `<FullscreenVerdictBadge>`。**PPE verdict 数据来源**：沿用现有 PPE 检测阈值评估的 pass/fail 结论（不要新增评估逻辑）。
- [ ] **A1.4 Live 面板统一全屏入口**：`LiveCameraPanel.tsx:152-155,164-166` 改用 Fullscreen API（对齐 `SafetyCameraPanel.tsx:78-95`），并渲染 `FullscreenVerdictBadge`。Live 的 verdict 用 `useLiveYoloDetection` 现有 `aiAnalysisResult?.overallQuality`，不新增。
- [ ] **A1.5 全屏隐藏噪音**：三个面板里 `VideoOverlayIndicators`、键盘提示、设置区在 `isFullscreen` 为 true 时不渲染（不是靠 CSS 隐藏，是直接不渲染，少 DOM）。
- [ ] **A1.6 验收**：三个 screen 各进入全屏 → 视频铺满 + 框可见 + 右上角 verdict + 底部 HUD；切回非全屏 → 全部原控件恢复。`tsc --noEmit` 零错误。真机走一次。

### 3.4 纪律红线（与 Phase W 一致）

- 单 commit ≤ 8 文件；A1.x 每项独立 commit；commit message 前缀 `A1.x: `。
- **不新增业务判定逻辑**（判定口径以现有 store/hook 为准），A1 只做"显示什么"和"在哪里显示"。
- 改完 `npx tsc --noEmit` 必跑。
- **不在全屏里堆 UI**——任何想往全屏加东西的人先回到本节 3.2 清单核对，符合"简单"才加。

---

## 4. 之后（W7+，Phase W 已全部完成）

1. **Phase W+（选做）**：W7 巨型页面拆分 / W8 三套后端契约收敛 / W9 深度卫生 —— 见行动文档。
2. **第二梯队（APK，二线）续做**：按本文件 **第 2 节** 的"接手优先级"续做，**不要按行动文档 Phase 0 从零开始**。Phase 0 已基本完成。

---

## 5. 环境与命令备忘

```bash
# 类型检查（每次改动后必跑）
npx tsc --noEmit          # 必须零错误

# 本地起服务（联调冒烟用）
/Users/yiliwen/项目快速启动/4启动AI检测项目.command  # Mac 双击入口
./start_mac.sh full        # Mac 命令行入口，前端 :3303 / Django :8000 / Node :3001 / RPA :3002
./start_mac.sh stop        # 停止本机服务

# APK 构建（第二梯队才用）
cd android-app && bash scripts/build-apk.sh debug
```

- 远程仓库：`https://github.com/8778fkv694-hub/AI-detection-Django`，分支 `main`。
- 大文件（`.pt/.onnx`）不进 git，手动同步（见根目录 AGENTS.md）。
- Jetson 生产环境经 `ssh jetson`，部署走 git pull（AGENTS.md 第一部分）。
- 本地起服务优先走 `./start_mac.sh full` 或用户指定的双击入口；只做前端冒烟可用 `./start_mac.sh frontend`。

## 6. 已知风险与坑（接手必读）

1. **W5 运行时回归已做**（2026-07-05）：`npx tsc --noEmit` 全程零错误；vite dev 冒烟 10 个路由（含无后端时的 6 页 + 起 Django 后重跑 `/live-inspection`/`/safety-equipment`/`/ocr` 三个改动最重的页面）全部零非网络类 console 错误。W5.3/W5.4 的检测循环并入是本轮风险最高的改动，已重点验证。
2. `yoloDetectBackend` 内仍保留 WASM 离线拦截分支（`isLocalOfflineMode()` → onnxYoloDetector）——这是 Electron/离线 web 的现行路径，**APK 场景将由 native 分支取代，但在第二梯队 Phase 1 之前不要删它**。
3. 三套后端（Django / `src/server/api.js` / `android-app/www/nodejs-project`）接口语义有漂移，W8 之前改任何 API 都要三处对照。
4. 上次失败教训（`docs/FAILED_CHANGES_2026-05-20.md`）：22 文件大爆炸。红线：单 commit ≤ 8 文件。
5. B2 存量 bug（`LiveInspectionScreen.tsx` 临时文件夹 404）**已修复**（`c2b9f5d`），见 1.1。
6. W5.3/W5.4 过程中发现 W1 当初的"收口"并不完整——`useRealtimeDetectionLoop.ts`/`usePPEDetection.ts` 两个平行的检测循环实现被漏掉了。**教训**：以后做"收口"类任务，光 grep 关键函数名不够，还要 grep 裸 fetch + 裸 import 交叉核实，独立平行实现容易被具体调用点搜索漏掉。
7. **安全事故**（见第 1 节顶部）：`production/.env.bak` 泄露的 Django SECRET_KEY 仍在生产环境使用，已止损但轮换/历史清洗由用户自行安排，接手者不要代为处理。
8. **脚本入口已收口**（W6.7）：根目录只保留 `start_mac.sh`、`start_full_project.sh`、`start_django_only.sh`；后两者是兼容包装。不要再新增平行 `start_*.sh`，新增场景应作为 `start_mac.sh` 的 mode。
9. **`backend/staticfiles/`（W6.5）已出库**：如果本地开发环境报静态资源 404（尤其是 Django admin 后台样式丢失），先跑一次 `python manage.py collectstatic`，这是预期行为，不是 bug。
10. `docs/HANDOFF-交接文档.md` 本文档 1.1 节 B1 部分提到的验证图 `test_hik_101_normal.jpg` 已在 W6.6 清理阶段删除（确认无代码依赖），该验证结论本身不受影响，仅作历史记录说明。
11. **Phase W（行动文档"第一梯队"）到此全部完成**：W1–W6 + B1 + B2 均已推送。第二梯队（APK）可以按行动文档 Phase 0 开始，或继续 Phase W+（选做的 W7/W8/W9）。
