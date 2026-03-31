/**
 * Kit Matching ROI Processor Hook
 *
 * 用途：处理齐套化检测的 ROI（感兴趣区域）截图
 * 功能：提取 ROI、计算清晰度、拼接多个 ROI 截图
 * 使用位置：KitMatchingScreen
 */

import { useCallback } from 'react';
import type { YoloDetection } from '@/lib/yoloDetector';
import type { ROISnapshot } from '@/types/kitMatching';
import { calculateSharpnessAsync } from '@/screens/kitMatching/config';

interface UseROIProcessorOptions {
  roiSnapshots: ROISnapshot[];
}

interface ROIExtractionResult {
  image: string;
  sharpness: number;
  roiArea: number;
  imageWidth: number;
  imageHeight: number;
}

export const useROIProcessor = ({ roiSnapshots }: UseROIProcessorOptions) => {
  /**
   * 从图像中提取并保存 ROI 区域
   * @param base64Image - Base64 编码的图像
   * @param detection - YOLO 检测结果
   * @returns ROI 提取结果（包含图像、清晰度、面积等）
   */
  const extractAndSaveROI = useCallback(
    async (
      base64Image: string,
      detection: YoloDetection
    ): Promise<ROIExtractionResult | null> => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          try {
            let x1, y1, x2, y2;
            const [x, y, width, height] = detection.bbox;

            // 检查坐标格式（相对坐标或绝对坐标）
            if (x > 1 || y > 1 || width > 1 || height > 1) {
              // 绝对像素坐标
              x1 = x;
              y1 = y;
              x2 = x + width;
              y2 = y + height;
            } else {
              // 相对坐标，需要乘以图片尺寸
              x1 = x * img.width;
              y1 = y * img.height;
              x2 = (x + width) * img.width;
              y2 = (y + height) * img.height;
            }

            // 确保坐标在图片范围内
            x1 = Math.max(0, Math.min(x1, img.width));
            y1 = Math.max(0, Math.min(y1, img.height));
            x2 = Math.max(0, Math.min(x2, img.width));
            y2 = Math.max(0, Math.min(y2, img.height));

            const cropWidth = x2 - x1;
            const cropHeight = y2 - y1;

            if (cropWidth <= 0 || cropHeight <= 0) {
              resolve(null);
              return;
            }

            // 添加边距
            const margin = 10;
            const cropX = Math.max(0, x1 - margin);
            const cropY = Math.max(0, y1 - margin);
            const finalWidth = Math.min(img.width - cropX, cropWidth + 2 * margin);
            const finalHeight = Math.min(img.height - cropY, cropHeight + 2 * margin);

            // 创建ROI canvas
            const roiCanvas = document.createElement('canvas');
            roiCanvas.width = finalWidth;
            roiCanvas.height = finalHeight;
            const roiCtx = roiCanvas.getContext('2d');

            if (!roiCtx) {
              resolve(null);
              return;
            }

            roiCtx.drawImage(
              img,
              cropX,
              cropY,
              finalWidth,
              finalHeight,
              0,
              0,
              finalWidth,
              finalHeight
            );

            const roiBase64 = roiCanvas.toDataURL('image/jpeg', 0.8);

            // 异步计算清晰度（使用拉普拉斯算子，避免阻塞主线程）
            const imageData = roiCtx.getImageData(0, 0, finalWidth, finalHeight);
            // 计算ROI面积（相对于原图的比例）
            const roiArea = finalWidth * finalHeight;
            calculateSharpnessAsync(imageData).then((sharpness) => {
              resolve({
                image: roiBase64,
                sharpness,
                roiArea,
                imageWidth: img.width,
                imageHeight: img.height,
              }); // 返回包含图片、清晰度、ROI面积和原图尺寸的对象
            });
          } catch (error) {
            console.error('ROI提取失败:', error);
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        img.src = base64Image.includes(',')
          ? base64Image
          : `data:image/jpeg;base64,${base64Image}`;
      });
    },
    []
  );

  /**
   * 拼接所有 ROI 截图为一张图片
   * @returns 拼接后的 Base64 图像（不含前缀）
   */
  const stitchROISnapshots = useCallback(async (): Promise<string | null> => {
    const snapshots = roiSnapshots; // 使用当前状态
    if (snapshots.length === 0) {
      return null;
    }

    return new Promise((resolve) => {
      const images: HTMLImageElement[] = [];
      let loadedCount = 0;

      snapshots.forEach((snapshot) => {
        const img = new Image();
        img.onload = () => {
          images.push(img); // 只有加载成功的图片才加入数组
          loadedCount++;
          // 检查是否所有图片都处理完成（成功或失败）
          if (loadedCount === snapshots.length) {
            // 如果没有图片加载成功，返回null
            if (images.length === 0) {
              resolve(null);
              return;
            }
            // 所有图片加载完成，开始拼接
            const padding = 10;
            const maxWidth = 800;
            const maxHeight = 600;

            // 计算布局
            let canvasWidth = 0;
            let canvasHeight = 0;

            if (images.length === 1) {
              canvasWidth = Math.min(images[0].width, maxWidth);
              canvasHeight = Math.min(images[0].height, maxHeight);
            } else if (images.length === 2) {
              const totalWidth = images[0].width + images[1].width + padding;
              canvasWidth = Math.min(totalWidth, maxWidth);
              canvasHeight = Math.max(images[0].height, images[1].height);
            } else {
              // 网格布局
              const cols = Math.ceil(Math.sqrt(images.length));
              const rows = Math.ceil(images.length / cols);
              let maxWidthInRow = 0;
              let maxHeightInCol = 0;

              for (let i = 0; i < rows; i++) {
                let rowWidth = 0;
                let rowHeight = 0;
                for (let j = 0; j < cols && i * cols + j < images.length; j++) {
                  rowWidth += images[i * cols + j].width;
                  rowHeight = Math.max(rowHeight, images[i * cols + j].height);
                }
                maxWidthInRow = Math.max(maxWidthInRow, rowWidth);
                maxHeightInCol += rowHeight;
              }

              canvasWidth = Math.min(maxWidthInRow + (cols - 1) * padding, maxWidth);
              canvasHeight = Math.min(maxHeightInCol + (rows - 1) * padding, maxHeight);
            }

            const stitchCanvas = document.createElement('canvas');
            stitchCanvas.width = canvasWidth;
            stitchCanvas.height = canvasHeight;
            const stitchCtx = stitchCanvas.getContext('2d');

            if (!stitchCtx) {
              resolve(null);
              return;
            }

            // 填充背景
            stitchCtx.fillStyle = '#000000';
            stitchCtx.fillRect(0, 0, canvasWidth, canvasHeight);

            // 绘制图片
            if (images.length === 1) {
              stitchCtx.drawImage(images[0], 0, 0, canvasWidth, canvasHeight);
            } else if (images.length === 2) {
              let currentX = 0;
              images.forEach((img) => {
                const scale = Math.min(1, (canvasHeight - padding) / img.height);
                const scaledWidth = img.width * scale;
                const scaledHeight = img.height * scale;
                stitchCtx.drawImage(img, currentX, 0, scaledWidth, scaledHeight);
                currentX += scaledWidth + padding;
              });
            } else {
              // 网格布局
              const cols = Math.ceil(Math.sqrt(images.length));
              let currentY = 0;

              for (let i = 0; i < images.length; i += cols) {
                let currentX = 0;
                let rowHeight = 0;

                for (let j = 0; j < cols && i + j < images.length; j++) {
                  const img = images[i + j];
                  const scale = Math.min(1, (canvasWidth / cols - padding) / img.width);
                  const scaledWidth = img.width * scale;
                  const scaledHeight = img.height * scale;
                  stitchCtx.drawImage(img, currentX, currentY, scaledWidth, scaledHeight);
                  currentX += scaledWidth + padding;
                  rowHeight = Math.max(rowHeight, scaledHeight);
                }

                currentY += rowHeight + padding;
              }
            }

            const stitchedBase64 = stitchCanvas.toDataURL('image/jpeg', 0.8);
            resolve(stitchedBase64.split(',')[1]);
          }
        };
        img.onerror = (error) => {
          console.error(`加载ROI图片失败: ${snapshot.class}`, error);
          loadedCount++;
          // 即使加载失败也继续，避免阻塞其他图片
          if (loadedCount === snapshots.length) {
            // 如果所有图片都加载失败，返回null
            if (images.length === 0) {
              resolve(null);
            } else {
              // 至少有一部分图片加载成功，继续拼接
              // 这个逻辑已经在 onload 中处理了
            }
          }
        };
        // 确保使用完整的data URI格式
        img.src = snapshot.image.includes('data:')
          ? snapshot.image
          : `data:image/jpeg;base64,${snapshot.image}`;
        // 不在这里 push，只在 onload 中 push 成功的图片
      });
    });
  }, [roiSnapshots]);

  /**
   * 使用提供的快照数组拼接图片（用于获取最新状态的场景）
   * @param snapshots - ROI快照数组
   * @returns 拼接后的 data URI 图像
   */
  const stitchWithSnapshots = useCallback(
    async (
      snapshots: Array<{ class: string; image: string; timestamp: number; confidence?: number }>
    ): Promise<string | null> => {
      if (snapshots.length === 0) {
        return null;
      }

      // 创建canvas进行拼接
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // 计算布局：根据截图数量决定排列方式
      const count = snapshots.length;
      let cols: number;
      let rows: number;

      if (count === 1) {
        cols = 1;
        rows = 1;
      } else if (count === 2) {
        cols = 2;
        rows = 1;
      } else if (count <= 4) {
        cols = 2;
        rows = 2;
      } else if (count <= 6) {
        cols = 3;
        rows = 2;
      } else if (count <= 9) {
        cols = 3;
        rows = 3;
      } else {
        cols = 4;
        rows = Math.ceil(count / 4);
      }

      // 假设每个ROI图片尺寸
      const roiWidth = 400;
      const roiHeight = 300;
      const padding = 10;

      canvas.width = cols * roiWidth + (cols + 1) * padding;
      canvas.height = rows * roiHeight + (rows + 1) * padding;

      // 填充白色背景
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 加载并绘制每个ROI图片
      const imagePromises = snapshots.map((snapshot, index) => {
        return new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            const x = padding + col * (roiWidth + padding);
            const y = padding + row * (roiHeight + padding);

            ctx.drawImage(img, x, y, roiWidth, roiHeight);

            // 添加类别标签
            ctx.fillStyle = '#000000';
            ctx.font = '16px Arial';
            ctx.fillText(snapshot.class, x + 5, y + 20);

            resolve();
          };
          img.onerror = (error) => {
            console.error(`加载ROI图片失败: ${snapshot.class}`, error);
            resolve();
          };
          // 确保使用完整的data URI格式
          img.src = snapshot.image.includes('data:')
            ? snapshot.image
            : `data:image/jpeg;base64,${snapshot.image}`;
        });
      });

      await Promise.all(imagePromises);

      return canvas.toDataURL('image/jpeg', 0.9);
    },
    []
  );

  return {
    extractAndSaveROI,
    stitchROISnapshots,
    stitchWithSnapshots,
  };
};
