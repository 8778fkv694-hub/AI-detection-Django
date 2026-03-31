/**
 * Fullscreen Hook
 *
 * 用途：管理全屏状态切换
 * 功能：进入/退出全屏、监听全屏状态变化
 * 使用位置：OCRDetectionScreen
 */

import { useCallback, useEffect } from 'react';

export interface UseFullscreenOptions {
  /** 视频容器元素ID */
  containerId?: string;
  /** 是否全屏状态 */
  isFullscreen: boolean;
  /** 设置全屏状态 */
  setIsFullscreen: (value: boolean) => void;
}

export interface UseFullscreenResult {
  /** 切换全屏 */
  toggleFullscreen: () => void;
}

export const useFullscreen = ({
  containerId = 'video-container',
  isFullscreen,
  setIsFullscreen,
}: UseFullscreenOptions): UseFullscreenResult => {
  // 全屏切换功能
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      // 进入全屏
      const videoContainer = document.getElementById(containerId);
      if (videoContainer) {
        videoContainer
          .requestFullscreen()
          .then(() => {
            setIsFullscreen(true);
          })
          .catch((err) => {
            console.error('进入全屏失败:', err);
          });
      }
    } else {
      // 退出全屏
      document
        .exitFullscreen()
        .then(() => {
          setIsFullscreen(false);
        })
        .catch((err) => {
          console.error('退出全屏失败:', err);
        });
    }
  }, [containerId, setIsFullscreen]);

  // 监听全屏状态变化（处理用户按ESC退出全屏的情况）
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!document.fullscreenElement;
      if (isFullscreen !== isCurrentlyFullscreen) {
        setIsFullscreen(isCurrentlyFullscreen);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [isFullscreen, setIsFullscreen]);

  return {
    toggleFullscreen,
  };
};
