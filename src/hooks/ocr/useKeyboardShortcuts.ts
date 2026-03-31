/**
 * OCR Keyboard Shortcuts Hook
 *
 * 用途：管理 OCR 页面的键盘快捷键
 * 功能：统一处理键盘事件、绑定/解绑全局快捷键
 * 使用位置：OCRDetectionScreen
 */

import { useEffect } from 'react';

export interface KeyboardShortcutsCallbacks {
  /** 空格键：手动抓拍 */
  onCapture?: () => void;
  /** 回车键：确认存疑后继续 */
  onConfirmUnqualified?: () => void;
  /** F键：切换全屏模式 */
  onToggleFullscreen?: () => void;
  /** R键：强制复位状态 */
  onResetWorkflow?: () => void;
  /** C键：切换摄像头开关 */
  onToggleCamera?: () => void;
  /** D键：切换实时检测 */
  onToggleRealtime?: () => void;
  /** P键：暂停/继续实时检测 */
  onTogglePause?: () => void;
  /** ESC键：关闭模态框 */
  onCloseModal?: () => void;
}

export interface KeyboardShortcutsOptions {
  /** 快捷键回调函数 */
  callbacks: KeyboardShortcutsCallbacks;
  /** 是否正在等待空格键 */
  isWaitingForSpace?: boolean;
  /** 摄像头是否开启 */
  isCameraOn?: boolean;
  /** 自动抓拍是否开启 */
  autoCapture?: boolean;
  /** 当前工作流状态 */
  workflowState?: string;
  /** 实时检测是否激活 */
  isRealtimeActive?: boolean;
  /** 是否处于暂停状态（用于日志输出） */
  isPaused?: boolean;
  /** 快捷键模态框是否显示 */
  showShortcutModal?: boolean;
}

/**
 * 键盘快捷键管理 Hook
 *
 * 统一管理 OCR 页面的所有快捷键：
 * - Space：手动抓拍
 * - Enter：确认存疑后继续
 * - F：切换全屏
 * - R：强制复位
 * - C：切换摄像头
 * - D：切换实时检测
 * - ESC：关闭模态框
 */
export const useKeyboardShortcuts = ({
  callbacks,
  isWaitingForSpace = false,
  isCameraOn = false,
  autoCapture = false,
  workflowState = 'idle',
  isRealtimeActive = false,
  isPaused = false,
  showShortcutModal = false,
}: KeyboardShortcutsOptions) => {
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      // 如果焦点在输入框、文本域等可编辑元素上，跳过快捷键
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // 回车键：确认存疑后继续
      if (event.code === 'Enter' && isWaitingForSpace && callbacks.onConfirmUnqualified) {
        event.preventDefault();
        console.log('回车键被按下，确认存疑并继续');
        callbacks.onConfirmUnqualified();
      }

      // 空格键：手动抓拍
      if (event.code === 'Space' && !autoCapture) {
        event.preventDefault(); // 总是阻止默认的页面滚动行为
        if (isCameraOn && workflowState === 'idle' && callbacks.onCapture) {
          console.log('空格键被按下，手动触发抓拍');
          callbacks.onCapture();
        } else {
          console.log('空格键被按下，但摄像头未开启或工作流状态不是空闲');
        }
      }

      // F键：切换全屏模式
      if (event.code === 'KeyF' && isCameraOn && callbacks.onToggleFullscreen) {
        event.preventDefault();
        console.log('F键被按下，切换全屏模式');
        callbacks.onToggleFullscreen();
      }

      // R键：强制复位所有状态
      if (event.code === 'KeyR' && callbacks.onResetWorkflow) {
        event.preventDefault();
        console.log('R键被按下，执行强制复位');
        callbacks.onResetWorkflow();
      }

      // C键：开启/关闭摄像头
      if (event.code === 'KeyC' && callbacks.onToggleCamera) {
        event.preventDefault();
        console.log('C键被按下，切换摄像头状态');
        callbacks.onToggleCamera();
      }

      // D键：开启/关闭实时检测
      if (event.code === 'KeyD' && isCameraOn && callbacks.onToggleRealtime) {
        event.preventDefault();
        console.log('D键被按下，切换实时检测状态');
        callbacks.onToggleRealtime();
      }

      // P键：暂停/继续实时检测
      if (event.code === 'KeyP' && isCameraOn && isRealtimeActive && callbacks.onTogglePause) {
        event.preventDefault();
        console.log(isPaused ? 'P键被按下，继续实时检测' : 'P键被按下，暂停实时检测');
        callbacks.onTogglePause();
      }

      // ESC键：关闭模态框
      if (event.code === 'Escape' && showShortcutModal && callbacks.onCloseModal) {
        event.preventDefault();
        console.log('ESC键被按下，关闭快捷键说明模态框');
        callbacks.onCloseModal();
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [
    callbacks,
    isWaitingForSpace,
    isCameraOn,
    autoCapture,
    workflowState,
    isRealtimeActive,
    isPaused,
    showShortcutModal,
  ]);
};
