# SafetyEquipmentScreen 重构计划

## 目标
将 `src/screens/SafetyEquipmentScreen.tsx` (2063行) 按照 LiveInspectionScreen 的成功经验进行重构，目标减少 70%+ 代码量。

## 当前结构分析

### 代码统计
- 总行数: 2063行
- useState: ~20个
- useRef: 5个 (videoRef, detectionCanvasRef, streamPlayerRef, hlsPlayerRef, isDetectingRef)
- useCallback: ~15个
- useEffect: ~10个
- JSX: ~700行

### 主要功能模块
1. 摄像头控制与视频显示 (物理摄像头 + 流媒体)
2. PPE检测逻辑 (人员、口罩、洁净帽)
3. 自动抓拍与手动抓拍
4. 检测结果管理与展示
5. PPE阈值设置面板
6. 临时文件夹操作
7. 键盘快捷键

### 与 LiveInspectionScreen 的相似之处
- 摄像头控制逻辑 (可复用 `useLiveCamera` 模式)
- 键盘快捷键 (可复用 `useLiveKeyboardShortcuts` 模式)
- 检测结果展示 (可复用 `LiveDetectionResultsCard` 模式)
- 抓拍图片网格 (可复用 `LiveCapturedImagesGrid` 模式)

### PPE 特有功能
- PPE阈值设置 (cleanroom_cap, mask, person)
- PPE合规率计算逻辑
- 人员检测触发自动抓拍
- 间隔内最优检测保留

---

## 重构方案

### 第一阶段：创建 Hooks（核心逻辑抽取）

#### 1. `src/hooks/safetyEquipment/useSafetyCamera.ts` (~200行)
职责：摄像头控制与视频流管理 (复用 useLiveCamera 模式)
```typescript
export interface UseSafetyCameraOptions {
  windowId: string;
  videoRef: RefObject<HTMLVideoElement>;
  selectedDeviceId: string | undefined;
  setSelectedDeviceId: (value: string) => void;
  videoDevices: CameraDevice[];
  setVideoDevices: (devices: CameraDevice[]) => void;
}

export interface UseSafetyCameraResult {
  isCameraOn: boolean;
  toggleCamera: () => Promise<void>;
  switchCamera: (deviceId: string) => Promise<void>;
  startCamera: (deviceId?: string) => Promise<void>;
  streamPlayerRef: RefObject<StreamPlayer | null>;
  hlsPlayerRef: RefObject<HLSPlayer | null>;
}
```

#### 2. `src/hooks/safetyEquipment/usePPEDetection.ts` (~350行)
职责：PPE检测核心逻辑
```typescript
export interface UsePPEDetectionOptions {
  videoRef: RefObject<HTMLVideoElement>;
  detectionCanvasRef: RefObject<HTMLCanvasElement>;
  isPpeActive: boolean;
  captureThreshold: number;
  ppeThresholds: PPEThresholds;
  showDetections: boolean;
  autoCapture: boolean;
  captureInterval: number;
  // 状态 setters...
}

export interface UsePPEDetectionResult {
  performDetection: (imageData: string) => Promise<YoloDetection[]>;
  performCaptureDetection: (imageData: string) => Promise<YoloDetection[]>;
  runPpeDetection: () => Promise<void>;
  drawDetections: (detections: YoloDetection[], canvas: HTMLCanvasElement) => void;
  detectionStats: DetectionStats;
}
```

#### 3. `src/hooks/safetyEquipment/usePPECapture.ts` (~200行)
职责：抓拍逻辑与自动检测触发
```typescript
export interface UsePPECaptureOptions {
  videoRef: RefObject<HTMLVideoElement>;
  isCameraOn: boolean;
  capturedImages: string[];
  setCapturedImages: (images: string[]) => void;
  triggerAutoInspection: (images?: string[]) => Promise<void>;
}

export interface UsePPECaptureResult {
  handleAutoCapture: (detections: YoloDetection[], imageData?: string) => void;
  handleManualCapture: () => void;
  captureCurrentFrame: () => Promise<string | null>;
  localCapturedImages: string[];
  setLocalCapturedImages: (images: string[]) => void;
}
```

#### 4. `src/hooks/safetyEquipment/usePPEInspection.ts` (~250行)
职责：PPE检测结果分析与保存
```typescript
export interface UsePPEInspectionOptions {
  capturedImages: string[];
  performDetection: (imageData: string) => Promise<YoloDetection[]>;
  addAppResult: (result: InspectionResult) => void;
  setResults: (results: InspectionResult[]) => void;
}

export interface UsePPEInspectionResult {
  triggerAutoInspection: (images?: string[]) => Promise<void>;
  isDetecting: boolean;
  lastDetectionTime: number;
}
```

#### 5. `src/hooks/safetyEquipment/usePPEKeyboardShortcuts.ts` (~80行)
职责：键盘快捷键 (复用 useLiveKeyboardShortcuts 模式)
```typescript
export interface UsePPEKeyboardShortcutsOptions {
  callbacks: {
    onManualCapture: () => void;
    onSafetyInspection: () => void;
    onToggleMonitoring: () => void;
    onLoadYoloModel: () => void;
  };
  isCameraOn: boolean;
  hasImages: boolean;
}
```

#### 6. `src/hooks/safetyEquipment/useTempFolder.ts` (~100行)
职责：临时文件夹操作
```typescript
export interface UseTempFolderOptions {
  localCapturedImages: string[];
  tempFolderPath: string;
}

export interface UseTempFolderResult {
  handleSaveToTempFolder: () => Promise<void>;
  handleOpenTempFolder: () => Promise<void>;
  handleClearTempFolder: () => Promise<void>;
}
```

---

### 第二阶段：创建组件（UI 抽取）

#### 1. `src/components/safetyEquipment/SafetyCameraPanel.tsx` (~180行)
职责：摄像头控制与视频显示区域
```
包含:
├── 视频显示区域 (video + canvas)
├── 摄像头选择器 (Select)
├── 开启/关闭摄像头按钮
├── 开始/停止监控按钮
├── 全屏按钮
├── 监控状态指示器
└── 检测统计显示
```

#### 2. `src/components/safetyEquipment/PPEThresholdSettings.tsx` (~200行)
职责：PPE阈值设置面板 (可折叠)
```
包含:
├── 洁净帽检测阈值
├── 口罩检测阈值
├── 人员检测阈值
├── 最优保留间隔设置
├── 自动上传数量设置
└── 重置为默认值按钮
```

#### 3. `src/components/safetyEquipment/SafetyCapturedImages.tsx` (~120行)
职责：抓拍图片网格与管理
```
包含:
├── 图片网格显示
├── 清空抓拍图片按钮
├── 保存到临时文件夹按钮
├── 打开临时文件夹按钮
└── 清空临时文件夹按钮
```

#### 4. `src/components/safetyEquipment/PPEResultsCard.tsx` (~150行)
职责：PPE检测结果展示
```
包含:
├── 结果列表 (图片 + 合格状态 + 原因)
├── 查看所有结果按钮
├── 清空所有结果按钮
└── 键盘快捷键提示
```

#### 5. `src/components/safetyEquipment/PPEModelInfo.tsx` (~80行)
职责：模型信息与切换
```
包含:
├── 当前模型显示
├── 刷新模型按钮
└── ModelSelector 组件
```

---

### 第三阶段：重构主页面

#### 重构后的 `SafetyEquipmentScreen.tsx` 结构 (~350行)
```typescript
const SafetyEquipmentScreen: React.FC = () => {
  // 1. Zustand Store 状态
  const { ... } = useSafetyEquipmentStore();
  const { ... } = useAppStore();

  // 2. 窗口标识
  const [windowId] = useState<string>(() => ...);

  // 3. 自定义 Hooks
  const camera = useSafetyCamera({ ... });
  const detection = usePPEDetection({ ... });
  const capture = usePPECapture({ ... });
  const inspection = usePPEInspection({ ... });
  const tempFolder = useTempFolder({ ... });

  // 4. 键盘快捷键
  usePPEKeyboardShortcuts({ ... });

  // 5. 模型相关
  const { modelName, isLoading, refresh } = useCurrentModel();

  // 6. 简化的 JSX
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
      {/* 左侧：实时监控 */}
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <PPEModelInfo />
          </CardHeader>
          <CardContent>
            <SafetyCameraPanel />
            <PPEThresholdSettings />
          </CardContent>
        </Card>
        <SafetyCapturedImages />
      </div>

      {/* 右侧：检测结果 */}
      <PPEResultsCard />

      {/* 对话框 */}
      <ModelUnavailableDialog />
    </div>
  );
};
```

---

## 文件结构

```
src/
├── screens/
│   └── SafetyEquipmentScreen.tsx          # 重构后 ~350行 (原2063行)
│
├── components/
│   └── safetyEquipment/                   # 新增目录
│       ├── index.ts                       # 导出文件
│       ├── SafetyCameraPanel.tsx          # ~180行
│       ├── PPEThresholdSettings.tsx       # ~200行
│       ├── SafetyCapturedImages.tsx       # ~120行
│       ├── PPEResultsCard.tsx             # ~150行
│       └── PPEModelInfo.tsx               # ~80行
│
└── hooks/
    └── safetyEquipment/                   # 新增目录
        ├── index.ts                       # 导出文件
        ├── useSafetyCamera.ts             # ~200行
        ├── usePPEDetection.ts             # ~350行
        ├── usePPECapture.ts               # ~200行
        ├── usePPEInspection.ts            # ~250行
        ├── usePPEKeyboardShortcuts.ts     # ~80行
        └── useTempFolder.ts               # ~100行
```

---

## 预期效果

| 指标 | 重构前 | 重构后 |
|------|--------|--------|
| 主页面行数 | 2063 | ~350 |
| Hooks 数量 | 0 | 6 |
| 组件数量 | 0 | 5 |
| 代码减少率 | - | 83% (主页面) |

---

## 执行步骤

### 步骤 1：创建目录结构
```bash
mkdir -p src/hooks/safetyEquipment
mkdir -p src/components/safetyEquipment
```

### 步骤 2：按顺序创建 Hooks (建议顺序)
1. `useTempFolder.ts` - 无依赖，最简单
2. `usePPEKeyboardShortcuts.ts` - 无依赖
3. `useSafetyCamera.ts` - 基础功能
4. `usePPEDetection.ts` - 核心检测逻辑
5. `usePPECapture.ts` - 依赖 detection
6. `usePPEInspection.ts` - 依赖 detection, capture

### 步骤 3：按顺序创建组件 (建议顺序)
1. `PPEModelInfo.tsx` - 最简单
2. `PPEThresholdSettings.tsx` - 独立设置组件
3. `SafetyCapturedImages.tsx` - 图片显示
4. `PPEResultsCard.tsx` - 结果展示
5. `SafetyCameraPanel.tsx` - 最复杂

### 步骤 4：创建导出文件
- `src/hooks/safetyEquipment/index.ts`
- `src/components/safetyEquipment/index.ts`

### 步骤 5：重构主页面
- 逐步替换主页面中的内联逻辑
- 使用新的 hooks 和组件

### 步骤 6：验证
```bash
npx tsc --noEmit
```

---

## 可复用的模式参考

### 从 LiveInspectionScreen 可复用的模式：
1. **摄像头控制模式** - `useLiveCamera.ts` 结构
2. **键盘快捷键模式** - `useLiveKeyboardShortcuts.ts` 结构
3. **抓拍图片网格** - `LiveCapturedImagesGrid.tsx` 结构
4. **检测结果卡片** - `LiveDetectionResultsCard.tsx` 结构

### 从 OCRDetectionScreen 可复用的模式：
1. **阈值设置面板** - 可折叠设置区域
2. **实时检测循环** - useEffect + setInterval 模式

---

## 关键差异点 (与 LiveInspectionScreen 对比)

| 功能点 | LiveInspection | SafetyEquipment |
|--------|----------------|-----------------|
| 检测类型 | YOLO多目标 | PPE专项(人/帽/罩) |
| 触发方式 | 任意目标OR/AND | 人员检测触发 |
| 阈值设置 | 统一阈值 | 分项阈值 |
| 抓拍策略 | 即时抓拍 | 间隔内最优保留 |
| AI分析 | 在线+本地 | 后端PPE检测 |
| 结果类型 | 质量评分 | 合规率 |

---

## 注意事项

1. **PPE阈值状态** - 使用 zustand store 管理，注意与 LiveInspection 的 detectionConfidence 不同
2. **间隔内最优检测** - bestDetectionInInterval 逻辑需要保留
3. **人员检测触发** - 只有检测到 person 且超过阈值才触发抓拍
4. **合规率计算** - 需要口罩和洁净帽都穿戴才是100%

---

## 类型定义建议

```typescript
// src/types/safetyEquipment.ts

export interface PPEThresholds {
  cleanroom_cap: number;
  mask: number;
  person: number;
  [key: string]: number;
}

export interface DetectionStats {
  totalDetections: number;
  personDetections: number;
  equipmentDetections: number;
}

export interface BestDetection {
  detections: YoloDetection[];
  imageData: string;
  confidence: number;
  timestamp: number;
}
```

---

## 时间估计参考

基于 LiveInspectionScreen 重构经验:
- Hooks 创建: 6个 × 平均30分钟 = 3小时
- 组件创建: 5个 × 平均25分钟 = 2小时
- 主页面重构: 1小时
- 测试验证: 1小时
- **总计: 约7小时**

---

*生成时间: 2025-12-30*
*参考: LiveInspectionScreen 重构经验*
