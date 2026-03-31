# 全画面模式最清晰帧抓拍优化计划

## 1. 目标
优化标准模式（全画面）下的抓拍逻辑，确保在用户设置的“抓拍延时”期间，系统能高效、流畅地寻找并锁定清晰度最高的一帧画面，并提供明确的文字反馈。
**核心区分**：
- **ROI/批处理模式**：寻找各个目标的最佳局部（ROI）。
- **全画面模式**：寻找整张画面的最佳瞬间（Best Full Frame）。

## 2. 现状分析
- **当前逻辑**：代码中已存在全画面清晰度比较逻辑，但在 UI 反馈上未做区分，用户感知不强。
- **存在问题**：
    1.  **文案混淆**：目前可能显示为“寻找最佳ROI”或通用等待文案，容易让用户误解为系统还在纠结那个小框框，实际上系统是在看整张图。
    2.  **性能风险**：全图清晰度计算涉及大量像素点，需确保不阻塞 UI 渲染。
    3.  **反馈缺失**：用户需要看到“寻找最佳全画面...”这样的明确提示，以及当前的清晰度得分，从而建立对系统的信任。

## 3. 修改计划

### Phase 1: 逻辑明确与解耦 (Refactoring)
- **Action**: 在 `useROIProcessor.ts` 中，虽然复用 `captureAndEvaluateFrame`，但需通过参数明确区分当前是 `Mode: ROI` 还是 `Mode: FullFrame`。
- **Action**: 确保全画面模式下，**Area（面积）权重强制为 0**，**Sharpness（清晰度）权重强制为 100%**。全画面的大小是固定的，没有任何面积比较的意义。

### Phase 2: UI 文案与状态区分 (UI & UX)
- **Action**: 在 `WorkflowStatusCard.tsx` 中引入专用状态 `searching_best_full_frame` 或复用 `searching_best_frame` 但根据模式显示不同文案。
    - 如果是 `imageSaveMode === 'roi'` -> 显示 "寻找最佳ROI..."
    - 如果是 `imageSaveMode === 'full'` -> 显示 "**寻找最佳全画面...**"
- **Action**: 在状态卡片上增加一行小字或动态指标：
    - "当前最佳清晰度: 85.4" (实时跳动)

### Phase 3: 性能优化 (Performance)
- **Action**: 确认 `calculateROISharpness` 对 1080P/4K 图片的计算耗时。如果超过 16ms (1帧)，必须放入 Web Worker 或使用 `requestIdleCallback` 分片计算，避免界面卡顿。

## 4. 涉及文件
- `src/screens/OCRDetectionScreen.tsx`: 控制延时循环，根据模式设置不同的 UI 状态文本。
- `src/components/ocr/WorkflowStatusCard.tsx`: 接收并显示“寻找最佳全画面”状态及清晰度数值。
- `src/hooks/ocr/useROIProcessor.ts`: 确保全画面模式下的评分逻辑纯粹。

## 5. 预期效果
当用户选择“标准模式（全画面）”并设置延时 3 秒：
1.  触发检测后，界面立即显示 "**寻找最佳全画面...**"。
2.  倒计时 3..2..1 期间，用户能看到清晰度数值在变化（例如手抖时低，手稳时高）。
3.  倒计时结束，系统确信抓取了这 3 秒内最清晰的一张全图发送给 
