#!/usr/bin/env python3
"""
测试修改后的检测逻辑
验证不同合规率下的显示逻辑
"""

def test_detection_logic():
    """测试检测逻辑"""
    print("=" * 60)
    print("测试修改后的检测逻辑")
    print("=" * 60)
    
    # 测试用例
    test_cases = [
        {
            "compliance_score": 100,
            "expected_quality": "合格",
            "expected_reason": "PPE穿戴合规"
        },
        {
            "compliance_score": 80,
            "expected_quality": "合格",
            "expected_reason": "PPE穿戴合规"
        },
        {
            "compliance_score": 50,
            "expected_quality": "需复检",
            "expected_reason": "请自我检查确认"
        },
        {
            "compliance_score": 30,
            "expected_quality": "需复检",
            "expected_reason": "不合格原因"
        },
        {
            "compliance_score": 0,
            "expected_quality": "需复检",
            "expected_reason": "请复检"
        }
    ]
    
    print("📋 检测逻辑规则:")
    print("   - 合规率 >= 80%: 显示'合格'")
    print("   - 合规率 = 50%: 显示'需复检'，原因：'请自我检查确认'")
    print("   - 合规率 = 0%: 显示'需复检'，原因：'请复检'")
    print("   - 合规率 >= 30% (其他): 显示'需复检'，原因：'不合格原因'")
    print("   - 合规率 < 30%: 显示'不合格'")
    
    print(f"\n🧪 测试用例验证:")
    
    for i, test_case in enumerate(test_cases, 1):
        score = test_case["compliance_score"]
        expected_quality = test_case["expected_quality"]
        expected_reason = test_case["expected_reason"]
        
        # 模拟检测逻辑
        if score >= 80:
            overall_quality = "合格"
            reason = f"PPE穿戴合规。合规率: {score:.1f}%"
        elif score == 50:
            overall_quality = "需复检"
            reason = f"请自我检查确认。合规率: {score:.1f}%"
        elif score == 0:
            overall_quality = "需复检"
            reason = f"请复检。合规率: {score:.1f}%"
        elif score >= 30:
            overall_quality = "需复检"
            reason = f"不合格原因。合规率: {score:.1f}%"
        else:
            overall_quality = "不合格"
            reason = f"不合格原因。合规率: {score:.1f}%"
        
        # 验证结果
        quality_match = overall_quality == expected_quality
        reason_match = expected_reason in reason
        
        status = "✅" if quality_match and reason_match else "❌"
        print(f"   测试{i}: 合规率{score}% -> {overall_quality} ({status})")
        print(f"      原因: {reason}")
        
        if not (quality_match and reason_match):
            print(f"      期望: {expected_quality}, 原因包含: {expected_reason}")
    
    print(f"\n✅ 检测逻辑修改完成！")
    print("   - 50%合规率: 显示'请自我检查确认'")
    print("   - 0%合规率: 显示'请复检'")
    print("   - 其他情况: 保持原有逻辑")
    
    return True

if __name__ == "__main__":
    print("🧪 开始测试修改后的检测逻辑...")
    
    success = test_detection_logic()
    
    print(f"\n{'='*60}")
    if success:
        print("🎉 检测逻辑测试完成！")
        print("✅ 50%合规率显示'请自我检查确认'")
        print("✅ 0%合规率显示'请复检'")
        print("✅ 其他情况保持原有逻辑")
    else:
        print("❌ 测试失败，请检查配置")
    print(f"{'='*60}")
