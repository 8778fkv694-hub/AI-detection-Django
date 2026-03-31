/**
 * Live AI Detection Hook
 *
 * 用途：AI质量分析（本地/在线模式）
 * 功能：执行AI检测、处理结果、管理进度状态
 * 使用位置：LiveInspectionScreen
 */

import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import toast from 'react-hot-toast';
import { analyzeImage } from '@/lib/api';
import { analyzeImageLocalOptimized, monitorMemoryUsage } from '@/lib/optimizedLocalAI';
import type { InspectionResult, Defect } from '@/types';

// 转换AI返回的质量等级从英文到中文
const convertQualityToChinese = (quality: string): '合格' | '存疑' | '需复检' => {
  const qualityMap: { [key: string]: '合格' | '存疑' | '需复检' } = {
    Qualified: '合格',
    qualified: '合格',
    Pass: '合格',
    pass: '合格',
    Good: '合格',
    good: '合格',
    Unqualified: '存疑',
    unqualified: '存疑',
    Fail: '存疑',
    fail: '存疑',
    Bad: '存疑',
    bad: '存疑',
    Recheck: '需复检',
    recheck: '需复检',
    Review: '需复检',
    review: '需复检',
    Manual: '需复检',
    manual: '需复检',
    需人工复核: '需复检',
    需复检: '需复检',
    合格: '合格',
    存疑: '存疑',
  };
  return qualityMap[quality] || '需复检';
};

export interface ProgressState {
  totalImages: number;
  completedImages: number;
  currentImageIndex: number;
  currentStatus: string;
  errors: string[];
}

export interface UseLiveAIDetectionOptions {
  /** 是否本地模式 */
  isLocalMode: boolean;
  /** 本地模型配置 */
  localModelConfig: any;
  /** AI配置 */
  config: any;
  /** 标准列表 */
  standards: any[];
  /** 选中的标准ID */
  selectedStandardId: string | null;
  /** 抓拍图片列表 */
  capturedImages: string[];
  /** 设置抓拍图片 */
  setCapturedImages: (images: string[]) => void;
  /** 本地结果 */
  localResults: InspectionResult[];
  /** 设置本地结果 */
  setLocalResults: (results: InspectionResult[]) => void;
  /** 添加全局结果 */
  addAppResult: (result: InspectionResult) => Promise<void>;
  /** 设置是否已抓拍 */
  setHasCapturedForDetection: (value: boolean) => void;
  /** 设置是否等待AI结果 */
  setIsWaitingForAIResult: (value: boolean) => void;
  /** 设置实际提示词 */
  setActualPrompt: (prompt: string) => void;
  /** 设置显示提示词详情 */
  setShowPromptDetails: (show: boolean) => void;
}

export interface UseLiveAIDetectionResult {
  /** 是否正在检测 */
  isInspecting: boolean;
  /** 进度状态 */
  progressState: ProgressState;
  /** 直接AI检测（单张） */
  handleDirectAIDetection: (imageBase64: string) => Promise<void>;
  /** 批量AI检测 */
  handleStartAIDetection: () => Promise<void>;
  /** 取消AI检测 */
  handleCancelAIDetection: () => void;
}

export const useLiveAIDetection = ({
  isLocalMode,
  localModelConfig,
  config,
  standards,
  selectedStandardId,
  capturedImages,
  setCapturedImages,
  localResults,
  setLocalResults,
  addAppResult,
  setHasCapturedForDetection,
  setIsWaitingForAIResult,
  setActualPrompt,
  setShowPromptDetails,
}: UseLiveAIDetectionOptions): UseLiveAIDetectionResult => {
  const [isInspecting, setIsInspecting] = useState(false);
  const [progressState, setProgressState] = useState<ProgressState>({
    totalImages: 0,
    completedImages: 0,
    currentImageIndex: 0,
    currentStatus: '',
    errors: [],
  });

  // 取消AI检测
  const handleCancelAIDetection = useCallback(() => {
    setIsInspecting(false);
    setProgressState({
      totalImages: 0,
      completedImages: 0,
      currentImageIndex: 0,
      currentStatus: '',
      errors: [],
    });
    toast.success('AI检测已取消');
  }, []);

  // 解析AI结果
  const parseAIResult = (analysisResult: any): { overallQuality: '合格' | '存疑' | '需复检'; score: number; reason: string; reasonKeywords: string; defects: Defect[] } => {
    let overallQuality: '合格' | '存疑' | '需复检' = '需复检';
    let score = 50;
    let reason = 'AI分析完成';
    let reasonKeywords = 'AI检测';
    let defects: Defect[] = [];

    if ((analysisResult as any).overall_quality) {
      const rawQuality = (analysisResult as any).overall_quality;
      overallQuality = convertQualityToChinese(rawQuality);
      score = analysisResult.score || 50;
      reason = analysisResult.reason || 'AI分析完成';
      reasonKeywords = analysisResult.reasonKeywords || 'AI检测';
      defects = analysisResult.defects || [];
    } else if ((analysisResult as any).overallQuality) {
      const rawQuality = (analysisResult as any).overallQuality;
      overallQuality = convertQualityToChinese(rawQuality);
      score = analysisResult.score || 50;
      reason = analysisResult.reason || 'AI分析完成';
      reasonKeywords = analysisResult.reasonKeywords || 'AI检测';
      defects = analysisResult.defects || [];
    }

    return { overallQuality, score, reason, reasonKeywords, defects };
  };

  // 直接AI检测（单张）
  const handleDirectAIDetection = useCallback(
    async (imageBase64: string) => {
      console.log('开始直接AI检测，图片大小:', imageBase64.length);
      console.log('当前模式:', isLocalMode ? '本地模型' : '在线模型');

      if (isInspecting) {
        toast.error('检测正在进行中，请稍候');
        return;
      }

      setIsInspecting(true);
      toast.success(`开始${isLocalMode ? '本地' : '在线'}AI检测...`);

      setProgressState({
        totalImages: 1,
        completedImages: 0,
        currentImageIndex: 1,
        currentStatus: '准备开始分析...',
        errors: [],
      });

      try {
        const selectedStandard = standards.find((s) => s.id === selectedStandardId);
        let analysisResult: InspectionResult;

        if (isLocalMode) {
          analysisResult = await analyzeImageLocalOptimized(imageBase64, localModelConfig, selectedStandard, undefined, (prompt) => {
            setActualPrompt(prompt);
            setShowPromptDetails(true);
          });
          monitorMemoryUsage();
        } else {
          analysisResult = await analyzeImage(imageBase64, config, selectedStandard);
        }

        if (analysisResult) {
          const { overallQuality, score, reason, reasonKeywords, defects } = parseAIResult(analysisResult);

          const result: InspectionResult = {
            id: uuidv4(),
            timestamp: new Date().toISOString(),
            image: `data:image/jpeg;base64,${imageBase64}`,
            standardId: selectedStandardId,
            overallQuality,
            score: score || 50,
            reason: String(reason || 'AI分析完成'),
            reasonKeywords: String(reasonKeywords || 'AI检测'),
            defects: defects || [],
            detectionType: selectedStandardId ? 'standard_inspection' : 'general_quality',
          };

          const newResults = [result, ...localResults];
          setLocalResults(newResults.slice(0, 10));

          try {
            await addAppResult(result);
            console.log('结果已保存到后端');
          } catch (error) {
            console.error('保存结果到后端失败:', error);
          }

          setProgressState((prev) => ({
            ...prev,
            currentStatus: '分析完成！',
            completedImages: 1,
          }));

          toast.success('AI检测完成！');

          setTimeout(() => {
            setIsInspecting(false);
            setProgressState({
              totalImages: 0,
              completedImages: 0,
              currentImageIndex: 0,
              currentStatus: '',
              errors: [],
            });
            setCapturedImages([]);
            setHasCapturedForDetection(false);
            setIsWaitingForAIResult(false);
          }, 2000);
        } else {
          console.error('AI分析结果为空');
          toast.error('AI分析失败，结果为空');
          setIsInspecting(false);
          setCapturedImages([]);
          setHasCapturedForDetection(false);
          setIsWaitingForAIResult(false);
        }
      } catch (error) {
        console.error('直接AI检测失败:', error);
        let errorMessage = 'AI检测失败';
        if (error instanceof Error) {
          if (error.message.includes('Load failed') || error.message.includes('网络连接已中断')) {
            errorMessage = '本地AI模型服务未运行';
          } else if (error.message.includes('Failed to fetch')) {
            errorMessage = '无法连接到AI服务';
          } else if (error.message.includes('timeout')) {
            errorMessage = 'AI检测超时';
          } else {
            errorMessage = `AI检测失败: ${error.message}`;
          }
        }
        toast.error(errorMessage);
        setIsInspecting(false);
        setCapturedImages([]);
        setHasCapturedForDetection(false);
        setIsWaitingForAIResult(false);
      }
    },
    [isInspecting, isLocalMode, localModelConfig, config, standards, selectedStandardId, localResults, setLocalResults, addAppResult, setCapturedImages, setHasCapturedForDetection, setIsWaitingForAIResult, setActualPrompt, setShowPromptDetails]
  );

  // 批量AI检测
  const handleStartAIDetection = useCallback(async () => {
    console.log('开始AI检测，抓拍图片数量:', capturedImages.length);

    if (capturedImages.length === 0) {
      toast.error('请先抓拍图片');
      return;
    }

    if (isInspecting) {
      toast.error('检测正在进行中，请稍候');
      return;
    }

    setIsInspecting(true);
    toast.success(`开始${isLocalMode ? '本地' : '在线'}AI检测...`);

    setProgressState({
      totalImages: capturedImages.length,
      completedImages: 0,
      currentImageIndex: 0,
      currentStatus: '准备开始分析...',
      errors: [],
    });

    try {
      const selectedStandard = standards.find((s) => s.id === selectedStandardId);
      const settledResults: InspectionResult[] = [];

      for (let index = 0; index < capturedImages.length; index++) {
        const imageBase64 = capturedImages[index];

        try {
          setProgressState((prev) => ({
            ...prev,
            currentImageIndex: index + 1,
            currentStatus: `正在分析第 ${index + 1} 张图片...`,
          }));

          let analysisResult: InspectionResult;

          if (isLocalMode) {
            const optimizedConfig = {
              ...localModelConfig,
              contextLength: localModelConfig.contextLength || 32768,
              timeout: localModelConfig.timeout || 900000,
              retryAttempts: localModelConfig.retryAttempts || 3,
              memoryOptimization: localModelConfig.memoryOptimization || false,
              batchSize: localModelConfig.batchSize || 1,
            };

            analysisResult = await analyzeImageLocalOptimized(imageBase64, optimizedConfig, selectedStandard, undefined, (prompt) => {
              setActualPrompt(prompt);
              setShowPromptDetails(true);
            });
            monitorMemoryUsage();
          } else {
            analysisResult = await analyzeImage(imageBase64, config, selectedStandard);
          }

          if (analysisResult) {
            const { overallQuality, score, reason, reasonKeywords, defects } = parseAIResult(analysisResult);

            const result: InspectionResult = {
              id: uuidv4(),
              timestamp: new Date().toISOString(),
              image: `data:image/jpeg;base64,${imageBase64}`,
              standardId: selectedStandardId,
              overallQuality,
              score: score || 50,
              reason: String(reason || 'AI分析完成'),
              reasonKeywords: String(reasonKeywords || 'AI检测'),
              defects: defects || [],
            };

            settledResults.push(result);

            setProgressState((prev) => ({
              ...prev,
              completedImages: prev.completedImages + 1,
              currentStatus: `第 ${index + 1} 张图片分析完成`,
            }));
          }
        } catch (error) {
          console.error('单张图片AI检测失败:', error);
          const errorMessage = `第 ${index + 1} 张图片分析失败: ${error instanceof Error ? error.message : '未知错误'}`;
          setProgressState((prev) => ({
            ...prev,
            completedImages: prev.completedImages + 1,
            errors: [...prev.errors, errorMessage],
          }));
        }
      }

      const newResults = [...settledResults, ...localResults];
      setLocalResults(newResults.slice(0, 10));

      for (const result of settledResults) {
        try {
          await addAppResult(result);
        } catch (error) {
          console.error('保存结果到后端失败:', error);
        }
      }

      setProgressState((prev) => ({
        ...prev,
        currentStatus: `分析完成！成功检测 ${settledResults.length} 张图片`,
        completedImages: prev.totalImages,
      }));

      toast.success(`AI检测完成，共检测 ${settledResults.length} 张图片`);

      setTimeout(() => {
        setIsInspecting(false);
        setProgressState({
          totalImages: 0,
          completedImages: 0,
          currentImageIndex: 0,
          currentStatus: '',
          errors: [],
        });
        setHasCapturedForDetection(false);
        setIsWaitingForAIResult(false);
      }, 2000);
    } catch (error) {
      console.error('AI检测失败:', error);
      let errorMessage = 'AI检测失败';
      if (error instanceof Error) {
        if (error.message.includes('Load failed')) {
          errorMessage = '本地AI模型服务未运行';
        } else if (error.message.includes('Failed to fetch')) {
          errorMessage = '无法连接到AI服务';
        } else if (error.message.includes('timeout')) {
          errorMessage = 'AI检测超时';
        } else {
          errorMessage = `AI检测失败: ${error.message}`;
        }
      }
      toast.error(errorMessage);
      setIsInspecting(false);
      setHasCapturedForDetection(false);
      setIsWaitingForAIResult(false);
    } finally {
      setCapturedImages([]);
    }
  }, [capturedImages, isInspecting, isLocalMode, localModelConfig, config, standards, selectedStandardId, localResults, setLocalResults, addAppResult, setCapturedImages, setHasCapturedForDetection, setIsWaitingForAIResult, setActualPrompt, setShowPromptDetails]);

  return {
    isInspecting,
    progressState,
    handleDirectAIDetection,
    handleStartAIDetection,
    handleCancelAIDetection,
  };
};
