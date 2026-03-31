/**
 * Safety Equipment Hooks
 *
 * 导出所有安全设备相关的 hooks
 */

export { useTempFolder } from './useTempFolder';
export type { UseTempFolderOptions, UseTempFolderResult } from './useTempFolder';

export { usePPEKeyboardShortcuts } from './usePPEKeyboardShortcuts';
export type { UsePPEKeyboardShortcutsOptions } from './usePPEKeyboardShortcuts';

export { usePPELocalState } from './usePPELocalState';
export type {
  PPEModelUnavailableDialogState,
  UsePPELocalStateResult,
} from './usePPELocalState';

export { usePPEBinding } from './usePPEBinding';
export type {
  PPETraceContext,
  PPEBindingSources,
  UsePPEBindingOptions,
  UsePPEBindingResult,
} from './usePPEBinding';

export { usePPEPolling } from './usePPEPolling';
export type { UsePPEPollingOptions } from './usePPEPolling';

export { useSafetyCamera } from './useSafetyCamera';
export type { UseSafetyCameraOptions, UseSafetyCameraResult } from './useSafetyCamera';

export { usePPEDetection } from './usePPEDetection';
export type {
  UsePPEDetectionOptions,
  UsePPEDetectionResult,
  DetectionStats,
  BestDetection,
} from './usePPEDetection';

export { usePPECapture } from './usePPECapture';
export type { UsePPECaptureOptions, UsePPECaptureResult } from './usePPECapture';

export { usePPEInspection } from './usePPEInspection';
export type { UsePPEInspectionOptions, UsePPEInspectionResult } from './usePPEInspection';

export { usePPESave } from './usePPESave';
export type {
  PPEInspectionDraft,
  SaveInspectionResultsResult,
  UsePPESaveOptions,
  UsePPESaveResult,
} from './usePPESave';

export { usePPEScreenController } from './usePPEScreenController';
