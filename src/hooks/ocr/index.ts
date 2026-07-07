/**
 * OCR Detection Hooks
 *
 * 导出所有OCR检测相关的 hooks
 */

export { useImagePreprocessing } from './useImagePreprocessing';
export { useFusionAI } from './useFusionAI';
export { useOCRProcessing } from './useOCRProcessing';
export { useOCRCamera } from './useOCRCamera';
export { useKeyboardShortcuts } from './useKeyboardShortcuts';
export { useOCRHistory } from './useOCRHistory';
export { useOCRWorkflow } from './useOCRWorkflow';
export { useOCRTemplates } from './useOCRTemplates';
export { useDetectionSave } from './useDetectionSave';
export { useModelConfig } from './useModelConfig';
export type { UseModelConfigOptions, UseModelConfigResult } from './useModelConfig';
export { useFullscreen } from './useFullscreen';
export type { UseFullscreenOptions, UseFullscreenResult } from './useFullscreen';
export { useRealtimeDetection } from './useRealtimeDetection';
export type {
  UseRealtimeDetectionOptions,
  UseRealtimeDetectionResult,
  BestROIData,
} from './useRealtimeDetection';
export { useROIProcessor } from './useROIProcessor';
export type {
  UseROIProcessorOptions,
  UseROIProcessorResult,
  ROIWeightRatio,
  BestROIData as ROIBestData,
} from './useROIProcessor';
export { useDetectionMode } from './useDetectionMode';
export type {
  UseDetectionModeOptions,
  UseDetectionModeResult,
  DetectionModeResult,
  DebounceResult,
} from './useDetectionMode';
export { useHardwareTrigger } from './useHardwareTrigger';
export type {
  HardwareTriggerCallbacks,
  HardwareTriggerOptions,
} from './useHardwareTrigger';
export { useHardwareWatchdog } from './useHardwareWatchdog';
export type {
  UseHardwareWatchdogOptions,
  UseHardwareWatchdogResult,
} from './useHardwareWatchdog';
export { useHardwareFallbackKeys } from './useHardwareFallbackKeys';
export type {
  HardwareFallbackKeysCallbacks,
  UseHardwareFallbackKeysOptions,
} from './useHardwareFallbackKeys';
