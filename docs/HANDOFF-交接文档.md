# HANDOFF 交接文档 — 检测架构重构（Web 主线）

> **最后更新**：2026-07-04
> **总纲领**：`docs/检测架构重构-行动文档-Web主线与APK落地.md`（先读它，再读本文档）
> **战略**：Web 端权重更高（主线）；APK 是二线离线方案，第一梯队（Phase W）全部完成前不启动。
> **接手规则**：一次只做一个任务，单独 commit，commit message 以任务编号开头（如 `W5: ...`）；单次 commit 涉及文件 > 8 个就停下拆分；每次改完跑 `npx tsc --noEmit` 必须零错误。

---

## 1. 当前进度（Phase W：4/6 完成）

| 任务 | 状态 | Commit | 说明 |
|---|---|---|---|
| W1 检测抽象层 | ✅ 已完成已推送 | `6367b73` | `src/services/detect.ts`（194 行）：server / local-onnx / native / stream-loop 四引擎收口，业务层禁止直连 onnxYoloDetector / yoloNativeBridge |
| W2 OCR/条码抽象层 | ✅ 已完成已推送 | `99f91eb` | `src/services/ocr.ts`（95 行） |
| W4 tsc 清零 | ✅ 已完成已推送 | `edd8a05` | 159→0 错误，tsc 已纳入构建门禁 |
| W3 阈值单一真源 | ✅ 已完成（本次） | `8fdf88e` | `src/state/detectionDefaults.ts` 集中全部默认阈值；三个 store 字面量清零；PPEThresholds 类型迁入并在 ppeDetectionStore 兼容性再导出 |
| W5 API 出口收口 | ⬜ **下一个任务** | — | 见第 2 节 |
| W6 仓库/代码卫生 | ⬜ 未开始 | — | 见第 3 节 |

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

## 2. 下一个任务：W5 — API 出口收口（预计半天，机械活）

（B1 已在本次修复，不再是前置任务；直接开始 W5 即可）

**现状**（2026-07-04 实测）：检测/OCR 相关 fetch 已被 W1/W2 收口；剩余**裸 fetch 39 处**（screens 20 处 + hooks 19 处，均指未走 `apiFetch`/`directBackendFetch` 的 `fetch(`）。

**做法**：
1. `grep -rn "fetch(" src/screens src/hooks --include="*.tsx" --include="*.ts" | grep -v "apiFetch\|directBackendFetch"` 列清单。
2. 逐个替换为 `src/lib/api.ts` 中已有函数；没有对应函数的，在 api.ts 新增（薄封装即可，保持 URL/参数/响应处理原样）。
3. **禁止顺手改业务逻辑**；一个 screen/hook 一个小步，全部完成后一次 commit（`W5: ...`）。
4. 验收：上述 grep 归零（个别第三方/静态资源 fetch 可豁免，注释说明）；tsc 零错误。

## 3. 之后：W6 — 卫生（预计半天）

- 删 `src/` 内的 `.bak/.backup` 文件（如 `KitMatchingResultsScreen.tsx.backup`、`useModelMode.ts.bak`）和混入的 md 文档（移到 `docs/history/`）。
- 26 个根目录 `start_*.sh` 归并为 `scripts/` 下 3–4 个带参数入口。
- `.gitignore` 补 `*.log`、测试图片等（84 个二进制/日志文件被 git 跟踪，`git rm --cached` 出库）。

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

## 6. 已知风险与坑（接手必读）

1. **运行时回归未做**（见第 1 节验证状态）——W1/W2 收口改动面大，冒烟是第一优先级。
2. `yoloDetectBackend` 内仍保留 WASM 离线拦截分支（`isLocalOfflineMode()` → onnxYoloDetector）——这是 Electron/离线 web 的现行路径，**APK 场景将由 native 分支取代，但在第二梯队 Phase 1 之前不要删它**。
3. 三套后端（Django / `src/server/api.js` / `android-app/www/nodejs-project`）接口语义有漂移，W8 之前改任何 API 都要三处对照。
4. 上次失败教训（`docs/FAILED_CHANGES_2026-05-20.md`）：22 文件大爆炸。红线：单 commit ≤ 8 文件。
