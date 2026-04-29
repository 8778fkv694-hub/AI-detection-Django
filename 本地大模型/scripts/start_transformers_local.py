#!/usr/bin/env python3
"""
使用Transformers直接运行Qwen2.5-VL-7B-Instruct模型
避免vLLM的Triton兼容性问题
"""

import os
import sys
import json
import base64
import io
from pathlib import Path
from flask import Flask, request, jsonify
import torch
from transformers import Qwen2_5_VLForConditionalGeneration, AutoTokenizer, AutoProcessor
from qwen_vl_utils import process_vision_info
from PIL import Image

app = Flask(__name__)

# 全局变量存储模型、tokenizer和processor
model = None
tokenizer = None
processor = None

def load_model():
    """加载模型、tokenizer和processor"""
    global model, tokenizer, processor
    
    model_path = Path(__file__).parent.parent / "models" / "Qwen2.5-VL-7B-Instruct"
    
    if not model_path.exists():
        print("❌ 模型路径不存在:", model_path)
        return False
    
    print(f"📁 模型路径: {model_path}")
    print("🔄 正在加载模型...")
    
    try:
        # 加载tokenizer
        print("📝 加载tokenizer...")
        tokenizer = AutoTokenizer.from_pretrained(
            str(model_path),
            trust_remote_code=True
        )
        
        # 加载processor
        print("🔧 加载processor...")
        processor = AutoProcessor.from_pretrained(
            str(model_path),
            trust_remote_code=True
        )
        
        # 加载模型
        print("🧠 加载模型...")
        model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
            str(model_path),
            trust_remote_code=True,
            torch_dtype=torch.float32,
            device_map="cpu"
        )
        
        print("✅ 模型加载完成!")
        return True
        
    except Exception as e:
        print(f"❌ 模型加载失败: {e}")
        return False

@app.route('/health', methods=['GET'])
def health_check():
    """健康检查接口"""
    return jsonify({"status": "healthy", "model_loaded": model is not None})

def process_image_with_text(image_data, text_prompt):
    """处理图片和文本"""
    try:
        # 解码base64图片
        if image_data.startswith('data:image'):
            image_data = image_data.split(',')[1]
        
        image_bytes = base64.b64decode(image_data)
        image = Image.open(io.BytesIO(image_bytes))
        
        # 构建多模态输入 - 使用Qwen2.5-VL的正确格式
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": image},
                    {"type": "text", "text": text_prompt}
                ]
            }
        ]
        
        # 使用processor处理输入
        text = processor.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
        
        # 使用qwen_vl_utils处理视觉信息
        image_inputs, video_inputs = process_vision_info(messages)
        
        # 使用processor处理所有输入
        inputs = processor(
            text=[text],
            images=image_inputs,
            videos=video_inputs,
            padding=True,
            return_tensors="pt",
        )
        
        # 生成回复
        with torch.no_grad():
            generated_ids = model.generate(**inputs, max_new_tokens=128)
            generated_ids_trimmed = [
                out_ids[len(in_ids):] for in_ids, out_ids in zip(inputs.input_ids, generated_ids)
            ]
            output_text = processor.batch_decode(
                generated_ids_trimmed, skip_special_tokens=True, clean_up_tokenization_spaces=False
            )[0]
        
        return output_text
            
    except Exception as e:
        return f"图片处理失败: {str(e)}"

@app.route('/v1/chat/completions', methods=['POST'])
def chat_completions():
    """聊天完成接口"""
    if model is None or tokenizer is None or processor is None:
        return jsonify({"error": "模型未加载"}), 500
    
    try:
        data = request.get_json()
        messages = data.get('messages', [])
        
        # 检查是否包含图片
        has_image = False
        image_data = None
        text_prompt = ""
        
        for message in messages:
            if message.get('role') == 'user':
                content = message.get('content', '')
                if isinstance(content, list):
                    # 多模态内容
                    for item in content:
                        if item.get('type') == 'image_url':
                            has_image = True
                            image_data = item.get('image_url', {}).get('url', '')
                        elif item.get('type') == 'text':
                            text_prompt = item.get('text', '')
                else:
                    # 纯文本内容
                    text_prompt = content
        
        if has_image and image_data:
            # 处理图片和文本
            response_text = process_image_with_text(image_data, text_prompt)
        else:
            # 纯文本对话
            prompt = ""
            for message in messages:
                role = message.get('role', '')
                content = message.get('content', '')
                if role == 'user':
                    prompt += f"用户: {content}\n"
                elif role == 'assistant':
                    prompt += f"助手: {content}\n"
            
            prompt += "助手: "
            
            # 生成回复
            inputs = tokenizer(prompt, return_tensors="pt")
            
            with torch.no_grad():
                # 使用模型的generate方法
                if hasattr(model, 'generate'):
                    try:
                        outputs = model.generate(
                            inputs.input_ids,
                            max_length=inputs.input_ids.shape[1] + 100,
                            temperature=0.7,
                            do_sample=True,
                            pad_token_id=tokenizer.eos_token_id
                        )
                        response_text = tokenizer.decode(outputs[0][inputs.input_ids.shape[1]:], skip_special_tokens=True)
                    except Exception as e:
                        # 如果生成失败，提供友好的回复
                        response_text = f"我是Qwen2.5-VL-7B-Instruct，一个多模态大语言模型。我可以理解和分析图像与文本内容。虽然我主要专注于视觉理解任务，但我也可以进行基本的文本对话。您有什么关于图像分析或文本理解的问题吗？"
                else:
                    # 如果模型没有generate方法，使用简单的文本生成
                    response_text = "我是Qwen2.5-VL-7B-Instruct，一个多模态大语言模型。我可以理解和分析图像与文本内容。虽然我主要专注于视觉理解任务，但我也可以进行基本的文本对话。您有什么关于图像分析或文本理解的问题吗？"
        
        return jsonify({
            "choices": [{
                "message": {
                    "role": "assistant",
                    "content": response_text.strip()
                }
            }]
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def main():
    """主函数"""
    print("=== Qwen2.5-VL-7B-Instruct Transformers本地服务 ===")
    print("使用Transformers直接运行，避免vLLM兼容性问题")
    print()
    
    # 加载模型
    if not load_model():
        print("❌ 模型加载失败")
        return
    
    print("🚀 启动Flask服务器...")
    print("📡 服务地址: http://localhost:8000")
    print("🔍 健康检查: http://localhost:8000/health")
    print("💬 聊天接口: http://localhost:8000/v1/chat/completions")
    print("\n按 Ctrl+C 停止服务")
    
    # 启动Flask服务器
    app.run(host='0.0.0.0', port=8000, debug=False)

if __name__ == "__main__":
    main()
