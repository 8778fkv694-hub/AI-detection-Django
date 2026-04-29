# 本地大模型项目

本项目用于部署和运行Qwen2.5-VL-7B-Instruct多模态大模型。

## 项目结构

```
本地大模型/
├── models/                    # 模型文件存储
├── scripts/                   # 启动和管理脚本
│   ├── start_model.py         # 直接启动模型服务（需要安装vLLM）
│   ├── start_docker_model.py  # Docker启动模型服务
│   ├── install_dependencies.py # 安装依赖
│   └── quick_start.sh         # 快速启动脚本
├── config/                    # 配置文件
├── logs/                      # 日志文件
├── test/                      # 测试文件
│   └── test_api.py            # API测试脚本
├── docker-compose.yml         # Docker配置
├── requirements.txt           # Python依赖
└── README.md                  # 项目说明
```

## 快速开始

### 第一步：下载模型文件

**重要：首次使用必须先下载模型文件（约14GB）**

#### 安装ModelScope
```bash
pip install modelscope
```

#### 下载方式选择

**方法1：一键设置（推荐）**
```bash
cd 本地大模型
./scripts/setup_model.sh
```

**方法2：使用ModelScope下载（推荐）**
```bash
cd 本地大模型
python3 scripts/download_modelscope.py
```

**方法3：传统Hugging Face下载**
```bash
cd 本地大模型
python3 scripts/download_model.py
```

**方法4：命令行直接下载**
```bash
# 下载完整模型库
modelscope download --model Qwen/Qwen2.5-VL-7B-Instruct

# 下载单个文件到指定目录
modelscope download --model Qwen/Qwen2.5-VL-7B-Instruct README.md --local_dir ./dir

# Git下载（需要先安装git lfs）
git lfs install
git clone https://www.modelscope.cn/Qwen/Qwen2.5-VL-7B-Instruct.git
```

**检查模型状态**：
```bash
python3 scripts/check_model.py
```

### 第二步：启动服务

#### 方法1：使用Docker（推荐）

1. **确保Docker已安装**：
   - 下载并安装 [Docker Desktop](https://www.docker.com/products/docker-desktop)

2. **快速启动**：
```bash
./scripts/quick_start.sh
```

#### 方法2：直接安装vLLM

1. **安装依赖**：
```bash
python3 scripts/install_dependencies.py
```

2. **启动模型服务**：
```bash
python3 scripts/start_model.py
```

### 第三步：测试API

启动服务后，在另一个终端运行：
```bash
python3 test/test_api.py
```

## 模型信息

- **模型名称**：Qwen/Qwen2.5-VL-7B-Instruct
- **模型类型**：多模态（文本+图像）
- **服务端口**：8000
- **API格式**：OpenAI兼容

## API使用示例

### 文本对话
```bash
curl -X POST "http://localhost:8000/v1/chat/completions" \
  -H "Content-Type: application/json" \
  --data '{
    "model": "Qwen/Qwen2.5-VL-7B-Instruct",
    "messages": [
      {
        "role": "user",
        "content": "你好，请介绍一下你自己。"
      }
    ]
  }'
```

### 图像分析
```bash
curl -X POST "http://localhost:8000/v1/chat/completions" \
  -H "Content-Type: application/json" \
  --data '{
    "model": "Qwen/Qwen2.5-VL-7B-Instruct",
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "请描述这张图片。"
          },
          {
            "type": "image_url",
            "image_url": {
              "url": "https://example.com/image.jpg"
            }
          }
        ]
      }
    ]
  }'
```

## 与主项目集成

此本地大模型可以与主AI检测项目集成，提供更强大的图像分析和文本处理能力。

## 注意事项

- 首次运行需要下载模型文件，可能需要较长时间
- 确保有足够的磁盘空间（模型约14GB）
- 建议使用GPU加速以获得更好的性能
- 如果遇到内存不足，可以调整Docker的内存限制