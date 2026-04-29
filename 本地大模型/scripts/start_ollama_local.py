#!/usr/bin/env python3
"""
使用Ollama启动Qwen2.5-VL-7B-Instruct模型
"""

import os
import sys
import subprocess
import time
import requests
from pathlib import Path

def check_ollama_installed():
    """检查Ollama是否已安装"""
    try:
        result = subprocess.run(['ollama', '--version'], capture_output=True, text=True)
        if result.returncode == 0:
            print(f"✅ Ollama已安装: {result.stdout.strip()}")
            return True
        else:
            print("❌ Ollama未正确安装")
            return False
    except FileNotFoundError:
        print("❌ Ollama未安装，请先安装Ollama")
        print("安装命令: brew install ollama")
        return False

def create_modelfile():
    """创建Modelfile"""
    model_path = Path(__file__).parent.parent / "models" / "Qwen2.5-VL-7B-Instruct"
    modelfile_path = Path(__file__).parent.parent / "Modelfile"
    
    if not model_path.exists():
        print(f"❌ 模型路径不存在: {model_path}")
        return False
    
    modelfile_content = f'''FROM {model_path}

# 设置模型参数
PARAMETER temperature 0.7
PARAMETER top_p 0.9
PARAMETER top_k 40
PARAMETER repeat_penalty 1.1

# 设置系统提示词
SYSTEM """你是Qwen2.5-VL-7B-Instruct，一个强大的多模态大语言模型。你可以理解和分析图像与文本内容，特别擅长视觉理解任务。请用中文回答用户的问题。"""

# 设置模板
TEMPLATE """{{{{ if .System }}}}<|im_start|>system
{{{{ .System }}}}<|im_end|>
{{{{ end }}}}{{{{ if .Prompt }}}}<|im_start|>user
{{{{ .Prompt }}}}<|im_end|>
{{{{ end }}}}<|im_start|>assistant
{{{{ .Response }}}}<|im_end|>"""'''
    
    with open(modelfile_path, 'w', encoding='utf-8') as f:
        f.write(modelfile_content)
    
    print(f"✅ Modelfile已创建: {modelfile_path}")
    return True

def build_model():
    """构建Ollama模型"""
    print("🔨 正在构建Ollama模型...")
    try:
        # 切换到模型目录
        model_dir = Path(__file__).parent.parent
        result = subprocess.run(
            ['ollama', 'create', 'qwen2.5-vl-7b', '-f', 'Modelfile'],
            cwd=model_dir,
            capture_output=True,
            text=True
        )
        
        if result.returncode == 0:
            print("✅ 模型构建成功!")
            return True
        else:
            print(f"❌ 模型构建失败: {result.stderr}")
            return False
    except Exception as e:
        print(f"❌ 构建过程出错: {e}")
        return False

def start_ollama_server():
    """启动Ollama服务器"""
    print("🚀 启动Ollama服务器...")
    try:
        # 启动Ollama服务
        process = subprocess.Popen(
            ['ollama', 'serve'],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        
        # 等待服务启动
        time.sleep(3)
        
        # 检查服务是否启动
        try:
            response = requests.get('http://localhost:11434/api/tags', timeout=5)
            if response.status_code == 200:
                print("✅ Ollama服务器启动成功!")
                print("📡 服务地址: http://localhost:11434")
                print("💬 聊天接口: http://localhost:11434/api/chat")
                print("🔍 模型列表: http://localhost:11434/api/tags")
                return True
            else:
                print("❌ Ollama服务器启动失败")
                return False
        except requests.exceptions.RequestException:
            print("❌ 无法连接到Ollama服务器")
            return False
            
    except Exception as e:
        print(f"❌ 启动Ollama服务器失败: {e}")
        return False

def test_model():
    """测试模型"""
    print("🧪 测试模型...")
    try:
        data = {
            "model": "qwen2.5-vl-7b",
            "messages": [
                {
                    "role": "user",
                    "content": "你好，请介绍一下你自己"
                }
            ],
            "stream": False
        }
        
        response = requests.post(
            'http://localhost:11434/api/chat',
            json=data,
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            print("✅ 模型测试成功!")
            print(f"AI回复: {result['message']['content']}")
            return True
        else:
            print(f"❌ 模型测试失败: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ 测试过程出错: {e}")
        return False

def main():
    """主函数"""
    print("=== Qwen2.5-VL-7B-Instruct Ollama本地服务 ===")
    print("使用Ollama运行模型，提供更好的性能和稳定性")
    print()
    
    # 检查Ollama
    if not check_ollama_installed():
        return
    
    # 创建Modelfile
    if not create_modelfile():
        return
    
    # 构建模型
    if not build_model():
        return
    
    # 启动服务器
    if not start_ollama_server():
        return
    
    # 测试模型
    if not test_model():
        return
    
    print("\n🎉 Ollama服务启动完成!")
    print("按 Ctrl+C 停止服务")
    
    try:
        # 保持服务运行
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n👋 服务已停止")

if __name__ == "__main__":
    main()
