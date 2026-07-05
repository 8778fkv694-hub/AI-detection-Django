import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { InspectionResult, BackendYoloDetection } from '@/types';
import { DETECTION_CONFIDENCE_DEFAULT } from './detectionDefaults';

interface LiveInspectionState {
  // 检测配置
  selectedStandardId: string | null;
  autoCapture: boolean;
  showDetections: boolean;
  detectionConfidence: number;
  selectedTarget: string; // 保留用于向后兼容
  selectedTargets: string[]; // 新增：多选目标
  yoloDetectionMode: 'or' | 'and'; // 新增：检测模式
  yoloTimeoutSeconds: number; // 新增：AND模式超时时间
  detectedElements: string[]; // 新增：已检测到的元素（用于AND模式）
  elementDetectionStartTime: number | null; // 新增：AND模式开始检测时间
  imageSaveMode: 'full' | 'roi';

  // UI 状态
  isFullscreen: boolean;
  showPromptDetails: boolean;
  expandedTargetGroups: string[]; // 新增：检测目标分组展开状态（存储为数组以便持久化）

  // 检测历史（最近的结果）
  localResults: InspectionResult[];
  detectionResults: BackendYoloDetection[];

  // Actions
  setSelectedStandardId: (id: string | null) => void;
  setAutoCapture: (value: boolean) => void;
  setShowDetections: (value: boolean) => void;
  setDetectionConfidence: (value: number) => void;
  setSelectedTarget: (target: string) => void; // 保留用于向后兼容
  setSelectedTargets: (targets: string[]) => void; // 新增
  setYoloDetectionMode: (mode: 'or' | 'and') => void; // 新增
  setYoloTimeoutSeconds: (seconds: number) => void; // 新增
  setDetectedElements: (elements: string[]) => void; // 新增
  setElementDetectionStartTime: (time: number | null) => void; // 新增
  setImageSaveMode: (mode: 'full' | 'roi') => void;
  setIsFullscreen: (value: boolean) => void;
  setShowPromptDetails: (value: boolean) => void;
  setExpandedTargetGroups: (groups: string[] | ((prev: string[]) => string[])) => void; // 新增
  setLocalResults: (results: InspectionResult[]) => void;
  addLocalResult: (result: InspectionResult) => void;
  setDetectionResults: (results: BackendYoloDetection[]) => void;
  addDetectionResult: (result: BackendYoloDetection) => void;
  clearResults: () => void;
}

export const useLiveInspectionStore = create<LiveInspectionState>()(
  persist(
    (set) => ({
      // 默认值
      selectedStandardId: null,
      autoCapture: true,
      showDetections: true,
      detectionConfidence: DETECTION_CONFIDENCE_DEFAULT,
      selectedTarget: 'bottle', // 保留用于向后兼容
      selectedTargets: ['bottle'], // 新增：默认选择瓶子
      yoloDetectionMode: 'or', // 新增：默认OR模式
      yoloTimeoutSeconds: 5, // 新增：AND模式默认5秒超时
      detectedElements: [], // 新增
      elementDetectionStartTime: null, // 新增
      imageSaveMode: 'roi',

      // UI 默认值
      isFullscreen: false,
      showPromptDetails: false,
      expandedTargetGroups: [], // 新增：默认所有分组收起

      // 检测历史默认值
      localResults: [],
      detectionResults: [],

      // Actions 实现
      setSelectedStandardId: (id) => set({ selectedStandardId: id }),
      setAutoCapture: (value) => set({ autoCapture: value }),
      setShowDetections: (value) => set({ showDetections: value }),
      setDetectionConfidence: (value) => set({ detectionConfidence: value }),
      setSelectedTarget: (target) => set({ selectedTarget: target }), // 保留用于向后兼容
      setSelectedTargets: (targets) => set({ selectedTargets: targets }), // 新增
      setYoloDetectionMode: (mode) => set({ yoloDetectionMode: mode }), // 新增
      setYoloTimeoutSeconds: (seconds) => set({ yoloTimeoutSeconds: seconds }), // 新增
      setDetectedElements: (elements) => set({ detectedElements: elements }), // 新增
      setElementDetectionStartTime: (time) => set({ elementDetectionStartTime: time }), // 新增
      setImageSaveMode: (mode) => set({ imageSaveMode: mode }),
      setIsFullscreen: (value) => set({ isFullscreen: value }),
      setShowPromptDetails: (value) => set({ showPromptDetails: value }),
      setExpandedTargetGroups: (groups) => set((state) => ({
        expandedTargetGroups: typeof groups === 'function' ? groups(state.expandedTargetGroups) : groups
      })), // 新增：支持数组或函数更新

      // 结果管理 Actions
      setLocalResults: (results) => set({ localResults: results }),
      addLocalResult: (result) => set((state) => ({
        localResults: [result, ...state.localResults].slice(0, 10) // 只保留最近10条
      })),
      setDetectionResults: (results) => set({ detectionResults: results }),
      addDetectionResult: (result) => set((state) => ({
        detectionResults: [result, ...state.detectionResults].slice(0, 10) // 只保留最近10条
      })),
      clearResults: () => set({ localResults: [], detectionResults: [] }),
    }),
    {
      name: 'live-inspection-storage',
      // 本地检测结果包含大图，避免持久化到 localStorage
      partialize: ({ localResults, detectionResults, ...rest }) => rest,
      // 数据恢复时的转换函数，确保类型正确
      merge: (persistedState: any, currentState: LiveInspectionState) => {
        return {
          ...currentState,
          ...persistedState,
          // 确保 detectedElements 始终是数组
          detectedElements: Array.isArray(persistedState?.detectedElements)
            ? persistedState.detectedElements
            : [],
          // 确保 selectedTargets 始终是数组
          selectedTargets: Array.isArray(persistedState?.selectedTargets)
            ? persistedState.selectedTargets
            : currentState.selectedTargets,
          // 确保 expandedTargetGroups 始终是数组
          expandedTargetGroups: Array.isArray(persistedState?.expandedTargetGroups)
            ? persistedState.expandedTargetGroups
            : [],
        };
      },
      storage: createJSONStorage(() => ({
        getItem: (name: string) => {
          try {
            return localStorage.getItem(name);
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
              // 清理检测结果数据
              try {
                const currentData = localStorage.getItem(name);
                if (currentData) {
                  const parsed = JSON.parse(currentData);
                  if (parsed.state?.localResults) {
                    parsed.state.localResults = parsed.state.localResults.slice(0, 5);
                  }
                  if (parsed.state?.detectionResults) {
                    parsed.state.detectionResults = parsed.state.detectionResults.slice(0, 5);
                  }
                  localStorage.setItem(name, JSON.stringify(parsed));
                  console.log('已清理实时检测数据，保留最近5条');
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
