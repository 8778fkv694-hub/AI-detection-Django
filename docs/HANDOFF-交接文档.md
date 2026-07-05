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

**验证状态**：以上改动均通过 `tsc --noEmit` 零错误验证；**web 端运行时手工回归尚未做**（本机无摄像头/后端联调环境）。接手者第一件事：起 Django + 前端，冒烟 实时检测 / OCR 检测 / PPE 检测 三个页面各跑一次检测，确认行为与改造前一致。

---

## 2. 下一个任务：W5 — API 出口收口（预计半天，机械活）

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
