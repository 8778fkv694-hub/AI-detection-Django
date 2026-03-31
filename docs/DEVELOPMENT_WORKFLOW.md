# 开发工作流程

## 🚀 开发前准备

### 1. 环境检查
```bash
# 检查Node.js版本
node --version  # 应该 >= 16.0.0

# 检查依赖
npm list --depth=0

# 运行代码质量检查
node scripts/pre-commit-check.js
```

### 2. 理解现有代码结构
- 查看 `DEVELOPMENT_GUIDELINES.md` 了解规范
- 理解相关功能的状态管理结构
- 识别可能受影响的其他功能

## 🔧 开发过程

### 1. 功能修改流程

#### 修改前
```bash
# 1. 创建功能分支
git checkout -b feature/your-feature-name

# 2. 备份当前状态
git stash push -m "backup before feature development"

# 3. 运行现有测试
npm test  # 如果有测试的话
```

#### 修改中
```typescript
// 1. 遵循状态管理规范
import { normalizeImageData, validateInspectionResult } from '@/utils/stateManagement';

// 2. 使用标准数据格式
const imageData = normalizeImageData(rawImageData);

// 3. 添加适当的错误处理
try {
  const result = await someAsyncOperation();
  // 处理成功结果
} catch (error) {
  console.error('操作失败:', error);
  // 用户友好的错误提示
}

// 4. 使用测试工具验证
import { quickValidate } from '@/utils/testingHelpers';
quickValidate.image(imageData);
```

#### 修改后
```bash
# 1. 运行代码质量检查
node scripts/pre-commit-check.js

# 2. 手动测试功能
# - 测试修改的功能
# - 测试相关功能
# - 检查控制台错误

# 3. 提交代码
git add .
git commit -m "feat: 描述你的修改"
```

### 2. 状态管理修改流程

#### 添加新状态
```typescript
// 1. 在对应的Zustand store中添加
interface YourStoreState {
  // 现有状态...
  newState: string;
  setNewState: (value: string) => void;
}

// 2. 实现action
setNewState: (value) => set({ newState: value }),

// 3. 在组件中使用
const { newState, setNewState } = useYourStore();
```

#### 修改现有状态
```typescript
// 1. 检查是否有其他组件依赖
// 2. 更新类型定义
// 3. 更新默认值
// 4. 测试所有相关功能
```

### 3. 图片处理修改流程

#### 修改图片处理逻辑
```typescript
// 1. 使用标准化函数
import { normalizeImageData } from '@/utils/stateManagement';

// 2. 确保数据格式一致
const processedImage = normalizeImageData(rawImage);

// 3. 添加错误处理
const handleImageError = (error: Error) => {
  console.error('图片处理失败:', error);
  // 显示用户友好的错误信息
};

// 4. 测试图片加载
import { ImageDataTester } from '@/utils/testingHelpers';
await ImageDataTester.testImageLoad(processedImage);
```

### 4. 配置修改流程

#### 添加新配置
```typescript
// 1. 在配置接口中添加
interface YourConfig {
  // 现有配置...
  newConfig: number;
}

// 2. 添加默认值
const defaultConfig: YourConfig = {
  // 现有默认值...
  newConfig: 0.5,
};

// 3. 添加验证
const validateConfig = (config: YourConfig) => {
  // 验证逻辑
};

// 4. 在UI中添加设置选项
```

## 🧪 测试流程

### 1. 功能测试清单

#### 基础功能测试
- [ ] 状态更新是否正确
- [ ] 图片显示是否正常
- [ ] 检测结果是否正确保存
- [ ] 配置修改是否生效
- [ ] 错误处理是否完善

#### 跨功能测试
- [ ] 修改OCR功能后，测试PPE检测功能
- [ ] 修改PPE功能后，测试OCR检测功能
- [ ] 修改全局状态后，测试所有相关功能

#### 用户体验测试
- [ ] 界面响应是否流畅
- [ ] 错误提示是否友好
- [ ] 加载状态是否清晰
- [ ] 数据同步是否及时

### 2. 自动化测试

#### 使用测试工具
```typescript
import { createDefaultTestSuite } from '@/utils/testingHelpers';

// 创建测试套件
const testSuite = createDefaultTestSuite();

// 添加自定义测试
testSuite.addTest(
  '自定义测试',
  () => {
    // 测试逻辑
    return true;
  },
  '测试描述'
);

// 运行测试
const results = await testSuite.runAllTests();
console.log(`测试结果: ${results.passed} 通过, ${results.failed} 失败`);
```

#### 状态同步测试
```typescript
import { StateManagementTester } from '@/utils/testingHelpers';

// 测试状态同步
const isSynced = StateManagementTester.testStateSync(
  localResults,
  globalResults,
  '检测结果'
);
```

## 🚨 问题排查流程

### 1. 状态管理问题
```typescript
// 1. 检查状态同步
import { debugState } from '@/utils/stateManagement';
debugState('localResults', localResults);
debugState('globalResults', globalResults);

// 2. 检查状态更新
console.log('状态更新前:', previousState);
console.log('状态更新后:', currentState);

// 3. 检查依赖关系
// 确保useEffect依赖数组正确
useEffect(() => {
  // 逻辑
}, [dependency1, dependency2]); // 确保依赖完整
```

### 2. 图片显示问题
```typescript
// 1. 检查图片数据格式
import { ImageDataTester } from '@/utils/testingHelpers';
const isValid = ImageDataTester.testImageDataFormat(imageData);

// 2. 检查图片加载
const canLoad = await ImageDataTester.testImageLoad(imageData);

// 3. 添加错误处理
<img 
  src={imageData}
  onError={(e) => {
    console.error('图片加载失败:', e);
    e.currentTarget.style.display = 'none';
  }}
/>
```

### 3. 配置问题
```typescript
// 1. 检查配置值
import { ConfigTester } from '@/utils/testingHelpers';
const isValid = ConfigTester.testThresholdConfig(thresholds);

// 2. 检查配置更新
console.log('配置更新前:', oldConfig);
console.log('配置更新后:', newConfig);

// 3. 检查配置使用
// 确保使用正确的配置值
const personDetections = detections.filter(d => 
  d.class === 'person' && d.confidence >= ppeThresholds.person // 使用正确的阈值
);
```

## 📋 发布前检查清单

### 代码质量
- [ ] 运行代码质量检查脚本
- [ ] 检查控制台错误
- [ ] 验证所有功能正常工作
- [ ] 检查性能表现

### 用户体验
- [ ] 界面响应流畅
- [ ] 错误提示友好
- [ ] 加载状态清晰
- [ ] 数据同步及时

### 兼容性
- [ ] 测试相关功能
- [ ] 验证状态管理
- [ ] 检查数据格式
- [ ] 确认配置正确

### 文档更新
- [ ] 更新API文档
- [ ] 更新用户指南
- [ ] 更新开发文档
- [ ] 记录变更日志

## 🔄 持续改进

### 1. 定期检查
- 每周运行代码质量检查
- 每月回顾开发流程
- 每季度更新最佳实践

### 2. 团队协作
- 代码审查时检查规范遵循
- 分享问题和解决方案
- 持续改进开发工具

### 3. 工具优化
- 根据使用反馈改进工具
- 添加新的检查项目
- 优化测试覆盖率
