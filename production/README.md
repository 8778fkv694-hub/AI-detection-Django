# AI检测系统生产环境部署说明

## 概述

本目录包含AI检测系统的生产环境部署配置文件，支持Docker容器化部署。

## 文件说明

### 核心配置文件
- `nginx.conf` - Nginx反向代理配置
- `supervisord.conf` - 进程管理配置
- `start.sh` - 容器启动脚本
- `init-db.sql` - 数据库初始化脚本
- `env.example` - 环境变量配置示例

### 部署脚本
- `../deploy.sh` - 一键部署脚本
- `../stop_prod.sh` - 停止服务脚本
- `../check_prod_status.sh` - 状态检查脚本

## 快速部署

### 1. 环境准备
确保系统已安装：
- Docker 20.10+
- Docker Compose 2.0+

### 2. 配置环境变量
```bash
# 复制环境变量模板
cp production/env.example .env

# 编辑配置文件
nano .env
```

### 3. 一键部署
```bash
# 执行部署脚本
chmod +x deploy.sh
./deploy.sh
```

### 4. 验证部署
```bash
# 检查服务状态
./check_prod_status.sh

# 访问系统
# 前端: https://localhost
# 后端: http://localhost:8012/api/
# 管理: http://localhost:8012/admin
```

## 服务架构

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Nginx (80/443)│────│  Django App     │────│  PostgreSQL     │
│   (反向代理)     │    │  (8012)         │    │  (5432)         │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                       ┌─────────────────┐
                       │     Redis       │
                       │     (6379)      │
                       └─────────────────┘
```

## 服务说明

### Nginx
- 提供HTTPS/HTTP服务
- 静态文件服务
- API请求代理
- SSL终止

### Django应用
- 提供REST API
- 处理AI检测请求
- 管理后台
- 静态文件收集

### PostgreSQL
- 存储检测数据
- 用户管理
- 系统配置

### Redis
- 缓存服务
- Celery消息队列
- 会话存储

## 性能优化

### 数据库优化
- 连接池配置
- 索引优化
- 查询优化

### 应用优化
- Gunicorn多进程
- 静态文件缓存
- 压缩传输

### 系统优化
- 资源限制
- 健康检查
- 自动重启

## 监控和日志

### 日志位置
- 应用日志: `/app/logs/`
- Nginx日志: `/var/log/nginx/`
- 系统日志: `/var/log/supervisor/`

### 监控命令
```bash
# 查看服务状态
docker-compose -f docker-compose.prod.yml ps

# 查看日志
docker-compose -f docker-compose.prod.yml logs -f

# 查看资源使用
docker stats
```

## 安全配置

### SSL/TLS
- 自动生成自签名证书
- 生产环境建议使用正式证书
- 强制HTTPS重定向

### 安全头
- X-Frame-Options
- X-Content-Type-Options
- X-XSS-Protection
- Strict-Transport-Security

### 访问控制
- 防火墙配置
- 端口限制
- 用户权限

## 备份和恢复

### 数据备份
```bash
# 备份数据库
docker-compose -f docker-compose.prod.yml exec db pg_dump -U qainspect qainspect > backup.sql

# 备份媒体文件
tar -czf media_backup.tar.gz /var/lib/docker/volumes/ai检测_后端django_app_media/_data
```

### 数据恢复
```bash
# 恢复数据库
docker-compose -f docker-compose.prod.yml exec -T db psql -U qainspect qainspect < backup.sql

# 恢复媒体文件
tar -xzf media_backup.tar.gz -C /var/lib/docker/volumes/ai检测_后端django_app_media/_data
```

## 故障排除

### 常见问题

1. **端口冲突**
   ```bash
   # 检查端口占用
   netstat -tulpn | grep :80
   netstat -tulpn | grep :8012
   ```

2. **权限问题**
   ```bash
   # 修复文件权限
   chmod +x deploy.sh
   chmod +x stop_prod.sh
   chmod +x check_prod_status.sh
   ```

3. **服务启动失败**
   ```bash
   # 查看详细日志
   docker-compose -f docker-compose.prod.yml logs app
   ```

### 重置系统
```bash
# 停止所有服务
./stop_prod.sh

# 清理数据卷
docker-compose -f docker-compose.prod.yml down -v

# 重新部署
./deploy.sh
```

## 升级和维护

### 系统升级
```bash
# 拉取最新镜像
docker-compose -f docker-compose.prod.yml pull

# 重新构建
docker-compose -f docker-compose.prod.yml up -d --build
```

### 定期维护
- 清理Docker镜像
- 更新安全补丁
- 监控磁盘空间
- 备份重要数据

## 技术支持

如遇到问题，请检查：
1. 系统日志文件
2. Docker容器状态
3. 网络连接
4. 资源使用情况

更多技术支持请联系开发团队。
