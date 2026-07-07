/**
 * useHardwareFallbackKeys
 *
 * 瞰顾:键盘 ⇄ 硬件的透明后备层。当 Arduino / 光电传感器未连接或失灵时,
 * 让键盘按键直接派发"硬件事件"等价的回调,使工作流无缝继续。
 *
 * 默认按键映射(与 useKeyboardShortcuts 现有 Space/Enter/R 等不冲突):
 *   - PageDown     -> onStopCapture     (替代 CAPTURE_END / STOP_CAPTURE 信号)
 *   - Home         -> onTrigger         (替代 TRIGGER 工件到位)
 *   - Delete       -> onClear            (替代 CLEAR 工件离开)
 *   - End          -> onConfirmUnqualified (替代 MANUAL_PASS)
 *   - PageUp       -> onResetWorkflow   (替代 RESET 故障复位)
 *
 * 冲突规避:仅在 input/textarea/contentEditable 之外响应;与浏览器原生 tab 焦点回车不冲突。
 *
 * 部署意图:所有检测页在 useHardwareTrigger 之外同时挂载本 hook。
 * 即使硬件在线,这些键也工作(冗余触发);硬件离线时则是唯一退路。
 */

import { useEffect } from 'react';

export interface HardwareFallbackKeysCallbacks {
  /** 工件到位(TRIGGER) */
  onTrigger?: () => void;
  /** 工件离开(CLEAR) */
  onClear?: () => void;
  /** 故障复位(RESET) */
  onResetWorkflow?: () => void;
  /** 手动放行(MANUAL_PASS) */
  onConfirmUnqualified?: () => void;
  /** 采集结束(STOP_CAPTURE/CAPTURE_END) */
  onStopCapture?: () => void;
}

export interface UseHardwareFallbackKeysOptions {
  callbacks: HardwareFallbackKeysCallbacks;
  /** 是否启用(默认 true)。无硬件/模拟模式应启用,真机在线亦可启用 */
  enabled?: boolean;
}

const isEditable = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  );
};

export const useHardwareFallbackKeys = ({
  callbacks,
  enabled = true,
}: UseHardwareFallbackKeysOptions): void => {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return;

      switch (e.code) {
        case 'Home':
          if (callbacks.onTrigger) {
            e.preventDefault();
            callbacks.onTrigger();
          }
          break;
        case 'Delete':
          if (callbacks.onClear) {
            e.preventDefault();
            callbacks.onClear();
          }
          break;
        case 'PageUp':
          if (callbacks.onResetWorkflow) {
            e.preventDefault();
            callbacks.onResetWorkflow();
          }
          break;
        case 'End':
          if (callbacks.onConfirmUnqualified) {
            e.preventDefault();
            callbacks.onConfirmUnqualified();
          }
          break;
        case 'PageDown':
          if (callbacks.onStopCapture) {
            e.preventDefault();
            callbacks.onStopCapture();
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [callbacks, enabled]);
};