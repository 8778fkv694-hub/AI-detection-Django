# Django后端数据管理指南

本指南介绍如何进入Django后端对数据进行管理。Django提供了两种主要的数据管理方式：

## 方式一：使用Django Admin管理界面（推荐）

Django Admin是一个功能强大的Web管理界面，可以方便地管理所有数据模型。

### 1. 启动Django服务器

首先需要启动Django后端服务器：

```bash
# 进入backend目录
cd backend

# 激活虚拟环境（如果使用虚拟环境）
source venv/bin/activate  # Linux/Mac
# 或
venv\Scripts\activate  # Windows

# 启动Django服务器
python manage.py runserver 0.0.0.0:8000
```

或者使用项目提供的启动脚本：

```bash
# 从项目根目录运行
./start_simple.sh  # Linux/Mac
# 或
start_django_only.sh  # 仅启动Django后端
```

### 2. 创建超级用户（如果还没有）

如果还没有创建超级用户，需要先创建一个：

```bash
cd backend
python manage.py createsuperuser
```

按提示输入：
- 用户名（Username）
- 邮箱（Email address，可选）
- 密码（Password）

**注意**：根据项目脚本，默认可能已经创建了超级用户：
- 用户名：`admin`
- 密码：`admin123`

### 3. 访问管理界面

在浏览器中打开以下地址：

```
http://localhost:8000/admin/
```

或如果服务器绑定到所有网络接口：

```
http://你的IP地址:8000/admin/
```

### 4. 登录管理界面

使用超级用户的用户名和密码登录。

### 5. 可管理的数据模型

登录后，您可以在管理界面中管理以下数据：

#### AI配置管理 (AIConfig)
- 模型名称
- 压缩设置
- 压缩质量

#### 缺陷类型管理 (DefectType)
- 缺陷名称
- 分类
- 颜色标记
- 创建时间

#### 缺陷严重程度管理 (DefectSeverity)
- 严重程度名称
- 级别
- 颜色标记

#### 检测标准管理 (Standard)
- 标准名称
- 是否发送标准图片
- 检测标准

#### 检测区域管理 (InspectionArea)
- 区域名称
- 关联标准
- 重要性
- 严重程度阈值

#### 检测结果管理 (InspectionResult)
- 检测时间
- 关联标准
- 整体质量
- 评分

#### 缺陷记录管理 (Defect)
- 缺陷类型
- 严重程度
- 置信度
- 关联的检测结果

#### 模型版本管理 (ModelVersion)
- 模型名称和版本
- 模型类型
- 状态
- 文件大小
- 性能指标

#### 模型部署管理 (ModelDeployment)
- 部署的模型版本
- 环境
- 状态
- 部署时间
- 成功率

#### 模型上传管理 (ModelUpload)
- 上传的文件名
- 文件大小
- 上传进度
- 状态

#### 模型性能管理 (ModelPerformance)
- 响应时间
- 内存使用
- CPU/GPU使用
- 请求统计

## 方式二：使用Django Shell（命令行）

Django Shell提供了Python交互式环境，可以直接操作数据库。

### 1. 进入Django Shell

```bash
cd backend
python manage.py shell
```

### 2. 常用操作示例

#### 查看所有检测结果

```python
from inspection.models import InspectionResult

# 获取所有检测结果
results = InspectionResult.objects.all()
for result in results:
    print(f"ID: {result.id}, 时间: {result.timestamp}, 质量: {result.overall_quality}")

# 获取最近的10条记录
recent_results = InspectionResult.objects.order_by('-timestamp')[:10]
```

#### 查看缺陷类型

```python
from inspection.models import DefectType

# 获取所有缺陷类型
defect_types = DefectType.objects.all()
for dt in defect_types:
    print(f"{dt.name} - {dt.category} - {dt.color}")
```

#### 创建新的缺陷类型

```python
from inspection.models import DefectType

# 创建新缺陷类型
new_defect = DefectType.objects.create(
    name="划痕",
    category="表面缺陷",
    color="#FF0000",
    description="产品表面划痕"
)
print(f"已创建缺陷类型: {new_defect.name}")
```

#### 更新数据

```python
from inspection.models import DefectType

# 更新缺陷类型
defect = DefectType.objects.get(name="划痕")
defect.color = "#FF5733"
defect.save()
print("已更新缺陷类型")
```

#### 删除数据

```python
from inspection.models import DefectType

# 删除缺陷类型（谨慎操作）
defect = DefectType.objects.get(name="划痕")
defect.delete()
print("已删除缺陷类型")
```

#### 查询和过滤

```python
from inspection.models import InspectionResult
from django.utils import timezone
from datetime import timedelta

# 查询最近24小时的检测结果
yesterday = timezone.now() - timedelta(days=1)
recent = InspectionResult.objects.filter(timestamp__gte=yesterday)

# 查询质量存疑的结果
failed = InspectionResult.objects.filter(overall_quality='FAILED')

# 统计数量
count = InspectionResult.objects.count()
print(f"总共有 {count} 条检测结果")
```

#### 批量操作

```python
from inspection.models import InspectionResult

# 批量更新
InspectionResult.objects.filter(overall_quality='PASSED').update(score=100)

# 批量删除（谨慎操作）
# InspectionResult.objects.filter(timestamp__lt=yesterday).delete()
```

### 3. 退出Shell

```python
exit()
```

## 方式三：使用Django REST API

项目还提供了REST API接口，可以通过API进行数据管理：

### API基础URL

```
http://localhost:8000/api/
```

### 主要API端点

- `GET /api/ai-configs/` - 获取AI配置列表
- `GET /api/defect-types/` - 获取缺陷类型列表
- `GET /api/standards/` - 获取检测标准列表
- `GET /api/results/` - 获取检测结果列表
- `GET /api/model-versions/` - 获取模型版本列表

详细API文档请参考：`http://localhost:8000/api/`

## 常见问题

### 1. 忘记超级用户密码

可以通过Django Shell重置密码：

```bash
cd backend
python manage.py shell
```

```python
from django.contrib.auth.models import User
user = User.objects.get(username='admin')
user.set_password('新密码')
user.save()
```

### 2. 创建新的超级用户

```bash
cd backend
python manage.py createsuperuser
```

### 3. 查看所有用户

```python
from django.contrib.auth.models import User
users = User.objects.all()
for user in users:
    print(f"{user.username} - {user.email} - 超级用户: {user.is_superuser}")
```

### 4. 数据库迁移

如果修改了模型，需要运行迁移：

```bash
cd backend
python manage.py makemigrations
python manage.py migrate
```

## 安全建议

1. **生产环境**：在生产环境中，请修改默认的超级用户密码
2. **访问控制**：考虑使用更严格的访问控制
3. **HTTPS**：在生产环境中使用HTTPS保护数据传输
4. **备份**：定期备份数据库

## 相关文件

- 管理界面配置：`backend/inspection/admin.py`
- URL配置：`backend/config/urls.py`
- 模型定义：`backend/inspection/models.py`
- 设置文件：`backend/config/settings.py`

## 更多帮助

- Django官方文档：https://docs.djangoproject.com/
- Django Admin文档：https://docs.djangoproject.com/en/stable/ref/contrib/admin/

