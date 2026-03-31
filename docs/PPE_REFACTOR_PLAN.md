# PPE 检测页面重构实施计划

## Context

当前 `PPE` 检测页面已经完成过一轮基础拆分，但整体结构还没有达到 `OCRDetectionScreen` 的稳定度和可维护性。

本次重构目标不是“尽量少写代码”或“强行抽公共”，而是：

- 对齐 `OCRDetectionScreen` 的页面组织方式
- 优先稳定性，优先低风险迁移
- 允许新建模块，避免在旧文件上做大范围连续改动
- 先让 `PPE` 页面结构清晰、依赖清晰，再考虑公共抽象

核心原则：

1. 页面主文件只做编排，不承载核心业务逻辑
2. 优先新建模块接管旧逻辑，而不是直接大改旧模块
3. 优先复用“模式”，不强求复用“代码”
4. 公共抽象放到第二阶段，不在第一阶段强推

---

## 当前现状

现有主要文件：

- `src/screens/SafetyEquipmentScreen.tsx`
- `src/state/safetyEquipmentStore.ts`
- `src/hooks/safetyEquipment/usePPEDetection.ts`
- `src/hooks/safetyEquipment/usePPECapture.ts`
- `src/hooks/safetyEquipment/usePPEInspection.ts`
- `src/hooks/safetyEquipment/usePPEKeyboardShortcuts.ts`
- `src/components/safetyEquipment/PPEThresholdSettings.tsx`
- `src/components/safetyEquipment/PPEResultsCard.tsx`

当前优点：

- 已有基础 hook 化
- 已有 store 持久化能力
- 已有部分组件拆分
- 已有 `PPE` 业务逻辑沉淀

当前问题：

- 页面层仍然偏厚，承担了过多编排职责
- `capture -> detection -> inspection` 链路依赖关系不够清晰
- `PPE` 页面没有像 `OCRDetectionScreen` 一样形成“总控 hook + store + 分块 UI”的稳定结构
- 与 `OCR`、`LiveInspection` 存在模式重复，但接口不统一
- 若直接在原文件上继续切分，回归风险较高

---

## 重构目标结构

建议新增并逐步迁移到以下结构：

- `src/screens/SafetyEquipmentScreen.tsx`
  - 页面编排层，仅负责布局和组件组合
- `src/state/ppeDetectionStore.ts`
  - 新的 `PPE` 专用 store
- `src/hooks/safetyEquipment/usePPELocalState.ts`
  - 页面局部状态
- `src/hooks/safetyEquipment/usePPEBinding.ts`
  - URL 参数 / 页面绑定信息 / 默认值处理
- `src/hooks/safetyEquipment/usePPEScreenController.ts`
  - 页面总控 hook
- `src/hooks/safetyEquipment/usePPESave.ts`
  - 保存链路
- `src/hooks/safetyEquipment/usePPEPolling.ts`
  - 轮询或实时检测控制
- `src/components/safetyEquipment/PPEBindingPanel.tsx`
  - 页面绑定信息面板
- `src/components/safetyEquipment/PPEControlPanel.tsx`
  - 摄像头控制、阈值设置、检测按钮
- `src/components/safetyEquipment/PPECapturedImagesPanel.tsx`
  - 抓拍图片与临时目录操作
- `src/components/safetyEquipment/PPEResultsSection.tsx`
  - 检测结果区
- `src/components/safetyEquipment/PPEShortcutHelpModal.tsx`
  - 快捷键帮助弹窗

第一阶段保留旧文件，不直接删除：

- `src/state/safetyEquipmentStore.ts`
- `src/hooks/safetyEquipment/usePPEDetection.ts`
- `src/hooks/safetyEquipment/usePPECapture.ts`
- `src/hooks/safetyEquipment/usePPEInspection.ts`
- `src/components/safetyEquipment/PPEThresholdSettings.tsx`
- `src/components/safetyEquipment/PPEResultsCard.tsx`

---

## 可复用与不可强复用

### 可以直接复用“模式”

以下能力建议直接按照 `OCRDetectionScreen` 的设计方式来做：

- 页面总控 hook 模式
- store 的“持久化配置 / 非持久化运行态”分层
- 折叠区块的交互模式
- 页面绑定信息面板模式
- 页面文件只做编排、不承担核心流程逻辑

### 可以轻改复用的能力

- `AnomalyAlertBanner`
- `anomalyStore`
- `OCRSettingsSection` 的折叠视觉样式
- `Button` / `Card` 等 UI 容器
- 检测结果保存链路的职责拆分思路

### 第一阶段不建议强抽公共

以下能力虽然看起来相似，但建议 `PPE` 先新建自己的模块：

- 摄像头 hook
- 键盘快捷键 hook
- 当前帧抓取逻辑
- 检测结果保存 hook
- 自动抓拍 / 实时检测流程控制
- PPE 穿戴分析逻辑
- PPE 阈值配置编辑器

原因：

- 当前接口未统一
- 业务差异较大
- 第一阶段目标是稳定迁移，不是公共抽象优化

---

## 实施步骤

## Step 1：新建 `ppeDetectionStore.ts`

新建文件：

- `src/state/ppeDetectionStore.ts`

目标：

- 不直接大改 `safetyEquipmentStore.ts`
- 先建立一套更接近 `OCRDetectionScreen` 的 `PPE` store

建议状态分组：

### 页面绑定信息

- `processStageCode`
- `processStageName`
- `pageInstanceId`
- `cameraId`

### 检测配置

- `autoCapture`
- `captureThreshold`
- `captureInterval`
- `inspectionCooldownInterval`
- `postDetectionDelay`
- `detectionInterval`
- `bestDetectionPriority`

### PPE 规则

- `ppeThresholds`

### UI 状态

- `isSettingsExpanded`
- `isBindingInfoCollapsed`
- `isThresholdsCollapsed`
- `isCapturedImagesCollapsed`
- `showShortcutModal`

### 运行态

- `capturedImages`
- `results`
- `bestDetectionInInterval`

持久化建议：

- 持久化配置类状态
- 不持久化大体积图片数据
- 不持久化瞬时运行锁和临时检测态

---

## Step 2：新建 `usePPELocalState.ts`

新建文件：

- `src/hooks/safetyEquipment/usePPELocalState.ts`

目标：

- 承接页面局部状态
- 避免所有内容都塞进 store 或页面文件

建议承接：

- `windowId`
- `modelUnavailableDialog`
- `tempFolderPath`
- 其他只属于当前页面生命周期的局部状态

不建议放入这里的内容：

- 可持久化配置
- 检测结果列表
- 抓拍图列表

---

## Step 3：新建 `usePPEBinding.ts`

新建文件：

- `src/hooks/safetyEquipment/usePPEBinding.ts`

目标：

- 对齐 `OCRDetectionScreen` 的页面绑定信息思路
- 统一处理 URL 参数、默认值、store 绑定值

处理内容建议：

- `stage_code`
- `stage_name`
- `page_instance_id`
- `camera_id`
- 其他后续可能接入的页面绑定参数

输出内容建议：

- `effectiveStageCode`
- `effectiveStageName`
- `effectivePageId`
- `effectiveCameraId`
- 当前绑定信息来源

---

## Step 4：新建页面总控 hook `usePPEScreenController.ts`

新建文件：

- `src/hooks/safetyEquipment/usePPEScreenController.ts`

目标：

- 把页面层的逻辑收口到一个总控 hook
- 页面主文件只做组件编排

总控 hook 负责组装：

- `useCurrentModel`
- `usePPELocalState`
- `usePPEBinding`
- `useSafetyCamera`
- `usePPECapture`
- `usePPEDetection`
- `usePPEInspection`
- `useTempFolder`
- `usePPEKeyboardShortcuts`
- 新的 `ppeDetectionStore`

返回内容建议按区域分组：

- `binding`
- `camera`
- `capture`
- `detection`
- `inspection`
- `results`
- `dialogs`
- `actions`

---

## Step 5：拆 UI 区块

新建文件：

- `src/components/safetyEquipment/PPEBindingPanel.tsx`
- `src/components/safetyEquipment/PPEControlPanel.tsx`
- `src/components/safetyEquipment/PPECapturedImagesPanel.tsx`
- `src/components/safetyEquipment/PPEResultsSection.tsx`
- `src/components/safetyEquipment/PPEShortcutHelpModal.tsx`

### 5.1 `PPEBindingPanel`

职责：

- 展示页面绑定信息
- 展示当前模型、工序、相机、页面实例
- 支持折叠

交互样式建议直接参考：

- `src/components/ocr/OCRSettingsSection.tsx`

### 5.2 `PPEControlPanel`

职责：

- 组合摄像头控制
- 组合阈值设置
- 组合“开始检测”按钮
- 承接监控启动/停止和检测操作

第一阶段可以继续复用：

- `PPEThresholdSettings`
- `SafetyCameraPanel`

### 5.3 `PPECapturedImagesPanel`

职责：

- 展示抓拍图片
- 清空抓拍图
- 保存到临时目录
- 打开临时目录
- 清空临时目录

第一阶段可以把现有 `SafetyCapturedImages` 包一层，不必立刻重写内部实现。

### 5.4 `PPEResultsSection`

职责：

- 展示当前结果和历史结果
- 跳转到结果页
- 清空结果
- 预留后续异常提醒区域

第一阶段可以基于 `PPEResultsCard` 包装。

---

## Step 6：解耦 `capture -> detection -> inspection`

这是本次重构中最需要优先修正的结构问题。

当前问题：

- `capture` 侧存在对 `triggerAutoInspection` 的依赖
- `inspection` 又依赖前置检测和抓拍状态
- 页面层通过临时占位方式规避循环依赖

目标结构：

### `capture`

只负责：

- 手动抓拍
- 自动抓拍
- 返回图片数据

### `detection`

只负责：

- 调用 YOLO 检测
- 检测框绘制
- 返回检测结果
- 返回检测统计

### `inspection/save`

只负责：

- 消费抓拍结果
- 进行 PPE 穿戴分析
- 生成 `InspectionResult`
- 调用保存接口

### `controller`

只负责：

- 决定何时触发自动检测
- 决定抓拍后是否进入分析和保存链路

这样可以彻底取消“占位回调 + 反向注入”的不稳定结构。

---

## Step 7：新建 `usePPESave.ts`

新建文件：

- `src/hooks/safetyEquipment/usePPESave.ts`

目标：

- 把 `usePPEInspection.ts` 中“PPE分析”和“结果保存”拆开

职责划分建议：

### `usePPEInspection`

只负责：

- 解析检测结果
- 生成 PPE 穿戴结论
- 计算 `score`
- 生成 `reason`

### `usePPESave`

只负责：

- 组装统一 `InspectionResult`
- 补齐 `detectionType`
- 补齐 `processStageCode / processStageName / cameraId / pageInstanceId`
- 调用 `addAppResult`
- 更新结果列表

这样后续如果要接：

- 异常系统
- 看板统计
- 页面绑定追踪

只需要改保存链路，不用反复动 PPE 业务分析代码。

---

## Step 8：对齐 OCR 的折叠交互

在 `PPE` 页面新增折叠区状态，建议通过 `ppeDetectionStore` 持久化：

- `isBindingInfoCollapsed`
- `isThresholdsCollapsed`
- `isCapturedImagesCollapsed`
- 可选：`isResultsCollapsed`

折叠区建议：

1. 页面绑定信息
2. 阈值设置
3. 抓拍图片区
4. 结果区域

样式统一参考 OCR：

- `cursor-pointer`
- `hover:bg-slate-700/30`
- `text-xs`
- `ChevronUp / ChevronDown`
- `max-h + opacity` 动画

第一阶段建议新建：

- `src/components/safetyEquipment/PPECollapsibleSection.tsx`

先在 `PPE` 内部使用，不急着抽成全局公共组件。

---

## Step 9：页面主文件瘦身

改造文件：

- `src/screens/SafetyEquipmentScreen.tsx`

最终目标：

- 不再直接承载大量 `useState / useEffect / useCallback`
- 不再直接处理抓拍、检测、保存细节
- 只消费 `usePPEScreenController`
- 只拼装 UI 区块

目标形式应接近：

- 顶层 refs
- `navigate`
- `const controller = usePPEScreenController(...)`
- `<PPEBindingPanel />`
- `<PPEControlPanel />`
- `<PPECapturedImagesPanel />`
- `<PPEResultsSection />`

---

## Step 10：第二阶段增强项

这部分不属于第一阶段必须完成的内容，但等基础结构稳定后建议跟进。

### 10.1 接入异常提醒

可直接复用：

- `src/components/ocr/AnomalyAlertBanner.tsx`
- `src/state/anomalyStore.ts`

前提：

- PPE 页面保存结果时补齐工序信息

### 10.2 接入页面绑定信息与追踪上下文

保存结果时补齐：

- `processStageCode`
- `processStageName`
- `pageInstanceId`
- `cameraId`

### 10.3 后续再考虑公共抽象

待 `PPE` 和 `OCR` 都稳定后，再决定是否抽以下公共层：

- `src/hooks/camera/useManagedCamera.ts`
- `src/hooks/ui/useKeyboardShortcuts.ts`
- `src/lib/camera/captureFrame.ts`
- `src/components/ui/CollapsibleSection.tsx`
- 通用结果保存流水线

---

## 第一阶段建议新建文件清单

- `src/state/ppeDetectionStore.ts`
- `src/hooks/safetyEquipment/usePPELocalState.ts`
- `src/hooks/safetyEquipment/usePPEBinding.ts`
- `src/hooks/safetyEquipment/usePPEScreenController.ts`
- `src/hooks/safetyEquipment/usePPESave.ts`
- `src/hooks/safetyEquipment/usePPEPolling.ts`
- `src/components/safetyEquipment/PPEBindingPanel.tsx`
- `src/components/safetyEquipment/PPEControlPanel.tsx`
- `src/components/safetyEquipment/PPECapturedImagesPanel.tsx`
- `src/components/safetyEquipment/PPEResultsSection.tsx`
- `src/components/safetyEquipment/PPEShortcutHelpModal.tsx`
- `src/components/safetyEquipment/PPECollapsibleSection.tsx`

---

## 第一阶段需要改造的现有文件

- `src/screens/SafetyEquipmentScreen.tsx`
- `src/state/safetyEquipmentStore.ts`
  - 第一阶段可只读不删，逐步迁移
- `src/hooks/safetyEquipment/usePPEDetection.ts`
- `src/hooks/safetyEquipment/usePPECapture.ts`
- `src/hooks/safetyEquipment/usePPEInspection.ts`
- `src/components/safetyEquipment/PPEThresholdSettings.tsx`
- `src/components/safetyEquipment/PPEResultsCard.tsx`

---

## 推荐实施顺序

按风险从低到高建议如下：

1. 新建 `ppeDetectionStore.ts`
2. 新建 `usePPELocalState.ts`
3. 新建 `usePPEBinding.ts`
4. 新建 `usePPEScreenController.ts`
5. 新建 `PPEBindingPanel.tsx`
6. 新建 `PPEControlPanel.tsx`
7. 新建 `PPECapturedImagesPanel.tsx`
8. 新建 `PPEResultsSection.tsx`
9. 改 `SafetyEquipmentScreen.tsx` 接入 controller
10. 解耦 `capture -> inspection`
11. 新建 `usePPESave.ts`
12. 加折叠状态和 UI 统一
13. 再考虑异常提醒和绑定增强

---

## 验证项

第一阶段完成后，至少验证以下内容：

1. `PPE` 页面可以正常打开，无控制台运行时错误
2. 摄像头可以正常开启、关闭、切换
3. 手动抓拍可正常工作
4. 自动抓拍逻辑行为与重构前一致
5. PPE 检测可以正常返回结果
6. 检测结果可以正常保存到结果页
7. 抓拍图区、阈值区、绑定区折叠展开正常
8. 页面刷新后配置类状态能恢复，图片和临时运行态不会错误恢复
9. `SafetyEquipmentScreen.tsx` 代码体积和职责明显下降
10. 新旧模块并存期间不影响现有结果页和看板统计

---

## 最终结论

本次 `PPE` 重构应采用：

- 结构先行
- 新建模块优先
- 稳定优先
- 模式复用优先于代码复用

第一阶段不要以“代码总量减少”为目标，而应以：

- 页面编排清晰
- 依赖关系清晰
- 可回退
- 可验证
- 可继续扩展异常提醒和看板能力

为主要目标。
