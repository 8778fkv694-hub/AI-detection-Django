/**
 * PPE Inspection Hook
 *
 * 用途：PPE检测结果分析与保存
 * 功能：触发自动检测、分析PPE穿戴情况、保存检测结果
 * 使用位置：SafetyEquipmentScreen
 */

import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import type { YoloDetection } from '@/lib/yoloDetector';
import { computePpeVerdict } from '@/lib/safetyEquipment/ppeVerdict';
import type { PPEInspectionDraft } from './usePPESave';

export interface UsePPEInspectionOptions {
  /** 抓拍图片列表 */
  capturedImages: string[];
  /** 执行检测函数 */
  performDetection: (imageData: string) => Promise<YoloDetection[]>;
  /** 保存分析结果 */
  saveInspectionResults: (drafts: PPEInspectionDraft[]) => Promise<{
    results: Array<unknown>;
    savedCount: number;
    failedCount: number;
  }>;
  /** 清空抓拍图片 */
  setCapturedImages: (images: string[]) => void;
  /** 设置本地抓拍图片 */
  setLocalCapturedImages: (images: string[]) => void;
  /** 强制更新 */
  setForceUpdate: React.Dispatch<React.SetStateAction<number>>;
  /** 检测状态引用 */
  isDetectingRef: React.MutableRefObject<boolean>;
}

export interface UsePPEInspectionResult {
  /** 触发自动检测 */
  triggerAutoInspection: (images?: string[]) => Promise<void>;
  /** 手动触发检测 */
  handleSafetyInspection: () => Promise<void>;
  /** 是否正在检测 */
  isDetecting: boolean;
  /** 上次检测时间 */
  lastDetectionTime: number;
}

export const usePPEInspection = ({
  capturedImages,
  performDetection,
  saveInspectionResults,
  setCapturedImages,
  setLocalCapturedImages,
  setForceUpdate,
  isDetectingRef,
}: UsePPEInspectionOptions): UsePPEInspectionResult => {
  const [isDetecting, setIsDetecting] = useState(false);
  const [lastDetectionTime, setLastDetectionTime] = useState(0);

  // 触发自动检测
  const triggerAutoInspection = useCallback(
    async (imagesToProcess?: string[]) => {
      const currentImages = imagesToProcess || capturedImages;
      if (currentImages.length === 0) return;

      if (isDetectingRef.current) {
        console.log('检测进行中，跳过本次检测');
        return;
      }

      isDetectingRef.current = true;
      setIsDetecting(true);
      setLastDetectionTime(Date.now());

      toast.loading('正在使用后端PPE检测个人防护装备穿戴情况...', { id: 'safety-inspection' });

      try {
        const inspectionDrafts: PPEInspectionDraft[] = [];

        for (let i = 0; i < currentImages.length; i++) {
          const imageData = currentImages[i];

          const detections = await performDetection(imageData);

          const { overallQuality, score, reason } = computePpeVerdict(detections);

          const result: PPEInspectionDraft = {
            image: imageData,
            overallQuality,
            score,
            reason,
            defects: [],
          };

          inspectionDrafts.push(result);
        }

        const { savedCount, failedCount } = await saveInspectionResults(inspectionDrafts);

        // 清空抓拍图片
        setTimeout(() => {
          setCapturedImages([]);
          setLocalCapturedImages([]);
          setForceUpdate((prev) => prev + 1);
        }, 2000);

        toast.success(`后端PPE检测完成，共检测 ${inspectionDrafts.length} 张图片`, {
          id: 'safety-inspection',
        });

        if (failedCount > 0) {
          console.warn(`保存完成：成功 ${savedCount} 条，失败 ${failedCount} 条`);
        }
      } catch (error) {
        toast.error(
          '后端PPE检测失败: ' + (error instanceof Error ? error.message : '未知错误'),
          { id: 'safety-inspection' }
        );
      } finally {
        isDetectingRef.current = false;
        setIsDetecting(false);
      }
    },
    [
      capturedImages,
      performDetection,
      saveInspectionResults,
      setCapturedImages,
      setLocalCapturedImages,
      setForceUpdate,
      isDetectingRef,
    ]
  );

  // 手动触发检测
  const handleSafetyInspection = useCallback(async () => {
    if (capturedImages.length === 0) return;
    await triggerAutoInspection(capturedImages);
  }, [capturedImages, triggerAutoInspection]);

  return {
    triggerAutoInspection,
    handleSafetyInspection,
    isDetecting,
    lastDetectionTime,
  };
};
