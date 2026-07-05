/**
 * FullscreenVerdictBadge
 *
 * 用途：全屏检测反馈的统一判定徽章，三大视频面板（OCR/PPE/Live）共用
 * 使用位置：RealtimeDetectionPanel / SafetyCameraPanel / LiveCameraPanel 全屏态
 *
 * 注意：本组件只负责展示，不计算判定逻辑。必须渲染在被 Fullscreen API
 * 全屏的容器 DOM 之内，否则全屏时不可见。
 */

import React from 'react';
import { cn } from '@/lib/utils';

export type FullscreenVerdict = '合格' | '存疑' | '需复检' | '待检测' | '检测中';

export interface FullscreenVerdictBadgeProps {
  /** 判定结果文案，直接展示 */
  verdict: FullscreenVerdict;
  /** 可选的分数小字（如合规率） */
  score?: number;
}

const VERDICT_COLOR: Record<FullscreenVerdict, string> = {
  合格: 'text-green-400',
  存疑: 'text-yellow-400',
  需复检: 'text-red-400',
  待检测: 'text-slate-400',
  检测中: 'text-slate-400',
};

export const FullscreenVerdictBadge: React.FC<FullscreenVerdictBadgeProps> = ({
  verdict,
  score,
}) => {
  return (
    <div className="absolute top-4 left-4 z-30 bg-black/70 backdrop-blur-sm px-6 py-4 rounded-lg border border-slate-600/50 shadow-xl">
      <div className={cn('text-4xl font-bold', VERDICT_COLOR[verdict])}>{verdict}</div>
      {typeof score === 'number' && (
        <div className="mt-1 text-sm text-slate-300">{score.toFixed(1)}%</div>
      )}
    </div>
  );
};

export default FullscreenVerdictBadge;
