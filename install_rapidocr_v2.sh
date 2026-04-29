#!/bin/bash

# 修正：使用 echo 传递 sudo 密码
echo "Wyl2zlj1" | sudo -S apt-get update
echo "Wyl2zlj1" | sudo -S apt-get install -y libpython3-dev python3-pip

# 3. 安装 RapidOCR 及其依赖 (CPU/GPU 通用包)
# 先尝试安装 rapidocr_onnxruntime，它会自动拉取 onnxruntime。
# 但为了 GPU，我们需要手动替换成 onnxruntime-gpu
echo "正在安装 RapidOCR..."
pip3 install rapidocr_onnxruntime

# 2. 安装 ONNX Runtime GPU (Jetson 专用)
echo "正在尝试安装 Jetson 适配的 onnxruntime-gpu..."

# 方法 A: 尝试从 Jetson 专用源安装
pip3 install onnxruntime-gpu --extra-index-url https://pypi.jetson.ai

# 如果上面失败，尝试方法 B: 下载预编译的 wheel (适用于 JetPack 5/6)
# 这里假设一个常见的兼容版本，如果失败我们会根据报错调整
if ! python3 -c "import onnxruntime; print(onnxruntime.get_available_providers())" | grep -q "CUDAExecutionProvider"; then
    echo "从 PyPI 安装的可能不支持 CUDA，尝试从 dusty-nv 镜像源安装..."
    # 卸载可能错误的 CPU 版本
    pip3 uninstall -y onnxruntime onnxruntime-gpu
    
    # 尝试安装适用于 JetPack 6 的版本 (手动指定 wheel 地址往往最稳)
    # 注意：这里需要根据实际情况查找 EXACT URL，先尝试通用的 jetson-packages 源
    echo "Wyl2zlj1" | sudo -S pip3 install --upgrade pip
    pip3 install onnxruntime-gpu --index-url https://pypi.jetson-ai-lab.com
fi

echo "验证 GPU 支持..."
python3 -c "import onnxruntime as ort; print(f'Available Providers: {ort.get_available_providers()}')"
