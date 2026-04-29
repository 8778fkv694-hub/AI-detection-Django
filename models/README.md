# 模型文件目录

此目录用于统一管理所有 YOLO 模型文件。

## 模型文件列表

- `ppe.pt` - PPE检测专用模型
- `waterprifer.pt` - 净水机专用检测模型
- `yolo8x.pt` - YOLO8X高性能PPE检测模型
- `yolo10x.pt` - YOLO10X模型
- `yolov8l.pt` - YOLOv8L PPE检测模型
- `yolov8n.pt` - YOLOv8N轻量模型
- `ppe_detection.pt` - PPE检测模型（备用）
- `filter.pt` - 滤芯专用检测模型（YOLO11版本）

## 路径查找优先级

系统会按以下优先级查找模型文件：

1. **models/** 文件夹（推荐位置，当前使用）
2. **PPE_detection_YOLO/** 文件夹（兼容旧位置）
3. **backend/** 文件夹（兼容旧位置）
4. 项目根目录（兼容旧位置）

## 注意事项

- 模型文件较大（通常几十MB到上百MB），已添加到 `.gitignore`，不会被提交到 Git
- 如需部署，请确保将模型文件复制到目标服务器的 `models/` 目录
- 系统会自动查找模型文件，优先使用 `models/` 文件夹中的文件

