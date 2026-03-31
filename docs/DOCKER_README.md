# 🐳 AI检测系统 Docker 部署指南

## 📋 概述

本项目已配置为使用阿里云镜像源进行Docker构建，提供更快的下载速度和更稳定的构建过程。

## 🚀 快速开始

### 方法1：使用管理脚本（推荐）

```bash
# 构建并启动服务
./docker_manage.sh build
./docker_manage.sh start

# 查看服务状态
./docker_manage.sh status

# 查看日志
./docker_manage.sh logs

# 停止服务
./docker_manage.sh stop
```

### 方法2：使用Docker Compose

```bash
# 构建并启动所有服务
docker-compose -f docker-compose.aliyun.yml up -d

# 查看服务状态
docker-compose -f docker-compose.aliyun.yml ps

# 停止服务
docker-compose -f docker-compose.aliyun.yml down
```

### 方法3：快速构建单个镜像

```bash
# 只构建应用镜像
./quick_docker_build.sh
```

## 📁 文件说明

| 文件 | 说明 |
|------|------|
| `Dockerfile.aliyun` | 使用阿里云镜像源的Dockerfile |
| `docker-compose.aliyun.yml` | 使用阿里云镜像源的Docker Compose配置 |
| `docker_manage.sh` | Docker管理脚本 |
| `quick_docker_build.sh` | 快速构建脚本 |
| `.env.docker` | Docker环境变量配置 |

## 🔧 配置说明

### 阿里云镜像源配置

- **Node.js**: `registry.cn-hangzhou.aliyuncs.com/library/node:18-alpine`
- **Python**: `registry.cn-hangzhou.aliyuncs.com/library/python:3.9-slim`
- **PostgreSQL**: `registry.cn-hangzhou.aliyuncs.com/library/postgres:15-alpine`
- **Redis**: `registry.cn-hangzhou.aliyuncs.com/library/redis:7-alpine`
- **Nginx**: `registry.cn-hangzhou.aliyuncs.com/library/nginx:alpine`

### 包管理器镜像源

- **npm**: `https://registry.npmmirror.com`
- **pip**: `https://mirrors.aliyun.com/pypi/simple/`
- **apt**: 使用阿里云Debian镜像源

## 🌐 服务端口

| 服务 | 端口 | 说明 |
|------|------|------|
| 前端 | 80/443 | HTTP/HTTPS访问 |
| 后端API | 8012 | 直接API访问 |
| 数据库 | 5432 | PostgreSQL |
| 缓存 | 6379 | Redis |

## 📱 访问地址

- **前端界面**: http://localhost
- **后端API**: http://localhost:8012/api/
- **管理后台**: http://localhost:8012/admin

## 🛠️ 管理命令

### 使用管理脚本

```bash
# 查看所有命令
./docker_manage.sh help

# 构建镜像
./docker_manage.sh build

# 启动服务
./docker_manage.sh start

# 停止服务
./docker_manage.sh stop

# 重启服务
./docker_manage.sh restart

# 查看状态
./docker_manage.sh status

# 查看日志
./docker_manage.sh logs

# 进入容器
./docker_manage.sh shell

# 清理资源
./docker_manage.sh clean
```

### 使用Docker Compose

```bash
# 构建镜像
docker-compose -f docker-compose.aliyun.yml build

# 启动服务
docker-compose -f docker-compose.aliyun.yml up -d

# 查看日志
docker-compose -f docker-compose.aliyun.yml logs -f

# 停止服务
docker-compose -f docker-compose.aliyun.yml down

# 重启服务
docker-compose -f docker-compose.aliyun.yml restart
```

## 🔍 故障排除

### 1. 构建失败

```bash
# 清理Docker缓存
docker system prune -f

# 重新构建
./docker_manage.sh build
```

### 2. 服务无法启动

```bash
# 查看详细日志
docker-compose -f docker-compose.aliyun.yml logs

# 检查端口占用
netstat -tulpn | grep :8012
```

### 3. 数据库连接问题

```bash
# 检查数据库容器状态
docker-compose -f docker-compose.aliyun.yml exec db psql -U qainspect -d qainspect

# 重启数据库
docker-compose -f docker-compose.aliyun.yml restart db
```

## 📊 性能优化

### 1. 构建优化

- 使用多阶段构建减少镜像大小
- 使用阿里云镜像源加速下载
- 缓存依赖包减少构建时间

### 2. 运行时优化

- 使用Alpine Linux减少镜像大小
- 配置健康检查确保服务稳定
- 使用数据卷持久化数据

## 🔒 安全建议

1. 修改默认密码
2. 使用HTTPS证书
3. 限制网络访问
4. 定期更新镜像

## 📝 注意事项

1. 首次构建可能需要较长时间
2. 确保Docker有足够的内存和磁盘空间
3. 生产环境请修改默认密码和密钥
4. 建议使用Docker Swarm或Kubernetes进行生产部署
