/**
 * PPE Keyboard Shortcuts Hook
 *
 * 用途：键盘快捷键管理
 * 功能：监听键盘事件，触发相应操作
 * 使用位置：SafetyEquipmentScreen
 *
 * 快捷键：
 * - Space: 手动抓拍
 * - Enter: 开始PPE检测
 * - M: 切换监控状态
 * - L: 加载YOLO模型
 */

import { useEffect } from 'react';

export interface UsePPEKeyboardShortcutsOptions {
  /** 摄像头是否开启 */
  isCameraOn: boolean;
  /** 抓拍图片数量 */
  capturedImagesCount: number;
  /** 手动抓拍函数 */
  onManualCapture: () => void;
  /** PPE检测函数 */
  onSafetyInspection: () => void;
  /** 切换监控状态函数 */
  onToggleMonitoring: () => void;
  /** 加载YOLO模型函数 */
  onLoadYoloModel: () => void;
  /** 快捷键帮助是否已打开 */
  showShortcutModal?: boolean;
  /** 打开快捷键帮助 */
  onOpenShortcutHelp?: () => void;
  /** 关闭快捷键帮助 */
  onCloseShortcutHelp?: () => void;
}

export const usePPEKeyboardShortcuts = ({
  isCameraOn,
  capturedImagesCount,
  onManualCapture,
  onSafetyInspection,
  onToggleMonitoring,
  onLoadYoloModel,
  showShortcutModal = false,
  onOpenShortcutHelp,
  onCloseShortcutHelp,
}: UsePPEKeyboardShortcutsOptions): void => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && showShortcutModal && onCloseShortcutHelp) {
        e.preventDefault();
        onCloseShortcutHelp();
        return;
      }

      // 手动抓拍 (Space)
      if (e.code === 'Space' && isCameraOn) {
        e.preventDefault();
        onManualCapture();
      }

      // 开始PPE检测 (Enter)
      if (e.code === 'Enter' && capturedImagesCount > 0) {
        e.preventDefault();
        onSafetyInspection();
      }

      // 切换监控状态 (M)
      if (e.code === 'KeyM' && isCameraOn) {
        e.preventDefault();
        onToggleMonitoring();
      }

      // 加载YOLO模型 (L)
      if (e.code === 'KeyL') {
        e.preventDefault();
        onLoadYoloModel();
      }

      // 打开快捷键帮助 (H)
      if (e.code === 'KeyH' && onOpenShortcutHelp) {
        e.preventDefault();
        onOpenShortcutHelp();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    isCameraOn,
    capturedImagesCount,
    onManualCapture,
    onSafetyInspection,
    onToggleMonitoring,
    onLoadYoloModel,
    showShortcutModal,
    onOpenShortcutHelp,
    onCloseShortcutHelp,
  ]);
};
