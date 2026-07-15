# HANDOFF 交接文档 — 检测架构重构（Web 主线 + APK 第二梯队）

> **最后更新**：2026-07-05（含二次独立复审 + A1 执行指引修订版 + **A1 全部完成** + 教练指引与路线图）
> **总纲领**：`docs/检测架构重构-行动文档-Web主线与APK落地.md`（先读它，再读本文档）
> **战略**：Web 端权重更高（主线）；APK 是二线离线方案，第一梯队（Phase W）全部完成前不启动。
> **本文档分区**：第 1 节 = Phase W 完成明细；**第 2 节 = APK 第二梯队现状审计与缺口**（接手 APK 必读，不要再按行动文档 Phase 0 从零做）；**第 3 节 = 全屏检测反馈 A1（已全部完成，含实际执行记录与环境限制说明）**；**第 7 节 = 未来 3–6 个月路线图与工作方法（接手前通读）**。
> **当前状态速览**：Phase W（第 1 节）✅ 全部完成；A1 全屏反馈（第 3 节，commit `386d5e8`~`aefe69b`）✅ 代码全部完成，**PPE 全屏真机验证已通过**（2026-07-05 补做，见 3.3 的 A1.6 真机记录），**OCR/Live 全屏真机验证仍未做**——接手后第一件事是接着补 OCR/Live 两项真机走查，而不是直接开始 M2。APK 第二梯队（第 2 节）待续做，优先级见 2.4。
> **接手规则**：一次只做一个任务，单独 commit，commit message 以任务编号开头（如 `W6: `/`P1: `/`A1.3: `）；单次 commit 涉及文件 > 8 个就停下拆分；每次改完跑 `npx tsc --noEmit` 必须零错误。

## 0. 二次独立复审记录（2026-07-05，代码实测，非文档转抄）

对第 1、2 节的关键声明逐条用代码/命令复核，结论如下：

| 复核项 | 结果 |
|---|---|
| `npx tsc --noEmit` | ✅ 零错误（exit 0），W4 门禁仍然成立 |
| 抽象层三件套 | ✅ `src/services/detect.ts`（现 257 行，W5 并入后比 W1 时的 194 行增长属正常）、`src/services/ocr.ts`（104 行）、`src/state/detectionDefaults.ts`（105 行）均在位 |
| B1 模型错配修复 | ✅ `backend/inspection/model_config.py:85` `yolo8_general.file = 'yolov8n.pt'` 已落地 |
| APK 缺口：EXIF | ✅ 属实——全 `android-app/android/.../java/` grep `ExifInterface\|rotationDegrees` 零命中，H10/P1 缺口真实存在 |
| APK 缺口：R8 | ✅ 属实——`android-app/android/app/build.gradle:25` `minifyEnabled false` |
| APK 缺口：ONNX 多份复制 | ✅ 属实——`android-app/scripts/build-apk.sh:174,178,182,186,189` 同一模型文件复制到 **5 个目录**，是 216MB > 150MB 的主因 |
| APK 缺口：benchmark 桥 | ✅ 属实——`src/lib/yoloNativeBridge.ts` 中无 `benchmark` 方法（注意真实路径是 `src/lib/`，不是旧稿写的 `src/services/`） |
| 工作区状态 | ✅ working tree clean，全部已推送至 `origin/main`（HEAD `2478ad3`） |
| 第 3 节 A1 原稿 | ⚠️ **发现 4 处路径/数据源错误**，已在本次修订中改正（详见 3.0 的"真实文件地图"）。教训：写方案时凭记忆写路径必错，动手前一律 grep 复核 |

**结论**：第 1 节（Phase W）与第 2 节（APK 审计）可信，可直接作为起点；第 3 节以本次修订版为准。

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
3. **🔴 B3/B5（2026-07-05 真机确诊+复测，全 APK 最高优先级）：5001 重定向让 Capacitor 原生桥半瘫痪 → 原生检测引擎从未真正生效，全部检测都在跑单线程 WASM**。本节记录两轮真机调查的完整过程和结论——**B3 已修复并验证；B5 是修 B3 之后才暴露出的更深一层坑，仍未解决；一次尝试性修复（B4）验证后判定弊大于利，已回退，原因见下**。

   **第一层（B3，已修复）：`capacitor.js` 桥文件从未真正复制成功**
   - 构建日志实锤：`build-apk.sh` 步骤 7d 曾输出 `⚠️ 未在 assets 中找到 capacitor.js`——`android/app/src/main/assets/public/capacitor.js` 这个源路径**不存在**（新版 Capacitor 不产出物理 capacitor.js，运行时由 WebViewLocalServer 动态注入），所以 f0d9b14 引入的"5001 重定向桥复制"从未复制成功过，失败还被 ⚠️ 静默吞掉。
   - 真机 logcat 实锤：WebView 重定向到 `http://localhost:5001/` 后，`capacitor.js` 请求被 Express 以 index.html 兜底应答 → `Uncaught SyntaxError: Unexpected token '<'` → `window.Capacitor` 不存在 → `isNativeYoloSupported()` 返回 false → 直落 WASM。
   - **已修复**（commit 待落地，本节收尾时一并提交）：`build-apk.sh` 步骤 7d 的 `CAP_JS_SRC` 改为真实源 `node_modules/@capacitor/android/capacitor/src/main/assets/native-bridge.js`，复制为 `capacitor.js`；找不到源文件时从 ⚠️ 警告改为 `exit 1` 硬失败（不允许静默）。
   - **验证结果（Pixel 3 XL 真机，B3 单独生效后）**：`Unexpected token '<'` 错误消失；`isNativeYoloSupported()` 确认变为 true——证据是 logcat 出现了**此前从未出现过**的新日志 `[YoloNativeBridge] Failed to initialize native model: Error: "YoloNative" plugin is not implemented on android`，说明代码这次真的**尝试**走了 native 分支（此前是直接跳过、连试都没试）。B3 本身是正确、必要的修复，予以保留。

   **第二层（B5，新发现，未解决）：即使 B3 修好，原生插件调用依然全部失败**
   - 上面那行新日志本身就是坏消息：`"YoloNative" plugin is not implemented on android`。深挖 Capacitor Android 源码（`Bridge.java` / `MessageHandler.java`）确认：Capacitor 的原生插件调用走的是 `androidBridge`（新版 WebView 用 `WebViewCompat.addWebMessageListener` 注入，**按来源白名单**限定，白名单来自 `capacitor.config.ts` 的 `server.allowNavigation`）。默认配置里没有 `http://localhost:5001` 这一项，所以 `:5001` 页面上 `androidBridge` 对象本身可能都拿不到。已尝试在 `allowNavigation` 里加入 `'http://localhost:5001'`（已验证写入了构建产物 `capacitor.config.json`），插件 in-list 检测确实变了（见上一条），但实际方法调用仍然失败。
   - **根本原因判断（未完全证实，需要下一位接手者用 Chrome remote debug 连上 WebView 実測 `navigator.serviceWorker`/`androidBridge` 对象逐项确认）**：Capacitor 的"已注册插件列表"是 Java Bridge 初始化时一次性同步给 JS 侧的（配合最初加载的那份 `native-bridge.js`）。我们的架构是先加载 Capacitor 自己的 `http://localhost` 页面（此时插件列表正常同步），然后**整个 WebView 导航到一个完全不同的 origin**（内嵌 Express 的 `:5001`），那个新页面加载的是我们**复制过去的静态 native-bridge.js 副本**——这只是重建了客户端 API 形状，并不会重放"Java 告诉 JS 有哪些插件已注册"这个握手过程。也就是说：**这套"重定向到内嵌 Node 服务器"的架构，从设计上就没打算支持原生插件跨 origin 继续工作**，B3 只是修好了"桥对象存在"，"桥能正常收发消息"是另一回事。
   - **这不是一个能快速打补丁解决的问题**。彻底解决需要二选一：
     ① 深入 patch Capacitor Bridge/MessageHandler，让它在检测到 `:5001` 新页面加载时重放插件注册握手（侵入式修改三方库，风险高、维护成本高）；
     ② **推荐**：从根上改变启动流程，让 WebView **不要**导航离开 Capacitor 自己的 `http://localhost` origin——内嵌 Node/Express 只作为后端 API 使用（前端继续 fetch 相对/绝对路径调用 `:5001` 的 API，不需要让 WebView 本身导航过去）。这是架构级改动，触及 `node-launcher.js` 的重定向逻辑和前端 API base URL 配置，工作量明显大于本轮的补丁式修复，建议单独立项，作为 APK 第二梯队新的最高优先级任务。
   - 在②完成之前，**原生检测引擎在 APK 上事实不可用**，全部检测请求都会"先尝试 native（快速失败）→ 回退 WASM"，跟 B3 修复前相比只是错误处理更干净，速度没有实质变化。

   **第三层（B4，尝试修复 WASM 单线程问题，已回退——过程中有一次误判，已用对照实验纠正，完整记录供参考）**
   - 诊断：`coi-serviceworker.js`（第三方 v0.1.7 vendored 脚本）首次注册成功但不会控制当前页面（SW 规范：注册≠接管，需下次导航才生效），且它自带的"注册后自动 reload 一次"逻辑只在 `registration.active && !controller` 为真时触发——首次安装时 `registration.active` 必为 null，条件不成立，**永远不会自动刷新**，本次会话 `crossOriginIsolated` 保持 false，logcat 实锤 `numThreads=1`。
   - 尝试的修复：改造 `coi-serviceworker.js`，让它监听 installing worker 的 `statechange` 到 `activated` 后主动 reload 一次（加 `sessionStorage` 防死循环）。
   - **第一轮真机验证**：改动后 reload 确实触发了（logcat 可见"Update found，刷新页面..."），但紧接着的 YoloWorker 初始化仍然显示 `hasSharedArrayBuffer=false`——**没达成目的**。同一轮测试里，在 `pm clear`（清空应用数据，模拟全新安装）场景下，应用启动卡在"waiting for node-server-ready..."**长达 45 秒**（黑屏），当时**误判**为这个 reload 改动与前端自身的"等待内嵌 Node 就绪"轮询逻辑产生竞态导致——这个归因是错的，见下一条。
   - **对照实验纠正误判**：把 `coi-serviceworker.js` 完全回退到原始内容（`git diff` 为空）后，重新构建、`pm clear`、冷启动复测——**45 秒延迟原样复现**（`14:57:56` "waiting for node-server-ready" → `14:58:41` "mountReact called"，与改动前后无关）。这证明 45 秒延迟是一个**独立于 B4 的、`pm clear`/全新安装场景下本就存在的慢启动问题**（大概率是内嵌 Node 首次启动要做数据库种子导入 + `nodejs-project` 资源从 assets 解包，日志可见"🌱 [Database] 发现出厂数据包，正在导入..."），不是本轮任何改动引入的回归，接手者不必因为这段记录而担心 B3 或本文档其它改动有问题。**该慢启动问题本身值得单独记录为新 bug（B6，见下）**，但与 B4 的去留无关。
   - **决策：B4 仍然回退**，但理由改为纯粹的"收益不确定"：两轮测试（改前、改后）`hasSharedArrayBuffer` 都是 false，即 B4 从未证实带来任何好处，既然没有收益就没必要保留这个改动的复杂度。另外发现一个更值得走的路：`android-app/www/nodejs-project/main.js:45-47` 里内嵌 Express **本来就已经**对所有响应设置了 `Cross-Origin-Opener-Policy`/`Cross-Origin-Embedder-Policy`/`Cross-Origin-Resource-Policy` 头——理论上 `:5001` 页面不需要任何 Service Worker 把戏就该天然获得跨源隔离。`coi-serviceworker.js` 存在的意义可能仅仅是给**重定向前**的 Capacitor 原生 `http://localhost` 页面（Express 管不到那里）提供隔离，对 `:5001` 页面而言它是冗余的。**接手者的下一步**：不要重新尝试 B4 那种"改 SW 逻辑"的补丁，而是先搞清楚"Express 已经在设置正确响应头的前提下，`:5001` 页面的 `crossOriginIsolated` 到底是不是 true"——用 Chrome remote debug（`chrome://inspect`）连上这个 WebView 直接在 console 里读 `window.crossOriginIsolated`，并在 Network 面板核对 `:5001` 主文档请求的实际响应头，而不是先急着动代码。如果 Express 的头已经生效但 `crossOriginIsolated` 仍是 false，说明问题出在别处（比如 ONNX Runtime WASM build 本身的线程开关、或这个 WebView 版本对 COEP 的支持程度），需要重新诊断，而不是继续在 Service Worker 层面打转。
   - **B6（新记录，未解决，优先级低于 B5）**：`pm clear`/全新安装场景下冷启动耗时 45 秒（正常场景 5–8 秒），怀疑是内嵌 Node 首次启动的数据库种子导入或资源解包阻塞了健康检查轮询。影响面：仅首次安装/清除数据后的第一次启动，不影响日常使用，優先级低，但如果要发布给真实用户，45 秒黑屏的首次启动体验需要至少加一个可见的加载提示（目前是纯黑屏，用户会以为卡死——本次调查中我自己都一度误判为卡死）。
   - **教训（写给接手者，也是写给我自己的）**：①观察到"改动后出现异常"不等于"改动导致异常"——必须做对照实验（把改动去掉，同样的操作序列复测一遍），否则会把无关的预先存在的 bug 错怪到当前改动头上，浪费回退的精力，还可能让人对一个其实无害的改动产生不必要的恐慌。②真机验证不能只看"改动后有没有报错"，冷启动（`pm clear`/卸载重装）路径要专门测一次，因为很多时序问题只在这个特定窗口出现——这条本身仍然成立，只是这次撞见的冷启动问题恰好和被怀疑的改动无关。
   - **实测参考数据**（供后续对照）：B3 修复前，单线程 WASM 640 输入推理耗时 PPE 3615ms（平板）/ OCR 1087ms（Pixel 3 XL）。这仍是 B3+B5 未完全解决、B4 已回退状态下的当前基线。

### 2.4 接手优先级（按建议执行顺序，每项独立 commit）

0. **🔴 B5 架构级修复**（插队到最前，2026-07-05 新增，未解决）：让 WebView 不要导航离开 Capacitor 自己的 origin（方案见上，2.3 第二层）；或先用 Chrome remote debug 确认 `:5001` 页面 `crossOriginIsolated` 实际状态，重新诊断 WASM 单线程的真正原因。B3（桥文件复制）已修复且应保留；B4（SW reload 改造）已回退，**不要重新尝试同类补丁**，先用远程调试拿到确凿证据再动手。
1. **P4 急救**（体积不达标纯属工程问题）：开 R8 + ONNX 文件去重重定向 ≤2 处。预期一轮就能降到 ≤150MB。纯 `build-apk.sh` + `build.gradle` 改动，≤3 文件。
2. **P3 收尾**：加 ML Kit `BarcodeScanner` 插件 OR 把离线并行 QR 改为 stub/丢弃；`detect.ts` / `ocr.ts` 在结果上补 `source` 字段。
3. **P1 EXIF + per-class NMS + `inferMs/source` 返回**：飞行模式拍照距 PC `best.pt` 对齐率达标的关键。改 `YoloNativeDetector.java` / `YoloNativePlugin.java` / `yoloNativeBridge.ts` 三个文件。
4. **P2 路径统一**（B3 修复后优先级上调）：把 PPE (`usePPEDetection.ts`) 与 OCR (`useRealtimeDetectionLoop.ts`) 的检测循环也走 `detectVideoFrame`，复用 320 letterbox + 背压 + 逆映射——这两条线现在直传全分辨率帧，是慢的第二大来源（第一大是 B3）；后续 `requestVideoFrameCallback` 替换 setTimeout。
5. **H10 旋转**：拍照与实时都加 EXIF 矫正。
6. **全屏检测反馈**（第 3 节，✅ 已完成）。

**性能预期基准（Pixel 3 XL / 骁龙845 级别硬件，供修复后对照）**：单线程 WASM 640 输入 ≈ 1–4s（当前实测值）；4 线程 WASM+SIMD ≈ 400–800ms；native C++ ORT 4 线程 640 ≈ 150–300ms；native + 320 letterbox ≈ 50–120ms（≈5–10 FPS，半实时可用）。修完 B3+P2 后达不到最后一档就再查。

---

## 3. 全屏检测反馈（下一阶段，A1）——实习生执行指引（2026-07-05 复审修订版）

> **用户原话**：手机屏幕小，检测最好全屏看；全屏反馈要简单，不要复杂。
> **本节地位**：这是接手后的第一个完整任务包。原稿只是草案；本版经过代码实测复审，修正了原稿 4 处路径/数据源错误。**动手前仍要 grep 复核行号**——行号会随后续提交漂移，路径 + 函数名才是可靠锚点。

### 3.0 真实文件地图（先收藏，原稿路径有误，以此表为准）

| 角色 | 真实路径 | 关键位置（2026-07-05 实测） |
|---|---|---|
| OCR 视频面板 | `src/components/ocr/RealtimeDetectionPanel.tsx` | 内联 verdict 大字 `:318-348`；全屏按钮 `:351-359` |
| PPE 视频面板 | `src/components/safetyEquipment/SafetyCameraPanel.tsx` | Fullscreen API `:78-105`（`requestFullscreen` + `fullscreenchange` 监听，是标准做法样板） |
| Live 视频面板 | `src/components/liveInspection/LiveCameraPanel.tsx` | `:152-166`，`isFullscreen`/`setIsFullscreen` 是 **props**，状态在父级页面 |
| Live 页面（全屏状态持有者） | `src/screens/LiveInspectionScreen.tsx` | `:88,:103` 持有状态；`:394` 用 CSS `fixed inset-0 z-50` 做**页面级伪全屏**（不是 Fullscreen API，见 A1.4 的方案修订） |
| PPE 实时检测 hook | `src/hooks/safetyEquipment/usePPEDetection.ts` | `drawDetections` 定义于 `:277`，**没有** perfStats 参数 |
| PPE 判定逻辑（verdict 真源） | `src/hooks/safetyEquipment/usePPEInspection.ts` | `:95-180`：detections → equipmentStatus → complianceScore → `overallQuality('合格'/'需复检'/'存疑')` + `score` + `reason` |
| Live 判定逻辑（verdict 真源） | `src/hooks/liveInspection/useLiveAIDetection.ts` | `parseAIResult` `:136-159` 产出 `overallQuality`。**原稿写 `useLiveYoloDetection` 是错的**，那个 hook 只管框和 HUD |
| Live HUD 样板 | `src/hooks/liveInspection/useLiveYoloDetection.ts` | `:570-592` 画「推理: Xms \| 帧率: Y FPS」 |
| OCR HUD 样板 | `src/lib/ocr/detectionDrawer.ts` | `:20` perfStats 可选参数、`:95-104` 绘制逻辑 |
| 检测结果类型 | `src/services/detect.ts` | `FrameDetectionResult` `:32-44` **已自带** `inferenceMs`/`fps` 字段——HUD 数据不需要新造 |
| 噪音组件 | `src/components/ocr/VideoOverlayIndicators.tsx` | **只有 OCR 面板在用**（原稿说三面板都有是错的）；PPE/Live 的"噪音"是各自面板内的按钮/状态条，A1.5 要逐面板盘点 |

### 3.1 设计目标（与用户要求对齐，不变）

**全屏 = 视频铺满 + 框 + 一个一眼可见的合格判定**。其余控件移出全屏或隐藏。

- **保留**：检测框 + 框上的 `label: confidence%`；右上角一个简洁的 `合格`/`存疑`/`需复检` 大色块徽章（绿/黄/红）。
- **保留**：底部一条极简 HUD（推理耗时 + FPS）——只在 Live/OCR 已有的 `perfStats` 渲染基础上打通到 PPE，不动布局。
- **隐藏**：人员/装备数量 chip、键盘提示、设置按钮、所有不属于"判断结果"的 HUD。
- **不增**：不加测距、不加多结果列表、不加图例、不加复杂控件。

### 3.2 动手前必须知道的三个坑（教练划重点）

1. **Fullscreen API 的子树陷阱（最容易翻车）**：`element.requestFullscreen()` 之后**只有该元素及其后代可见**。`SafetyCameraPanel` 全屏的是视频容器，所以 `FullscreenVerdictBadge` 必须渲染在**被全屏的那个容器 DOM 之内**，渲染在面板外层或用 portal 挂到 `body` 上的话，全屏时徽章根本看不见。写完先真机/浏览器目视确认，再谈样式。
2. **两种"全屏"并存是现状，不是 bug**：OCR/PPE 走 Fullscreen API，Live 走页面级 CSS overlay（`LiveInspectionScreen.tsx:394` 的 `fixed inset-0`，且整个页面 grid 布局依赖 `isFullscreen` 状态切 class）。**方案修订（推荐）**：A1.4 **不要**把 Live 强改成 Fullscreen API——那会绕过页面级布局状态，牵连 `LiveInspectionScreen` 的 grid 逻辑，改动面远超 8 文件红线的精神。统一的应该是**全屏里的体验**（徽章 + HUD + 降噪），不是全屏的实现机制。如果将来真要统一机制，单独立项，先在 APK WebView 真机上验证 Fullscreen API 行为（ESC/返回手势退出时 `fullscreenchange` 同步）再动。
3. **verdict 是"抽取复用"，不是"重新发明"**：PPE 的判定逻辑目前**埋在拍照评估循环里**（`usePPEInspection.ts:95-180`），实时全屏要用它就必须先抽成纯函数（见 A1.3 步骤）。红线是：**映射关系一个字都不许改**（合规率≥80→合格 等阈值原样搬），改了就是新增业务逻辑，违反 3.4。

### 3.3 执行计划（每项独立 commit，前缀 `A1.x: `，按序做）—— **已全部完成（2026-07-05）**

> 以下保留原计划文字（供理解设计意图），每项后附「实际执行记录」——与计划有出入的地方均已标注原因，这是本轮"教练带做"的真实交付记录，供之后类似任务参考方法，而非单纯留痕。

- [x] **A1.1 共享徽章组件**（半天）
  新建 `src/components/detection/FullscreenVerdictBadge.tsx`，纯展示组件，≤80 行：
  - Props：`verdict: '合格' | '存疑' | '需复检' | '待检测' | '检测中'`（注意 OCR 现有代码里有"待检测/检测中..."中间态，`RealtimeDetectionPanel.tsx:341-343`，不能只做三态）；`score?: number` 可选小字。
  - 颜色：合格=绿、存疑=黄、需复检=红、待检测/检测中=灰。样式抄 `RealtimeDetectionPanel.tsx:319-320` 现有的 `bg-black/70 backdrop-blur` 大字块即可，不要自由发挥。
  - **判定逻辑不进组件**——组件只吃算好的 `verdict` 字符串。OCR 那段"融合模式三条件与"的 IIFE（`:321-345`）留在面板里算，算完把结果传进来。
  - 验收：组件能被 Storybook 式地单独渲染五种状态（临时页面或直接在 OCR 面板试）；`tsc` 零错误。
  - **实际执行**（commit `386d5e8`）：按计划落地；额外发现 OCR 面板还有 `'检测中...'`（带省略号）这个第 6 态未在原计划枚举中，已补进 `FullscreenVerdict` 联合类型，否则 A1.2 迁移时会丢失这个视觉状态。
- [x] **A1.2 OCR 面板迁移**（半天）
  `RealtimeDetectionPanel.tsx:318-348` 的内联大字块替换为 `<FullscreenVerdictBadge verdict={...} />`。verdict 计算逻辑原样上移为面板内一个 `const fullscreenVerdict = useMemo(...)`——**行为零变化，纯搬家**。
  - 验收：全屏下逐状态对比（融合开/关 × qualified/unqualified/processing），视觉与改前一致；非全屏无任何变化。
  - **实际执行**（commit `98d9c70`）：按计划落地，零偏差。
- [x] **A1.3 PPE 面板加 verdict + HUD**（1–2 天，本阶段最难的一项）
  分两步，**一个 commit 内完成但先后有序**：
  1. **抽纯函数**：把 `usePPEInspection.ts:95-180` 的判定块抽到新文件 `src/lib/safetyEquipment/ppeVerdict.ts`，签名建议 `computePpeVerdict(detections: PPEDetection[]): { overallQuality: '合格'|'需复检'|'存疑'; score: number; missingItems: string[] }`。`usePPEInspection` 原地改为调用该函数，**用同一组输入前后对拍确认输出逐字段一致**（最简单：临时 console.log 新旧结果各跑一次拍照流程对比，确认后删掉）。
  2. **接到全屏**：`SafetyCameraPanel.tsx` 在全屏时对最近一帧检测结果调 `computePpeVerdict`，结果传 `<FullscreenVerdictBadge>`。**防闪烁**：逐帧算 verdict 会跳变，加一个 300–500ms 的展示节流（`useRef` 存上次更新时间即可）——这是展示层平滑，不算新增业务逻辑，但别做成多帧投票之类的花活。
  3. **HUD**：`usePPEDetection.ts:277` 的 `drawDetections` 加可选 `perfStats` 参数，绘制代码直接抄 `useLiveYoloDetection.ts:570-592`。注意：PPE 检测路径目前还没统一走 `detectVideoFrame`（见 2.2 P2 缺口），所以 `inferenceMs` 暂时要在 PPE 自己的调用点计时（`performance.now()` 前后差），等 P2 路径统一后改用 `FrameDetectionResult.inferenceMs`，届时删掉临时计时。在代码处留一行 `// TODO(P2): 路径统一后改用 FrameDetectionResult.inferenceMs`。
  - 验收：PPE 全屏 = 框 + 右上角徽章 + 底部 HUD；拍照评估功能（`usePPEInspection`）行为不变。
  - **实际执行**（拆成两个子提交，非计划里的"一个 commit"——理由：抽纯函数与接全屏是两类风险不同的改动，拆开更易单独回滚）：
    - `093e5cf` A1.3a：抽 `computePpeVerdict`，用 token 级 diff（阈值/分支/文案模板逐字比对）核实抽取无逻辑漂移，比"临时 console.log 对拍"更严格且不需要事后清理。
    - `12584b6` A1.3b：接全屏 + HUD。**未加计划中的 300–500ms 展示节流**——查实 PPE 检测循环由 `usePPEPolling` 至少 2000ms 一次驱动（非逐帧），verdict 更新频率远低于计划设想的"逐帧跳变"场景，节流是不需要的复杂度，属合理偏离而非遗漏。**顺手修了一个未写进计划的隐患**：HUD 数据若直接读 `perfStats` state 会因 `setState` 异步而落后一帧（stale closure），改用本帧局部变量 `framePerfStats` 传给 `drawDetections`。
- [x] **A1.4 Live 面板加徽章（方案已修订，见 3.2 坑 2）**（半天–1 天）
  **保持 Live 现有 CSS overlay 全屏机制不动**，只做两件事：
  1. `LiveCameraPanel.tsx` 在 `isFullscreen` 时渲染 `<FullscreenVerdictBadge>`；verdict 数据从 `LiveInspectionScreen.tsx:150` 已解构的 `useLiveAIDetection` 结果里取 `aiAnalysisResult?.overallQuality`（无结果时传 `'待检测'`），经 props 传入面板——面板已经在收 `isFullscreen`，加一个 prop 顺路。
  2. Live 的 HUD 已存在（canvas 内绘制），不动。
  - 验收：Live 全屏出现徽章；AI 分析未开启时显示"待检测"灰色而不是空白或报错。
  - **实际执行**（commit `0ac4f02`）：**verdict 数据源与计划不符，已修正**——`useLiveAIDetection` 的返回类型 `UseLiveAIDetectionResult` 根本不导出 `aiAnalysisResult`/`overallQuality`（那只是 `parseAIResult` 函数内部的局部变量），本节 3.3 这条计划文字本身就是错的。改为从 `LiveInspectionScreen` 已持有的 `localResults`（`useLiveInspectionStore`）取值：`localResults[0]?.overallQuality ?? '待检测'`。确认 `localResults[0]` 是最新一条的依据：`useLiveAIDetection.ts:214,371` 两处更新都是 `[result, ...localResults]` 头插。**这是"不要相信文档，要 grep 复核"（3.2 坑总纲）的又一次现身说法**——连当天刚写的计划都会凭错误记忆写错数据源，动手前的复核不是形式主义。
- [x] **A1.5 全屏降噪**（半天）
  原则：全屏时**白名单渲染**——video、检测 canvas、徽章、HUD、退出全屏按钮，其余一律 `{!isFullscreen && ...}` 直接不渲染（不是 CSS 隐藏）。逐面板盘点：
  - OCR：`VideoOverlayIndicators`、键盘提示、"检测中"小徽标（`:311-315`，与大徽章重复）。
  - PPE / Live：进各自面板数一遍非白名单元素再动手，**先截图记录改前状态**，防止误删非全屏时也需要的东西。
  - 验收：全屏只剩白名单五件套；退出全屏后所有控件如初。
  - **实际执行**（commit `aefe69b`）：OCR/PPE 按计划办。**Live 的降噪比计划复杂得多**——Live 走页面级 CSS overlay 而非 Fullscreen API（3.2 坑 2），意味着容器外的兄弟元素（`LiveCameraPanel` 的 `CardHeader` 标题/模型选择/键盘提示、屏幕里的"检测目标选择"Card、`LiveDetectionResultsCard`、YOLO 识别目标浮层）**不会**像 OCR/PPE 那样被浏览器自动裁剪出画面，必须在 `LiveInspectionScreen.tsx` 里逐个显式 `{!isFullscreen && ...}`。改动时发现一个隐藏坑：被隐藏的"检测目标选择"Card 里嵌着 `<input id="file-upload-input">`（由面板"上传"按钮通过 `getElementById` 触发），若整卡片不渲染，全屏下点"上传"会因找不到元素而静默失效——已将该 `<input>` 移到条件外层单独常驻挂载。
- [x] **A1.6 总验收**（半天）
  三个 screen 各进/出全屏一轮：视频铺满 + 框可见 + 徽章 + HUD + 降噪生效 + 退出恢复。`npx tsc --noEmit` 零错误；`./start_mac.sh full` 冒烟三页面 console 零非网络错误；**APK 真机走一遍 OCR 与 PPE 全屏**（Live 若真机没有摄像头流可跳过并在 commit message 注明）。
  - **实际执行与环境限制说明**：`tsc --noEmit` 与 `npm run build` 均零错误通过；三页面非全屏态冒烟（含 A1.5 降噪改动的回归检查——标题/键盘提示/结果卡片等在非全屏下仍正常出现）通过，console 仅剩预期的无后端 fetch 噪音。沙盒预览环境本身无摄像头、无法触发真实 Fullscreen API（`requestFullscreen()` 因缺少用户手势被安全策略拦截，报 `Permissions check failed`——这本身印证了"必须真机验证"而非代码问题），因此当时只完成了非全屏回归，全屏视觉核对与 APK 真机走查留待补做。
  - **真机补验收记录（2026-07-05 下午，同日晚些时候）**：Android 真机通过 USB 连接（`adb devices` 可见，型号 `25097RP43C`，Android 16，`arm64-v8a`），执行 `cd android-app && bash scripts/build-apk.sh debug` 用当天最新代码（含全部 A1 commit）重新构建（`BUILD SUCCESSFUL`，`dist/AI检测系统-debug-v1.0.0.apk`，720MB debug 包，体积未做精简，这是预期的——P4 瘦身是第 2 节的独立任务，不在 A1 范围），`adb install -r` 覆盖安装，`adb shell am start` 启动。
    - **PPE 全屏 —— ✅ 完整走通，符合 3.1 全部白名单**：开摄像头 → 开始监控（非全屏下"监控中"指示器 + "人员/装备"chip 正常显示，确认 A1.5 未破坏非全屏状态）→ 点击全屏图标 → 全屏画面：视频铺满、检测框（`NO-Hardhat: 88.5%`/`NO-Mask: 87.9%`）清晰可见、左上角判定徽章显示"需复检 0.0%"（红色，与 `computePpeVerdict` 口径一致——口罩/安全帽均判定 not_worn，`complianceScore=0`）、右下角 HUD 显示"推理: 3615ms | 帧率: 0 FPS"（FPS 取整为 0 属预期——PPE 走的是按需拍照分析而非连续视频流推理，`1000/3615≈0.28` 四舍五入为 0，非 bug）、"监控中"指示器与"人员/装备"chip 已消失（A1.5 降噪生效）。点击退出全屏 → 侧边栏、"监控中"指示器（`人员: 2 / 装备: 2`，检测到两人）、所有原控件完整恢复。**这是 A1 全部 6 项任务第一次在真实硬件、真实摄像头画面下的端到端确认**，此前所有验证都止步于 tsc/build/无摄像头冒烟。
    - **OCR / Live 全屏 —— 待验证**：已导航到 OCR 融合模式页面（弹出"选择工序配方"引导弹窗，需要先跳过/选配才能进入摄像头面板），用户在此时叫停，改为先记录进度。**下一步接手者直接从这里继续**：点"跳过，稍后配置"关闭弹窗 → 开摄像头 → 全屏 → 核对右上角 verdict 徽章（融合模式开关下的合格/存疑状态）+ 底部 HUD + 降噪；随后再验证 Live 面板（`/live-inspection`，注意 Live 是页面级 CSS overlay 全屏，不是 Fullscreen API，核对点是标题/模型选择/键盘提示/检测目标卡片/结果卡片在全屏时确实消失，退出后完整恢复）。
    - **顺带确认的信息**：debug APK 构建产物路径 `android-app/dist/AI检测系统-debug-v1.0.0.apk`；设备已装 `com.wyl.inspection.mobile`，后续再验证可直接 `adb install -r` 覆盖，无需卸载重装。

### 3.4 纪律红线（与 Phase W 一致）

- 单 commit ≤ 8 文件；A1.x 每项独立 commit；commit message 前缀 `A1.x: `。
- **不新增业务判定逻辑**（判定口径以现有 store/hook 为准；A1.3 的抽函数是"搬家"，阈值与映射一字不改），A1 只做"显示什么"和"在哪里显示"。
- 改完 `npx tsc --noEmit` 必跑。
- **不在全屏里堆 UI**——任何想往全屏加东西的念头，先回 3.1 清单核对，符合"简单"才加。用户就要一个字：简单。

---

## 4. 之后（W7+，Phase W 已全部完成）

1. **Phase W+（选做）**：W7 巨型页面拆分 / W8 三套后端契约收敛 / W9 深度卫生 —— 见行动文档。
2. **第二梯队（APK，二线）续做**：按本文件 **第 2 节** 的"接手优先级"续做，**不要按行动文档 Phase 0 从零开始**。Phase 0 已基本完成。
3. **整体节奏与优先级排布见第 7 节路线图**——第 7 节是月度视角，本节和第 2.4 节是任务视角，冲突时以第 7 节的顺序为准。

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

---

## 7. 未来 3–6 个月路线图与教练指引（写给接手实习生）

> 这一节是导师视角：不只告诉你做什么，还告诉你为什么这么排、这个项目要长成什么样、以及你该怎么在这个项目里工作。**接手第一天先通读本节，再回到第 3 节动手。**

### 7.1 一段话认清这个项目

它今天的形态是"**一套 React 检测前端 + 三个部署形态（Mac/Web 开发、Jetson 生产、Android 离线 APK）+ 三套后端（Django 主力 / Node 流媒体 / APK 内嵌 Node）**"。Phase W 干的事情是把散落在十几个 hook 里的检测调用收口到 `src/services/detect.ts` 和 `ocr.ts` 两个抽象层。它要长成的样子是：**一个以 detect.ts/ocr.ts 为核心的检测平台**——新增一种检测场景时，只需要 (a) 配一个模型条目 (b) 挂一个 screen，而不是复制一份 hook。你做的每个任务，都应该问一句"这是在向那个形态靠近，还是在远离"。

### 7.2 月度路线图（2026-07 起，顺序有依据，别乱换）

| 阶段 | 时间 | 任务 | 验收标准（可量化） |
|---|---|---|---|
| **M1 全屏反馈 + APK 止血** | 7 月 | ① 第 3 节 A1.1–A1.6 全做完 ② P4 急救：R8 开启 + `build-apk.sh` ONNX 复制 5 处收敛到 ≤2 处 ③ P3 收尾：ML Kit BarcodeScanner 插件（或先 stub 掉离线 QR 死代码）+ `detect.ts`/`ocr.ts` 结果补 `source` 字段 | 三页面全屏体验达标；APK ≤150MB；离线模式无静默 404 |
| **M2 端侧精度对齐** | 8 月 | ① P1：EXIF 旋转矫正 + per-class NMS + native 返回 `inferMs/source` ② **建对齐基准**：选 20 张有代表性的测试图（正拍/竖拍/暗光/多目标），PC `best.pt` 与 APK 端侧各跑一遍，记录逐图类别命中与 IoU ③ P2：PPE/OCR 循环统一走 `detectVideoFrame`（顺手兑现 A1.3 留的 TODO） | 20 图对齐率：类别一致 ≥90%，且竖拍图零形变；PPE/OCR 竖屏框不变形 |
| **M3 还技术债：可测试性** | 9 月 | ① W7：巨型页面拆分（先拆 `OCRDetectionScreen`，仓库已有拆分备忘录 `docs/OCRDetectionScreen_拆分备忘录.md`）② 引入 vitest，**从纯函数开始**：letterbox 逆映射、`computePpeVerdict`（A1.3 抽出来的，天生可测）、`detectionDefaults` ③ GitHub Actions CI：`tsc --noEmit` + `npm run build` + 单测，PR 必过 | 单测 ≥20 个且全绿进 CI；任何人推错代码 CI 会红 |
| **M4–M5 三后端收敛（W8）** | 10–11 月 | 方向判断（见 7.3）：**Django 是唯一业务真源**；Node 只保留流媒体桥职责；APK 内嵌 nodejs-project 逐步瘦身——凡是 native 插件已覆盖的能力（YOLO/OCR/条码），对应 node 路由删除。先做接口对照表（三后端同名路由逐个列请求/响应差异），再动代码 | 接口对照表进 docs；APK node 端路由数量净减少；无双写路由 |
| **M6 数据闭环起步** | 12 月 | ① 检测结果回流：把生产误检/漏检样本导出为待标注集 ② `train2/` 复训流程文档化（现在只有当初训练的人会跑）③ 模型版本管理：`.pt/.onnx` 加 manifest（文件名+sha256+训练日期+类别表），杜绝 B1 那种"文件名与内容对不上"的事故再次发生 | 复训流程一个新人照文档能跑通；每个模型文件可追溯来源 |

**排序的道理**（这也是你以后自己排期时的思考模板）：
- M1 在最前，因为它是**用户直接看得见的价值**（全屏是用户原话需求）+ 纯工程止血（体积超标不涉及算法风险），风险低、见效快，适合你熟悉代码库。
- M2 在 M3 前，因为端侧精度是 APK 这条产品线**成立与否**的前提——对不齐 PC 结果，APK 就只是个玩具；而"建基准"这件事做一次以后每次改动都能复用。
- M3（测试）故意排在两轮功能之后：等你改过足够多代码、被回归吓过一两次，才会真正理解测试保护的是什么。但不能再晚——W8 大手术没有测试网兜着不能开工。
- W8 是全项目最大的手术，必须在 CI + 单测就位后做，且**先写对照表再动代码**（这个项目历史上 22 文件大爆炸的事故就是跳过调查直接动手造成的，见 `docs/FAILED_CHANGES_2026-05-20.md`）。

### 7.3 三个方向性判断（现在不必做，但要照这个方向演化）

1. **APK 内嵌 Node 的终局是消亡**。它存在是历史原因（复用 web 后端代码）。native 插件（YOLO/OCR/条码）逐步覆盖后，内嵌 Node 只剩数据存储一件事，而那件事该由端侧 SQLite/文件直接做。每次你在 APK node 端修 bug 前先问：这个能力是不是该直接 native 化？是就别修，改道。
2. **三套后端的漂移只会越来越贵**。第 6 节坑 3 说改 API 要三处对照——这不可持续。W8 的收敛不是可选优化，是止损。在 W8 之前，**任何新 API 一律只加在 Django**，另外两处只做转发，不写业务。
3. **模型管理要从"人肉记忆"变成"清单可查"**。B1 事故（`yolo8_general` 配置槽指着一个 PPE 模型跑了很久没人发现）的根因是模型文件与配置声明之间没有任何机器校验。M6 的 manifest 是最小解；更进一步可以在 Django 启动时校验"配置声明的类别数 == 权重实际 nc"，不一致直接拒绝加载。

### 7.4 工作方法（纪律与习惯，比技术更重要）

- **第一周只读不写**：顺序是 行动文档 → 本文档全文 → `src/services/detect.ts`（257 行，全项目最重要的文件）→ `src/services/ocr.ts` → 跑通 `./start_mac.sh full` 并六个页面点一遍 → `cd android-app && bash scripts/build-apk.sh debug` 装真机跑一遍。读完你应该能回答：一次拍照检测，从按钮点击到框画出来，经过哪几个文件？答不出来就再读。
- **每个任务的完成定义（DoD）**：功能可见 + `tsc` 零错误 + 冒烟无 console 错误 + 单 commit ≤8 文件 + commit message 带任务编号。五条缺一不算完。
- **卡住 30 分钟规则**：卡住超过 30 分钟，停下来写三行字——"我以为的是什么 / 实际观察到什么 / 证据在哪个文件哪一行"。一半的问题写完就自己解了；剩下一半，这三行就是你向别人求助的最好格式。
- **不要相信文档里的行号，相信 grep**：本文档已经修正过一轮凭记忆写错的路径（见第 0 节）。文档会腐烂，代码不会说谎。动手前 `grep -n` 复核是肌肉记忆。
- **收口类任务的搜索方法**（第 6 节坑 6 的教训）：光 grep 函数名不够，还要 grep 裸 `fetch(` + 裸 `import` 交叉核实——平行的重复实现不会引用你知道的那个函数名。
- **改前留证据**：涉及 UI 的改动先截图，涉及行为的改动先记录旧输出（A1.3 的对拍就是这个思路）。"改完发现不对但想不起原来什么样"是最浪费时间的处境。
- **每周五 15 分钟更新本文档**：做完什么、卡在什么、下周做什么，写在对应章节。交接文档不更新等于没有交接文档——你今天读到的这份能用，是因为前人这么做了。

### 7.5 不要碰的东西（再强调一遍）

1. **SECRET_KEY 事故后续**（轮换 + git 历史清洗）：用户明确自行安排，你不做，除非用户开口。但**每月口头提醒一次用户**"密钥还没轮换"是你的职责——提醒是免费的，事故不是。
2. **`yoloDetectBackend` 里的 WASM 离线分支**：Electron/离线 web 还在用，APK native 化完成前不删（第 6 节坑 2）。
3. **`models/yolo10x.pt` 游离文件**：17 类 PPE 模型，暂无配置引用。M6 做 manifest 时一并处置（收编或归档），现在别动。
4. **大文件同步纪律**：`.pt/.onnx` 不进 git，改动模型后按 AGENTS.md 手动同步，Jetson 走 `ssh jetson` + git pull。忘了这条，生产和开发的模型会悄悄分叉——这正是 B1 类事故的温床。

---

## 8. 2026-07-10 审计与首轮收口（当前接手点）

### 8.1 审计范围与结论

- 审计覆盖 2026-07-04 至 07-07 的 56 个提交、领先远端的 12 个提交，以及当时工作区的 Android、Django、前端未提交改动。
- `npm run build`、Django 模型差异检查通过；debug APK 可完整构建，产物约 255MB。构建包内确认含 `capacitor.js` 和 `best.onnx` / `ppe.onnx` / `yolov8n.onnx`。
- 本轮**不处理** B5（WebView 导航离开 Capacitor origin 导致原生桥失效）的架构问题；它需要真机证据和单独立项，不能混进安全/元数据补丁。

### 8.2 本地小模型提示词决策（已确认）

本地多模态模型能力有限，长系统提示词会增加幻觉和遗漏，故保持短提示词策略：只保留任务目标、必要标准与 JSON 输出格式。保守质检边界不应依赖继续加长提示词；后续应由结果解析、OCR/YOLO 规则比对和 JSON schema 校验来兜底，冲突或解析失败统一降级为`需复检`。

### 8.3 本轮已修复项

1. **Ollama 远程代理 SSRF**：`ollama_host` 不再可任意指定。后端仅接受默认 `OLLAMA_HOST` 或环境变量 `OLLAMA_ALLOWED_HOSTS`（逗号分隔、完整 origin）中明确列出的 `http(s)://host:port`；拒绝路径、账号、查询参数和重定向。部署远程 Ollama 前必须显式配置，例如：`OLLAMA_ALLOWED_HOSTS=http://192.168.55.1:11434`。
2. **PPE 端侧 10/17 类漂移**：已确认 `ppe.onnx` 输出 `[1, 21, 2100]`，即 4 个框参数 + 17 类；`.pt` 同样是 17 类。Node 端模型播种信息同步为 17 类、补齐中文名，并从版本 3 升至版本 4，使既有 APK 本地数据库在升级后重新播种。
3. **远程 Ollama 健康检查**：健康检查、等待重试和失败诊断现在使用所选的远程地址，缓存按地址隔离；UI 提示远程地址必须由服务端白名单授权。
4. **大文件误提交防护**：`.gitignore` 已忽略 `*.large_backup`，防止三个共 334MB 的模型备份被 `git add -A` 误纳入提交。

验证记录：新增 Django 安全回归 4 项全部通过；Web 与移动端 TypeScript/Vite 构建通过；APK 内嵌 Node 服务已确认写入 `MOBILE_MODELS_VERSION = 4` 和 17 类 PPE 定义。

### 8.4 后续优先级

1. 为模型建立唯一 manifest（文件 SHA256、类别表、阈值、输入尺寸），再由 Django、前端和 APK Node 服务读取/生成，彻底避免多处硬编码漂移。
2. 抽取 Live/OCR/PPE 共用的旋转台采集状态机；先补模拟串口测试，再改三页流程。
3. B5 继续按第 2.3 节的真机诊断路径处理，优先验证而不是再做跨 origin 桥补丁。

---

## 9. 2026-07-10 平板启动闪退修复

- **现象**：安装 debug APK 后启动即退出，Android crash buffer 出现 `FORTIFY: pthread_mutex_lock called on a destroyed mutex`。
- **直接原因**：内嵌 Node 服务监听 `0.0.0.0:5001` 时收到 `EADDRINUSE`。现场确认平板上的 `com.checklist.offline`（UID 10364）已占用 5001；nodejs-mobile 在未能处理该冲突时连带退出宿主进程。
- **修复**：AI 检测 APK 的内嵌服务统一迁移到 5002：`node-launcher.js`、`nodejs-project/main.js`、Capacitor `allowNavigation`、前端 `LOCAL_NODE_PORT`、连接测试提示同步更新。保留 5001 给平板上的其他应用，不停止或覆盖它。
- **真机验证**：平板序列号 `551c3203` 已重新安装；应用进程保持运行（PID 28062），`0.0.0.0:5002` 正常监听，`/health` 返回 `{"status":"ok","port":5002}`；未新增 crash 记录。当前 APK 仍保留 5001 的外部监听，但 AI 客户端不再使用该端口。

## 10. 2026-07-10 Web/APK 交互回归修复

- **模型管理入口失效**：`ModelUnavailableDialog` 使用了不存在的 `/model-management`，`ModelSelector` 使用了旧版 hash 地址 `#/model-management`。两者统一改为 React Router 的 `/models` 应用内导航，Web 不再打开空白新窗口，APK 也能正常跳转。
- **旧结果页返回链断裂**：历史组件仍跳转 `/results`、`/results/:id` 和 `/live`，但主路由只注册了 `/results-debug`、`/live-inspection`。Web 与 APK 均补齐结果列表、结果详情及 `/live` 兼容路由，避免增强检测完成或查看详情后落到空白页。
- **Web 冒烟验证**：本地 Vite 预览中，模型池入口到 `/models` 正常；齐套化页面在“暂无待选模型”状态点击“模型管理”后到 `/models`，模型管理标题可见。
