#!/usr/bin/env python3
"""
更新现有检测结果的detection_type字段
根据检测结果的特征自动分类
"""

import os
import sys
import django

# 设置Django环境
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from inspection.models import InspectionResult

def update_detection_types():
    """更新检测结果的detection_type字段"""
    print("🔧 开始更新检测结果的detection_type字段...")
    
    # 获取所有检测结果
    results = InspectionResult.objects.all()
    total_count = results.count()
    print(f"📊 找到 {total_count} 条检测结果")
    
    cleanroom_count = 0
    standard_count = 0
    general_count = 0
    unknown_count = 0
    
    for result in results:
        # 如果已经有detection_type，跳过
        if result.detection_type != 'unknown':
            continue
            
        reason = result.reason or ''
        lower_reason = reason.lower()
        
        # 检查是否为洁净用品检测
        if ('洁净帽' in lower_reason or 
            '口罩' in lower_reason or 
            '洁净服' in lower_reason or
            '洁净用品' in lower_reason or
            'ppe' in lower_reason or
            '防护装备' in lower_reason or
            '灌缝帽' in lower_reason):
            result.detection_type = 'cleanroom_ppe'
            cleanroom_count += 1
            print(f"✅ 标记为洁净用品检测: {result.id}")
            
        # 检查是否为标准检测
        elif result.standard:
            result.detection_type = 'standard_inspection'
            standard_count += 1
            print(f"✅ 标记为标准检测: {result.id}")
            
        # 其他情况标记为通用质量检测
        else:
            result.detection_type = 'general_quality'
            general_count += 1
            print(f"✅ 标记为通用质量检测: {result.id}")
        
        result.save()
    
    print(f"\n📈 更新完成统计:")
    print(f"   洁净用品检测: {cleanroom_count} 条")
    print(f"   标准检测: {standard_count} 条")
    print(f"   通用质量检测: {general_count} 条")
    print(f"   未知类型: {unknown_count} 条")
    print(f"   总计: {cleanroom_count + standard_count + general_count + unknown_count} 条")

if __name__ == '__main__':
    update_detection_types()
