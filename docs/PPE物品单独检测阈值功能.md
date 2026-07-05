# PPE物品单独检测阈值功能

## 功能描述
为每个PPE物品（个人防护装备）单独设置检测阈值，实现更精确的检测控制。

## 实现的功能

### 1. 单独阈值设置
- **洁净帽检测阈值**：可设置50%-95%的检测阈值
- **口罩检测阈值**：可设置50%-95%的检测阈值  
- **蓝色洁净服检测阈值**：可设置50%-95%的检测阈值
- **人员检测阈值**：可设置50%-95%的检测阈值

### 2. 智能检测逻辑
- **最低阈值检测**：使用所有物品中最低的阈值进行后端检测
- **前端过滤**：根据每个物品的单独阈值进行精确过滤
- **动态调整**：实时调整阈值，立即生效

### 3. 用户界面优化
- **清晰标识**：每个PPE物品都有独立的阈值设置
- **范围选择**：提供50%-95%的阈值选择范围
- **重置功能**：一键重置所有阈值为默认值（80%）
- **实时反馈**：阈值变化立即反映在检测结果中

## 技术实现

### 状态管理
```typescript
const [ppeThresholds, setPpeThresholds] = useState({
  cleanroom_cap: 0.8,    // 洁净帽检测阈值
  mask: 0.8,            // 口罩检测阈值
  cleanroom_suit: 0.8,  // 蓝色洁净服检测阈值
  person: 0.8,          // 人员检测阈值
});
```

### 检测逻辑优化
```typescript
const performDetection = useCallback(async (imageData: string): Promise<YoloDetection[]> => {
  // 使用最低的阈值进行检测，然后在前端进行过滤
  const minThreshold = Math.min(...Object.values(ppeThresholds));
  const backendDetections = await yoloDetectBackend(imageData, minThreshold);
  
  // 根据类别使用对应的阈值进行过滤
  const filteredDetections = detections.filter(detection => {
    if (!relevantClasses.includes(detection.class)) return false;
    
    // 根据类别使用对应的阈值
    const threshold = ppeThresholds[detection.class as keyof typeof ppeThresholds] || 0.8;
    return detection.confidence >= threshold;
  });

  return filteredDetections;
}, [ppeThresholds]);
```

### UI组件
```typescript
{/* 洁净帽检测阈值 */}
<div className="flex items-center justify-between">
  <Label className="text-sm">洁净帽检测阈值</Label>
  <Select 
    value={ppeThresholds.cleanroom_cap.toString()} 
    onValueChange={(value) => setPpeThresholds(prev => ({
      ...prev,
      cleanroom_cap: parseFloat(value)
    }))}
  >
    <SelectTrigger className="w-24">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="0.5">50%</SelectItem>
      <SelectItem value="0.6">60%</SelectItem>
      <SelectItem value="0.7">70%</SelectItem>
      <SelectItem value="0.8">80%</SelectItem>
      <SelectItem value="0.85">85%</SelectItem>
      <SelectItem value="0.9">90%</SelectItem>
      <SelectItem value="0.95">95%</SelectItem>
    </SelectContent>
  </Select>
</div>
```

## 使用场景

### 1. 不同物品的检测难度
- **口罩**：可能需要较低阈值（如70%），因为口罩较小且易被遮挡
- **洁净帽**：可能需要中等阈值（如80%），因为帽子相对明显
- **蓝色洁净服**：可能需要较高阈值（如85%），因为服装较大且特征明显
- **人员**：可能需要中等阈值（如80%），因为人员检测相对稳定

### 2. 环境因素调整
- **光线条件**：光线不好时可以降低阈值
- **摄像头角度**：角度不佳时可以调整相应物品的阈值
- **检测距离**：距离较远时可以适当降低阈值

### 3. 精确控制
- **误报控制**：提高阈值减少误报
- **漏检控制**：降低阈值减少漏检
- **平衡优化**：根据实际使用情况找到最佳平衡点

## 优势

### 1. 精确控制
- ✅ 每个PPE物品独立控制
- ✅ 根据实际检测难度调整
- ✅ 适应不同环境条件

### 2. 用户体验
- ✅ 直观的阈值设置界面
- ✅ 实时生效，无需重启
- ✅ 一键重置功能

### 3. 检测效果
- ✅ 减少误报和漏检
- ✅ 提高检测准确性
- ✅ 适应不同使用场景

## 使用方法
1. **开启摄像头**：点击"开启摄像头"
2. **调整阈值**：在"PPE物品检测阈值设置"区域调整各物品的阈值
3. **开始监控**：点击"开始监控"进行实时检测
4. **观察效果**：根据检测结果进一步调整阈值
5. **重置设置**：如需恢复默认值，点击"重置"按钮

## 建议设置
- **口罩**：70%-80%（较小物品，易被遮挡）
- **洁净帽**：80%-85%（相对明显，但可能被头发遮挡）
- **蓝色洁净服**：85%-90%（较大物品，特征明显）
- **人员**：80%-85%（检测相对稳定）
