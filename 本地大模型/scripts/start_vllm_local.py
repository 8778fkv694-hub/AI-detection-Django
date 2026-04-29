#!/usr/bin/env python3
"""
使用vLLM本地启动Qwen2.5-VL-7B-Instruct模型服务
"""

import os
import sys
import subprocess
from pathlib import Path

def start_vllm_server():
    """启动vLLM服务器"""
    print("=== 启动vLLM本地服务器 ===")
    
    model_path = Path(__file__).parent.parent / "models" / "Qwen2.5-VL-7B-Instruct"
    
    if not model_path.exists():
        print("❌ 模型路径不存在:", model_path)
        return False
    
    print(f"📁 模型路径: {model_path}")
    print("🚀 正在启动vLLM服务器...")
    
    # 构建vLLM启动命令 - 使用最简配置避免Triton问题
    cmd = [
        "python3", "-m", "vllm.entrypoints.openai.api_server",
        "--model", str(model_path),
        "--host", "0.0.0.0",
        "--port", "8000",
        "--trust-remote-code",
        "--served-model-name", "Qwen/Qwen2.5-VL-7B-Instruct",
        "--enforce-eager",
        "--max-num-batched-tokens", "128",
        "--max-model-len", "128",
        "--cpu-offload-gb", "0.5",
        "--dtype", "float32"
    ]
    
    print("🔧 启动命令:")
    print(" ".join(cmd))
    print()
    
    try:
        # 启动vLLM服务器
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            universal_newlines=True,
            bufsize=1
        )
        
        print("✅ vLLM服务器启动中...")
        print("📡 服务地址: http://localhost:8000")
        print("🔍 健康检查: http://localhost:8000/health")
        print("💬 聊天接口: http://localhost:8000/v1/chat/completions")
        print("\n按 Ctrl+C 停止服务")
        
        # 实时输出日志
        for line in process.stdout:
            print(line.rstrip())
            
    except KeyboardInterrupt:
        print("\n🛑 正在停止vLLM服务器...")
        process.terminate()
        process.wait()
        print("✅ 服务器已停止")
    except Exception as e:
        print(f"❌ 启动失败: {e}")
        return False
    
    return True

def test_vllm_connection():
    """测试vLLM连接"""
    import requests
    import time
    
    print("🧪 测试vLLM连接...")
    
    # 等待服务器启动
    for i in range(30):
        try:
            response = requests.get("http://localhost:8000/health", timeout=5)
            if response.status_code == 200:
                print("✅ vLLM服务器连接成功!")
                return True
        except:
            pass
        
        print(f"⏳ 等待服务器启动... ({i+1}/30)")
        time.sleep(2)
    
    print("❌ vLLM服务器连接超时")
    return False

def main():
    """主函数"""
    print("=== Qwen2.5-VL-7B-Instruct vLLM本地服务 ===")
    print("使用ModelScope下载的模型文件")
    print()
    
    # 检查模型文件
    model_path = Path(__file__).parent.parent / "models" / "Qwen2.5-VL-7B-Instruct"
    if not model_path.exists():
        print("❌ 模型文件不存在，请先下载模型")
        return
    
    # 启动vLLM服务器
    if start_vllm_server():
        print("🎉 vLLM服务器启动完成!")
    else:
        print("❌ vLLM服务器启动失败")

if __name__ == "__main__":
    main()
