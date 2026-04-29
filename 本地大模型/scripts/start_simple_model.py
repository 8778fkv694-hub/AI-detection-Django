#!/usr/bin/env python3
"""
简单的模型服务启动脚本
使用transformers库直接加载模型
"""

import os
import sys
import json
from pathlib import Path
from flask import Flask, request, jsonify
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

app = Flask(__name__)

# 全局变量存储模型和tokenizer
model = None
tokenizer = None

def load_model():
    """加载模型和tokenizer"""
    global model, tokenizer
    
    model_path = Path(__file__).parent.parent / "models" / "Qwen2.5-VL-7B-Instruct"
    
    print(f"正在加载模型: {model_path}")
    
    try:
        # 加载tokenizer
        print("加载tokenizer...")
        tokenizer = AutoTokenizer.from_pretrained(
            str(model_path), 
            trust_remote_code=True
        )
        print("✅ Tokenizer加载成功")
        
        # 加载模型（使用CPU）
        print("加载模型...")
        model = AutoModelForCausalLM.from_pretrained(
            str(model_path),
            trust_remote_code=True,
            torch_dtype=torch.float32,  # 使用float32以兼容CPU
            device_map="cpu",
            low_cpu_mem_usage=True
        )
        print("✅ 模型加载成功")
        
        return True
        
    except Exception as e:
        print(f"❌ 模型加载失败: {e}")
        return False

@app.route('/health', methods=['GET'])
def health():
    """健康检查"""
    return jsonify({"status": "healthy", "model_loaded": model is not None})

@app.route('/chat', methods=['POST'])
def chat():
    """聊天接口"""
    if model is None or tokenizer is None:
        return jsonify({"error": "模型未加载"}), 500
    
    try:
        data = request.get_json()
        message = data.get('message', '')
        
        if not message:
            return jsonify({"error": "消息不能为空"}), 400
        
        # 编码输入
        inputs = tokenizer.encode(message, return_tensors="pt")
        
        # 生成回复
        with torch.no_grad():
            outputs = model.generate(
                inputs,
                max_length=inputs.shape[1] + 100,
                num_return_sequences=1,
                temperature=0.7,
                do_sample=True,
                pad_token_id=tokenizer.eos_token_id
            )
        
        # 解码输出
        response = tokenizer.decode(outputs[0], skip_special_tokens=True)
        
        # 移除输入部分，只返回生成的部分
        if response.startswith(message):
            response = response[len(message):].strip()
        
        return jsonify({
            "response": response,
            "input": message
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/info', methods=['GET'])
def info():
    """模型信息"""
    if model is None:
        return jsonify({"error": "模型未加载"}), 500
    
    return jsonify({
        "model_name": "Qwen2.5-VL-7B-Instruct",
        "model_type": "qwen2_5_vl",
        "device": "cpu",
        "status": "ready"
    })

def main():
    """主函数"""
    print("=== Qwen2.5-VL-7B-Instruct 简单模型服务 ===")
    
    # 加载模型
    if not load_model():
        print("模型加载失败，服务启动中止")
        return
    
    print("🚀 模型服务启动中...")
    print("📡 服务地址: http://localhost:8001")
    print("🔍 健康检查: http://localhost:8001/health")
    print("💬 聊天接口: http://localhost:8001/chat")
    print("ℹ️  模型信息: http://localhost:8001/info")
    print("\n按 Ctrl+C 停止服务")
    
    # 启动Flask服务
    app.run(host='0.0.0.0', port=8001, debug=False)

if __name__ == "__main__":
    main()
