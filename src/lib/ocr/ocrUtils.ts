/**
 * OCR 工具函数
 *
 * 用途：提供 OCR 检测页面的通用工具函数
 * 使用位置：OCRDetectionScreen, WorkflowStatusCard 等
 */

import React from 'react';
import { CheckCircle, AlertCircle, XCircle } from 'lucide-react';
import type { TestResult } from '@/types/ocr';

/**
 * 根据置信度返回对应的颜色类名
 * @param confidence 置信度值 (0-1)
 * @returns Tailwind CSS 颜色类名
 */
export const getConfidenceColor = (confidence: number): string => {
  if (confidence >= 0.8) return 'text-green-400';
  if (confidence >= 0.5) return 'text-yellow-400';
  return 'text-red-400';
};

/**
 * 根据置信度返回对应的图标组件
 * @param confidence 置信度值 (0-1)
 * @returns React 图标元素
 */
export const getConfidenceIcon = (confidence: number): React.ReactElement => {
  if (confidence >= 0.8) {
    return React.createElement(CheckCircle, { className: 'h-4 w-4 text-green-400' });
  }
  if (confidence >= 0.5) {
    return React.createElement(AlertCircle, { className: 'h-4 w-4 text-yellow-400' });
  }
  return React.createElement(XCircle, { className: 'h-4 w-4 text-red-400' });
};

/**
 * 导出 OCR 结果为 JSON 文件
 * @param ocrResult OCR 测试结果
 * @param imageName 图片名称
 */
export const exportOCRResults = (ocrResult: TestResult | null, imageName?: string): void => {
  if (!ocrResult) return;

  const data = {
    timestamp: new Date().toISOString(),
    image_name: imageName || 'unknown',
    result: ocrResult
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ocr_test_result_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
