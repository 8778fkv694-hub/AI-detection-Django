/**
 * useVideoAspect
 *
 * 用途：获取视频原始宽高比（规范化坐标系），用于让视频容器跟随原始比例，
 *       避免在不同朝向（横屏/竖屏）下检测框被 CSS 拉伸变形。
 *
 * 规范化思路：
 *   - 检测框始终在「视频原始分辨率空间」绘制（canvas.width=videoWidth, canvas.height=videoHeight）。
 *   - 容器 aspect-ratio 跟随 videoWidth/videoHeight，使 canvas 的 CSS 盒子与视频内容区严格重合，
 *     缓冲区到显示区为等比缩放，无需依赖 object-contain 对 canvas 的支持（部分 WebView 不稳定）。
 */
import { useState, useEffect, type RefObject } from 'react';

export const useVideoAspect = (videoRef: RefObject<HTMLVideoElement | null>) => {
  const [aspect, setAspect] = useState<number | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const update = () => {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (w > 0 && h > 0) {
        setAspect(w / h);
      }
    };

    update();
    video.addEventListener('loadedmetadata', update);
    video.addEventListener('resize', update);

    return () => {
      video.removeEventListener('loadedmetadata', update);
      video.removeEventListener('resize', update);
    };
  }, [videoRef]);

  return aspect;
};