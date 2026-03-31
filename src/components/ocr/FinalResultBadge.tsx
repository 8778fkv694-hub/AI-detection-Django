/**
 * FinalResultBadge Component
 *
 * 用途：显示最终检测结果徽章（合格/存疑）
 * 位置：屏幕右上角固定定位
 * 使用位置：OCRDetectionScreen, OCRErrorPreventionScreen 等
 */

import React from 'react';

interface FinalResultBadgeProps {
  finalResult: 'qualified' | 'unqualified' | 'none';
}

export const FinalResultBadge: React.FC<FinalResultBadgeProps> = ({ finalResult }) => {
  if (finalResult === 'none') return null;

  return (
    <div className="fixed top-4 right-4 z-50">
      <div className={`
        px-8 py-4 rounded-lg border-4 shadow-2xl font-bold text-2xl
        ${finalResult === 'qualified'
          ? 'bg-green-500 text-white border-green-600'
          : 'bg-red-500 text-white border-red-600'
        }
      `}>
        {finalResult === 'qualified' ? '✓ 合格' : '✗ 存疑'}
      </div>
    </div>
  );
};
