/**
 * 状态管理工具函数
 * 用于标准化状态操作，避免状态管理问题
 */

import type { InspectionResult } from '@/types';

/**
 * 标准化图片数据格式
 * 确保所有图片数据都是完整的data URL格式
 */
export const normalizeImageData = (imageData: string | null | undefined): string => {
  if (!imageData) return 'data:image/jpeg;base64,';
  if (imageData.startsWith('data:image/')) return imageData;
  return `data:image/jpeg;base64,${imageData}`;
};

/**
 * 验证检测结果数据完整性
 */
export const validateInspectionResult = (result: Partial<InspectionResult>): boolean => {
  const requiredFields = ['id', 'timestamp', 'image', 'overallQuality', 'score', 'reason'];
  return requiredFields.every(field => {
    const value = result[field as keyof InspectionResult];
    return value !== null && value !== undefined && value !== '';
  });
};

/**
 * 标准化检测结果数据
 */
export const normalizeInspectionResult = (result: Partial<InspectionResult>): InspectionResult => {
  if (!validateInspectionResult(result)) {
    throw new Error('检测结果数据不完整');
  }

  return {
    id: result.id!,
    timestamp: result.timestamp!,
    image: normalizeImageData(result.image),
    standardId: result.standardId || null,
    overallQuality: result.overallQuality!,
    score: result.score!,
    reason: result.reason!,
    reasonKeywords: result.reasonKeywords || '',
    defects: result.defects || [],
    detectionType: result.detectionType || 'unknown',
    ocrResult: result.ocrResult || undefined,
    llmResult: result.llmResult || undefined
  };
};

/**
 * 安全的图片加载处理
 */
export const createImageLoadHandler = (resultId: string) => ({
  onLoad: () => {
    console.log(`✅ 检测结果图片加载成功: ${resultId}`);
  },
  onError: (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    console.error(`❌ 检测结果图片加载失败: ${resultId}`);
    const target = e.currentTarget;
    target.style.display = 'none';

    // 显示占位符
    const placeholder = document.createElement('div');
    placeholder.className = 'w-24 h-24 bg-slate-700 rounded-md flex items-center justify-center';
    placeholder.innerHTML = '<span class="text-slate-400 text-xs">图片加载失败</span>';
    target.parentNode?.replaceChild(placeholder, target);
  }
});

/**
 * 状态更新防抖处理
 */
export const createDebouncedStateUpdater = <T>(
  setter: (value: T) => void,
  delay: number = 300
) => {
  let timeoutId: NodeJS.Timeout;

  return (value: T) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      setter(value);
    }, delay);
  };
};

/**
 * 批量状态更新
 * 确保多个状态更新在同一个渲染周期内完成
 */
export const batchStateUpdate = (updates: (() => void)[]) => {
  // 使用React的unstable_batchedUpdates如果可用
  if (typeof window !== 'undefined' && (window as any).React?.unstable_batchedUpdates) {
    (window as any).React.unstable_batchedUpdates(() => {
      updates.forEach(update => update());
    });
  } else {
    // 回退到同步执行
    updates.forEach(update => update());
  }
};

/**
 * 状态同步检查
 * 检查两个状态是否同步
 */
export const checkStateSync = <T>(
  state1: T[],
  state2: T[],
  keyField: keyof T = 'id' as keyof T
): { isSynced: boolean; differences: string[] } => {
  const differences: string[] = [];

  // 检查长度
  if (state1.length !== state2.length) {
    differences.push(`长度不匹配: ${state1.length} vs ${state2.length}`);
  }

  // 检查内容
  const keys1 = new Set(state1.map(item => item[keyField]));
  const keys2 = new Set(state2.map(item => item[keyField]));

  const missingInState2 = [...keys1].filter(key => !keys2.has(key));
  const missingInState1 = [...keys2].filter(key => !keys1.has(key));

  if (missingInState2.length > 0) {
    differences.push(`状态2缺少: ${missingInState2.join(', ')}`);
  }

  if (missingInState1.length > 0) {
    differences.push(`状态1缺少: ${missingInState1.join(', ')}`);
  }

  return {
    isSynced: differences.length === 0,
    differences
  };
};

/**
 * 配置验证工具
 */
export const validateThresholds = (thresholds: Record<string, number>): {
  isValid: boolean;
  errors: string[];
} => {
  const errors: string[] = [];

  Object.entries(thresholds).forEach(([key, value]) => {
    if (typeof value !== 'number') {
      errors.push(`${key}: 必须是数字`);
    } else if (value < 0 || value > 1) {
      errors.push(`${key}: 必须在0-1之间`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * 调试状态工具
 */
export const debugState = (stateName: string, state: any) => {
  if (process.env.NODE_ENV === 'development') {
    console.group(`🔍 状态调试: ${stateName}`);
    console.log('状态值:', state);
    console.log('状态类型:', typeof state);
    if (Array.isArray(state)) {
      console.log('数组长度:', state.length);
      console.log('数组内容:', state.map((item, index) => ({ index, item })));
    }
    console.groupEnd();
  }
};
