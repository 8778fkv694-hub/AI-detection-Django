# HANDOFF 交接文档 — 检测架构重构（Web 主线）

> **最后更新**：2026-07-05
> **总纲领**：`docs/检测架构重构-行动文档-Web主线与APK落地.md`（先读它，再读本文档）
> **战略**：Web 端权重更高（主线）；APK 是二线离线方案，第一梯队（Phase W）全部完成前不启动。
> **接手规则**：一次只做一个任务，单独 commit，commit message 以任务编号开头（如 `W6: ...`）；单次 commit 涉及文件 > 8 个就停下拆分；每次改完跑 `npx tsc --noEmit` 必须零错误。

---

## 1. 当前进度（Phase W：5/6 完成）

| 任务 | 状态 | Commit | 说明 |
|---|---|---|---|
| W1 检测抽象层 | ✅ 已完成已推送 | `6367b73` | `src/services/detect.ts`（194 行）：server / local-onnx / native / stream-loop 四引擎收口，业务层禁止直连 onnxYoloDetector / yoloNativeBridge |
| W2 OCR/条码抽象层 | ✅ 已完成已推送 | `99f91eb` | `src/services/ocr.ts`（95 行） |
| W4 tsc 清零 | ✅ 已完成已推送 | `edd8a05` | 159→0 错误，tsc 已纳入构建门禁 |
| W3 阈值单一真源 | ✅ 已完成已推送 | `8fdf88e` | `src/state/detectionDefaults.ts` 集中全部默认阈值；三个 store 字面量清零；PPEThresholds 类型迁入并在 ppeDetectionStore 兼容性再导出 |
| B1 模型文件错配 | ✅ 已完成已推送 | `6a3e044` | `yolo8_general` 权重从 `yolo10x.pt`（实为PPE模型）改指 `yolov8n.pt` |
| **W5 API 出口收口** | ✅ **本次完成已推送** | `4ddd492`~`8426676`~`ae62250` | 见下方 1.1，7 个子提交 |
| W6 仓库/代码卫生 | ⬜ **下一个任务** | — | 见第 3 节 |

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
- `InspectionScreen.tsx`、`ResultsScreen.tsx`、`ProductionBatchScreen.tsx`：**未挂载路由的死文件**（`App.tsx` 里被注释或压根未 import），改了也无运行时效果，归入 W6 判断是否物理删除。

**⚠️ W5 冒烟中发现的新存量 bug（B2，未修，记录留存）**：
`LiveInspectionScreen.tsx` 的 `handleSaveToTempFolder`/`handleClearTempFolder` 调用 `/api/save-images`、`/api/clear-folder`（注意：**没有** `/rpa/` 前缀），全仓库搜索确认**后端不存在这两个路由**，长期 404（被 catch 静默吞掉，只提示"保存失败"）。这是**第三个独立的"临时文件夹操作"实现**（前两个已在 W5.1 收口到 `rpa.ts`），但语义不同——用的是数组批量接口 `{images: capturedImages}` 而非逐张接口，且硬编码了开发者本机绝对路径 `/Users/yiliwen/开发/打包带走/...`。**不属于机械替换范围**（后端本就不存在，直接套用 `rpa.ts` 需要改成循环调用单张接口，是行为改造不是收口），需要人工决策：①删除这个死功能 ②改造成循环调用 `saveImageToFolder` ③新增批量后端接口。建议下一个专门任务处理，不要顺手改。

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

## 2. 下一个任务：W6 — 仓库/代码卫生（预计半天）

- 删 `src/` 内的 `.bak/.backup` 文件（`src/lib/api.ts.bak`、`src/lib/optimizedLocalAI.ts.bak`、`KitMatchingResultsScreen.tsx.backup`、`useModelMode.ts.bak` 等，W5 排查中确认存在）和混入的 md 文档（移到 `docs/history/`）。
- 26 个根目录 `start_*.sh` 归并为 `scripts/` 下 3–4 个带参数入口。
- `.gitignore` 补 `*.log`、测试图片等（84 个二进制/日志文件被 git 跟踪，`git rm --cached` 出库）。
- **顺带处理**：三个未挂载路由的死文件（`InspectionScreen.tsx`/`ResultsScreen.tsx`/`ProductionBatchScreen.tsx`，见 1.1）——确认真的无引用后物理删除，或者如果只是"暂时下线"就保留但加注释说明。
- **B2 bug**（见 1.1）适合在这里一并处理或另开小任务：`LiveInspectionScreen.tsx` 的临时文件夹保存功能长期 404。

## 3. 之后（W7+）

## 4. 再之后（按行动文档顺序）

1. **Phase W+（选做）**：W7 巨型页面拆分 / W8 三套后端契约收敛 / W9 深度卫生 —— 见行动文档。
2. **第二梯队（APK，二线）**：从 Phase 0 真机基准开始 —— **没有真机数字前不写插件业务代码**；现有原生插件 `YoloNativeDetector.java`（ONNX Runtime）是修复复用对象，不要重写；硬骨头清单 H1–H10 在行动文档第 4 章，执行到对应任务必读。

---

## 5. 环境与命令备忘

```bash
# 类型检查（每次改动后必跑）
npx tsc --noEmit          # 必须零错误

# 本地起服务（联调冒烟用）
cd backend && source venv/bin/activate && python manage.py runserver 0.0.0.0:8000
npm run dev               # 前端 :3300

# APK 构建（第二梯队才用）
cd android-app && bash scripts/build-apk.sh debug
```

- 远程仓库：`https://github.com/8778fkv694-hub/AI-detection-Django`，分支 `main`。
- 大文件（`.pt/.onnx`）不进 git，手动同步（见根目录 AGENTS.md）。
- Jetson 生产环境经 `ssh jetson`，部署走 git pull（AGENTS.md 第一部分）。
- 本地起前端只用 `npm run dev:client`（纯 vite，:3303）；`npm run dev`/`dev:full` 会额外拉起 nodemon（Express，抢 3303 端口）和 rpa-server，如果只是冒烟 UI 不需要它们。

## 6. 已知风险与坑（接手必读）

1. **W5 运行时回归已做**（2026-07-05）：`npx tsc --noEmit` 全程零错误；vite dev 冒烟 10 个路由（含无后端时的 6 页 + 起 Django 后重跑 `/live-inspection`/`/safety-equipment`/`/ocr` 三个改动最重的页面）全部零非网络类 console 错误。W5.3/W5.4 的检测循环并入是本轮风险最高的改动，已重点验证。
2. `yoloDetectBackend` 内仍保留 WASM 离线拦截分支（`isLocalOfflineMode()` → onnxYoloDetector）——这是 Electron/离线 web 的现行路径，**APK 场景将由 native 分支取代，但在第二梯队 Phase 1 之前不要删它**。
3. 三套后端（Django / `src/server/api.js` / `android-app/www/nodejs-project`）接口语义有漂移，W8 之前改任何 API 都要三处对照。
4. 上次失败教训（`docs/FAILED_CHANGES_2026-05-20.md`）：22 文件大爆炸。红线：单 commit ≤ 8 文件。
5. **B2 新发现**（见 1.1）：`LiveInspectionScreen.tsx` 的临时文件夹保存长期 404，未修，需要人工决策方案。
6. W5.3/W5.4 过程中发现 W1 当初的"收口"并不完整——`useRealtimeDetectionLoop.ts`/`usePPEDetection.ts` 两个平行的检测循环实现被漏掉了。**教训**：以后做"收口"类任务，光 grep 关键函数名不够，还要 grep 裸 fetch + 裸 import 交叉核实，独立平行实现容易被具体调用点搜索漏掉。
