/**
 * Live Image Processing Hook
 *
 * 用途：图片压缩与ROI处理
 * 功能：压缩图片、裁剪ROI区域
 * 使用位置：LiveInspectionScreen
 */

import { useCallback } from 'react';
import { useAIConfigStore } from '@/state/aiConfigStore';
import type { BackendYoloDetection } from '@/types';

export interface UseLiveImageProcessingResult {
  /** 压缩图片 */
  compressImage: (base64Image: string, maxWidth?: number, maxHeight?: number, quality?: number) => Promise<string>;
  /** 裁剪ROI区域 */
  cropImageToROI: (base64Image: string, detections: BackendYoloDetection[], maxWidth?: number, maxHeight?: number, quality?: number) => Promise<string>;
}

export const useLiveImageProcessing = (): UseLiveImageProcessingResult => {
  const { config } = useAIConfigStore();

  // 图片压缩函数
  const compressImage = useCallback(
    (
      base64Image: string,
      maxWidth: number = config.imageWidth,
      maxHeight: number = config.imageHeight,
      quality: number = config.compressionQuality
    ): Promise<string> => {
      console.log('🔧 图片压缩配置:', {
        imageWidth: config.imageWidth,
        imageHeight: config.imageHeight,
        compressionQuality: config.compressionQuality,
        compressionEnabled: config.compressionEnabled,
        maxWidth,
        maxHeight,
        quality,
      });

      // 如果压缩被禁用，直接返回原图
      if (!config.compressionEnabled) {
        console.log('📷 压缩已禁用，返回原图');
        return Promise.resolve(base64Image);
      }

      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const originalWidth = img.width;
          const originalHeight = img.height;
          const originalSize = Math.round((base64Image.length * 0.75) / 1024);

          const canvas = document.createElement('canvas');
          let { width, height } = img;

          // 计算压缩后的尺寸
          if (width > height) {
            if (width > maxWidth) {
              height = (height * maxWidth) / width;
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = (width * maxHeight) / height;
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          const compressedBase64 = canvas.toDataURL('image/jpeg', quality).split(',')[1];
          const compressedSize = Math.round((compressedBase64.length * 0.75) / 1024);

          console.log(
            `图片压缩到${maxWidth}x${maxHeight} (质量${quality}): ${originalWidth}x${originalHeight} -> ${width}x${height}, 大小: ${originalSize}KB -> ${compressedSize}KB (压缩率: ${Math.round((1 - compressedSize / originalSize) * 100)}%)`
          );

          resolve(compressedBase64);
        };
        img.src = `data:image/jpeg;base64,${base64Image}`;
      });
    },
    [config.imageWidth, config.imageHeight, config.compressionQuality, config.compressionEnabled]
  );

  // ROI裁剪功能
  const cropImageToROI = useCallback(
    (
      base64Image: string,
      detections: BackendYoloDetection[],
      maxWidth: number = config.imageWidth,
      maxHeight: number = config.imageHeight,
      quality: number = config.compressionQuality
    ): Promise<string> => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          try {
            if (detections.length === 0) {
              resolve(base64Image);
              return;
            }

            // 计算所有检测框的边界
            let minX = img.width;
            let minY = img.height;
            let maxX = 0;
            let maxY = 0;

            detections.forEach((detection) => {
              let x1, y1, x2, y2;

              if (
                detection.bbox.x1 > 1 ||
                detection.bbox.y1 > 1 ||
                detection.bbox.x2 > 1 ||
                detection.bbox.y2 > 1
              ) {
                x1 = detection.bbox.x1;
                y1 = detection.bbox.y1;
                x2 = detection.bbox.x2;
                y2 = detection.bbox.y2;
              } else {
                x1 = detection.bbox.x1 * img.width;
                y1 = detection.bbox.y1 * img.height;
                x2 = detection.bbox.x2 * img.width;
                y2 = detection.bbox.y2 * img.height;
              }

              x1 = Math.max(0, Math.min(x1, img.width));
              y1 = Math.max(0, Math.min(y1, img.height));
              x2 = Math.max(0, Math.min(x2, img.width));
              y2 = Math.max(0, Math.min(y2, img.height));

              minX = Math.min(minX, x1);
              minY = Math.min(minY, y1);
              maxX = Math.max(maxX, x2);
              maxY = Math.max(maxY, y2);
            });

            // 添加边距（20% 确保大模型能看到足够的脸部/背景上下文，防止误判）
            const marginX = (maxX - minX) * 0.2;
            const marginY = (maxY - minY) * 0.2;

            const cropX = Math.max(0, minX - marginX);
            const cropY = Math.max(0, minY - marginY);
            const cropWidth = Math.min(img.width - cropX, maxX - minX + 2 * marginX);
            const cropHeight = Math.min(img.height - cropY, maxY - minY + 2 * marginY);

            if (cropWidth <= 0 || cropHeight <= 0) {
              console.warn('ROI裁剪区域无效，返回原图');
              resolve(base64Image);
              return;
            }

            // 创建裁剪canvas
            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = cropWidth;
            cropCanvas.height = cropHeight;
            const cropCtx = cropCanvas.getContext('2d');

            if (!cropCtx) {
              console.error('无法创建裁剪canvas上下文');
              resolve(base64Image);
              return;
            }

            cropCtx.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

            // 计算压缩后的尺寸
            let finalWidth = cropWidth;
            let finalHeight = cropHeight;

            if (finalWidth > finalHeight) {
              if (finalWidth > maxWidth) {
                finalHeight = (finalHeight * maxWidth) / finalWidth;
                finalWidth = maxWidth;
              }
            } else {
              if (finalHeight > maxHeight) {
                finalWidth = (finalWidth * maxHeight) / finalHeight;
                finalHeight = maxHeight;
              }
            }

            // 创建最终canvas
            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = finalWidth;
            finalCanvas.height = finalHeight;
            const finalCtx = finalCanvas.getContext('2d');

            if (!finalCtx) {
              console.error('无法创建最终canvas上下文');
              resolve(base64Image);
              return;
            }

            finalCtx.drawImage(cropCanvas, 0, 0, cropWidth, cropHeight, 0, 0, finalWidth, finalHeight);

            const croppedBase64 = finalCanvas.toDataURL('image/jpeg', quality).split(',')[1];

            console.log(
              `🎯 ROI裁剪完成: 原图${img.width}x${img.height} -> 裁剪${cropWidth}x${cropHeight} -> 压缩${finalWidth}x${finalHeight}`
            );
            resolve(croppedBase64);
          } catch (error) {
            console.error('ROI裁剪失败:', error);
            resolve(base64Image);
          }
        };
        img.onerror = () => {
          console.error('图片加载失败');
          resolve(base64Image);
        };
        img.src = `data:image/jpeg;base64,${base64Image}`;
      });
    },
    [config.imageWidth, config.imageHeight, config.compressionQuality]
  );

  return {
    compressImage,
    cropImageToROI,
  };
};
