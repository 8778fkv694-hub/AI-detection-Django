import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { InspectionResult } from '@/types';
import {
  defaultPPEThresholds,
  PPE_CAPTURE_THRESHOLD_DEFAULT,
  PPE_INSPECTION_THRESHOLD_DEFAULT,
} from './detectionDefaults';
import type { PPEThresholds } from './detectionDefaults';

// 兼容性再导出：safetyEquipmentStore 等既有代码从本文件 import 这两个名字。
// 真源已迁移至 detectionDefaults.ts（W3），新代码请直接从那里 import。
export { defaultPPEThresholds } from './detectionDefaults';
export type { PPEThresholds } from './detectionDefaults';

const STORAGE_VERSION = 'v2';
const LEGACY_PPE_STORAGE_NAME = 'safety-equipment-storage';

const createScopedStorageName = () => {
  if (typeof window === 'undefined') {
    return `ppe-detection-storage-${STORAGE_VERSION}:server`;
  }

  const params = new URLSearchParams(window.location.search);
  const pageInstanceId = params.get('page_instance_id')?.trim();
  const stageCode = params.get('stage_code')?.trim();
  const explicitWindowId = params.get('windowId')?.trim();

  const buildScopeKey = () => {
    if (pageInstanceId) return `page:${pageInstanceId}`;
    if (stageCode) return `stage:${stageCode}`;
    if (explicitWindowId) return `window:${explicitWindowId}`;

    const sessionStorageKey = `ppe-detection-scope:${window.location.pathname}`;
    let sessionScope = window.sessionStorage.getItem(sessionStorageKey);
    if (!sessionScope) {
      sessionScope = `tab:${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      window.sessionStorage.setItem(sessionStorageKey, sessionScope);
    }
    return sessionScope;
  };

  return `ppe-detection-storage-${STORAGE_VERSION}:${buildScopeKey()}`;
};

const PPE_DETECTION_STORAGE_NAME = createScopedStorageName();

export interface PPEBindingConfig {
  processStageCode: string;
  processStageName: string;
  pageInstanceId: string;
  cameraId: string;
}

export interface BestDetectionInInterval {
  confidence: number;
  sharpness?: number;
  timestamp: number;
  detections: any[];
  imageData?: string;
}

export interface PPEDetectionState {
  processStageCode: string;
  processStageName: string;
  pageInstanceId: string;
  cameraId: string;
  autoCapture: boolean;
  showDetections: boolean;
  captureThreshold: number;
  inspectionThreshold: number;
  captureInterval: number;
  autoUploadCount: number;
  inspectionCooldownInterval: number;
  postDetectionDelay: number;
  detectionInterval: number;
  bestDetectionPriority: 'confidence' | 'sharpness';
  ppeThresholds: PPEThresholds;
  isSettingsExpanded: boolean;
  isBindingInfoCollapsed: boolean;
  isThresholdsCollapsed: boolean;
  isCapturedImagesCollapsed: boolean;
  isResultsCollapsed: boolean;
  showShortcutModal: boolean;
  capturedImages: string[];
  results: InspectionResult[];
  bestDetectionInInterval: BestDetectionInInterval | null;
  setBindingConfig: (config: Partial<PPEBindingConfig>) => void;
  setAutoCapture: (value: boolean) => void;
  setShowDetections: (value: boolean) => void;
  setCaptureThreshold: (value: number) => void;
  setInspectionThreshold: (value: number) => void;
  setCaptureInterval: (value: number) => void;
  setAutoUploadCount: (value: number) => void;
  setInspectionCooldownInterval: (value: number) => void;
  setPostDetectionDelay: (value: number) => void;
  setDetectionInterval: (value: number) => void;
  setBestDetectionPriority: (priority: 'confidence' | 'sharpness') => void;
  setPpeThresholds: (thresholds: PPEThresholds) => void;
  updatePpeThreshold: (category: keyof PPEThresholds, value: number) => void;
  setIsSettingsExpanded: (value: boolean) => void;
  setIsBindingInfoCollapsed: (value: boolean) => void;
  setIsThresholdsCollapsed: (value: boolean) => void;
  setIsCapturedImagesCollapsed: (value: boolean) => void;
  setIsResultsCollapsed: (value: boolean) => void;
  setShowShortcutModal: (value: boolean) => void;
  setCapturedImages: (images: string[]) => void;
  addCapturedImage: (image: string) => void;
  setResults: (results: InspectionResult[]) => void;
  addResult: (result: InspectionResult) => void;
  setBestDetectionInInterval: (detection: BestDetectionInInterval | null) => void;
  clearResults: () => void;
}

export const usePPEDetectionStore = create<PPEDetectionState>()(
  persist(
    (set) => ({
      processStageCode: '',
      processStageName: '',
      pageInstanceId: '',
      cameraId: '',
      autoCapture: false,
      showDetections: true,
      captureThreshold: PPE_CAPTURE_THRESHOLD_DEFAULT,
      inspectionThreshold: PPE_INSPECTION_THRESHOLD_DEFAULT,
      captureInterval: 5,
      autoUploadCount: 1,
      inspectionCooldownInterval: 3,
      postDetectionDelay: 10,
      detectionInterval: 1,
      bestDetectionPriority: 'confidence',
      ppeThresholds: defaultPPEThresholds,
      isSettingsExpanded: true,
      isBindingInfoCollapsed: false,
      isThresholdsCollapsed: false,
      isCapturedImagesCollapsed: false,
      isResultsCollapsed: false,
      showShortcutModal: false,
      capturedImages: [],
      results: [],
      bestDetectionInInterval: null,
      setBindingConfig: (config) =>
        set((state) => ({
          processStageCode: config.processStageCode ?? state.processStageCode,
          processStageName: config.processStageName ?? state.processStageName,
          pageInstanceId: config.pageInstanceId ?? state.pageInstanceId,
          cameraId: config.cameraId ?? state.cameraId,
        })),
      setAutoCapture: (value) => set({ autoCapture: value }),
      setShowDetections: (value) => set({ showDetections: value }),
      setCaptureThreshold: (value) => set({ captureThreshold: value }),
      setInspectionThreshold: (value) => set({ inspectionThreshold: value }),
      setCaptureInterval: (value) => set({ captureInterval: value }),
      setAutoUploadCount: (value) => set({ autoUploadCount: value }),
      setInspectionCooldownInterval: (value) => set({ inspectionCooldownInterval: value }),
      setPostDetectionDelay: (value) => set({ postDetectionDelay: value }),
      setDetectionInterval: (value) => set({ detectionInterval: value }),
      setBestDetectionPriority: (priority) => set({ bestDetectionPriority: priority }),
      setPpeThresholds: (thresholds) => set({ ppeThresholds: thresholds }),
      updatePpeThreshold: (category, value) =>
        set((state) => ({
          ppeThresholds: {
            ...state.ppeThresholds,
            [category]: value,
          },
        })),
      setIsSettingsExpanded: (value) =>
        set({
          isSettingsExpanded: value,
          isThresholdsCollapsed: !value,
        }),
      setIsBindingInfoCollapsed: (value) => set({ isBindingInfoCollapsed: value }),
      setIsThresholdsCollapsed: (value) =>
        set({
          isThresholdsCollapsed: value,
          isSettingsExpanded: !value,
        }),
      setIsCapturedImagesCollapsed: (value) => set({ isCapturedImagesCollapsed: value }),
      setIsResultsCollapsed: (value) => set({ isResultsCollapsed: value }),
      setShowShortcutModal: (value) => set({ showShortcutModal: value }),
      setCapturedImages: (images) => set({ capturedImages: images }),
      addCapturedImage: (image) =>
        set((state) => ({
          capturedImages: [image, ...state.capturedImages].slice(0, 20),
        })),
      setResults: (results) => set({ results }),
      addResult: (result) =>
        set((state) => ({
          results: [result, ...state.results].slice(0, 10),
        })),
      setBestDetectionInInterval: (detection) => set({ bestDetectionInInterval: detection }),
      clearResults: () =>
        set({ capturedImages: [], results: [], bestDetectionInInterval: null }),
    }),
    {
      name: PPE_DETECTION_STORAGE_NAME,
      partialize: ({ capturedImages, results, bestDetectionInInterval, showShortcutModal, ...rest }) => rest,
      onRehydrateStorage: () => (state) => {
        if (state) {
          const mergedThresholds = { ...defaultPPEThresholds };
          Object.keys(state.ppeThresholds || {}).forEach((key) => {
            const userValue = (state.ppeThresholds as any)[key];
            if (userValue !== undefined) {
              mergedThresholds[key as keyof PPEThresholds] = userValue;
            }
          });
          state.ppeThresholds = mergedThresholds;

          if (typeof state.captureInterval === 'number' && state.captureInterval > 100) {
            state.captureInterval = Math.max(1, Math.round(state.captureInterval / 1000));
          }

          if (typeof state.isThresholdsCollapsed !== 'boolean') {
            state.isThresholdsCollapsed = !state.isSettingsExpanded;
          } else {
            state.isSettingsExpanded = !state.isThresholdsCollapsed;
          }

          if (typeof state.isCapturedImagesCollapsed !== 'boolean') {
            state.isCapturedImagesCollapsed = false;
          }

          if (typeof state.isResultsCollapsed !== 'boolean') {
            state.isResultsCollapsed = false;
          }

          state.processStageCode = state.processStageCode || '';
          state.processStageName = state.processStageName || '';
          state.pageInstanceId = state.pageInstanceId || '';
          state.cameraId = state.cameraId || '';
        }
      },
      storage: createJSONStorage(() => ({
        getItem: (name: string) => {
          try {
            const scopedValue = localStorage.getItem(name);
            if (scopedValue !== null) {
              return scopedValue;
            }
            return localStorage.getItem(LEGACY_PPE_STORAGE_NAME);
          } catch (error) {
            console.warn('localStorage读取失败，使用内存存储:', error);
            return null;
          }
        },
        setItem: (name: string, value: string) => {
          try {
            localStorage.setItem(name, value);
          } catch (error) {
            if (error instanceof Error && error.name === 'QuotaExceededError') {
              console.warn('localStorage存储空间不足，清理旧数据...');
              try {
                const currentData = localStorage.getItem(name);
                if (currentData) {
                  const parsed = JSON.parse(currentData);
                  if (parsed.state?.capturedImages) {
                    parsed.state.capturedImages = parsed.state.capturedImages.slice(0, 10);
                  }
                  if (parsed.state?.results) {
                    parsed.state.results = parsed.state.results.slice(0, 5);
                  }
                  localStorage.setItem(name, JSON.stringify(parsed));
                  console.log('已清理安全设备检测数据，保留最近记录');
                  return;
                }
              } catch (cleanupError) {
                console.error('清理数据失败:', cleanupError);
              }
            }
            console.warn('localStorage写入失败，数据将不会持久化:', error);
          }
        },
        removeItem: (name: string) => {
          try {
            localStorage.removeItem(name);
          } catch (error) {
            console.warn('localStorage删除失败:', error);
          }
        },
      })),
    }
  )
);
