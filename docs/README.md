# WYL检测法后端 - Django AI检测服务

## 🎯 项目说明

这是一个**Django后端服务**，专门用于AI视觉检测。**不需要启动前端服务**，只需要Django后端即可。

## 🚀 快速启动

### 推荐方式：专用脚本
```bash
./start_django_only.sh
```

### 手动启动
```bash
cd backend
source venv/bin/activate
python manage.py runserver
```

## 🌟 核心功能

- **AI视觉检测**: 基于YOLO模型的PPE检测
- **RESTful API**: 提供检测接口服务
- **批量处理**: 支持异步批量检测
- **图像处理**: 支持多种图像格式
- **数据库管理**: SQLite/PostgreSQL支持

## 📁 项目结构

```
backend/                    ← Django后端核心
├── manage.py              ← Django管理脚本
├── venv/                  ← Python虚拟环境
├── requirements.txt       ← Python依赖
├── inspection/            ← 检测应用
├── config/                ← Django配置
└── media/                 ← 媒体文件存储
```

## 🔧 技术栈

- **后端框架**: Django 4.2+
- **AI模型**: YOLO8x, YOLO10x
- **图像处理**: OpenCV, Pillow
- **任务队列**: Celery + Redis
- **数据库**: SQLite (开发) / PostgreSQL (生产)

## 🌐 API接口

- **实时检测**: `POST /api/results/live-inspect/`
- **批量检测**: `POST /api/results/batch-inspect/`
- **标准管理**: `/api/standards/`
- **结果查询**: `/api/results/`
- **AI配置**: `/api/ai-configs/`

## ⚠️ 重要提醒

**本项目只需要Django后端，不需要启动：**
- ❌ Node.js前端服务
- ❌ React开发服务器
- ❌ Vite构建工具

## 📖 详细文档

更多启动说明请查看：`项目启动说明.md`

## 🛑 停止服务

```bash
pkill -f "manage.py runserver"
```

## 📞 技术支持

如有问题，请查看项目启动说明文档或联系开发团队。
    ```
  