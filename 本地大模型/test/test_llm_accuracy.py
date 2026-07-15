#!/usr/bin/env python3
"""
本地 LLM 识图准确率与质检效果评估测试脚本
- 遍历测试用例（包括正常图与各类异常缺陷图）
- 调用本地 Ollama 服务中的 gemma4:e2b-it-qat 进行多模态分析
- 自动关闭 think 推理链以提速，并强制输出 JSON
- 评估识图判定是否符合预期分类（合格/存疑/需复检）
- 生成详细的准确率评估报告并保存至 reports/ 目录下
"""

import os
import sys
import json
import time
import base64
import requests
from datetime import datetime
from typing import Any, Dict, List

# 本地路径配置
ROOT_DIR = "/Users/yiliwen/开发/04_比赛与学习/打包带走/改善周项目/AI检测React+Django"
REPORT_DIR = os.path.join(ROOT_DIR, "reports")
OLLAMA_URL = "http://localhost:11434/api/chat"

# 默认质检规范（根据 AGENTS.md）
SYSTEM_PROMPT = (
    "你是本项目中的工业视觉检验LLM，用于结合控制面板图片、检测标准，输出稳定、保守、可解析的设备状态质检结论。\n"
    "职责约束：\n"
    "1. 仔细检查设备外观是否有物理损坏、磨损、异常脏污。\n"
    "2. 检查控制面板上的各类数码显示、液晶屏读数是否清晰，以及指示灯是否正常亮起。\n"
    "3. 核心原则：如果图像模糊不清、光线极差（对比度过低）、画面全黑、或者图像内容完全缺失，必须判定为“需复检”或“存疑”，严禁盲目判定为“合格”。\n\n"
    "必须返回符合以下结构的合法 JSON，绝对不要带有 Markdown 标记（如 ```json 等）：\n"
    "{\n"
    "  \"overallQuality\": \"合格\" | \"存疑\" | \"需复检\",\n"
    "  \"score\": 0-100之间的整数,\n"
    "  \"reason\": \"判定原因说明\",\n"
    "  \"reasonKeywords\": [\"关键词1\", \"关键词2\"],\n"
    "  \"defects\": [] 或者 包含异常描述的数组\n"
    "}"
)

USER_MESSAGE = "请仔细分析这张控制面板或设备图片，检测是否存在缺陷、异常读数、画面异常，并输出质检结论 JSON。"

# 测试用例定义 (图片路径, 期望的判定结果, 测试类型说明)
TEST_CASES = [
    {
        "filename": "realistic_test_image.jpg",
        "expected_quality": "合格",
        "desc": "标准清晰的设备几何设计图（正常控制面板对照）"
    },
    {
        "filename": "media__1783470434559.jpg",
        "expected_quality": "合格",
        "desc": "用户上传的设备真实控制面板（所有指示灯和参数读数正常）",
        "path_override": "/Users/yiliwen/.gemini/antigravity/brain/f2cab295-51a8-4b2c-a490-eeefee9a9bd6/media__1783470434559.jpg"
    },
    {
        "filename": "problematic_blank.png",
        "expected_quality": "需复检",
        "desc": "空白底图（画面内容完全缺失，测试空面板容错）"
    },
    {
        "filename": "problematic_blurry.png",
        "expected_quality": "需复检",
        "desc": "模糊图像（清晰度过低无法识别细节，必须要求复检）"
    },
    {
        "filename": "problematic_low_contrast.png",
        "expected_quality": "需复检",
        "desc": "极低对比度/曝光严重异常图像（难以看清仪表读数，应要求复检或存疑）"
    },
    {
        "filename": "problematic_noisy.png",
        "expected_quality": "需复检",
        "desc": "强噪点干扰图像（存在严重的数字识别抖动隐患，应输出存疑或需复检）"
    }
]

def encode_image(image_path: str) -> str:
    """读取并 base64 编码图像"""
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")

def check_ollama_service() -> bool:
    """检查本地 Ollama 服务以及 gemma4 模型是否可用"""
    try:
        resp = requests.get("http://localhost:11434/api/tags", timeout=5)
        if resp.status_code == 200:
            models = [m["name"] for m in resp.json().get("models", [])]
            return "gemma4:e2b-it-qat" in models
        return False
    except Exception:
        return False

def evaluate_cases() -> Dict[str, Any]:
    print("==================================================")
    print("   本地 LLM 识图准确率与质检一致性自动化测试      ")
    print("==================================================")
    
    if not check_ollama_service():
        print("✗ 错误: 本地 Ollama 服务未启动，或未找到 'gemma4:e2b-it-qat' 模型！")
        sys.exit(1)
        
    print("✓ Ollama 及 gemma4:e2b-it-qat 模型状态正常。")
    
    results = []
    correct_count = 0
    total_count = 0
    
    for case in TEST_CASES:
        filename = case["filename"]
        expected = case["expected_quality"]
        desc = case["desc"]
        
        # 确定图片路径
        img_path = case.get("path_override", os.path.join(ROOT_DIR, filename))
        if not os.path.exists(img_path):
            print(f"⚠️ 跳过测试: {filename} 未在根目录中找到！")
            continue
            
        print(f"\n[测试用例 {total_count + 1}] 正在分析: {filename} ({desc})")
        
        # 编码图像
        img_b64 = encode_image(img_path)
        
        # 构造请求体，关闭 think 推理，强制输出 JSON
        payload = {
            "model": "gemma4:e2b-it-qat",
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": USER_MESSAGE, "images": [img_b64]}
            ],
            "stream": False,
            "format": "json",
            "think": False,
            "options": {
                "temperature": 0.1,
                "num_predict": 512
            }
        }
        
        start_time = time.time()
        prediction = None
        score = 0
        reason = ""
        success = False
        duration_ms = 0
        
        try:
            resp = requests.post(OLLAMA_URL, json=payload, timeout=60)
            duration_ms = int((time.time() - start_time) * 1000)
            
            if resp.status_code == 200:
                content = resp.json().get("message", {}).get("content", "")
                parsed = json.loads(content)
                prediction = parsed.get("overallQuality", "未知")
                score = parsed.get("score", 0)
                reason = parsed.get("reason", "")
                success = True
            else:
                reason = f"Ollama 错误码: {resp.status_code}"
        except json.JSONDecodeError:
            reason = "JSON 解析失败（大模型输出格式非法）"
        except Exception as e:
            reason = f"调用异常: {str(e)}"
            
        # 判定是否准确（如果预期是“需复检”，模型输出“需复检”或“存疑”均视为捕获异常成功）
        is_match = False
        if expected == "合格" and prediction == "合格":
            is_match = True
        elif expected in ("需复检", "存疑") and prediction in ("需复检", "存疑"):
            is_match = True
            
        if is_match:
            correct_count += 1
            match_str = "✓ MATCH"
        else:
            match_str = "✗ MISMATCH"
            
        total_count += 1
        
        case_report = {
            "filename": filename,
            "description": desc,
            "expected": expected,
            "predicted": prediction or "无输出",
            "score": score,
            "is_correct": is_match,
            "duration_ms": duration_ms,
            "reason": reason
        }
        results.append(case_report)
        
        print(f"  预测结果: {prediction or '失败'} (分值: {score})")
        print(f"  判定状态: {match_str} (耗时: {duration_ms}ms)")
        print(f"  判定原因: {reason}")
        
    accuracy = (correct_count / total_count) * 100 if total_count > 0 else 0
    print("\n==================================================")
    print("                  评估结果汇总                    ")
    print("==================================================")
    print(f"总测试用例数: {total_count}")
    print(f"正确匹配数:   {correct_count}")
    print(f"整体识图准确率: {accuracy:.2f}%")
    print("==================================================")
    
    # 构造保存的报告
    os.makedirs(REPORT_DIR, exist_ok=True)
    report_filename = f"llm_accuracy_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    report_path = os.path.join(REPORT_DIR, report_filename)
    
    final_report = {
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "model": "gemma4:e2b-it-qat",
        "accuracy_percent": round(accuracy, 2),
        "total_cases": total_count,
        "correct_cases": correct_count,
        "results": results
    }
    
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(final_report, f, ensure_ascii=False, indent=2)
        
    print(f"报告已保存至: {report_path}")
    return final_report

if __name__ == "__main__":
    evaluate_cases()
