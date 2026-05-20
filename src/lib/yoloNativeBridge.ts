import { registerPlugin, Capacitor } from '@capacitor/core';

export interface YoloBox {
  label: string;
  confidence: number;
  bbox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
}

export interface YoloNativePluginType {
  initModel(options: {
    modelPath: string;
    numThreads?: number;
    useNnapi?: boolean;
    classNames?: string[];
  }): Promise<{ success: boolean }>;

  detectFrame(options: {
    base64: string;
    confidenceThreshold?: number;
    nmsThreshold?: number;
  }): Promise<{ boxes: YoloBox[] }>;
}

// Register the native Capacitor plugin
export const YoloNative = registerPlugin<YoloNativePluginType>('YoloNative');

/**
 * Checks if the Native YOLO Plugin is supported in the current environment
 */
export function isNativeYoloSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

/**
 * Initializes the native YOLO model
 */
export async function initNativeYolo(
  modelPath: string,
  classNames: string[],
  numThreads = 4,
  useNnapi = false
): Promise<boolean> {
  if (!isNativeYoloSupported()) {
    console.warn('[YoloNativeBridge] Native YOLO is not supported on this platform.');
    return false;
  }

  try {
    // Standardize path: strip leading / for Android asset manager compatibility
    let assetPath = modelPath;
    if (assetPath.startsWith('/')) {
      assetPath = assetPath.substring(1);
    }
    // Prepend public/ prefix since Capacitor assets are placed in public/
    if (!assetPath.startsWith('public/')) {
      assetPath = 'public/' + assetPath;
    }

    console.log(`[YoloNativeBridge] Initializing native model: ${assetPath}, threads: ${numThreads}, nnapi: ${useNnapi}`);
    const result = await YoloNative.initModel({
      modelPath: assetPath,
      numThreads,
      useNnapi,
      classNames,
    });
    return result.success;
  } catch (err) {
    console.error('[YoloNativeBridge] Failed to initialize native model:', err);
    return false;
  }
}

/**
 * Encodes canvas content to Base64 and executes native inference
 */
export async function detectFrameNative(
  canvas: HTMLCanvasElement,
  confidenceThreshold: number,
  nmsThreshold: number
): Promise<YoloBox[]> {
  if (!isNativeYoloSupported()) {
    return [];
  }

  try {
    // Generate base64 JPEG from canvas (use 0.8 quality for fast compression and transfer)
    const base64Data = canvas.toDataURL('image/jpeg', 0.8);
    
    // Call native inference
    const result = await YoloNative.detectFrame({
      base64: base64Data,
      confidenceThreshold,
      nmsThreshold,
    });
    
    return result.boxes || [];
  } catch (err) {
    console.error('[YoloNativeBridge] Native frame detection error:', err);
    return [];
  }
}
