/**
 * Kit Matching Detection Hook
 *
 * 用途：管理齐套化检测逻辑
 * 功能：执行检测、过滤结果、保存检测结果
 * 使用位置：KitMatchingScreen
 */

import { useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import toast from 'react-hot-toast';
import { yoloDetectBackend } from '@/lib/api';
import type { YoloDetection } from '@/lib/yoloDetector';
import type { InspectionResult } from '@/types';
import type { ROISnapshot } from '@/types/kitMatching';

// 检测类型定义（与 API 保持一致）
type DetectionType = 'cleanroom_ppe' | 'kit_matching' | 'ocr_inspection' | 'ocr_fusion_inspection' | 'general_quality';

interface UseKitDetectionOptions {
  // 阈值设置
  ppeThresholds: Record<string, number>;
  captureThreshold: number;
  detectionType?: DetectionType;

  // 状态管理
  setIsMonitoring: (value: boolean) => void;
  setIsPpeActive: (value: boolean) => void;
  setIsWaitingForCooldown: (value: boolean) => void;
  lastInspectionTimeRef: React.MutableRefObject<number>;

  // 模型配置
  getAllModelClasses: () => string[];
  getCurrentModelClasses: () => string[];
  getClassChineseName: (className: string) => string;

  // 对话框状态
  setModelUnavailableDialog: (state: {
    isOpen: boolean;
    errorMessage: string;
    errorType: 'model_unavailable' | 'specific_model_unavailable';
  }) => void;

  // 结果管理
  addAppResult: (result: InspectionResult) => Promise<void>;
  results: InspectionResult[] | null;
  setResults: (results: InspectionResult[]) => void;
  setRoiSnapshots: React.Dispatch<React.SetStateAction<ROISnapshot[]>>;
}

export const useKitDetection = ({
  ppeThresholds,
  captureThreshold,
  detectionType = 'kit_matching',
  setIsMonitoring,
  setIsPpeActive,
  setIsWaitingForCooldown,
  lastInspectionTimeRef,
  getAllModelClasses,
  getCurrentModelClasses,
  getClassChineseName,
  setModelUnavailableDialog,
  addAppResult,
  results,
  setResults,
  setRoiSnapshots,
}: UseKitDetectionOptions) => {
  /**
   * 执行实时检测（用于监控模式）
   */
  const performDetection = useCallback(
    async (imageData: string): Promise<YoloDetection[]> => {
      try {
        // 使用最低的阈值进行检测，然后在前端进行过滤
        const thresholdValues = Object.values(ppeThresholds).filter(
          (v) => typeof v === 'number'
        ) as number[];
        const minThreshold = thresholdValues.length > 0 ? Math.min(...thresholdValues) : 0.5;
        const backendDetections = await yoloDetectBackend(imageData, minThreshold, { detection_type: detectionType });

        // 转换为前端统一的检测结构
        const detections: YoloDetection[] = backendDetections.map((d) => ({
          class: d.label,
          confidence: d.confidence,
          bbox: [d.bbox.x1, d.bbox.y1, d.bbox.x2 - d.bbox.x1, d.bbox.y2 - d.bbox.y1],
        }));

        // 过滤出我们关心的齐套化类别（从后端获取）
        const relevantClasses = getAllModelClasses();
        const relevantClassesSet = new Set(relevantClasses);

        const filteredDetections = detections.filter((detection) => {
          if (!relevantClassesSet.has(detection.class)) return false;

          // 使用动态阈值（从ppeThresholds中获取）
          const threshold =
            ((ppeThresholds as unknown) as Record<string, number>)[detection.class] ?? 0.8;

          // 如果阈值为0，跳过该类别的检测
          if (threshold === 0) return false;

          return detection.confidence >= threshold;
        });

        return filteredDetections;
      } catch (error) {
        console.error('后端齐套化检测失败:', error);

        // 检查是否是模型不可用的错误
        if (
          (error as any).errorType === 'model_unavailable' ||
          (error as any).errorType === 'specific_model_unavailable'
        ) {
          setModelUnavailableDialog({
            isOpen: true,
            errorMessage: (error as Error).message,
            errorType: (error as any).errorType,
          });
        } else {
          toast.error(`检测失败: ${(error as Error).message}`);
        }

        return [];
      }
    },
    [ppeThresholds, getAllModelClasses, setModelUnavailableDialog, detectionType]
  );

  /**
   * 执行抓拍检测（专门用于手动抓拍）
   */
  const performCaptureDetection = useCallback(
    async (imageData: string): Promise<YoloDetection[]> => {
      try {
        console.log('调用后端检测，阈值:', captureThreshold);

        // 验证图片数据
        if (!imageData || imageData.length === 0) {
          console.error('图片数据为空，跳过检测');
          return [];
        }

        // 验证图片数据长度（防止过大的图片）
        if (imageData.length > 1000000) {
          // 限制为1MB
          console.error('图片数据过大，跳过检测:', imageData.length);
          return [];
        }

        // 验证base64数据格式
        try {
          const testDecode = atob(imageData);
          if (testDecode.length === 0) {
            console.error('图片数据格式无效，跳过检测');
            return [];
          }
        } catch (e) {
          console.error('图片数据base64解码失败，跳过检测:', e);
          return [];
        }

        console.log('图片数据验证通过，开始后端检测');
        const backendDetections = await yoloDetectBackend(imageData, captureThreshold, { detection_type: detectionType });

        // 后端检测结果（仅在开发模式下输出日志）
        if (process.env.NODE_ENV === 'development') {
          console.log('后端原始检测结果:', backendDetections);
        }

        const detections: YoloDetection[] = backendDetections.map((d) => ({
          class: d.label,
          confidence: d.confidence,
          bbox: [d.bbox.x1, d.bbox.y1, d.bbox.x2 - d.bbox.x1, d.bbox.y2 - d.bbox.y1],
        }));

        // 过滤出我们关心的齐套化类别（从后端获取）
        const relevantClasses = getAllModelClasses();
        const relevantClassesSet = new Set(relevantClasses);
        const filteredDetections = detections.filter((detection) =>
          relevantClassesSet.has(detection.class)
        );

        // 过滤后的检测结果（仅在开发模式下输出日志）
        if (process.env.NODE_ENV === 'development') {
          console.log('过滤后的检测结果:', filteredDetections);
        }
        return filteredDetections;
      } catch (error) {
        console.error('抓拍齐套化检测失败:', error);
        return [];
      }
    },
    [captureThreshold, getAllModelClasses, detectionType]
  );

  /**
   * 保存齐套化检测结果
   */
  const saveKitMatchingResult = useCallback(
    async (stitchedImage: string) => {
      try {
        // 从ROI截图中提取已检测的类别
        let currentSnapshots: ROISnapshot[] = [];
        setRoiSnapshots((snapshots) => {
          currentSnapshots = snapshots;
          return snapshots; // 不改变状态，只是读取
        });

        // 从ROI截图中提取已检测的类别
        const currentDetectedClasses = new Set<string>(currentSnapshots.map((s) => s.class));

        // 获取当前模型需要的类别
        const requiredClasses = getCurrentModelClasses();

        // 添加调试日志
        console.log('🔍 saveKitMatchingResult 调试信息:');
        console.log('  - requiredClasses:', requiredClasses);
        console.log('  - roiSnapshots数量:', currentSnapshots.length);
        console.log('  - roiSnapshots类别:', currentSnapshots.map((s) => s.class));
        console.log('  - currentDetectedClasses:', Array.from(currentDetectedClasses));

        // 判断是否齐套：检测到所有需要的类别
        const isCompleteKit = requiredClasses.every((cls) => currentDetectedClasses.has(cls));
        console.log('  - isCompleteKit:', isCompleteKit);

        // 计算检测百分比：只计算在requiredClasses中已检测到的类别数量
        const detectedCount = requiredClasses.filter((cls) =>
          currentDetectedClasses.has(cls)
        ).length;
        const totalCount = requiredClasses.length;
        const score =
          totalCount > 0 ? Math.round(((detectedCount / totalCount) * 100 * 100)) / 100 : 0;
        console.log('  - detectedCount:', detectedCount, 'totalCount:', totalCount, 'score:', score);

        // 简单规则判断：只有合格和存疑两种结果
        const overallQuality: '合格' | '存疑' = isCompleteKit ? '合格' : '存疑';

        // 生成原因说明
        let reason = '';
        if (isCompleteKit) {
          reason = `✅ 齐套化完整！已检测到所有类别 (${currentDetectedClasses.size}/${requiredClasses.length})`;
        } else {
          const missingClasses = requiredClasses.filter((cls) => !currentDetectedClasses.has(cls));
          const missingClassNames = missingClasses.map((cls) => getClassChineseName(cls)).join('、');
          const detectedClassNames = Array.from(currentDetectedClasses)
            .map((cls) => getClassChineseName(cls))
            .join('、');
          reason = `⚠️ 齐套化不完整。已检测到: ${detectedClassNames || '无'}；缺少: ${missingClassNames}`;
        }

        // 提取base64数据（去掉data URI前缀）
        const imageData = stitchedImage.includes(',')
          ? stitchedImage.split(',')[1]
          : stitchedImage;

        // 创建检测结果
        const result: InspectionResult = {
          id: uuidv4(),
          timestamp: new Date().toISOString(),
          image: imageData,
          standardId: null,
          // @ts-ignore
          overallQuality: overallQuality,
          score,
          reason,
          // @ts-ignore
          detectionType: 'kit_matching' as const,
        };

        // 保存结果到数据库
        await addAppResult(result);

        // 更新本地结果列表
        const currentResults = results || [];
        const allResults = [result, ...currentResults];
        setResults(allResults.slice(0, 20));

        // 提交后关闭监控，进入等待冷却状态
        setIsMonitoring(false);
        setIsPpeActive(false);
        setIsWaitingForCooldown(true);
        lastInspectionTimeRef.current = Date.now();

        toast.success(`齐套化检测完成：${overallQuality === '合格' ? '✅ 合格' : '⚠️ 存疑'}`, {
          duration: 3000,
          id: 'kit-matching-result',
        });

        return result;
      } catch (error) {
        console.error('保存齐套化检测结果失败:', error);
        toast.error(
          '保存检测结果失败: ' + (error instanceof Error ? error.message : '未知错误'),
          {
            duration: 3000,
            id: 'kit-matching-result',
          }
        );
        throw error;
      }
    },
    [
      getCurrentModelClasses,
      addAppResult,
      setResults,
      results,
      getClassChineseName,
      setRoiSnapshots,
      setIsMonitoring,
      setIsPpeActive,
      setIsWaitingForCooldown,
      lastInspectionTimeRef,
    ]
  );

  return {
    performDetection,
    performCaptureDetection,
    saveKitMatchingResult,
  };
};
