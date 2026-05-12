# Jetson Orin Nano 操作备忘录

> **最后更新**: 2026-05-12
> **设备**: Jetson Orin Nano 8GB
> **IP**: 192.168.55.1 (USB直连)
> **用户**: wenyili

---

## 一、连接方式

### USB 直连（主力）
```bash
# 本机执行
cd ~/开发/SSH\ Jetson\ nano
./connect.sh

# 或直接
ssh wenyili@192.168.55.1
```

### Tailscale（备用，外网穿透）
```bash
ssh wenyili@100.104.149.15
```

### VNC 远程桌面
```bash
./vnc_jetson.sh
```

---

## 二、项目路径

| 内容 | 路径 |
|------|------|
| 项目根目录 | `~/projects/AI-Detection/` |
| Django 后端 | `~/projects/AI-Detection/backend/` |
| 前端 SPA 构建产物 | `~/projects/AI-Detection/dist/` |
| 前端访问地址 | `http://192.168.55.1:3005/` |
| 后端 API | `http://192.168.55.1:8000/api/` |
| Python 虚拟环境 | `~/projects/AI-Detection/venv/` |
| 日志 | `~/projects/AI-Detection/backend/*.log` |
| 数据库 | `~/projects/AI-Detection/backend/db.sqlite3` |
| HLS 临时文件 | `~/projects/AI-Detection/backend/media/hls/` |

---

## 三、服务管理

### systemd 服务（图形会话自动启停）

| 服务 | 端口 | 说明 |
|------|------|------|
| `ai-backend.service` | 8000 | Django WSGI (gunicorn, --workers 1) |
| `ai-frontend-spa.service` | 3005 | 前端静态文件服务 |

```bash
# 查看服务状态
systemctl --user status ai-backend
systemctl --user status ai-frontend-spa

# 手动启停
systemctl --user restart ai-backend
systemctl --user stop ai-frontend-spa

# 查看日志
journalctl --user -u ai-backend -f
journalctl --user -u ai-frontend-spa -f
```

### 模式切换

```bash
# 查看当前模式
~/bin/jetson-mode status

# 完整模式（桌面 + 检测项目自动运行）
~/bin/jetson-mode full

# 极简模式（关闭桌面，释放 GPU 内存）
~/bin/jetson-mode minimal
```

---

## 四、代码同步

### 从 Mac 推送到 Jetson
```bash
# Mac 上执行
cd ~/开发/SSH\ Jetson\ nano
./sync_to_jetson.sh
```

同步规则：
- 排除 `node_modules`, `.git`, `*.pt` 模型, `venv`, `__pycache__`
- 排除 `*.sqlite3` (保护生产数据库)
- 磁盘使用率 ≥95% 时阻止同步

### GitHub → Jetson（直接在 Jetson 上）
```bash
ssh jetson
cd ~/projects/AI-Detection
git pull origin main
sudo systemctl --user restart ai-backend
```

### 从 Jetson 拉回 Mac
```bash
./sync_from_jetson.sh
```

---

## 五、日常运维

### 磁盘清理
```bash
# 手动执行（清理30天前记录 + VACUUM）
~/projects/AI-Detection/bin/cleanup_daily.sh

# 检查磁盘
df -h ~/
```

### 重启服务
```bash
# 暴力重启（清端口 + 重启服务）
systemctl --user restart ai-backend
systemctl --user restart ai-frontend-spa

# 检查端口
fuser 8000/tcp
fuser 3005/tcp
```

### 查看后端日志
```bash
tail -f ~/projects/AI-Detection/backend/django.log
journalctl --user -u ai-backend --since "10 min ago"
```

---

## 六、关键参数配置

### 摄像头采集
| 参数 | 推荐值 | 说明 |
|------|--------|------|
| 分辨率 | **1280x720** | 平衡画质与性能 |
| 摄像头采集帧率 | 30fps | USB 摄像头原生 |
| YOLO 输入尺寸 | **640** | ultralytics 默认 |
| MJPEG 前端帧率 | **10fps** | 显示不需要高帧率 |

### 模型
| 参数 | 值 |
|------|-----|
| 模型池最大数量 | **2**（Jetson 8GB 限制） |
| 默认模型 | `ppe_detection` |

### Django
| 参数 | 值 |
|------|-----|
| Workers | **1**（单 worker，避免多进程抢摄像头） |
| 内存限制 | 2.5G max, 2.0G high |
| DB | SQLite WAL 模式 |

---

## 七、常见故障排查

### 1. 无法连接 Jetson
```bash
# 检查 USB 线是否插对端口（Micro-USB/USB-C 数据口，非电源口）
ping 192.168.55.1
```

### 2. 前端页面打不开 (3005)
```bash
ssh jetson
systemctl --user status ai-frontend-spa
# 如果挂了：
systemctl --user restart ai-frontend-spa
```

### 3. API 无响应 (8000)
```bash
ssh jetson
systemctl --user status ai-backend
# 检查端口是否被占
fuser 8000/tcp
# 查看日志尾
tail -50 ~/projects/AI-Detection/backend/django.log
```

### 4. 摄像头画面不出来
```bash
# 检查摄像头设备
ls /dev/video*
v4l2-ctl --list-devices

# 测试摄像头是否正常
ffmpeg -f v4l2 -list_formats all -i /dev/video0

# 检查 MJPEG 透传是否在跑
ps aux | grep ffmpeg
```

### 5. 磁盘满了
```bash
# 查看大文件
du -sh ~/projects/AI-Detection/backend/media/hls/*
du -sh ~/projects/AI-Detection/backend/media/results/*

# 手动清理 HLS 缓存
rm -rf ~/projects/AI-Detection/backend/media/hls/*

# 清理数据库旧记录
sqlite3 ~/projects/AI-Detection/backend/db.sqlite3 \
  "DELETE FROM inspection_inspectionresult WHERE timestamp < datetime('now', '-30 days'); VACUUM;"
```

### 6. 内存不足 / OOM
```bash
# 检查内存使用
free -h

# 检查 GPU 内存
sudo tegrastats

# 如果 OOM，切到极简模式释放桌面内存
~/bin/jetson-mode minimal
```

### 7. 模型加载失败
```bash
# 检查模型文件是否存在
ls -la ~/projects/AI-Detection/models/

# 至少需要 ppe.pt
# 如果有 TensorRT 引擎 (.engine)，优先加载
ls ~/projects/AI-Detection/models/*.engine
```

---

## 八、快速操作速查

```bash
# === 完全重启检测系统 ===
ssh jetson
systemctl --user stop ai-frontend-spa ai-backend
sleep 2
fuser -k 8000/tcp 3005/tcp 2>/dev/null
sleep 1
systemctl --user start ai-backend ai-frontend-spa

# === 只看实时日志 ===
ssh jetson 'journalctl --user -u ai-backend -f'

# === 检查系统健康 ===
ssh jetson '
echo "=== 磁盘 ===" && df -h ~/
echo "=== 内存 ===" && free -h
echo "=== 服务 ===" && systemctl --user status ai-backend ai-frontend-spa --no-pager
echo "=== 端口 ===" && fuser 8000/tcp 3005/tcp
'
```
