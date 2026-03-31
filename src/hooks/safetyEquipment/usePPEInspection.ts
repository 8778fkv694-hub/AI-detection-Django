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

          // 分析核心PPE检测结果
          const personDetections = detections.filter((d) => d.class === 'person');
          const maskDetections = detections.filter((d) => d.class === 'mask');
          const hatDetections = detections.filter((d) =>
            ['Hardhat', 'helmet', 'hat', 'cleanroom_cap'].includes(d.class)
          );
          const noMaskDetections = detections.filter((d) =>
            ['NO-Mask', 'no_mask'].includes(d.class)
          );
          const noHatDetections = detections.filter((d) =>
            ['NO-Hardhat', 'no_hat', 'no_cleanroom_cap'].includes(d.class)
          );

          const hasPersonnel = personDetections.length > 0;

          const equipmentStatus = {
            faceMask:
              maskDetections.length > 0 && noMaskDetections.length === 0 ? 'worn' : 'not_worn',
            cleanroomCap:
              hatDetections.length > 0 && noHatDetections.length === 0 ? 'worn' : 'not_worn',
          };

          // 计算合规率
          let complianceScore = 0;
          const wornCount = [equipmentStatus.faceMask, equipmentStatus.cleanroomCap].filter(
            (status) => status === 'worn'
          ).length;

          if (wornCount === 2) {
            complianceScore = 100;
          } else if (wornCount === 1) {
            complianceScore = 50;
          } else {
            complianceScore = 0;
          }

          // 判断质量等级
          let overallQuality: '合格' | '需复检' | '存疑';
          if (complianceScore >= 80) {
            overallQuality = '合格';
          } else if (complianceScore === 50 || complianceScore === 0) {
            overallQuality = '需复检';
          } else if (complianceScore >= 30) {
            overallQuality = '需复检';
          } else {
            overallQuality = '存疑';
          }

          // 生成原因
          const missingItems = [];
          if (equipmentStatus.faceMask === 'not_worn') missingItems.push('口罩');
          if (equipmentStatus.cleanroomCap === 'not_worn' && hasPersonnel)
            missingItems.push('洁净帽');

          const detectionDetails = [];
          if (personDetections.length > 0)
            detectionDetails.push(`检测到${personDetections.length}名人员`);
          if (maskDetections.length > 0)
            detectionDetails.push(`检测到${maskDetections.length}个口罩`);
          if (hatDetections.length > 0)
            detectionDetails.push(`检测到${hatDetections.length}顶洁净帽`);
          if (noMaskDetections.length > 0)
            detectionDetails.push(`发现${noMaskDetections.length}人未戴口罩`);
          if (noHatDetections.length > 0)
            detectionDetails.push(`发现${noHatDetections.length}人未戴洁净帽`);

          let reason = '';
          if (overallQuality === '合格') {
            reason = `PPE穿戴合规。${detectionDetails.join(', ')}。合规率: ${complianceScore.toFixed(1)}%`;
          } else if (complianceScore === 50) {
            const detectedText =
              detectionDetails.length > 0
                ? `已检测到: ${detectionDetails.join(', ')}`
                : '未检测到任何PPE装备';
            reason = `请自我检查确认。${detectedText}。合规率: ${complianceScore.toFixed(1)}%`;
          } else if (complianceScore === 0) {
            const detectedText =
              detectionDetails.length > 0
                ? `已检测到: ${detectionDetails.join(', ')}`
                : '未检测到任何PPE装备';
            reason = `请复检。${detectedText}。合规率: ${complianceScore.toFixed(1)}%`;
          } else {
            const missingText =
              missingItems.length > 0 ? `缺少: ${missingItems.join('、')}` : '';
            const detectedText =
              detectionDetails.length > 0
                ? `已检测到: ${detectionDetails.join(', ')}`
                : '未检测到任何PPE装备';
            reason = `存疑原因: ${missingText}。${detectedText}。合规率: ${complianceScore.toFixed(1)}%`;
          }

          const result: PPEInspectionDraft = {
            image: imageData,
            overallQuality,
            score: complianceScore,
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
