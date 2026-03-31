#!/usr/bin/env python3
"""
模型验证脚本
用于验证训练好的模型是否正确包含自定义类别
"""

from ultralytics import YOLO
import os

def verify_model(model_path):
    """验证模型文件"""
    print(f"🔍 验证模型: {model_path}")
    print("=" * 50)
    
    # 检查文件是否存在
    if not os.path.exists(model_path):
        print(f"❌ 模型文件不存在: {model_path}")
        return False
    
    # 检查文件大小
    file_size = os.path.getsize(model_path)
    print(f"📁 文件大小: {file_size / (1024*1024):.1f} MB")
    
    try:
        # 加载模型
        model = YOLO(model_path)
        
        print(f"✅ 模型加载成功")
        print(f"📊 任务类型: {model.task}")
        print(f"📊 类别数量: {len(model.names)}")
        
        print("\n🎯 模型包含的类别:")
        for class_id, class_name in model.names.items():
            print(f"  {class_id}: {class_name}")
        
        # 检查是否包含预期的类别
        expected_classes = ['filter', 'filtername', 'nsplogo', 'qrcode']
        model_classes = list(model.names.values())
        
        print(f"\n🔍 验证结果:")
        all_present = True
        for expected_class in expected_classes:
            if expected_class in model_classes:
                print(f"  ✅ {expected_class} - 存在")
            else:
                print(f"  ❌ {expected_class} - 缺失")
                all_present = False
        
        if all_present:
            print(f"\n🎉 模型验证通过！包含所有预期的自定义类别")
            return True
        else:
            print(f"\n⚠️  模型验证失败！缺少预期的自定义类别")
            return False
            
    except Exception as e:
        print(f"❌ 模型加载失败: {e}")
        return False

def main():
    """主函数"""
    print("🚀 YOLOv8模型验证工具")
    print("=" * 50)
    
    # 验证多个可能的模型路径
    model_paths = [
        "runs/detect/train/weights/best.pt",
        "yolo_dataset_trainable/runs/detect/train2/weights/best.pt",
        "yolo_dataset_trainable/runs/detect/train/weights/best.pt"
    ]
    
    for model_path in model_paths:
        if os.path.exists(model_path):
            print(f"\n📁 检查路径: {model_path}")
            verify_model(model_path)
            print()
        else:
            print(f"⚠️  路径不存在: {model_path}")
    
    print("\n💡 使用建议:")
    print("1. 确保AI检测项目使用正确的模型文件路径")
    print("2. 检查AI检测项目的模型加载代码")
    print("3. 确保没有加载预训练的COCO模型")

if __name__ == "__main__":
    main()
