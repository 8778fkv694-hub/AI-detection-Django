#!/usr/bin/env python3
"""
YOLOv8模型测试脚本
测试训练好的模型在测试集上的性能
"""

import os
import cv2
import numpy as np
from ultralytics import YOLO
from pathlib import Path
import time

def test_model_on_images(model_path, test_images_dir, output_dir="test_results"):
    """在测试图片上测试模型"""
    print("🚀 YOLOv8模型测试")
    print("=" * 50)
    
    # 加载模型
    print(f"📁 加载模型: {model_path}")
    model = YOLO(model_path)
    
    # 显示模型信息
    print(f"✅ 模型加载成功")
    print(f"📊 任务类型: {model.task}")
    print(f"📊 类别数量: {len(model.names)}")
    print("🎯 可检测类别:")
    for class_id, class_name in model.names.items():
        print(f"  {class_id}: {class_name}")
    
    # 创建输出目录
    os.makedirs(output_dir, exist_ok=True)
    
    # 获取测试图片
    test_images = list(Path(test_images_dir).glob("*.jpg")) + list(Path(test_images_dir).glob("*.png"))
    print(f"\n📸 找到 {len(test_images)} 张测试图片")
    
    if not test_images:
        print("❌ 没有找到测试图片")
        return
    
    # 选择前5张图片进行测试
    test_images = test_images[:5]
    print(f"🔍 测试前 {len(test_images)} 张图片")
    
    # 统计结果
    total_detections = 0
    class_counts = {name: 0 for name in model.names.values()}
    
    for i, img_path in enumerate(test_images):
        print(f"\n📷 测试图片 {i+1}: {img_path.name}")
        
        # 进行检测
        start_time = time.time()
        results = model(str(img_path), conf=0.25)  # 置信度阈值0.25
        inference_time = time.time() - start_time
        
        # 处理结果
        result = results[0]
        boxes = result.boxes
        
        if boxes is not None and len(boxes) > 0:
            print(f"  ✅ 检测到 {len(boxes)} 个目标")
            print(f"  ⏱️  推理时间: {inference_time:.3f}秒")
            
            # 统计检测结果
            for box in boxes:
                class_id = int(box.cls[0])
                confidence = float(box.conf[0])
                class_name = model.names[class_id]
                
                print(f"    - {class_name}: {confidence:.3f}")
                class_counts[class_name] += 1
                total_detections += 1
        else:
            print(f"  ❌ 未检测到目标")
            print(f"  ⏱️  推理时间: {inference_time:.3f}秒")
        
        # 保存结果图片
        result_img = result.plot()
        output_path = os.path.join(output_dir, f"result_{img_path.stem}.jpg")
        cv2.imwrite(output_path, result_img)
        print(f"  💾 结果保存到: {output_path}")
    
    # 输出统计结果
    print(f"\n📊 测试结果统计")
    print("=" * 30)
    print(f"总检测数量: {total_detections}")
    print("各类别检测数量:")
    for class_name, count in class_counts.items():
        print(f"  {class_name}: {count}")
    
    print(f"\n💾 所有结果图片保存在: {output_dir}/")
    
    return {
        'total_detections': total_detections,
        'class_counts': class_counts,
        'test_images': len(test_images)
    }

def test_model_performance(model_path, test_images_dir):
    """测试模型性能指标"""
    print(f"\n🎯 模型性能测试")
    print("=" * 30)
    
    model = YOLO(model_path)
    
    # 在测试集上评估
    results = model.val(data='yolo_dataset_trainable/data.yaml', split='test')
    
    print(f"📊 测试集性能指标:")
    print(f"  mAP50: {results.box.map50:.3f}")
    print(f"  mAP50-95: {results.box.map:.3f}")
    print(f"  精确度: {results.box.mp:.3f}")
    print(f"  召回率: {results.box.mr:.3f}")

def main():
    """主函数"""
    model_path = "runs/detect/train/weights/best.pt"
    test_images_dir = "yolo_dataset_trainable/test/images"
    
    # 检查文件是否存在
    if not os.path.exists(model_path):
        print(f"❌ 模型文件不存在: {model_path}")
        return
    
    if not os.path.exists(test_images_dir):
        print(f"❌ 测试图片目录不存在: {test_images_dir}")
        return
    
    # 测试模型
    test_results = test_model_on_images(model_path, test_images_dir)
    
    # 性能测试
    try:
        test_model_performance(model_path, test_images_dir)
    except Exception as e:
        print(f"⚠️  性能测试失败: {e}")
    
    print(f"\n🎉 测试完成！")

if __name__ == "__main__":
    main()
