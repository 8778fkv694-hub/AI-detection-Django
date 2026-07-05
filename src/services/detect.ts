/**
 * 检测统一抽象层（行动文档 W1）
 *
 * 所有 YOLO 检测调用的唯一入口。引擎选择在此处收口：
 *  - server      : Django /results/yolo-detect/（yoloDetectBackend，内含离线 WASM 拦截与重试）
 *  - local-onnx  : WebView 内 ONNX Runtime WASM（离线 web / Electron）
 *  - native      : Android 原生 ORT 插件（APK，YoloNative）
 *  - stream-loop : 后端解耦检测循环（在线流媒体模式，前端只拉 JSON 结果）
 *
 * 纪律：业务 hook / screen 一律 import 本文件，禁止直接 import
 * onnxYoloDetector / yoloNativeBridge / 手写 fetch 检测接口。
 */

import { yoloDetectBackend } from '@/lib/api';
import { buildApiUrl, isLocalOfflineMode } from '@/lib/config';
import { onnxYoloDetector } from '@/lib/onnxYoloDetector';
import {
  isNativeYoloSupported,
  initNativeYolo,
  detectFrameNative,
} from '@/lib/yoloNativeBridge';
import type { BackendYoloDetection } from '@/types';

export type { BackendYoloDetection };

export type DetectionSource = 'server' | 'local-onnx' | 'native' | 'stream-loop';

export interface FrameDetectionResult {
  detections: BackendYoloDetection[];
  source: DetectionSource;
  /** 推理耗时（ms）；stream-loop 模式下取后端上报值 */
  inferenceMs: number | null;
  /** 检测帧率；stream-loop 模式下取后端上报值 */
  fps: number | null;
  /** stream-loop 模式下的帧 ID，用于抓拍时按帧取图 */
  frameId?: number;
  /** stream-loop 模式下后端上报的原始帧尺寸，用于检测框坐标缩放 */
  sourceSize?: { width: number; height: number };
}

export interface DetectImageOptions {
  model_id?: string;
  detection_type?:
    | 'cleanroom_ppe'
    | 'kit_matching'
    | 'ocr_inspection'
    | 'ocr_fusion_inspection'
    | 'general_quality';
}

/** 当前是否处于离线客户端模式（APK / Electron / 离线 web） */
export function isOfflineEngineActive(): boolean {
  return isLocalOfflineMode();
}

/** 原生 Android 推理插件是否可用 */
export function isNativeEngineAvailable(): boolean {
  return isNativeYoloSupported();
}

/** 本地引擎信息（展示用，如首页看板） */
export function getLocalEngineInfo(): {
  engine: 'native' | 'wasm';
  modelPath: string;
  modelFileName: string;
} {
  const config = onnxYoloDetector.getConfig();
  return {
    engine: isNativeYoloSupported() ? 'native' : 'wasm',
    modelPath: config.modelPath,
    modelFileName: config.modelPath.split('/').pop() || 'unknown',
  };
}

/**
 * 确保本地推理引擎加载了指定模型（离线客户端模型切换收口）。
 * native 环境走原生插件加载，否则走 WASM switchModel。
 */
export async function ensureLocalModel(modelId: string): Promise<boolean> {
  const { modelPath, classNames } = onnxYoloDetector.getModelConfigById(modelId);
  if (isNativeYoloSupported()) {
    // 4 线程、关闭 NNAPI（稳定性优先，与既有行为一致）
    return initNativeYolo(modelPath, classNames, 4, false);
  }
  return onnxYoloDetector.switchModel(modelPath, classNames);
}

/**
 * 单帧图片检测（拍照 / 抓拍路径）。
 * 引擎路由完全委托 yoloDetectBackend（其内部已实现：离线 → WASM，失败/在线 → Django）。
 */
export async function detectImage(
  imageBase64: string,
  conf: number,
  options?: DetectImageOptions
): Promise<BackendYoloDetection[]> {
  return yoloDetectBackend(imageBase64, conf, options);
}

/**
 * 视频帧检测（实时预览路径，离线客户端）。
 * 引擎阶梯：native 插件 → WASM → （异常时）截全帧走服务器。
 * 行为与原 useLiveYoloDetection 内联实现一致。
 */
export async function detectVideoFrame(
  video: HTMLVideoElement,
  conf: number
): Promise<FrameDetectionResult> {
  try {
    const startTime = performance.now();
    let detections: BackendYoloDetection[];
    let source: DetectionSource;

    if (isNativeYoloSupported()) {
      // 原生路径：缩到 320 再过桥（带宽预算，见行动文档 H6）
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 320;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, 320, 320);
      }
      detections = await detectFrameNative(canvas, conf, 0.45);
      source = 'native';
    } else {
      detections = await onnxYoloDetector.detectFromVideo(video);
      // 原生插件已在 Java 端过滤置信度，WASM 需在 JS 过滤
      detections = detections.filter((d) => d.confidence >= conf);
      source = 'local-onnx';
    }

    const elapsed = performance.now() - startTime;
    return {
      detections,
      source,
      inferenceMs: Math.round(elapsed),
      fps: elapsed > 0 ? Math.round(1000 / elapsed) : null,
    };
  } catch (e) {
    console.error('[detect] 本地推理失败，降级到后端 API:', e);
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64Image = canvas.toDataURL('image/jpeg').split(',')[1];
    const detections = await yoloDetectBackend(base64Image, conf);
    return { detections, source: 'server', inferenceMs: null, fps: null };
  }
}

/**
 * stream-loop 模式：拉取后端 Ring Buffer 中的一帧高清原图（与检测框完全对齐）。
 * 返回原始 Response（不解析 blob），调用方按需 .blob() / 读取 X-Frame-ID 头等，行为不变。
 * frameId 传入时按历史帧精确请求，不传则取最新帧。
 */
export async function fetchStreamSnapshot(
  streamId: string,
  frameId?: number
): Promise<Response> {
  const query = frameId && frameId > 0 ? `?frame_id=${frameId}` : '';
  return fetch(buildApiUrl(`/streams/${streamId}/snapshot/${query}`));
}

/** stream-loop 模式：拉取后端检测循环的最新结果 */
export async function fetchStreamDetections(
  streamId: string
): Promise<FrameDetectionResult> {
  const response = await fetch(buildApiUrl(`/streams/${streamId}/detections/`));
  if (!response.ok) {
    // 与旧内联实现语义一致：非 200 视为本次轮询失败，由调用方 catch 跳过本帧更新
    // （不能返回空结果，否则会把上一帧的性能指标闪成空）
    throw new Error(`拉取检测结果失败: HTTP ${response.status}`);
  }
  const result = await response.json();
  return {
    detections: result.boxes || [],
    source: 'stream-loop',
    inferenceMs: result.inference_ms || null,
    fps: result.detect_fps || null,
    frameId: result.frame_id || 0,
    sourceSize: result.frame_width && result.frame_height
      ? { width: result.frame_width, height: result.frame_height }
      : undefined,
  };
}

/** stream-loop 模式：请求后端启动检测循环 */
export async function startStreamDetectionLoop(
  streamId: string,
  params: { confThreshold: number; modelId?: string; ownerId: string }
): Promise<void> {
  await fetch(buildApiUrl(`/streams/${streamId}/detection-loop/start/`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conf_threshold: params.confThreshold,
      ...(params.modelId ? { model_id: params.modelId } : {}),
      owner_id: params.ownerId,
    }),
  });
}

/** stream-loop 模式：请求后端停止检测循环 */
export async function stopStreamDetectionLoop(
  streamId: string,
  ownerId: string
): Promise<void> {
  await fetch(buildApiUrl(`/streams/${streamId}/detection-loop/stop/`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ owner_id: ownerId }),
  });
}
