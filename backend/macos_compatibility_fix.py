#!/usr/bin/env python3
"""
macOS PyTorch兼容性修复脚本
解决PyTorch 2.8+在macOS上的模型加载问题
"""

import os
import sys
import importlib
import warnings

def fix_pytorch_macos_compatibility():
    """
    修复PyTorch在macOS上的兼容性问题
    """
    print("正在修复macOS PyTorch兼容性问题...")
    
    # 设置环境变量
    os.environ["TORCH_LOAD_SAFE"] = "true"
    os.environ["TORCH_WEIGHTS_ONLY"] = "false"
    os.environ["TORCH_SERIALIZATION_WEIGHTS_ONLY"] = "false"
    os.environ["ULTRALYTICS_CACHE_DIR"] = "/tmp/ultralytics_cache"
    os.environ["ULTRALYTICS_HOME"] = "/tmp/ultralytics_home"
    
    # 设置PyTorch缓存目录
    try:
        import torch
        torch.hub.set_dir('/tmp/torch_hub')
        print("✅ PyTorch缓存目录设置成功")
    except Exception as e:
        print(f"⚠️ PyTorch缓存目录设置失败: {e}")
    
    # 修复torch.load函数
    try:
        import torch
        import torch.serialization
        
        # 确保torch.load函数正确初始化
        if not hasattr(torch.load, '__module__'):
            # 重新导入torch
            importlib.reload(torch)
            print("✅ PyTorch重新加载成功")
        else:
            print("✅ PyTorch已正确初始化")
            
    except Exception as e:
        print(f"⚠️ PyTorch初始化修复失败: {e}")
    
    # 设置ultralytics兼容性
    try:
        import ultralytics
        # 重新导入ultralytics以确保使用新的环境变量
        importlib.reload(ultralytics)
        print("✅ Ultralytics重新加载成功")
    except Exception as e:
        print(f"⚠️ Ultralytics重新加载失败: {e}")
    
    print("macOS兼容性修复完成")

def test_model_loading():
    """
    测试模型加载是否正常
    """
    print("\n正在测试模型加载...")
    
    try:
        from ultralytics import YOLO
        
        # 测试在线模型加载
        print("测试在线模型加载...")
        model = YOLO('yolov8n.pt')
        print("✅ 在线模型加载成功")
        
        # 测试本地PPE模型加载
        ppe_model_path = os.path.join(os.path.dirname(__file__), 'ppe_detection.pt')
        if os.path.exists(ppe_model_path):
            print("测试本地PPE模型加载...")
            ppe_model = YOLO(ppe_model_path)
            print("✅ 本地PPE模型加载成功")
        else:
            print("⚠️ 本地PPE模型文件不存在")
            
        return True
        
    except Exception as e:
        print(f"❌ 模型加载测试失败: {e}")
        return False

if __name__ == '__main__':
    # 修复兼容性问题
    fix_pytorch_macos_compatibility()
    
    # 测试模型加载
    if test_model_loading():
        print("\n🎉 macOS兼容性修复成功！")
    else:
        print("\n❌ macOS兼容性修复失败，请检查错误信息")
