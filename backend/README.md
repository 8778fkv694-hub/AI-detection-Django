# WYL视觉质检系统 - Django后端

这是一个基于Django REST Framework的视觉质检系统后端，提供AI配置管理、缺陷类型管理、检测标准管理和检测结果管理等功能。

## 功能特性

- **AI配置管理**: 管理AI模型的配置信息
- **缺陷类型管理**: 定义和管理缺陷类型
- **检测标准管理**: 创建和管理检测标准
- **检测区域管理**: 定义检测区域和ROI
- **检测结果管理**: 存储和管理检测结果
- **批量检测**: 支持批量图片检测
- **异步任务**: 使用Celery处理异步任务

## 技术栈

- Django 4.2+
- Django REST Framework
- PostgreSQL (生产环境) / SQLite (开发环境)
- Redis (Celery消息队列)
- Celery (异步任务处理)
- Pillow (图像处理)

## 快速开始

### 1. 环境准备

确保已安装Python 3.8+和pip。

### 2. 安装依赖

```bash
cd backend
pip install -r requirements.txt
```

### 3. 启动数据库服务

使用Docker Compose启动PostgreSQL和Redis：

```bash
# 在项目根目录下运行
docker-compose up -d db redis
```

或者只启动Redis（使用SQLite作为数据库）：

```bash
docker-compose up -d redis
```

### 4. 初始化数据库

```bash
cd backend
python manage.py migrate
python manage.py createsuperuser
```

### 5. 启动服务

#### 启动Django开发服务器

```bash
python start_django.py
```

或者手动启动：

```bash
python manage.py runserver 0.0.0.0:8000
```

#### 启动Celery工作进程（可选）

如果需要处理异步任务，启动Celery：

```bash
python start_celery.py
```

或者手动启动：

```bash
celery -A config worker --loglevel=info
```

## API接口

### 基础URL
- 开发环境: `http://localhost:8000/api/`
- 管理界面: `http://localhost:8000/admin/`

### 主要接口

#### AI配置管理
- `GET /api/ai-configs/` - 获取AI配置列表
- `POST /api/ai-configs/` - 创建AI配置
- `GET /api/ai-configs/get_current_config/` - 获取当前配置

#### 缺陷类型管理
- `GET /api/defect-types/` - 获取缺陷类型列表
- `POST /api/defect-types/` - 创建缺陷类型

#### 检测标准管理
- `GET /api/standards/` - 获取检测标准列表
- `POST /api/standards/` - 创建检测标准

#### 检测区域管理
- `GET /api/inspection-areas/` - 获取检测区域列表
- `POST /api/inspection-areas/` - 创建检测区域

#### 检测结果管理
- `GET /api/results/` - 获取检测结果列表
- `POST /api/results/live-inspect/` - 实时检测
- `POST /api/results/batch-inspect/` - 批量检测

## 数据模型

### AIConfig (AI配置)
- `model_name`: 模型名称
- `api_key`: API密钥
- `api_base_url`: API基础URL
- `system_prompt`: 系统提示词
- `compression_enabled`: 是否启用压缩
- `compression_quality`: 压缩质量

### DefectType (缺陷类型)
- `name`: 缺陷类型名称
- `category`: 缺陷类别
- `description`: 描述
- `severity_levels`: 严重程度级别
- `color`: 显示颜色

### Standard (检测标准)
- `name`: 标准名称
- `criteria`: 检测标准
- `standard_image`: 标准图片
- `send_standard_image`: 是否发送标准图片
- `override_system_prompt`: 覆盖系统提示词
- `defect_types`: 缺陷类型配置

### InspectionArea (检测区域)
- `standard`: 关联的检测标准
- `name`: 区域名称
- `x, y, width, height`: 区域坐标和尺寸
- `description`: 描述
- `color`: 显示颜色
- `defect_types`: 缺陷类型列表
- `severity_threshold`: 严重程度阈值
- `importance`: 重要性级别

### InspectionResult (检测结果)
- `timestamp`: 检测时间
- `image`: 检测图片
- `standard`: 使用的检测标准
- `overall_quality`: 整体质量
- `score`: 检测分数
- `reason`: 检测原因
- `reason_keywords`: 关键词

### Defect (缺陷)
- `inspection_result`: 关联的检测结果
- `type`: 缺陷类型
- `description`: 描述
- `severity`: 严重程度
- `confidence`: 置信度
- `x, y, width, height`: 缺陷位置
- `area_id`: 关联的检测区域

## 环境变量配置

可以通过环境变量配置以下参数：

```bash
# Django设置
DEBUG=True
DJANGO_SECRET_KEY=your-secret-key
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

# 数据库设置 (PostgreSQL)
PG_HOST=localhost
PG_PORT=5432
PG_DB=qainspect
PG_USER=qainspect
PG_PASSWORD=qainspect

# Celery设置
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
```

## 开发说明

### 添加新的API接口

1. 在 `inspection/models.py` 中定义数据模型
2. 在 `inspection/serializers.py` 中创建序列化器
3. 在 `inspection/views.py` 中创建视图集
4. 在 `config/urls.py` 中注册路由

### 添加新的异步任务

1. 在 `inspection/tasks.py` 中定义任务函数
2. 使用 `@shared_task` 装饰器
3. 在视图中调用任务

### 数据库迁移

```bash
python manage.py makemigrations
python manage.py migrate
```

## 部署说明

### 生产环境部署

1. 设置 `DEBUG=False`
2. 配置生产数据库
3. 配置静态文件服务
4. 使用Gunicorn或uWSGI部署
5. 配置Nginx反向代理

### Docker部署

```bash
# 构建镜像
docker build -t wyl-inspection-backend .

# 运行容器
docker run -d -p 8000:8000 wyl-inspection-backend
```

## 故障排除

### 常见问题

1. **数据库连接失败**
   - 检查PostgreSQL服务是否启动
   - 验证数据库连接参数

2. **Celery任务不执行**
   - 检查Redis服务是否启动
   - 确认Celery工作进程正在运行

3. **CORS错误**
   - 检查前端URL是否在CORS允许列表中
   - 验证CORS中间件配置

### 日志查看

```bash
# Django日志
python manage.py runserver --verbosity=2

# Celery日志
celery -A config worker --loglevel=debug
```

## 许可证

本项目采用MIT许可证。
