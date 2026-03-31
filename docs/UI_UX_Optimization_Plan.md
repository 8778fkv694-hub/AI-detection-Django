# OCR 检测界面 UI/UX 优化执行计划 (Revised V2)

本文档基于之前的优化提案，并结合了**技术风险审查报告**进行了修正。本计划优先考虑性能、交互稳定性及移动端兼容性，规避了高开销渲染和潜在的交互冲突。

## 1. 基础体验增强 (Quick Wins & Low Risk)

目标：以最小的代码改动获得最大的可用性提升，无性能风险。

### 1.1 按钮快捷键动态标注 (Dynamic Shortcut Hints)
让用户在使用过程中自然学会快捷键，避免硬编码导致的文档与实现不一致。

- [ ] **创建快捷键映射 Hook/Config**: 
    - 确保快捷键定义在单一的配置文件 (`OCR_SHORTCUTS`) 中。
- [ ] **封装 `ShortcutButton` 组件**: 
    - 接收 `actionName` (如 `START_SCAN`) 而不是硬编码的按键名。
    - 从配置中读取对应的按键 (如 `Space`, `Enter`)。
    - 渲染逻辑：`Button Text` + `<kbd className="ml-2 text-xs opacity-60 bg-black/20 px-1 rounded">Space</kbd>`。
- [ ] **替换现有按钮**: 
    - 将“开始识别”、“清空”、“全屏”等按钮替换为该封装组件。

### 1.2 OCR 结果等宽字体 (Monospace Font)
提升关键数据的可读性，便于字符核对。

- [ ] **样式调整**:
    - 在 `OCRResultDisplay` 组件中，找到显示识别文本 (`detectedText` / `ocr_text`) 的 DOM 元素。
    - 添加类: `font-mono tracking-wide`。
    - 推荐字体栈：`font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`。

---

## 2. 视觉反馈系统 (Visual Feedback System)

目标：建立直观的“结果-反馈”回路，但必须保证不阻断用户操作。

### 2.1 全屏判决穿透动画 (Non-blocking Overlay)
在检测完成瞬间提供视觉冲击，但必须允许点击穿透。

- [ ] **创建 `ResultOverlay` 组件**:
    - **关键属性**: 容器必须设置 `pointer-events-none`，确保点击事件穿透到底层视频。
    - **动画实现**: 使用 CSS Keyframes (`scale-in`, `fade-out`)，避免 JS 动画库。
    - **状态**:
        - **合格 (OK)**: 绿色 Icon (`CheckCircle`)，持续 0.8s。
        - **存疑 (NG)**: 红色 Icon (`XCircle`)，持续 1.2s，伴随轻微震动 (`shake`)。
- [ ] **集成**: 覆盖在 `VideoContainer` 图层最上方。

### 2.2 CSS 驱动的倒计时 (CSS-Driven Countdown)
避免 JS 定时器造成的动画卡顿。

- [ ] **组件实现**: `CountdownRing`。
- [ ] **技术方案**:
    - 使用 SVG Circle。
    - 通过 CSS `transition` 控制 `stroke-dashoffset`。
    - 当 `captureDelaySeconds` 变化时，通过 CSS Variable 传递持续时间 `--duration: 5s`。
    - CSS: `transition: stroke-dashoffset var(--duration) linear;`。
    - **避免**: 使用 `setInterval` 每 100ms 更新一次 UI。只在开始和结束时触发状态变更。

### 2.3 边缘呼吸警示 (Edge Warning)
- [ ] **实现**: 仅在 `finalResult === 'unqualified'` 时，给外层容器添加 `.warning-glow` 类（红光呼吸效果），同样设置 `pointer-events-none`。

---

## 3. 布局与移动端适配 (Layout & Mobile)

目标：解决小屏痛点，但避免破坏性布局。

### 3.1 响应式视频吸顶 (Conditional Sticky Video)
仅在大屏开启吸顶，避免移动端键盘遮挡问题。

- [ ] **CSS 策略**:
    - 使用 Tailwind 的响应式前缀：`lg:sticky lg:top-4 lg:z-10`。
    - **移动端 (Default)**: 保持默认流式布局 (`static`)，防止键盘弹出时遮挡内容。
- [ ] **移动端辅助**:
    - 在移动端视图下，在结果列表底部添加一个“回到顶部 (看视频)”的 Floating Action Button (FAB)。

### 3.2 极简图片对比 (Toggle Comparison)
放弃重型滑动组件，使用轻量级切换方案，彻底规避触摸冲突。

- [ ] **交互设计**:
    - 在图片预览区右下角悬浮一个 `Switch/Toggle` 按钮，文案为“查看原图 / 预处理”。
    - 或者：按住图片显示原图，松开显示处理后（类似微信编辑图片的逻辑）。
- [ ] **实现**:
    - 纯 CSS `opacity` 切换，即时响应，零 JS 计算开销，无触摸事件冲突。

### 3.3 设置面板摘要 (Settings Summary)
- [ ] **Helper 函数**: 编写 `getSettingsSummary(config)`，返回只读的配置字符串。
- [ ] **UI 集成**: 在折叠 Headers 上显示该摘要，字号 `text-xs`，颜色 `text-slate-400`。

---

## 4. 性能与美化 (Performance & Polish)

目标：在不牺牲帧率的前提下提升质感。

### 4.1 性能优先的毛玻璃 (Performance-First Glassmorphism)
- [ ] **条件渲染**:
    - 默认：使用高透明度背景 + 模糊 `bg-slate-800/80 backdrop-blur-md`。
    - **低性能模式 (工控机优化)**: 如果检测到帧率低（可选）或通过该配置开关，回退到 `bg-slate-900/95` (无模糊)。
    - 优化 DOM 层级，确保 `backdrop-filter` 只应用在结果面板这一层，不要滥用。

### 4.2 诊断信息折叠 (Debug Info Toggle)
- [ ] **实现**: 添加 `showDebugInfo` 开关，默认关闭。隐藏 FPS 等无关信息，减少 React 渲染树的节点数量更新。

---

## 5. 执行顺序建议

1.  **Phase 1 (无风险)**: 快捷键标注、等宽字体、设置摘要。
2.  **Phase 2 (核心交互)**: 全屏穿透动画、呼吸警示、CSS 倒计时。
3.  **Phase 3 (布局优化)**: 响应式 Sticky、图片按住对比。
4.  **Phase 4 (视觉打磨)**: 毛玻璃效果（需在真机测试性能）。

