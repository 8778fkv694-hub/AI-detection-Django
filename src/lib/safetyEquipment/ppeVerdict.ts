/**
 * PPE 判定纯函数
 *
 * 用途：从检测结果计算 PPE 穿戴合规判定
 * 来源：从 usePPEInspection.ts 的拍照评估循环原样抽出（A1.3），
 *       阈值与映射关系逐字段保持不变，供拍照评估与全屏实时判定共用。
 */

import type { YoloDetection } from '@/lib/yoloDetector';

export interface PpeVerdict {
  overallQuality: '合格' | '需复检' | '存疑';
  score: number;
  reason: string;
  missingItems: string[];
}

export function computePpeVerdict(detections: YoloDetection[]): PpeVerdict {
  const personDetections = detections.filter((d) => d.class === 'person');
  const maskDetections = detections.filter((d) => d.class === 'mask');
  const hatDetections = detections.filter((d) =>
    ['Hardhat', 'helmet', 'hat', 'cleanroom_cap'].includes(d.class)
  );
  const noMaskDetections = detections.filter((d) => ['NO-Mask', 'no_mask'].includes(d.class));
  const noHatDetections = detections.filter((d) =>
    ['NO-Hardhat', 'no_hat', 'no_cleanroom_cap'].includes(d.class)
  );

  const hasPersonnel = personDetections.length > 0;

  const equipmentStatus = {
    faceMask: maskDetections.length > 0 && noMaskDetections.length === 0 ? 'worn' : 'not_worn',
    cleanroomCap: hatDetections.length > 0 && noHatDetections.length === 0 ? 'worn' : 'not_worn',
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
  const missingItems: string[] = [];
  if (equipmentStatus.faceMask === 'not_worn') missingItems.push('口罩');
  if (equipmentStatus.cleanroomCap === 'not_worn' && hasPersonnel) missingItems.push('洁净帽');

  const detectionDetails: string[] = [];
  if (personDetections.length > 0) detectionDetails.push(`检测到${personDetections.length}名人员`);
  if (maskDetections.length > 0) detectionDetails.push(`检测到${maskDetections.length}个口罩`);
  if (hatDetections.length > 0) detectionDetails.push(`检测到${hatDetections.length}顶洁净帽`);
  if (noMaskDetections.length > 0)
    detectionDetails.push(`发现${noMaskDetections.length}人未戴口罩`);
  if (noHatDetections.length > 0)
    detectionDetails.push(`发现${noHatDetections.length}人未戴洁净帽`);

  let reason = '';
  if (overallQuality === '合格') {
    reason = `PPE穿戴合规。${detectionDetails.join(', ')}。合规率: ${complianceScore.toFixed(1)}%`;
  } else if (complianceScore === 50) {
    const detectedText =
      detectionDetails.length > 0 ? `已检测到: ${detectionDetails.join(', ')}` : '未检测到任何PPE装备';
    reason = `请自我检查确认。${detectedText}。合规率: ${complianceScore.toFixed(1)}%`;
  } else if (complianceScore === 0) {
    const detectedText =
      detectionDetails.length > 0 ? `已检测到: ${detectionDetails.join(', ')}` : '未检测到任何PPE装备';
    reason = `请复检。${detectedText}。合规率: ${complianceScore.toFixed(1)}%`;
  } else {
    const missingText = missingItems.length > 0 ? `缺少: ${missingItems.join('、')}` : '';
    const detectedText =
      detectionDetails.length > 0 ? `已检测到: ${detectionDetails.join(', ')}` : '未检测到任何PPE装备';
    reason = `存疑原因: ${missingText}。${detectedText}。合规率: ${complianceScore.toFixed(1)}%`;
  }

  return { overallQuality, score: complianceScore, reason, missingItems };
}
