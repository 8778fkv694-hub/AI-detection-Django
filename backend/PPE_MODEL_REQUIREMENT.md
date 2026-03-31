# PPE检测系统 - 强制依赖PPE模型

## 系统要求

**重要：系统必须依赖PPE模型，不支持其他检测方式**

### 必需组件
- Python 3.8+
- Django 4.0+
- PyTorch
- Ultralytics YOLO
- **PPE检测模型文件** (`ppe_detection.pt`)

### PPE模型要求
- 模型文件必须存在且完整
- 模型文件路径：`backend/ppe_detection.pt`
- 或通过环境变量设置：`PPE_MODEL_PATH`
- 模型大小：约84MB
- 支持的检测类别：人员、洁净帽、口罩、洁净服等PPE装备

## 安装和配置

### 1. 安装依赖
```bash
cd backend
pip install -r requirements.txt
```

### 2. 准备PPE模型
**必须步骤：** 将PPE检测模型文件放置在正确位置

```bash
# 方法1：直接放置模型文件
cp ppe_detection.pt backend/ppe_detection.pt

# 方法2：设置环境变量
export PPE_MODEL_PATH=/path/to/your/ppe_detection.pt
```

### 3. 验证PPE模型
```bash
cd backend
python check_ppe_model.py
```

如果看到以下输出，说明PPE模型配置正确：
```
✅ PPE模型验证成功，系统可以正常启动
```

## 启动系统

### 启动前检查
系统启动前会自动检查PPE模型是否可用：

```bash
cd backend
python start_django.py
```

如果PPE模型不可用，系统会显示错误信息并退出：
```
❌ 系统启动失败
系统必须依赖PPE模型，但PPE模型不可用。
```

### 正常启动
如果PPE模型可用，系统会正常启动：
```
✅ PPE模型验证成功，系统可以正常启动
启动Django开发服务器...
服务器将在 http://localhost:8000 运行
```

## API端点

### PPE模型状态检查
- `GET /api/results/ppe-model-status/` - 获取PPE模型状态
- `GET /api/results/ppe-model-info/` - 获取PPE模型详细信息
- `GET /api/results/validate-ppe-model/` - 验证PPE模型是否可用

### 检测API
- `POST /api/results/yolo-detect/` - PPE检测（必须依赖PPE模型）

## 故障排除

### 常见问题

1. **PPE模型文件不存在**
   ```
   错误：系统必须依赖PPE模型，但PPE模型文件不存在
   解决方案：将ppe_detection.pt文件放置在backend/目录下
   ```

2. **PPE模型加载失败**
   ```
   错误：系统必须依赖PPE模型，但PPE模型加载失败了
   解决方案：检查模型文件是否完整，重新下载模型文件
   ```

3. **权限问题**
   ```
   错误：无法读取PPE模型文件
   解决方案：检查文件权限，确保有读取权限
   ```

### 验证步骤

1. 检查模型文件是否存在：
   ```bash
   ls -la backend/ppe_detection.pt
   ```

2. 检查模型文件大小（应该约84MB）：
   ```bash
   du -h backend/ppe_detection.pt
   ```

3. 运行模型检查脚本：
   ```bash
   python check_ppe_model.py
   ```

## 技术架构

### 强制依赖设计
- 系统启动时必须验证PPE模型可用性
- 所有检测API都会检查PPE模型状态
- 不支持其他检测方式或模型回退
- 如果PPE模型不可用，系统拒绝启动

### 模型管理
- 自动检测PPE模型文件位置
- 支持环境变量配置
- 提供详细的模型状态信息
- 完整的错误处理和诊断

## 注意事项

1. **系统必须依赖PPE模型**，没有PPE模型系统无法运行
2. 不支持其他检测方式或模型回退
3. 确保PPE模型文件完整且可读
4. 定期检查PPE模型状态
5. 备份PPE模型文件

## 联系支持

如果遇到PPE模型相关问题，请检查：
1. 模型文件是否完整
2. 文件路径是否正确
3. 权限设置是否正确
4. 系统依赖是否安装完整
