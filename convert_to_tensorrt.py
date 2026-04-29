#!/usr/bin/env python3
"""
将 YOLO .pt 模型转换为 TensorRT .engine 格式
在 Jetson 上运行此脚本可获得最佳推理性能

使用方法:
    python3 convert_to_tensorrt.py [模型路径] [--half] [--imgsz 640]
    
    例如:
    python3 convert_to_tensorrt.py models/waterprifer.pt --half --imgsz 640
    
    或者转换所有模型:
    python3 convert_to_tensorrt.py --all
"""

import os
import sys
import argparse
from pathlib import Path

def convert_model(model_path: str, half: bool = True, imgsz: int = 640):
    """
    将单个 .pt 模型转换为 TensorRT .engine 格式
    
    Args:
        model_path: .pt 模型文件路径
        half: 是否使用 FP16 精度（推荐，速度更快且节省显存）
        imgsz: 输入图像大小
    """
    try:
        from ultralytics import YOLO
    except ImportError:
        print("❌ 错误: 请先安装 ultralytics: pip install ultralytics")
        return False
    
    model_path = Path(model_path)
    if not model_path.exists():
        print(f"❌ 模型文件不存在: {model_path}")
        return False
    
    if model_path.suffix != '.pt':
        print(f"⚠️ 跳过非 .pt 文件: {model_path}")
        return False
    
    # 跳过 macOS 的 ._ 隐藏文件
    if model_path.name.startswith('._'):
        return False
    
    engine_path = model_path.with_suffix('.engine')
    
    print(f"\n{'='*60}")
    print(f"🔄 正在转换: {model_path.name}")
    print(f"   输出文件: {engine_path.name}")
    print(f"   FP16 精度: {'是' if half else '否'}")
    print(f"   输入尺寸: {imgsz}x{imgsz}")
    print(f"{'='*60}")
    
    try:
        # 加载 PyTorch 模型
        model = YOLO(str(model_path))
        
        # 导出为 TensorRT 格式
        # Ultralytics YOLO 会自动处理 ONNX 中间步骤
        export_path = model.export(
            format='engine',  # TensorRT 格式
            half=half,        # FP16 精度
            imgsz=imgsz,      # 输入图像大小
            device=0,         # 使用 GPU 0
            simplify=True,    # 简化 ONNX 图
            workspace=4,      # TensorRT 工作空间大小 (GB)
        )
        
        print(f"✅ 转换成功: {export_path}")
        return True
        
    except Exception as e:
        print(f"❌ 转换失败: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description='将 YOLO .pt 模型转换为 TensorRT .engine 格式')
    parser.add_argument('model', nargs='?', help='.pt 模型文件路径')
    parser.add_argument('--all', action='store_true', help='转换 models/ 目录下的所有 .pt 文件')
    parser.add_argument('--half', action='store_true', default=True, help='使用 FP16 精度 (默认: True)')
    parser.add_argument('--no-half', dest='half', action='store_false', help='使用 FP32 精度')
    parser.add_argument('--imgsz', type=int, default=640, help='输入图像大小 (默认: 640)')
    parser.add_argument('--models-dir', type=str, default='models', help='模型目录 (默认: models)')
    
    args = parser.parse_args()
    
    if args.all:
        # 转换目录下的所有模型
        models_dir = Path(args.models_dir)
        if not models_dir.exists():
            print(f"❌ 模型目录不存在: {models_dir}")
            sys.exit(1)
        
        pt_files = list(models_dir.glob('*.pt'))
        # 过滤掉 macOS 隐藏文件
        pt_files = [f for f in pt_files if not f.name.startswith('._')]
        
        if not pt_files:
            print(f"⚠️ 在 {models_dir} 中未找到 .pt 文件")
            sys.exit(1)
        
        print(f"📦 找到 {len(pt_files)} 个模型文件待转换:")
        for f in pt_files:
            print(f"   - {f.name}")
        
        success_count = 0
        for pt_file in pt_files:
            if convert_model(str(pt_file), half=args.half, imgsz=args.imgsz):
                success_count += 1
        
        print(f"\n{'='*60}")
        print(f"🎉 转换完成: {success_count}/{len(pt_files)} 个模型成功")
        print(f"{'='*60}")
        
    elif args.model:
        # 转换单个模型
        success = convert_model(args.model, half=args.half, imgsz=args.imgsz)
        sys.exit(0 if success else 1)
    else:
        parser.print_help()
        sys.exit(1)

if __name__ == '__main__':
    main()
