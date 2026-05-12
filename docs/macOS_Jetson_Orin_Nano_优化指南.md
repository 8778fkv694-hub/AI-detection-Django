# macOS → Jetson Orin Nano 全流程优化指南

> **维护者**: Tony  
> **目标设备**: Jetson Orin Nano (JetPack R36.4.3 / L4T, ARM aarch64)  
> **开发机**: macOS (Apple Silicon)  
> **项目**: AI-Detection (Django + React/Vite + YOLO + OCR + 流媒体)  
> **最后更新**: 2026-05-12

---

## 目录

1. [架构概览](#1-架构概览)
2. [macOS 端开发环境优化](#2-macos-端开发环境优化)
3. [macOS ↔ Jetson 同步策略](#3-macos--jetson-同步策略)
4. [Jetson 端构建与部署优化](#4-jetson-端构建与部署优化)
5. [Jetson 运行时性能优化](#5-jetson-运行时性能优化)
6. [GPU 加速关键技术](#6-gpu-加速关键技术)
7. [已知问题修复清单](#7-已知问题修复清单)
8. [运维工作流](#8-运维工作流)
9. [附录：文件清单](#9-附录文件清单)

---

## 1. 架构概览

```
┌─────────────────────────┐     USB 直连 (192.168.55.1)     ┌──────────────────────────┐
│   macOS (开发机)          │ ◄──────────────────────────► │   Jetson Orin Nano        │
│                          │   SSH / SCP / rsync           │                           │
│  • 代码编辑 (VS Code)     │                                │  • Django 后端 :8000       │
│  • Git 版本管理           │                                │  • React SPA 前端 :3005     │
│  • 本地测试与验证          │                                │  • YOLO GPU 推理           │
│  • rsync 增量同步         │                                │  • RapidOCR ONNX 识别       │
│  • SSH 远程管理           │                                │  • HLS 视频流              │
│                          │                                │  • systemd 服务管理         │
│                          │                                │  • jetson-mode 模式切换     │
└─────────────────────────┘                                └──────────────────────────┘
```

**核心原则**: macOS 是代码编写和版本管理的主场，Jetson 是编译执行的目标场。通过 USB 直连 + rsync 增量同步，实现「改-推-测」的快速闭环。

---

## 2. macOS 端开发环境优化

### 2.1 SSH 快速连接

**已配置**: SSH 密钥免密登录，无需每次输入密码。

```bash
# 快速连接（推荐使用脚本）
cd "/Users/yiliwen/开发/SSH Jetson nano"
./connect.sh

# 或直接
ssh wenyili@192.168.55.1
```

**连接信息**:
| 项目 | 值 |
|------|------|
| 用户名 | wenyili |
| IP | 192.168.55.1 |
| 方式 | USB 直连 (Device Mode) |
| 认证 | SSH 密钥（免密） |

### 2.2 macOS 端 .ssh/config 优化建议

在 `~/.ssh/config` 中添加以下配置，减少连接延迟和断连：

```
Host jetson
    HostName 192.168.55.1
    User wenyili
    ServerAliveInterval 60
    ServerAliveCountMax 5
    TCPKeepAlive yes
    Compression yes
    StrictHostKeyChecking accept-new
```

配置后可直接 `ssh jetson` 连接（当前终端中就是你正在用的那个进程）。

### 2.3 本地代码编辑建议

- **VS Code Remote-SSH**: 可直接在 macOS 的 VS Code 中通过 SSH 编辑 Jetson 上的文件，无需手动同步
- **本地编辑 + rsync 推送**: 适合离线编辑，编辑完再统一推送

---

## 3. macOS ↔ Jetson 同步策略

### 3.1 rsync 增量同步（核心优化）

> **注意**: 项目存在两套同步脚本，请根据场景选用：
> - **工具目录版**: `/Users/yiliwen/开发/SSH Jetson nano/sync_to_jetson.sh`（功能更全，排除规则更完整）
> - **项目根目录版**: 项目根下的 `sync_to_jetson.sh`（随项目走，排除规则较精简）

**方向**: 本地 Mac → Jetson

```bash
# 方式一：使用工具目录脚本（推荐）
cd "/Users/yiliwen/开发/SSH Jetson nano"
./sync_to_jetson.sh

# 方式二：使用项目根目录脚本
cd "/Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django"
./sync_to_jetson.sh
```

**方向**: Jetson → 本地 Mac

```bash
cd "/Users/yiliwen/开发/SSH Jetson nano"
./sync_from_jetson.sh
```

### 3.2 已排除的目录（智能跳过）

项目根目录 `sync_to_jetson.sh` 排除以下内容：

| 排除项 | 原因 |
|--------|------|
| `node_modules/` | Jetson 上独立安装 |
| `venv/`, `__pycache__/`, `*.pyc` | Python 环境独立 |
| `*.pt`, `*.onnx`, `*.engine` | 大模型文件，手动上传 |
| `.git/`, `.gitignore` | 不需要同步到目标机 |
| `*.log`, `*.sqlite3`, `db.sqlite3` | 运行时产物 |
| `.env`, `.env.local`, `.env.production` | 保留 Jetson 自己的配置 |
| `backend/requirements.txt` | Jetson 有专用 GPU 版本依赖 |
| `media/hls/`, `media/uploads/` | 运行时媒体数据 |
| `.DS_Store` | macOS 系统文件 |

> **注意**: `dist/` 目录当前**不排除**（会同步到 Jetson 以节省远端构建时间）。
> 如需在 Jetson 上独立构建前端，可取消 `sync_to_jetson.sh` 中 `dist/` 排除行的注释。

### 3.3 同步优化建议

1. **日常开发用小批量 rsync**: 只同步修改的源文件（默认已实现）
2. **模型文件走专用通道**: 用 `upload_assets.sh` 单独上传大模型和视频
3. **首次部署用压缩包**: `project_deploy.tar.gz` 可用于批量初始化

---

## 4. Jetson 端构建与部署优化

### 4.1 前端构建优化

**问题**: Vite 构建时因 inotify 限制报 `ENOSPC`。

**解决方案**:

```bash
# 提高系统 inotify 限制
echo "fs.inotify.max_user_watches=524288" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

`vite.config.ts` 已配置忽略大目录：
```typescript
server: {
  watch: {
    ignored: ['**/venv/**', '**/node_modules/**', '**/.git/**']
  }
}
```

### 4.2 Node.js 版本管理

**问题**: 系统默认 Node.js v12 不支持顶层 `await`。

**解决方案**: 使用预装的 Node.js v18.19.0 (ARM64)。

```bash
# 位置: ~/node-v18.19.0-linux-arm64/
export NODEJS_HOME=$HOME/node-v18.19.0-linux-arm64
export PATH=$NODEJS_HOME/bin:$PATH
```

所有启动脚本已自动设置此 PATH。

### 4.3 生产环境部署 (systemd)

项目使用 systemd 用户服务管理，跟随图形会话自动启停：

| 服务 | 功能 | 端口 |
|------|------|------|
| `ai-backend.service` | Django WSGI 后端 | 8000 |
| `ai-frontend-spa.service` | React SPA 静态服务 | 3005 |

**安装**:
```bash
bash install_jetson_mode_setup.sh
```

### 4.4 jetson-mode 模式切换

```bash
# 查看当前模式（含桌面、服务状态）
~/bin/jetson-mode status

# 完整模式 - 桌面 + 视觉检测自动启动
~/bin/jetson-mode full

# 极简模式 - 关闭桌面 + 停止检测，最低功耗
~/bin/jetson-mode minimal
```

**使用场景**:
- **开发调试** → `full` 模式，桌面操作方便
- **长期无人值守** → `minimal` 模式通过 SSH 切换，释放 GPU 和内存
- **需要图形界面时** → 切回 `full`

### 4.5 Python 环境隔离

**关键优化**: 使用 venv 隔离，项目依赖固定在项目中。

```bash
# 虚拟环境路径
~/projects/AI-Detection/venv/

# 环境变量（所有启动脚本已设置）
export PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True  # 跳过在线模型检查
export HF_HUB_OFFLINE=1                              # HuggingFace 离线模式
export PYTHONUNBUFFERED=1                            # 实时输出日志
```

---

## 5. Jetson 运行时性能优化

### 5.1 PyTorch GPU 加速

| 组件 | 版本/来源 | 说明 |
|------|----------|------|
| PyTorch | 2.8.0 | 从 `pypi.jetson-ai-lab.io` 安装 |
| TorchVision | 0.23.0 | 匹配 PyTorch 版本 |
| CUDA | 12.6 | JetPack R36.4.3 内置 |
| GPU | Orin (Ampere) | `torch.cuda.is_available() == True` |

**安装方法** (参考 `install_gpu_torch.sh`):
```bash
source ~/projects/AI-Detection/venv/bin/activate
pip install torch --index-url https://pypi.jetson-ai-lab.dev/jp6/cu122
pip install torchvision --no-deps --extra-index-url https://pypi.jetson-ai-lab.dev/jp6/cu122/+simple
```

**安装后验证**:
```python
import torch
print(torch.__version__)          # 2.8.0
print(torch.cuda.is_available())  # True
print(torch.cuda.get_device_name(0))  # 'Orin'
```

### 5.2 TorchVision NMS 修复（关键补丁）

**问题**: YOLO 检测报错 `Could not run 'torchvision::nms' with arguments from the 'CUDA' backend.`

**根因**: Jetson 预编译的 TorchVision wheel 中 NMS C++ 扩展只含 CPU 后端。

**修复**: 禁用 `torchvision.ops.nms`，改用 Ultralytics 内置纯 PyTorch 实现。

**修改位置**: `~/projects/AI-Detection/venv/lib/python3.10/site-packages/ultralytics/utils/nms.py` (约第 151 行)

```python
# 原始代码
if "torchvision" in sys.modules:
    import torchvision
    i = torchvision.ops.nms(boxes, scores, iou_thres)

# 修复后
if False: # "torchvision" in sys.modules:
    import torchvision
    i = torchvision.ops.nms(boxes, scores, iou_thres)
```

**影响**: NMS 改为 PyTorch 实现，略有耗时增加（几毫秒），但 YOLO 推理核心（卷积）仍在 GPU 高速运行。这是不重新编译 TorchVision 前提下的最优雅方案。

### 5.3 OCR 引擎选择

| 引擎 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| **RapidOCR (ONNX)** ✅ | 启动快，内存低 40%，无需在线检查 | 精度略低于 PaddlePaddle GPU | **生产环境首选** |
| PaddleOCR (GPU) | 精度高，GPU 加速 | 编译耗时长，需要显存 | 高精度需求 |

**默认引擎**: RapidOCR ONNX 加速版，已通过 `install_rapidocr_v2.sh` 安装。

### 5.4 内存与进程管理

```bash
# 查看 GPU 使用
nvtop

# 查看系统资源
htop

# 清理残留进程（启动脚本自动执行）
fuser -k 8000/tcp 3005/tcp 3001/tcp 3303/tcp 5173/tcp 2>/dev/null
pkill -f "node .*vite" 2>/dev/null
```

---

## 6. GPU 加速关键技术

### 6.1 YOLO 推理管道

```
摄像头/视频 → OpenCV 读取 → YOLO GPU 推理 (CUDA) → 检测框 → 后处理
                                              ↓
                                    NMS (PyTorch 实现) ← 已打补丁
```

### 6.2 PaddlePaddle GPU 编译 (可选)

**状态**: 待确认（请在 Jetson 上执行 `python -c "import paddle; print(paddle.device.is_compiled_with_cuda())"` 验证）。

```bash
# 监控编译进度
tail -f ~/paddle_build.log

# 编译完成后验证
python -c "import paddle; print(paddle.device.is_compiled_with_cuda())"
```

**脚本**: `compile_paddle.sh`

### 6.3 ROI 清晰度计算方案

| 方案 | 优点 | 缺点 | 状态 |
|------|------|------|------|
| CPU (OpenCV) | 稳定，无依赖 | 成为瓶颈时才能体现 | **当前使用** |
| PyTorch GPU | CUDA 加速，免编译 | 小图可能负优化，需设阈值 | 备选方案 |

**PyTorch 方案要点**（需要时启用）:
- 用 `torch.nn.functional.conv2d` 实现拉普拉斯卷积
- 面积阈值 < 256×256 用 CPU，≥ 用 GPU
- 初始化时执行 Warm-up 避免首帧卡顿

---

## 7. 已知问题修复清单

| # | 问题 | 状态 | 修复方案 |
|---|------|------|----------|
| 1 | TorchVision NMS CUDA 不支持 | ✅ 已修复 | 禁用 torchvision.ops.nms，用 PyTorch 实现 |
| 2 | Vite ENOSPC 文件监听限制 | ✅ 已修复 | 提高 inotify 限制 + 忽略大目录 |
| 3 | Node.js 版本过低 (v12) | ✅ 已修复 | 使用预装 v18.19.0 ARM64 版本 |
| 4 | 前后端端口分离导致 API 404 | ✅ 已修复 | `apiRequest` 统一封装 + 动态 Base URL |
| 5 | HLS 流媒体路径错误 | ✅ 已修复 | 生产模式返回绝对 URL |
| 6 | OCR/CamelCase→Snake_case 映射 | ✅ 已修复 | `appStore.ts` 显式字段转换 |
| 7 | SQLite 偶发锁定 | ⚠️ 临时 | 重启服务解决，建议迁移 PostgreSQL |
| 8 | ROI 拼接图片模糊 | ⚠️ 待排查 | 需定位拼接/压缩代码 |
| 9 | PaddlePaddle GPU 编译 | ❓ 待确认 | `compile_paddle.sh`，需在 Jetson 上验证结果 |
| 10 | NDK 交叉编译 (Android 项目) | ✅ Mac 端已解决 | 使用 NDK 27 替代损坏的 NDK 25 |

---

## 8. 运维工作流

### 8.1 日常开发循环

```
1. 在 macOS 编辑代码
       │
2. 运行 ./sync_to_jetson.sh
       │
3. SSH 到 Jetson: ssh jetson
       │
4. 重启服务 或 等待热重载
       │
5. 浏览器访问 http://192.168.55.1:3005 验证
       │
6. 测试通过后 git commit + push
```

### 8.2 大文件传输

```bash
# 传输单个大文件到 Jetson
scp /path/to/large_file wenyili@192.168.55.1:~/downloads/

# 传输整个目录
scp -r /path/to/dir wenyili@192.168.55.1:~/projects/AI-Detection/
```

### 8.3 服务重启

```bash
# 方法 1: 使用启动脚本（自动清理旧进程）
bash ~/projects/AI-Detection/run_jetson_production.sh

# 方法 2: 使用 systemd（如果已安装）
systemctl --user restart ai-backend.service ai-frontend-spa.service
```

### 8.4 电量/温度管理

```bash
# 查看 Jetson 温度和功耗
sudo tegrastats

# 切换到低功耗模式
sudo nvpmodel -m 1  # 5W 模式
sudo nvpmodel -m 0  # MAXN 模式

# 节能建议: 不需要视觉检测时切到 minimal 模式
~/bin/jetson-mode minimal
```

### 8.5 Git 工作流建议

- **本地 Mac 仓库**: 所有代码变更在 macOS 上提交
- **Jetson 上只拉取**: `git pull` 只更新，不在 Jetson 上直接改代码
- **同步方向**: macOS → (rsync/git pull) → Jetson → (测试) → macOS (commit)

---

## 9. 附录：文件清单

以下脚本分布在两个位置：
- **工具目录** (`/Users/yiliwen/开发/SSH Jetson nano/`)：SSH 连接和 rsync 同步工具
- **项目根目录** (`AI检测React+Django/`)：部署、运行、安装脚本

部分脚本在两个目录均有副本（如 `sync_to_jetson.sh`），以工具目录版为准。

核心脚本清单：

| 文件 | 用途 | 运行环境 |
|------|------|----------|
| `connect.sh` | SSH 快速连接 | macOS |
| `ssh_jetson.sh` | SSH 备用连接 | macOS |
| `sync_to_jetson.sh` | Mac → Jetson rsync 同步 | macOS |
| `sync_from_jetson.sh` | Jetson → Mac rsync 同步 | macOS |
| `sync_and_push.sh` | 同步 + git 推送 | macOS |
| `upload_assets.sh` | 上传模型/视频资产 | macOS |
| `run_jetson_production.sh` | 生产模式启动 | Jetson |
| `run_jetson_simple.sh` | 轻量开发模式 | Jetson |
| `start_remote.sh` | 远程启动（本地调用） | macOS → Jetson |
| `install_jetson_mode_setup.sh` | 安装 systemd 服务 | Jetson |
| `jetson-mode.sh` | 模式切换 (full/minimal) | Jetson |
| `install_gpu_torch.sh` | GPU PyTorch 安装 | Jetson |
| `fix_torchvision.sh` | TorchVision 源码构建 | Jetson |
| `compile_paddle.sh` | PaddlePaddle GPU 编译 | Jetson |
| `install_rapidocr_v2.sh` | RapidOCR ONNX 安装 | Jetson |
| `setup_jetson.sh` | 初始环境配置 | Jetson |
| `serve_spa.py` | SPA 静态文件服务 | Jetson |
| `migrate_jetson_sd_to_ssd.sh` | SD→SSD 迁移 | Jetson |
| `restore_hdmi.sh` | HDMI 显示恢复 | Jetson |
| `ai-backend.service` | Django systemd 配置 | Jetson |
| `ai-frontend-spa.service` | React SPA systemd 配置 | Jetson |
| `patch_streams.py` | 流媒体补丁 | Jetson |
| `patch_tensorrt_priority.py` | TensorRT 优先级调整 | Jetson |
| `convert_to_tensorrt.py` | 模型→TensorRT 转换 | Jetson |
| `Jetson_Migration_Diff.md` | macOS→Jetson 变更汇总 | 参考 |
| `SESSION_2026-01-14.md` | 部署复盘记录 | 参考 |

---

> **本文档随项目演进持续更新。每次关键优化、问题修复后请同步更新本文档。**
