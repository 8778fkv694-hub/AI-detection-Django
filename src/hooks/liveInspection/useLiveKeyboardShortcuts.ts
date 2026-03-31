/**
 * Live Keyboard Shortcuts Hook
 *
 * 用途：键盘快捷键管理
 * 功能：监听键盘事件，触发相应操作
 * 使用位置：LiveInspectionScreen
 *
 * 快捷键：
 * - Space: 抓拍
 * - Y: 切换YOLO检测
 * - F: 切换全屏
 * - U: 上传图片
 * - A: AI分析
 * - T: 测试本地模型连接
 */

import { useEffect } from 'react';
import toast from 'react-hot-toast';

export interface UseLiveKeyboardShortcutsOptions {
  /** 摄像头是否开启 */
  isCameraOn: boolean;
  /** 是否全屏 */
  isFullscreen: boolean;
  /** 设置全屏状态 */
  setIsFullscreen: (value: boolean) => void;
  /** 抓拍图片数量 */
  capturedImagesCount: number;
  /** 是否正在检测 */
  isInspecting: boolean;
  /** 手动抓拍函数 */
  handleCapture: () => void;
  /** 切换YOLO检测函数 */
  toggleYoloDetection: () => void;
  /** 开始AI检测函数 */
  handleStartAIDetection: () => void;
  /** 测试本地模型连接函数 */
  testLocalModelConnection: () => void;
}

export const useLiveKeyboardShortcuts = ({
  isCameraOn,
  isFullscreen,
  setIsFullscreen,
  capturedImagesCount,
  isInspecting,
  handleCapture,
  toggleYoloDetection,
  handleStartAIDetection,
  testLocalModelConnection,
}: UseLiveKeyboardShortcutsOptions): void => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 抓拍 (Space)
      if (e.code === 'Space' && isCameraOn) {
        e.preventDefault();
        handleCapture();
      }

      // 切换YOLO检测 (Y)
      if (e.code === 'KeyY' && isCameraOn) {
        e.preventDefault();
        toggleYoloDetection();
      }

      // 切换全屏 (F)
      if (e.code === 'KeyF' && isCameraOn) {
        e.preventDefault();
        setIsFullscreen(!isFullscreen);
      }

      // 上传图片 (U)
      if (e.code === 'KeyU') {
        e.preventDefault();
        const fileInput = document.getElementById('file-upload-input') as HTMLInputElement;
        if (fileInput) {
          fileInput.click();
        }
      }

      // AI分析 (A)
      if (e.code === 'KeyA') {
        e.preventDefault();
        if (capturedImagesCount > 0 && !isInspecting) {
          handleStartAIDetection();
        } else if (capturedImagesCount === 0) {
          toast.error('请先抓拍或上传图片');
        } else if (isInspecting) {
          toast.error('AI分析正在进行中，请稍候');
        }
      }

      // 测试本地模型连接 (T)
      if (e.code === 'KeyT') {
        e.preventDefault();
        testLocalModelConnection();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    isCameraOn,
    isFullscreen,
    setIsFullscreen,
    capturedImagesCount,
    isInspecting,
    handleCapture,
    toggleYoloDetection,
    handleStartAIDetection,
    testLocalModelConnection,
  ]);
};
