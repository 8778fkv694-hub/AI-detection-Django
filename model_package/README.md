# 模型使用说明

## 模型文件信息
- **模型文件**: best.pt (6.0 MB)
- **训练完成**: 100 epochs
- **性能指标**: mAP50 = 74.6%

## 可识别类别
模型可以检测以下4个类别：

| 类别ID | 类别名称 | 描述 |
|--------|----------|------|
| 0 | filter | 过滤器 |
| 1 | filtername | 过滤器名称 |
| 2 | nsplogo | NSP标志/Logo |
| 3 | qrcode | 二维码 |

## 使用方法
```python
from ultralytics import YOLO

# 加载模型
model = YOLO('best.pt')

# 进行检测
results = model('image.jpg')

# 查看结果
for result in results:
    boxes = result.boxes
    for box in boxes:
        class_id = int(box.cls[0])
        confidence = float(box.conf[0])
        class_name = model.names[class_id]
        print(f"检测到: {class_name} (置信度: {confidence:.2f})")
```

## 验证脚本
运行 verify_model.py 来验证模型是否正确加载。
