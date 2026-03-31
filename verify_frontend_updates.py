#!/usr/bin/env python3
"""
验证前端检测目标更新
"""

import os
import re

def check_frontend_updates():
    """检查前端文件中的检测目标更新"""
    
    print("=" * 60)
    print("前端检测目标更新验证")
    print("=" * 60)
    
    # 需要检查的文件
    files_to_check = [
        'src/screens/OCRDetectionScreen.tsx',
        'src/screens/OCRTestScreen.tsx', 
        'src/screens/LiveInspectionScreen.tsx'
    ]
    
    # 需要查找的模式
    patterns = {
        'getTargetChineseName': r'getTargetChineseName.*?\{([^}]+)\}',
        'getAvailableTargets': r'getAvailableTargets.*?\{([^}]+)\}',
        'detectionTargets': r'detectionTargets.*?\[([^\]]+)\]'
    }
    
    # 期望的自定义类别
    expected_custom_classes = ['filter', 'filtername', 'nsplogo', 'qrcode']
    expected_chinese_names = ['过滤器', '过滤器名称', 'NSP标志', '二维码']
    
    all_good = True
    
    for file_path in files_to_check:
        if not os.path.exists(file_path):
            print(f"❌ 文件不存在: {file_path}")
            all_good = False
            continue
            
        print(f"\\n📁 检查文件: {file_path}")
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # 检查getTargetChineseName函数
            if 'getTargetChineseName' in content:
                print("  ✅ 包含getTargetChineseName函数")
                
                # 检查是否包含自定义类别的中文名称
                for chinese_name in expected_chinese_names:
                    if chinese_name in content:
                        print(f"    ✅ 包含中文名称: {chinese_name}")
                    else:
                        print(f"    ❌ 缺少中文名称: {chinese_name}")
                        all_good = False
            
            # 检查getAvailableTargets函数
            if 'getAvailableTargets' in content:
                print("  ✅ 包含getAvailableTargets函数")
                
                # 检查filter_core_detection的返回值
                if 'filter_core_detection' in content:
                    # 查找返回的类别数组
                    if "['filter', 'filtername', 'nsplogo', 'qrcode']" in content:
                        print("    ✅ filter_core_detection返回正确的4个类别")
                    else:
                        print("    ❌ filter_core_detection未返回正确的4个类别")
                        all_good = False
            
            # 检查detectionTargets数组（LiveInspectionScreen）
            if 'detectionTargets' in content:
                print("  ✅ 包含detectionTargets数组")
                
                # 检查是否包含自定义类别
                for custom_class in expected_custom_classes:
                    if f"'{custom_class}'" in content:
                        print(f"    ✅ 包含类别: {custom_class}")
                    else:
                        print(f"    ❌ 缺少类别: {custom_class}")
                        all_good = False
                        
        except Exception as e:
            print(f"  ❌ 读取文件失败: {e}")
            all_good = False
    
    print(f"\\n" + "=" * 60)
    if all_good:
        print("🎉 所有前端文件更新正确！")
        print("✅ 检测目标界面现在会显示您的4个自定义类别:")
        print("   - 过滤器 (filter)")
        print("   - 过滤器名称 (filtername)")
        print("   - NSP标志 (nsplogo)")
        print("   - 二维码 (qrcode)")
    else:
        print("❌ 部分文件更新不完整，请检查上述错误")
    print("=" * 60)

if __name__ == "__main__":
    check_frontend_updates()
