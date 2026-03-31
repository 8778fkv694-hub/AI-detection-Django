# OCRDetectionScreen 二次重构计划

## 当前状态分析

### 文件概况
- **文件路径**: `src/screens/OCRDetectionScreen.tsx`
- **起始行数**: 2522 行（重构前2368行）
- **当前行数**: 1928 行（已减少 440 行，-18.6%）
- **目标**: 继续模块化，将文件缩减至 500 行以下

### 已提取的 Hooks（12个）
```
src/hooks/ocr/
├── useImagePreprocessing.ts   # 图像预处理
├── useFusionAI.ts             # 融合模式AI分析
├── useOCRProcessing.ts        # OCR处理核心逻辑
├── useOCRCamera.ts            # 摄像头管理
├── useKeyboardShortcuts.ts    # 键盘快捷键
├── useOCRHistory.ts           # 历史记录管理
├── useOCRWorkflow.ts          # 工作流管理
├── useOCRTemplates.ts         # 模板管理
├── useDetectionSave.ts        # 检测结果保存
├── useModelConfig.ts          # ✅ Phase 1 新增 - 模型配置管理
├── useFullscreen.ts           # ✅ Phase 1 新增 - 全屏切换
├── useRealtimeDetection.ts    # ✅ Phase 2 新增 - 实时检测状态管理
├── useROIProcessor.ts         # ✅ Phase 2 新增 - ROI处理（389行）
└── useDetectionMode.ts        # ✅ Phase 2 新增 - OR/AND检测模式（277行）
```

### 已提取的组件（23个）
```
src/components/ocr/
├── QRCodeDetectionResult.tsx
├── FinalResultBadge.tsx
├── DetectionProgressIndicator.tsx
├── ShortcutHelpModal.tsx
├── TemplateList.tsx
├── TemplateSaveInput.tsx
├── ImageInfoCard.tsx
├── TargetSelectionPanel.tsx
├── OCRResultDisplay.tsx
├── CaptureSettingsPanel.tsx
├── SmartPreprocessingPanel.tsx
├── NonFusionModeStatusCard.tsx
├── BarcodeSettingsPanel.tsx
├── FusionModeResultCard.tsx
├── FusionModeSettingsPanel.tsx
├── WorkflowStatusCard.tsx
├── RealtimeDetectionPanel.tsx
├── CompressionSettingsPanel.tsx
├── KeywordSettingsPanel.tsx
├── ROIYoloSettingsPanel.tsx
├── TestHistoryCard.tsx
└── VideoDebugInfo.tsx
```

### 剩余复杂度分析（Phase 2 完成后）

| 问题区域 | 行数 | 说明 |
|---------|------|------|
| `performRealtimeDetection` | ~661行 | ✅已提取ROI处理和检测模式逻辑，剩余延时捕获、图像拼接等 |
| 状态变量 | ~70个 | 仍有大量useState和useRef |
| useEffect hooks | ~12个 | 状态同步、副作用处理 |
| 工具函数 | ~100行 | stitchROIs包装、canvas操作等 |
| JSX渲染 | ~480行 | 已较好模块化，但仍可优化 |

---

## 重构计划（按风险等级排序）

### 🟢 Phase 1: 低风险重构 ✅ 已完成

#### 1.1 提取模型配置 Hook ✅
**文件**: `src/hooks/ocr/useModelConfig.ts`
**状态**: 已完成

#### 1.2 提取工具函数到 lib 模块 ✅
**文件**: `src/lib/ocr/detectionDrawer.ts`, `src/lib/ocr/ocrUtils.ts`
**状态**: 已完成

#### 1.3 提取全屏切换 Hook ✅
**文件**: `src/hooks/ocr/useFullscreen.ts`
**状态**: 已完成

---

### 🟡 Phase 2: 中风险重构（预计减少 400 行）

#### 2.1 提取实时检测 Hook（核心重构）
**文件**: `src/hooks/ocr/useRealtimeDetection.ts`
**提取内容**:
- `performRealtimeDetection` 回调函数
- 检测队列管理（detectionQueueRef）
- 检测状态管理（isDetectingRef）
- 历史检测记录管理（historyDetectionsRef）
- 最佳ROI累积管理（bestROIsRef）
- 防抖机制（debounceStartTimeRef）

**风险说明**:
- 函数内部有大量状态依赖
- 需要仔细处理闭包和ref同步
- 建议分步进行：先提取框架，再逐步迁移逻辑

**预计减少**: ~300 行

#### 2.2 提取 ROI 处理 Hook
**文件**: `src/hooks/ocr/useROIProcessor.ts`
**提取内容**:
- ROI 累积保存逻辑
- ROI 清晰度计算逻辑
- ROI 综合评分逻辑（面积+清晰度权重）
- 延时期间 ROI 选择逻辑

**依赖**: 需要与 useRealtimeDetection 协同

**预计减少**: ~100 行

---

### 🔴 Phase 3: 高风险重构（预计减少 300 行）

#### 3.1 重构检测模式状态机
**说明**: 将 OR/AND 模式逻辑重构为状态机模式
**涉及内容**:
- `yoloDetectionMode` 逻辑分离
- 超时检测逻辑
- 元素累积逻辑
- 触发条件判断

**风险说明**:
- 核心业务逻辑，影响检测行为
- 需要充分测试 OR 和 AND 模式
- 建议添加单元测试后再进行

#### 3.2 合并 Refs 到自定义 Hook
**说明**: 创建 `useDetectionRefs` 统一管理所有 refs
**涉及 refs**:
- `detectedElementsRef`
- `elementDetectionStartTimeRef`
- `isPausedRef`
- `isDetectingRef`
- `detectionQueueRef`
- `historyDetectionsRef`
- `bestROIsRef`
- `debounceStartTimeRef`

**风险说明**:
- Refs 同步逻辑复杂
- 需要确保所有引用点更新正确

#### 3.3 迁移更多状态到 Zustand Store
**候选状态**:
- `matchStatus`
- `isDetecting`
- `videoInfo`
- `debounceSeconds`
- `isInPostDetectionDelay`

**风险说明**:
- 需要更新所有组件的状态访问方式
- 可能影响渲染性能

---

## 执行顺序建议

```
Week 1: Phase 1（低风险）
├── 1.1 useModelConfig.ts
├── 1.2 detectionUtils.ts
└── 1.3 useFullscreen.ts

Week 2: Phase 2（中风险）
├── 2.1 useRealtimeDetection.ts（框架）
└── 2.2 useROIProcessor.ts

Week 3: Phase 2 继续 + Phase 3 准备
├── 2.1 useRealtimeDetection.ts（完善）
└── 添加单元测试

Week 4: Phase 3（高风险）
├── 3.1 检测模式状态机
├── 3.2 useDetectionRefs.ts
└── 3.3 状态迁移到 Store
```

---

## 预期成果

| 阶段 | 减少行数 | 完成后主文件行数 |
|------|---------|-----------------|
| 当前 | - | 2522 |
| Phase 1 | ~200 | ~2320 |
| Phase 2 | ~400 | ~1920 |
| Phase 3 | ~300 | ~1620 |
| 最终目标 | - | < 500 |

**注意**: 要达到 500 行以下，还需要：
- 进一步拆分 JSX 结构（可提取更多小组件）
- 将 useEffect 逻辑合并到对应 hooks 中
- 考虑将部分状态管理移至 Context 或新的 Zustand slice

---

## 测试策略

### 每个阶段完成后必须验证的功能点：

1. **摄像头功能**
   - [ ] 摄像头开关正常
   - [ ] 设备切换正常
   - [ ] 流媒体播放正常

2. **实时检测**
   - [ ] OR 模式检测正常
   - [ ] AND 模式检测正常
   - [ ] 超时重置正常
   - [ ] 防抖机制正常

3. **ROI 功能**
   - [ ] ROI 截取正常
   - [ ] 清晰度评分正常
   - [ ] ROI 拼接正常

4. **工作流**
   - [ ] 自动抓拍正常
   - [ ] 手动抓拍正常
   - [ ] 合格/不合格判定正常
   - [ ] 结果保存正常

5. **融合模式**
   - [ ] OCR 识别正常
   - [ ] AI 分析正常
   - [ ] 二维码检测正常

---

## 注意事项

1. **保持向后兼容**: 每次重构后确保现有功能不受影响
2. **Git 分支策略**: 每个 Phase 使用独立分支，完成测试后再合并
3. **代码审查**: 高风险重构需要代码审查
4. **回滚计划**: 保持可快速回滚的能力

---

## 参考文件

- 已完成重构: `SafetyEquipmentScreen.tsx` (2063行 → 318行)
- 目录结构参考: `src/hooks/safetyEquipment/`
- 组件结构参考: `src/components/safetyEquipment/`
