# OCR融合模式检测目标标签闪烁问题 - 终极修复

## 问题描述
在OCR融合模式页面（OCRDetectionScreen），检测目标标签出现**严重闪烁不稳定**的现象：
- 标签从 **0个直接跳到7个/8个**
- 运行过程中，绿色标签会**全部消失**，然后又**突然全部出现**
- 刷新后，标签的绿色状态**有时候在，有时候不在**
- 新浏览器（无缓存）比老浏览器（有缓存）更容易出现这个问题

## 根本原因分析

### 问题1：OR模式每帧替换而非累积（已修复）
```typescript
// ❌ 错误：每帧都完全替换
const newDetectedElements = detectedLabels.length > 0
  ? [...new Set(detectedLabels)]
  : [];  // 当前帧没检测到，就清空！
setDetectedElements(newDetectedElements);
```

### 问题2：Zustand Persist 的 Rehydration 竞态条件（核心问题）

#### Zustand Persist 的工作原理
1. **组件首次渲染**：使用默认值 `detectedElements = []`
2. **Rehydration 阶段**：从 localStorage 恢复数据
3. **异步恢复**：可能在任何时候触发状态更新

#### 闪烁的时序
```
时间 0ms:   组件挂载 → detectedElements = [] （默认值）→ 标签全黄
时间 10ms:  实时检测 → detectedElements = ['防伪标签'] → 标签变绿
时间 50ms:  Rehydration → 从 localStorage 恢复旧数据 → detectedElements = [] → 标签又变黄！
时间 100ms: 下一帧检测 → detectedElements = ['防伪标签', '服务标签'] → 标签又变绿
时间 150ms: 某个条件触发 → detectedElements 被清空 → 标签又变黄
```

**结果**：标签不断在 **黄→绿→黄→绿** 之间闪烁！

#### 为什么老浏览器问题较轻？
- 老浏览器的 localStorage 中**可能恰好保存了某些检测状态**
- Rehydration 恢复的数据碰巧包含一些目标
- 减少了从 `[]` 开始的情况，但仍然不稳定

#### 为什么新浏览器问题严重？
- localStorage 为空，总是从 `[]` 恢复
- 每次 Rehydration 都会清空 `detectedElements`

## 终极解决方案

### 核心思路
**`detectedElements` 和其他实时检测状态不应该被持久化！**

这些状态是**临时的、瞬时的**，每次页面加载都应该重新开始：
- `detectedElements`：当前检测到的元素列表
- `elementDetectionStartTime`：检测开始时间
- `workflowState`：工作流状态
- `isWaitingForSpace`：等待确认状态
- `workflowResult`：工作流结果

### 修复1：使用 Zustand Persist 的 `partialize`

在 `ocrDetectionStore.ts` 中，使用 `partialize` 选项**排除**实时检测状态：

```typescript
export const useOCRDetectionStore = create<OCRDetectionState>()(
  persist(
    (set) => ({
      // ... state 定义
    }),
    {
      name: 'ocr-detection-storage',
      // 🔧 排除实时检测状态的持久化，避免闪烁和竞态条件
      partialize: (state) => {
        const {
          detectedElements,        // 排除：实时检测状态，不应持久化
          elementDetectionStartTime, // 排除：实时检测时间，不应持久化
          workflowState,            // 排除：工作流状态，每次都应重新开始
          isWaitingForSpace,        // 排除：等待确认状态，不应持久化
          workflowResult,           // 排除：工作流结果，不应持久化
          ...rest
        } = state;
        return rest; // 只持久化其他状态（如配置、模板等）
      },
      storage: createJSONStorage(() => ({ ... })),
      // ... 其他配置
    }
  )
);
```

### 修复2：OR模式改为累积检测

在 `OCRDetectionScreen.tsx` 中，修复OR模式逻辑：

```typescript
// ✅ 正确：累积检测到的元素
if (yoloDetectionMode === 'or') {
  shouldTriggerCapture = targetDetections.length > 0;
  
  // 累积检测到的元素，而不是每次都替换
  if (detectedLabels.length > 0) {
    const detectedArray = Array.isArray(detectedElementsRef.current) && detectedElementsRef.current.length > 0
      ? detectedElementsRef.current
      : (Array.isArray(detectedElements) && detectedElements.length > 0 ? detectedElements : []);
    const newElements = [...new Set([...detectedArray, ...detectedLabels])];
    setDetectedElements(newElements);
    detectedElementsRef.current = newElements;
  }
  // 注意：如果当前帧没检测到，保持之前的累积结果，不清空
}
```

## 修复后的行为

### ✅ 稳定的检测状态
```
时间 0ms:   页面加载 → detectedElements = [] （默认值，不会从 localStorage 恢复）
时间 10ms:  检测到 ['防伪标签'] → detectedElements = ['防伪标签']
时间 50ms:  没检测到 → detectedElements 保持 ['防伪标签'] （不清空）
时间 100ms: 检测到 ['服务标签'] → detectedElements = ['防伪标签', '服务标签']
时间 150ms: 没检测到 → detectedElements 保持不变
```

**结果**：标签**稳定保持绿色**，不会闪烁！

### ✅ 新浏览器和老浏览器行为一致
- 都从 `detectedElements = []` 开始
- 都累积检测到的元素
- 都不受 localStorage 影响

### ✅ 配置仍然被持久化
以下配置仍然正常持久化：
- `selectedTargets`：选中的检测目标
- `fusionModeEnabled`：融合模式开关
- `keywordConfigs`：关键词配置
- `barcodeConfigs`：二维码配置
- `compressionConfig`：压缩配置
- 等等...

## 清空逻辑

检测状态会在以下情况被清空（这是预期行为）：
1. **页面刷新/重新加载**：每次都从空开始
2. **手动强制复位**：用户点击复位按钮
3. **检测超时**：AND模式下，如果设置了超时时间且超时
4. **检测完成后确认**：用户确认检测结果后继续工作流

## 测试步骤

### 测试1：不再闪烁
1. 打开 OCR融合模式页面
2. 开启实时检测
3. **验证**：
   - 标签从黄色逐渐变绿 ✅
   - 绿色标签保持稳定，不会突然消失 ✅
   - 不会出现从0个跳到7个/8个的情况 ✅

### 测试2：新浏览器和老浏览器一致
1. 清空浏览器缓存（或使用隐私模式）
2. 打开页面并进行检测
3. **验证**：行为与老浏览器完全一致 ✅

### 测试3：刷新后状态正确重置
1. 实时检测中，标签变绿
2. 刷新页面
3. **验证**：
   - 标签重新变为黄色 ✅
   - 可以开始新的检测 ✅
   - 配置项（如选中的目标）仍然保留 ✅

## 相关文件
- `/src/state/ocrDetectionStore.ts` - 添加 partialize 配置
- `/src/screens/OCRDetectionScreen.tsx` - 修复OR模式逻辑

## 技术要点

### Zustand Persist Partialize
`partialize` 选项允许你选择性地持久化状态：
```typescript
partialize: (state) => {
  const { tempField1, tempField2, ...persistentState } = state;
  return persistentState; // 只持久化 persistentState
}
```

### 为什么不用 skipHydration？
`skipHydration` 会跳过整个 store 的 rehydration，我们只想跳过特定字段。

### 为什么不用 useEffect 清空？
在组件中用 `useEffect` 清空会导致额外的渲染，并且仍然存在时序问题。

## 影响范围
- ✅ 完全修复标签闪烁问题
- ✅ 新浏览器和老浏览器行为一致
- ✅ 不影响其他持久化配置
- ✅ 不影响检测功能和准确性
- ✅ 页面加载更快（不需要恢复临时状态）
