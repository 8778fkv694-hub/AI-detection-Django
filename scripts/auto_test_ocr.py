#!/usr/bin/env python3
"""
OCR功能自动化测试脚本
测试所有OCR相关功能，包括前端、后端、模型、实时检测等
"""

import requests
import json
import time
import base64
import os
from PIL import Image, ImageDraw, ImageFont
import io

class OCRTester:
    def __init__(self):
        self.frontend_url = "http://localhost:3305"
        self.backend_url = "http://localhost:8000"
        self.test_results = {}
        self.test_image = self.create_test_image()
        
    def create_test_image(self):
        """创建一个测试图片"""
        # 创建一个简单的测试图片
        img = Image.new('RGB', (200, 100), color='white')
        draw = ImageDraw.Draw(img)
        
        # 尝试使用系统字体
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 20)
        except:
            font = ImageFont.load_default()
        
        # 绘制测试文字
        draw.text((10, 30), "TEST OCR", fill='black', font=font)
        draw.text((10, 60), "123456", fill='black', font=font)
        
        # 转换为base64
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        img_str = base64.b64encode(buffer.getvalue()).decode()
        return img_str
    
    def log(self, message, status="INFO"):
        """记录测试日志"""
        timestamp = time.strftime("%H:%M:%S")
        status_symbol = {"INFO": "ℹ️", "PASS": "✅", "FAIL": "❌", "WARN": "⚠️"}
        print(f"[{timestamp}] {status_symbol.get(status, 'ℹ️')} {message}")
    
    def test_frontend_access(self):
        """测试前端页面访问"""
        self.log("测试前端页面访问...")
        try:
            response = requests.get(f"{self.frontend_url}/ocr-test", timeout=10)
            if response.status_code == 200:
                self.test_results['frontend'] = True
                self.log("前端页面访问正常", "PASS")
                return True
            else:
                self.test_results['frontend'] = False
                self.log(f"前端页面访问失败: {response.status_code}", "FAIL")
                return False
        except Exception as e:
            self.test_results['frontend'] = False
            self.log(f"前端页面访问错误: {str(e)}", "FAIL")
            return False
    
    def test_backend_ocr_status(self):
        """测试后端OCR服务状态"""
        self.log("测试后端OCR服务状态...")
        try:
            response = requests.get(f"{self.backend_url}/api/ocr/status/", timeout=10)
            if response.status_code == 200:
                data = response.json()
                self.test_results['backend_ocr'] = True
                self.log(f"后端OCR服务正常: {data}", "PASS")
                return True
            else:
                self.test_results['backend_ocr'] = False
                self.log(f"后端OCR服务失败: {response.status_code}", "FAIL")
                return False
        except Exception as e:
            self.test_results['backend_ocr'] = False
            self.log(f"后端OCR服务错误: {str(e)}", "FAIL")
            return False
    
    def test_yolo_service(self):
        """测试YOLO检测服务"""
        self.log("测试YOLO检测服务...")
        try:
            response = requests.get(f"{self.backend_url}/api/results/available-models/", timeout=10)
            if response.status_code == 200:
                data = response.json()
                self.test_results['yolo_service'] = True
                self.log(f"YOLO检测服务正常: {data}", "PASS")
                return True
            else:
                self.test_results['yolo_service'] = False
                self.log(f"YOLO检测服务失败: {response.status_code}", "FAIL")
                return False
        except Exception as e:
            self.test_results['yolo_service'] = False
            self.log(f"YOLO检测服务错误: {str(e)}", "FAIL")
            return False
    
    def test_paddleocr_model(self):
        """测试PaddleOCR模型"""
        self.log("测试PaddleOCR模型...")
        try:
            response = requests.post(
                f"{self.backend_url}/api/ocr/extract/",
                json={
                    "image": self.test_image,
                    "model": "paddleocr"
                },
                timeout=30
            )
            if response.status_code == 200:
                data = response.json()
                self.test_results['paddleocr'] = True
                self.log(f"PaddleOCR模型正常: {data}", "PASS")
                return True
            else:
                self.test_results['paddleocr'] = False
                self.log(f"PaddleOCR模型失败: {response.status_code}", "FAIL")
                return False
        except Exception as e:
            self.test_results['paddleocr'] = False
            self.log(f"PaddleOCR模型错误: {str(e)}", "FAIL")
            return False
    
    def test_easyocr_model(self):
        """测试EasyOCR模型"""
        self.log("测试EasyOCR模型...")
        try:
            response = requests.post(
                f"{self.backend_url}/api/ocr/extract/",
                json={
                    "image": self.test_image,
                    "model": "easyocr"
                },
                timeout=30
            )
            if response.status_code == 200:
                data = response.json()
                self.test_results['easyocr'] = True
                self.log(f"EasyOCR模型正常: {data}", "PASS")
                return True
            else:
                self.test_results['easyocr'] = False
                self.log(f"EasyOCR模型失败: {response.status_code}", "FAIL")
                return False
        except Exception as e:
            self.test_results['easyocr'] = False
            self.log(f"EasyOCR模型错误: {str(e)}", "FAIL")
            return False
    
    def test_yolo_detection(self):
        """测试YOLO检测功能"""
        self.log("测试YOLO检测功能...")
        try:
            response = requests.post(
                f"{self.backend_url}/api/results/yolo-detect/",
                json={
                    "image": self.test_image,
                    "conf": 0.5
                },
                timeout=30
            )
            if response.status_code == 200:
                data = response.json()
                self.test_results['yolo_detection'] = True
                self.log(f"YOLO检测功能正常: {data}", "PASS")
                return True
            else:
                self.test_results['yolo_detection'] = False
                self.log(f"YOLO检测功能失败: {response.status_code}", "FAIL")
                return False
        except Exception as e:
            self.test_results['yolo_detection'] = False
            self.log(f"YOLO检测功能错误: {str(e)}", "FAIL")
            return False
    
    def test_ocr_models_list(self):
        """测试OCR模型列表"""
        self.log("测试OCR模型列表...")
        try:
            response = requests.get(f"{self.backend_url}/api/ocr/models/", timeout=10)
            if response.status_code == 200:
                data = response.json()
                self.test_results['ocr_models_list'] = True
                self.log(f"OCR模型列表正常: {data}", "PASS")
                return True
            else:
                self.test_results['ocr_models_list'] = False
                self.log(f"OCR模型列表失败: {response.status_code}", "FAIL")
                return False
        except Exception as e:
            self.test_results['ocr_models_list'] = False
            self.log(f"OCR模型列表错误: {str(e)}", "FAIL")
            return False
    
    def test_keyword_analysis(self):
        """测试关键词分析功能"""
        self.log("测试关键词分析功能...")
        try:
            response = requests.post(
                f"{self.backend_url}/api/ocr/extract/",
                json={
                    "image": self.test_image,
                    "model": "easyocr",
                    "keywords": ["TEST", "OCR"],
                    "match_mode": "contains",
                    "min_confidence": 0.5
                },
                timeout=30
            )
            if response.status_code == 200:
                data = response.json()
                self.test_results['keyword_analysis'] = True
                self.log(f"关键词分析功能正常: {data}", "PASS")
                return True
            else:
                self.test_results['keyword_analysis'] = False
                self.log(f"关键词分析功能失败: {response.status_code}", "FAIL")
                return False
        except Exception as e:
            self.test_results['keyword_analysis'] = False
            self.log(f"关键词分析功能错误: {str(e)}", "FAIL")
            return False
    
    def run_all_tests(self):
        """运行所有测试"""
        self.log("开始自动化测试...", "INFO")
        self.log("=" * 50, "INFO")
        
        # 基础服务测试
        self.test_frontend_access()
        self.test_backend_ocr_status()
        self.test_yolo_service()
        self.test_ocr_models_list()
        
        # OCR模型测试
        self.test_paddleocr_model()
        self.test_easyocr_model()
        
        # 高级功能测试
        self.test_yolo_detection()
        self.test_keyword_analysis()
        
        # 生成测试报告
        self.generate_report()
    
    def generate_report(self):
        """生成测试报告"""
        self.log("=" * 50, "INFO")
        self.log("测试报告", "INFO")
        self.log("=" * 50, "INFO")
        
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results.values() if result)
        failed_tests = total_tests - passed_tests
        
        self.log(f"总测试数: {total_tests}", "INFO")
        self.log(f"通过: {passed_tests}", "PASS" if passed_tests > 0 else "INFO")
        self.log(f"失败: {failed_tests}", "FAIL" if failed_tests > 0 else "INFO")
        self.log(f"成功率: {(passed_tests/total_tests)*100:.1f}%", "INFO")
        
        self.log("\n详细结果:", "INFO")
        for test_name, result in self.test_results.items():
            status = "PASS" if result else "FAIL"
            self.log(f"  {test_name}: {'通过' if result else '失败'}", status)
        
        # 保存报告到文件
        report_file = "ocr_test_report.json"
        with open(report_file, 'w', encoding='utf-8') as f:
            json.dump({
                'timestamp': time.strftime("%Y-%m-%d %H:%M:%S"),
                'total_tests': total_tests,
                'passed_tests': passed_tests,
                'failed_tests': failed_tests,
                'success_rate': (passed_tests/total_tests)*100,
                'results': self.test_results
            }, f, ensure_ascii=False, indent=2)
        
        self.log(f"\n测试报告已保存到: {report_file}", "INFO")

if __name__ == "__main__":
    tester = OCRTester()
    tester.run_all_tests()
