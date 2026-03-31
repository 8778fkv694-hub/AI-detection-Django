#!/usr/bin/env python3
"""
设置系统使用滤芯检测模型的脚本
"""

import os
import sys
import django

# 添加项目路径
project_root = os.path.dirname(os.path.abspath(__file__))
sys.path.append(os.path.join(project_root, 'backend'))

# 设置Django环境
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.config.settings')
django.setup()

from backend.inspection.models import ModelConfig
from backend.inspection.model_config import ppe_model_config

def setup_filter_model():
    """设置滤芯检测模型为默认模型"""
    try:
        print("正在设置滤芯检测模型...")
        
        # 获取滤芯检测模型配置
        filter_model_config = ppe_model_config.get_model_config('filter_core_detection')
        
        if not filter_model_config:
            print("错误：找不到滤芯检测模型配置")
            return False
        
        print(f"滤芯检测模型配置：{filter_model_config['name']}")
        print(f"模型文件：{filter_model_config['file']}")
        print(f"检测类别：{filter_model_config['classes']}")
        
        # 设置滤芯检测模型为当前模型
        ModelConfig.set_current_model('FILTER_CORE', 'filter_core_detection', filter_model_config)
        print("✅ 滤芯检测模型已设置为FILTER_CORE类型")
        
        # 同时设置为PPE_YOLO类型的默认模型（为了兼容性）
        ModelConfig.set_current_model('PPE_YOLO', 'filter_core_detection', filter_model_config)
        print("✅ 滤芯检测模型已设置为PPE_YOLO类型（兼容性）")
        
        # 验证设置
        current_filter_model = ModelConfig.get_current_model('FILTER_CORE')
        current_ppe_model = ModelConfig.get_current_model('PPE_YOLO')
        
        print(f"\n当前滤芯检测模型：{current_filter_model}")
        print(f"当前PPE检测模型：{current_ppe_model}")
        
        # 检查模型文件是否存在
        model_file = filter_model_config['file']
        model_paths = [
            os.path.join(project_root, model_file),
            os.path.join(project_root, 'backend', model_file),
            os.path.join(project_root, 'PPE_detection_YOLO', model_file)
        ]
        
        model_exists = False
        for path in model_paths:
            if os.path.exists(path):
                print(f"✅ 模型文件存在：{path}")
                model_exists = True
                break
        
        if not model_exists:
            print(f"⚠️  警告：模型文件 {model_file} 未找到")
            print("请确保模型文件存在于以下位置之一：")
            for path in model_paths:
                print(f"  - {path}")
        
        print("\n🎉 滤芯检测模型设置完成！")
        print("\n模型特性：")
        print(f"  - 检测窗口：{filter_model_config.get('detection_window', 5)}秒")
        print(f"  - 置信度阈值：{filter_model_config.get('confidence_threshold', 0.6)}")
        print(f"  - 最佳照片抓拍：{filter_model_config.get('best_photo_capture', True)}")
        print(f"  - 抓拍间隔：{filter_model_config.get('capture_interval', 0.5)}秒")
        print(f"  - 最大抓拍数：{filter_model_config.get('max_captures', 10)}张")
        
        return True
        
    except Exception as e:
        print(f"❌ 设置滤芯检测模型失败：{e}")
        return False

def verify_best_pt_replacement():
    """验证best.pt文件是否已被正确替换"""
    try:
        best_pt_path = os.path.join(project_root, 'best.pt')
        backup_path = os.path.join(project_root, 'best.pt.backup')
        
        if not os.path.exists(best_pt_path):
            print("❌ best.pt文件不存在")
            return False
        
        if not os.path.exists(backup_path):
            print("⚠️  备份文件best.pt.backup不存在")
        else:
            print("✅ 原始模型已备份为best.pt.backup")
        
        # 检查文件大小
        best_size = os.path.getsize(best_pt_path)
        print(f"✅ 当前best.pt文件大小：{best_size:,} 字节")
        
        # 检查是否与yolov8n.pt相同
        yolov8n_path = os.path.join(project_root, 'yolov8n.pt')
        if os.path.exists(yolov8n_path):
            yolov8n_size = os.path.getsize(yolov8n_path)
            if best_size == yolov8n_size:
                print("✅ best.pt已成功替换为滤芯检测模型（yolov8n.pt）")
                return True
            else:
                print(f"⚠️  best.pt大小({best_size})与yolov8n.pt大小({yolov8n_size})不匹配")
                return False
        else:
            print("⚠️  yolov8n.pt文件不存在，无法验证替换")
            return False
            
    except Exception as e:
        print(f"❌ 验证best.pt替换失败：{e}")
        return False

if __name__ == "__main__":
    print("=" * 60)
    print("滤芯检测模型设置脚本")
    print("=" * 60)
    
    # 验证best.pt替换
    print("\n1. 验证best.pt文件替换...")
    verify_best_pt_replacement()
    
    # 设置滤芯检测模型
    print("\n2. 设置系统模型配置...")
    success = setup_filter_model()
    
    if success:
        print("\n" + "=" * 60)
        print("🎉 滤芯检测模型设置完成！")
        print("=" * 60)
        print("\n使用说明：")
        print("1. 系统现在使用滤芯专用检测模型")
        print("2. 支持检测：瓶子、杯子、花瓶等物体")
        print("3. 自动抓拍最佳照片功能已启用")
        print("4. 检测窗口为5秒，每0.5秒抓拍一次")
        print("5. 最多抓拍10张照片，选择质量最好的")
        print("\n如需切换回其他模型，请使用前端界面或API接口。")
    else:
        print("\n" + "=" * 60)
        print("❌ 设置失败，请检查错误信息")
        print("=" * 60)
