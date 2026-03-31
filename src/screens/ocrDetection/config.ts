/**
 * OCR Detection Configuration
 *
 * 用途：OCRDetectionScreen 页面专属配置与常量
 * 使用位置：OCRDetectionScreen.tsx
 */

import type { PreprocessingPreset } from '@/types/ocr';

// 预处理方案配置
export const PREPROCESSING_PRESETS: PreprocessingPreset[] = [
  {
    id: 'conservative',
    name: '保守方案',
    description: '轻微处理，保持原图特征',
    methods: [
      { type: 'brightness', intensity: 'light', parameters: { brightness: 10 } },
      { type: 'contrast', intensity: 'light', parameters: { contrast: 1.2 } }
    ]
  },
  {
    id: 'balanced',
    name: '平衡方案',
    description: '适中处理，平衡效果与质量',
    methods: [
      { type: 'brightness', intensity: 'moderate', parameters: { brightness: 20 } },
      { type: 'contrast', intensity: 'moderate', parameters: { contrast: 1.3 } },
      { type: 'sharpness', intensity: 'light', parameters: { sharpness: 0.5 } }
    ]
  },
  {
    id: 'aggressive',
    name: '激进方案',
    description: '强力处理，最大化检测效果',
    methods: [
      { type: 'brightness', intensity: 'aggressive', parameters: { brightness: 30 } },
      { type: 'contrast', intensity: 'aggressive', parameters: { contrast: 1.5 } },
      { type: 'sharpness', intensity: 'moderate', parameters: { sharpness: 0.8 } },
      { type: 'denoise', intensity: 'moderate', parameters: { denoise: 1 } }
    ]
  }
];

// 滑块样式
export const sliderStyles = `
  .slider::-webkit-slider-thumb {
    appearance: none;
    height: 16px;
    width: 16px;
    border-radius: 50%;
    background: #3b82f6;
    cursor: pointer;
    border: 2px solid #1e293b;
  }
  .slider::-moz-range-thumb {
    height: 16px;
    width: 16px;
    border-radius: 50%;
    background: #3b82f6;
    cursor: pointer;
    border: 2px solid #1e293b;
  }
`;

// 固定配置常量
export const OCR_DETECTION_CONFIG = {
  // 二维码检测最大重试次数
  maxRetries: 5,
  // 固定使用微信二维码检测器
  useWeChatQR: true,
  // 默认 OCR 模型: 'auto' 让后端自动选择最佳引擎 (优先使用 RapidOCR)
  defaultModel: 'auto',
  // 默认预处理方案
  defaultPreprocessingPreset: 'balanced',
  // 默认检测间隔（秒）
  defaultDetectionInterval: 0.1,
  // 默认是否需要合格结果确认
  defaultRequireQualifiedConfirmation: true,
  // 默认图片压缩配置
  defaultCompressionConfig: {
    maxWidth: 1024,
    maxHeight: 1024,
    quality: 0.9,
    maxSizeMB: 1
  }
} as const;
