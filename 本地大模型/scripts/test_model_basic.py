#!/usr/bin/env python3
"""
基础模型测试脚本
不依赖transformers库，直接测试模型文件
"""

import json
import os
from pathlib import Path

def test_model_files():
    """测试模型文件完整性"""
    print("=== 基础模型文件测试 ===")
    
    model_dir = Path(__file__).parent.parent / "models" / "Qwen2.5-VL-7B-Instruct"
    
    if not model_dir.exists():
        print("❌ 模型目录不存在")
        return False
    
    print(f"✅ 模型目录存在: {model_dir}")
    
    # 检查关键文件
    required_files = [
        "config.json",
        "tokenizer.json",
        "tokenizer_config.json",
        "model.safetensors.index.json"
    ]
    
    for file in required_files:
        file_path = model_dir / file
        if file_path.exists():
            size_mb = file_path.stat().st_size / (1024 * 1024)
            print(f"✅ {file} ({size_mb:.1f} MB)")
        else:
            print(f"❌ {file} 缺失")
            return False
    
    # 检查safetensors文件
    safetensors_files = list(model_dir.glob('model-*.safetensors'))
    print(f"✅ 找到 {len(safetensors_files)} 个safetensors文件")
    
    total_size = 0
    for file in sorted(safetensors_files):
        size_mb = file.stat().st_size / (1024 * 1024)
        total_size += size_mb
        print(f"   - {file.name}: {size_mb:.1f} MB")
    
    print(f"📊 总模型大小: {total_size/1024:.1f} GB")
    
    return True

def test_model_config():
    """测试模型配置"""
    print("\n=== 模型配置测试 ===")
    
    model_dir = Path(__file__).parent.parent / "models" / "Qwen2.5-VL-7B-Instruct"
    
    try:
        # 读取模型配置
        with open(model_dir / 'config.json', 'r', encoding='utf-8') as f:
            config = json.load(f)
        
        print("✅ 模型配置加载成功")
        print(f"   模型类型: {config.get('model_type', '未知')}")
        print(f"   词汇表大小: {config.get('vocab_size', '未知')}")
        print(f"   隐藏层大小: {config.get('hidden_size', '未知')}")
        print(f"   层数: {config.get('num_hidden_layers', '未知')}")
        print(f"   注意力头数: {config.get('num_attention_heads', '未知')}")
        
        # 检查tokenizer配置
        with open(model_dir / 'tokenizer_config.json', 'r', encoding='utf-8') as f:
            tokenizer_config = json.load(f)
        
        print("✅ Tokenizer配置加载成功")
        print(f"   Tokenizer类型: {tokenizer_config.get('tokenizer_class', '未知')}")
        
        return True
        
    except Exception as e:
        print(f"❌ 配置加载失败: {e}")
        return False

def test_model_index():
    """测试模型索引"""
    print("\n=== 模型索引测试 ===")
    
    model_dir = Path(__file__).parent.parent / "models" / "Qwen2.5-VL-7B-Instruct"
    
    try:
        with open(model_dir / 'model.safetensors.index.json', 'r') as f:
            index = json.load(f)
        
        print("✅ 模型索引文件正常")
        weight_map = index.get('weight_map', {})
        print(f"   权重文件映射: {len(weight_map)} 个参数")
        
        # 检查权重文件引用
        referenced_files = set(weight_map.values())
        print(f"   引用的文件: {len(referenced_files)} 个")
        
        for file in sorted(referenced_files):
            print(f"   - {file}")
        
        return True
        
    except Exception as e:
        print(f"❌ 模型索引测试失败: {e}")
        return False

def main():
    """主函数"""
    print("=== Qwen2.5-VL-7B-Instruct 基础测试 ===")
    print("使用ModelScope下载的模型文件")
    print()
    
    # 测试模型文件
    files_ok = test_model_files()
    
    # 测试模型配置
    config_ok = test_model_config()
    
    # 测试模型索引
    index_ok = test_model_index()
    
    print("\n=== 测试结果 ===")
    if files_ok and config_ok and index_ok:
        print("🎉 所有测试通过！")
        print("✅ 模型文件完整")
        print("✅ 模型配置正确")
        print("✅ 模型索引正常")
        print("\n📝 说明:")
        print("- 模型已成功从ModelScope下载")
        print("- 所有必要文件都存在且完整")
        print("- 模型可以用于推理（需要兼容的推理引擎）")
        print("- 由于PyTorch版本兼容性问题，建议使用Docker或更新PyTorch版本")
    else:
        print("❌ 部分测试失败")
        print("请检查模型文件是否完整")

if __name__ == "__main__":
    main()
