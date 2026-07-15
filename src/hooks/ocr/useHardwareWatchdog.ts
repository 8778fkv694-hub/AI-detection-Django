/**
 * useHardwareWatchdog
 *
 * 眬顾:硬件采集流程的看门狗。当 Arduino 等外设向网页发送 TRIGGER 启动旋转/采集后,
 * 如果在 timeoutMs 内未收到 STOP_CAPTURE 信号(例如:移动视角失灵/断电/串口被拔/
 * 信号线脱落),本 hook 自动触发 onTimeout 回调,让上层执行降级评估或复位,
 * 避免工作流无止境卡在 'capturing' 状态等待信号。
 *
 * 它与 useHardwareTrigger 配合工作:
 *   - useHardwareTrigger 在收到 TRIGGER/CAPTURE_END 等任何串口信号时调用 markActivity()
 *   - 本 hook 在事件循环空闲期检测超时,到期调用 onTimeout
 *
 * 多页面共用模式:每个检测页自行实例化,本地 state 彼此隔离。
 *
 * 静默策略:无 'armed' 状态时完全空跑(无 timer、无日志),保证未启用场景零开销。
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseHardwareWatchdogOptions {
  /** 是否布防(页面处于采集中且依赖硬件结束时为 true) */
  armed: boolean;
  /** 超时阈值(毫秒),默认 30s -- 给移动视角完整周期留够时间 */
  timeoutMs?: number;
  /** 超时回调(典型:降级触发与 STOP_CAPTURE 等价的评估流程) */
  onTimeout: () => void;
  /** 是否在控制台打印调试日志(开发场景 true,生产默认 false) */
  debug?: boolean;
}

export interface UseHardwareWatchdogResult {
  /** 主动标记一次硬件活动(收到任何串口信号时调用,重置计时) */
  markActivity: () => void;
  /** 距离上次活动到现在已过的毫秒数 */
  elapsedMs: number;
  /** 当前布防中(armed=true 且计时器已启动) */
  isRunning: boolean;
  /** 剩余毫秒(只读,渲染进度条用) */
  remainingMs: number;
}

export const useHardwareWatchdog = ({
  armed,
  timeoutMs = 30_000,
  onTimeout,
  debug = false,
}: UseHardwareWatchdogOptions): UseHardwareWatchdogResult => {
  const onTimeoutRef = useRef(onTimeout);
  useEffect(() => { onTimeoutRef.current = onTimeout; }, [onTimeout]);

  const lastActivityRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  const [, forceTick] = useState(0);

  // 每 500ms 检查一次:超时则触发回调;否则 forceTick 让 remainingMs 实时更新
  useEffect(() => {
    if (!armed) {
      lastActivityRef.current = null;
      firedRef.current = false;
      return;
    }
    if (lastActivityRef.current === null) {
      lastActivityRef.current = Date.now();
      firedRef.current = false;
      if (debug) console.log('[watchdog] 布防,计时开始', { timeoutMs });
    }

    const interval = window.setInterval(() => {
      const last = lastActivityRef.current;
      if (last === null) return;
      const now = Date.now();
      const elapsed = now - last;
      const remaining = Math.max(0, timeoutMs - elapsed);

      if (remaining === 0 && !firedRef.current) {
        firedRef.current = true;
        if (debug) console.warn('[watchdog] 采集超时,触发降级评估/复位');
        try {
          onTimeoutRef.current();
        } catch (err) {
          console.error('[watchdog] onTimeout 抛错:', err);
        }
      }
      // 50ms 一次刷新进度最优;500ms 既不抖 UI 也足够细
      forceTick(v => v + 1);
    }, 500);

    return () => {
      window.clearInterval(interval);
    };
  }, [armed, timeoutMs, debug]);

  const markActivity = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    firedRef.current = false;
    if (debug) console.log('[watchdog] 收到活动,重置计时');
  }, [debug]);

  const last = lastActivityRef.current;
  const elapsedMs = last === null ? 0 : Math.min(timeoutMs, Date.now() - last);
  const remainingMs = Math.max(0, timeoutMs - elapsedMs);

  return {
    markActivity,
    elapsedMs,
    isRunning: armed && last !== null,
    remainingMs,
  };
};