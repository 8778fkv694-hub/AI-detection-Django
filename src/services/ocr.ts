/**
 * OCR 统一抽象层（行动文档 W2）
 *
 * 所有 OCR 服务调用的唯一入口。当前实现为 ServerEngine（Django /api/ocr/*）；
 * APK 端侧引擎（ML Kit，行动文档 Phase 3）将在此文件内路由，调用方零改动。
 *
 * 纪律：业务 hook / screen 一律 import 本文件，禁止手写 fetch('/api/ocr/...')
 * ——裸 fetch 带死前缀在 Electron/APK 下 API base 不同时会直接断路。
 */

import { apiFetch } from '@/lib/config';
import { isNativeOcrSupported, recognizeTextNative } from '@/lib/textRecognitionBridge';

export interface OcrExtractRequest {
  /** 纯 base64 图片数据（不含 data: 前缀） */
  image: string;
  /** OCR 引擎/模型选择，如 'auto'；不传由后端决定 */
  model?: string;
  /** 是否启用文字方向检测 */
  use_angle_cls?: boolean;
}

/** 执行 OCR 文字识别（Django /ocr/extract/） */
export async function extractText<T = any>(req: OcrExtractRequest): Promise<T> {
  if (isNativeOcrSupported()) {
    try {
      const result = await recognizeTextNative(req.image);
      return result as unknown as T;
    } catch (err) {
      console.error('[ocr] Native OCR failed, falling back to server:', err);
    }
  }
  const res = await apiFetch('/ocr/extract/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    throw new Error(`OCR检测失败: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export interface OcrServiceStatus {
  available?: boolean;
  engine?: string;
  model?: string;
  [key: string]: unknown;
}

/** 查询 OCR 服务状态（Django /ocr/status/） */
export async function getOcrStatus(): Promise<OcrServiceStatus> {
  const res = await apiFetch('/ocr/status/');
  if (!res.ok) {
    throw new Error(`OCR状态查询失败: ${res.status}`);
  }
  return res.json();
}

export interface BatchDetectionPayload {
  roi_ids: string[];
  apply_rules?: boolean;
  enable_barcode?: boolean;
  target_configs?: Record<string, unknown>;
  keyword_configs?: unknown[];
  barcode_configs?: unknown[];
  non_grid_targets?: unknown[];
}

/** ROI 批处理检测（Django /ocr/batch-detection/） */
export async function runBatchDetection<T = any>(payload: BatchDetectionPayload): Promise<T> {
  const res = await apiFetch('/ocr/batch-detection/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({} as { error?: string }));
    throw new Error(errorData.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/** 获取 ROI 缓存统计（Django /ocr/roi-cache-stats/） */
export async function getRoiCacheStats<T = any>(): Promise<T> {
  const res = await apiFetch('/ocr/roi-cache-stats/');
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

/** 清理 ROI 缓存（Django /ocr/cleanup-roi-cache/） */
export async function cleanupRoiCache<T = any>(mode: 'expired' | 'all' = 'expired'): Promise<T> {
  const res = await apiFetch('/ocr/cleanup-roi-cache/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}
