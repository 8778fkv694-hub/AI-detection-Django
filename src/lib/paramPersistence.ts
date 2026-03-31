/**
 * 参数持久化工具
 * 用于保存和恢复页面参数到localStorage
 */

export interface LiveInspectionParams {
  selectedStandardId: string | null;
  selectedTarget: string;
  detectionConfidence: number;
  autoCapture: boolean;
  showDetections: boolean;
  autoAIDetectionEnabled: boolean;
  isYoloActive: boolean;
}

const STORAGE_KEY = 'liveInspectionParams';

/**
 * 保存实时检测参数到localStorage
 */
export const saveLiveInspectionParams = (params: Partial<LiveInspectionParams>): void => {
  try {
    const existingParams = getLiveInspectionParams();
    const updatedParams = { ...existingParams, ...params };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedParams));
    console.log('💾 实时检测参数已保存:', updatedParams);
  } catch (error) {
    console.error('保存参数失败:', error);
  }
};

/**
 * 从localStorage获取实时检测参数
 */
export const getLiveInspectionParams = (): LiveInspectionParams => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const params = JSON.parse(stored);
      console.log('📖 从存储中恢复参数:', params);
      return params;
    }
  } catch (error) {
    console.error('读取参数失败:', error);
  }
  
  // 返回默认参数
  return {
    selectedStandardId: null,
    selectedTarget: 'bottle',
    detectionConfidence: 0.8,
    autoCapture: false,
    showDetections: true,
    autoAIDetectionEnabled: false,
    isYoloActive: false,
  };
};

/**
 * 清除保存的参数
 */
export const clearLiveInspectionParams = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log('🗑️ 实时检测参数已清除');
  } catch (error) {
    console.error('清除参数失败:', error);
  }
};

/**
 * 检查是否有保存的参数
 */
export const hasLiveInspectionParams = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch (error) {
    return false;
  }
};
