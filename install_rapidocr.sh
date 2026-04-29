#!/bin/bash

# 1. 确保安装了基础依赖
sudo apt-get update
sudo apt-get install -y libpython3-dev python3-pip

# 2. 安装 ONNX Runtime GPU (针对 JetPack 6.0 / Python 3.10)
# NVIDIA 官方推荐直接从 PyPI 安装最新支持 JetPack 的版本，
# 或者从 Jetson Zoo 下载。对于 JetPack 6 (Orin)，通常可以直接 pip 安装。
echo "正在安装 onnxruntime-gpu..."
pip3 install onnxruntime-gpu --extra-index-url https://aiinfra.pkgs.visualstudio.com/PublicPackages/_packaging/onnxruntime-cuda-12/pypi/simple/

# 3. 安装 RapidOCR 及其依赖
echo "正在安装 RapidOCR..."
# rapidocr_onnxruntime 是 CPU/GPU 通用的包装器，关键看底层装的是 onnxruntime 还是 onnxruntime-gpu
pip3 install rapidocr_onnxruntime

echo "安装完成。正在验证 GPU 支持..."
python3 -c "import onnxruntime as ort; print(f'Available Providers: {ort.get_available_providers()}')"
