import { registerPlugin, Capacitor } from '@capacitor/core';

export interface OCRResult {
  text: string;
  confidence: number;
  bbox: number[][];
}

export interface NativeOcrResponse {
  success: boolean;
  full_text: string;
  detailed_results: OCRResult[];
  text_count: number;
  orientation_match?: boolean;
  error?: string;
}

export interface TextRecognitionPluginType {
  recognizeText(options: {
    base64: string;
  }): Promise<NativeOcrResponse>;
}

// Register the native Capacitor plugin
export const TextRecognition = registerPlugin<TextRecognitionPluginType>('TextRecognition');

/**
 * Checks if the Native OCR Plugin is supported in the current environment
 */
export function isNativeOcrSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

/**
 * Executes native OCR text recognition on Android
 */
export async function recognizeTextNative(
  base64Data: string
): Promise<NativeOcrResponse> {
  if (!isNativeOcrSupported()) {
    return {
      success: false,
      full_text: '',
      detailed_results: [],
      text_count: 0,
      error: 'Native OCR not supported on this platform',
    };
  }

  try {
    return await TextRecognition.recognizeText({
      base64: base64Data,
    });
  } catch (err: any) {
    console.error('[TextRecognitionBridge] Native OCR detection error:', err);
    return {
      success: false,
      full_text: '',
      detailed_results: [],
      text_count: 0,
      error: err?.message || 'Unknown Native OCR error',
    };
  }
}
