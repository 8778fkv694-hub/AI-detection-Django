#!/usr/bin/env python3
"""
PPE模型启动检查脚本
系统必须依赖PPE模型，此脚本用于在启动时验证PPE模型是否可用
"""

import os
import sys
import django

# 设置Django环境
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from inspection.yolo import validate_model_availability, get_ppe_model_info, get_model_status

def check_ppe_model():
    """
    检查PPE模型是否可用
    """
    print("=" * 60)
    print("PPE模型启动检查")
    print("=" * 60)
    
    # 获取PPE模型信息
    model_info = get_ppe_model_info()
    print(f"模型类型: {model_info['model_type']}")
    print(f"模型路径: {model_info['model_path']}")
    print(f"模型存在: {'✅' if model_info['model_exists'] else '❌'}")
    print(f"模型大小: {model_info['model_size'] / (1024*1024):.2f} MB" if model_info['model_exists'] else "模型不存在")
    print(f"是否必需: {'✅' if model_info['required'] else '❌'}")
    print(f"描述: {model_info['description']}")
    print()
    
    # 验证模型是否可用
    print("正在验证PPE模型...")
    try:
        is_available = validate_model_availability()
        if is_available:
            print("✅ PPE模型验证成功，系统可以正常启动")
            
            # 获取详细状态
            status_info = get_model_status()
            print(f"状态: {status_info['status']}")
            print(f"消息: {status_info['message']}")
            
            return True
        else:
            print("❌ PPE模型验证失败，系统无法启动")
            return False
    except Exception as e:
        print(f"❌ PPE模型验证异常: {str(e)}")
        return False

def main():
    """
    主函数
    """
    if not check_ppe_model():
        print("\n" + "=" * 60)
        print("❌ 系统启动失败")
        print("=" * 60)
        print("系统必须依赖PPE模型，但PPE模型不可用。")
        print("请检查以下项目:")
        print("1. PPE模型文件是否存在")
        print("2. PPE模型文件是否完整")
        print("3. 模型文件路径是否正确")
        print("4. 是否有足够的磁盘空间")
        print("5. 是否有读取权限")
        print("\n解决方案:")
        print("1. 将PPE模型文件放置在正确位置")
        print("2. 设置PPE_MODEL_PATH环境变量")
        print("3. 检查文件权限")
        print("4. 重新下载模型文件")
        sys.exit(1)
    else:
        print("\n" + "=" * 60)
        print("✅ 系统启动检查通过")
        print("=" * 60)
        print("PPE模型已就绪，系统可以正常运行")
        sys.exit(0)

if __name__ == "__main__":
    main()
