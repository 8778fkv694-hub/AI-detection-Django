# 开发规范和最佳实践

## 🎯 状态管理规范

### 1.1 状态管理原则
- **单一数据源**：每个功能模块只使用一个主要的状态管理系统
- **明确职责**：本地状态 vs 全局状态 vs 持久化状态
- **避免重复**：不要同时维护多个相同用途的状态

### 1.2 状态管理分层
```
┌─────────────────────────────────────┐
│  UI状态 (useState)                  │  ← 临时UI状态，不持久化
│  - 模态框显示/隐藏                   │
│  - 表单输入值                       │
│  - 加载状态                         │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│  功能状态 (Zustand Store)           │  ← 功能相关状态，持久化
│  - 检测配置                         │
│  - 用户偏好设置                     │
│  - 检测历史                         │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│  全局状态 (useAppStore)             │  ← 跨模块共享状态
│  - 检测结果                         │
│  - 标准配置                         │
│  - 同步状态                         │
└─────────────────────────────────────┘
```

### 1.3 状态命名规范
```typescript
// ✅ 好的命名
const [isModalOpen, setIsModalOpen] = useState(false);        // UI状态
const { capturedImages, setCapturedImages } = useSafetyEquipmentStore(); // 功能状态
const { results, addResult } = useAppStore();                // 全局状态

// ❌ 避免的命名
const [data, setData] = useState([]);                        // 太模糊
const [temp, setTemp] = useState(null);                      // 无意义
```

## 🔧 数据格式规范

### 2.1 图片数据格式
```typescript
// ✅ 统一使用完整data URL格式
const imageData = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ...";

// ❌ 避免纯base64格式
const imageData = "/9j/4AAQSkZJRgABAQAAAQ...";

// 图片处理工具函数
export const normalizeImageData = (imageData: string): string => {
  if (!imageData) return 'data:image/jpeg;base64,';
  if (imageData.startsWith('data:image/')) return imageData;
  return `data:image/jpeg;base64,${imageData}`;
};
```

### 2.2 检测结果格式
```typescript
// ✅ 标准检测结果格式
interface InspectionResult {
  id: string;
  timestamp: string;
  image: string;                    // 必须是完整data URL
  standardId: string | null;
  overallQuality: '合格' | '存疑' | '需复检';
  score: number;
  reason: string;
  reasonKeywords: string;
  defects: any[];
  detectionType: string;
  ocrResult?: any;                  // 可选OCR结果
  llmResult?: any;                  // 可选LLM结果
}
```

## ⚙️ 配置管理规范

### 3.1 阈值配置
```typescript
// ✅ 集中管理所有阈值
interface PPEThresholds {
  person: number;                   // 人员检测阈值
  cleanroom_cap: number;           // 洁净帽检测阈值
  mask: number;                    // 口罩检测阈值
  cleanroom_suit: number;          // 洁净服检测阈值
  // ... 其他阈值
}

// ❌ 避免分散的阈值定义
const captureThreshold = 0.5;      // 不要单独定义
const personThreshold = 0.6;       // 不要重复定义
```

### 3.2 配置验证
```typescript
// ✅ 配置验证函数
export const validateThresholds = (thresholds: PPEThresholds): boolean => {
  return Object.values(thresholds).every(value => 
    typeof value === 'number' && value >= 0 && value <= 1
  );
};
```

## 🔄 异步操作规范

### 4.1 状态更新模式
```typescript
// ✅ 正确的状态更新模式
const handleCapture = useCallback(async () => {
  try {
    // 1. 立即更新UI状态
    setLocalCapturedImages([newImage]);
    
    // 2. 更新持久化状态
    setCapturedImages([newImage]);
    
    // 3. 触发后续操作
    await triggerDetection([newImage]);
    
    // 4. 延迟清理（让用户看到结果）
    setTimeout(() => {
      setCapturedImages([]);
      setLocalCapturedImages([]);
    }, 3000);
  } catch (error) {
    console.error('抓拍失败:', error);
  }
}, []);
```

### 4.2 错误处理
```typescript
// ✅ 完整的错误处理
const saveResult = async (result: InspectionResult) => {
  try {
    // 数据验证
    if (!result.image || !result.id) {
      throw new Error('检测结果数据不完整');
    }
    
    // 格式标准化
    const normalizedResult = {
      ...result,
      image: normalizeImageData(result.image)
    };
    
    // 保存操作
    await addAppResult(normalizedResult);
    
    console.log('✅ 结果保存成功');
  } catch (error) {
    console.error('❌ 结果保存失败:', error);
    // 用户友好的错误提示
    toast.error('保存失败，请重试');
  }
};
```

## 🧪 测试和验证

### 5.1 功能测试清单
- [ ] 状态更新是否正确
- [ ] 图片显示是否正常
- [ ] 检测结果是否正确保存
- [ ] 配置修改是否生效
- [ ] 错误处理是否完善

### 5.2 跨功能测试
- [ ] 修改OCR功能后，测试PPE检测功能
- [ ] 修改PPE功能后，测试OCR检测功能
- [ ] 修改全局状态后，测试所有相关功能

## 📝 开发检查清单

### 修改前
- [ ] 理解当前功能的状态管理结构
- [ ] 识别可能受影响的其他功能
- [ ] 备份当前工作状态

### 修改中
- [ ] 遵循状态管理规范
- [ ] 使用标准数据格式
- [ ] 添加适当的错误处理
- [ ] 保持代码一致性

### 修改后
- [ ] 测试修改的功能
- [ ] 测试相关功能
- [ ] 验证数据格式正确性
- [ ] 检查控制台错误
- [ ] 确认用户体验正常
