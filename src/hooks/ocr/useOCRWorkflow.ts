/**
 * OCR Workflow Management Hook
 *
 * 用途：管理 OCR 检测的工作流程
 * 功能：手动抓拍、工作流状态管理、检测结果处理
 * 使用位置：OCRDetectionScreen
 */

import { useCallback } from 'react';

export interface UseOCRWorkflowOptions {
  /** 视频元素引用 */
  videoRef: React.RefObject<HTMLVideoElement>;
  /** 摄像头是否开启 */
  isCameraOn: boolean;
  /** 当前工作流状态 */
  workflowState: string;
  /** 选中的检测目标 */
  selectedTargets: (string | null)[];
  /** 是否需要合格结果确认 */
  requireQualifiedConfirmation: boolean;
  /** 处理抓拍图像的函数 */
  processCapturedImage: (
    base64Data: string,
    imageFile: File,
    source?: any
  ) => Promise<any>;
  /** 设置工作流状态 */
  setWorkflowState: (state: any) => void;
  /** 设置选中的图片 */
  setSelectedImage: (file: File | null) => void;
  /** 设置图片预览 */
  setImagePreview: (url: string) => void;
  /** 设置检测到的元素 */
  setDetectedElements: (elements: string[]) => void;
  /** 设置元素检测开始时间 */
  setElementDetectionStartTime: (time: number | null) => void;
  /** 设置是否等待空格键 */
  setIsWaitingForSpace: (waiting: boolean) => void;
  /** 设置匹配状态 */
  setMatchStatus: (status: any) => void;
  /** 设置工作流结果 */
  setWorkflowResult: (result: any) => void;
  /** 设置 AI 分析结果 */
  setAiAnalysisResult: (result: any) => void;
  /** 设置最终结果 */
  setFinalResult: (result: any) => void;
  /** 检测到的元素 Ref */
  detectedElementsRef: React.MutableRefObject<string[]>;
  /** 元素检测开始时间 Ref */
  elementDetectionStartTimeRef: React.MutableRefObject<number | null>;
}

export interface UseOCRWorkflowResult {
  /** 手动抓拍函数 */
  handleManualCapture: () => Promise<void>;
}

/**
 * OCR 工作流管理 Hook
 *
 * 职责：
 * - 手动抓拍流程：从摄像头捕获图像 → OCR处理 → 结果判定
 * - 工作流状态转换：idle → capturing → processing → waiting_for_approval/completed
 * - 检测结果处理：
 *   - 合格：根据配置决定是否需要确认
 *   - 存疑：等待用户确认
 *   - 无匹配：自动继续
 * - YOLO 检测状态重置
 */
export const useOCRWorkflow = ({
  videoRef,
  isCameraOn,
  workflowState,
  selectedTargets,
  requireQualifiedConfirmation,
  processCapturedImage,
  setWorkflowState,
  setSelectedImage,
  setImagePreview,
  setDetectedElements,
  setElementDetectionStartTime,
  setIsWaitingForSpace,
  setMatchStatus,
  setWorkflowResult,
  setAiAnalysisResult,
  setFinalResult,
  detectedElementsRef,
  elementDetectionStartTimeRef,
}: UseOCRWorkflowOptions): UseOCRWorkflowResult => {
  /**
   * 手动抓拍函数
   *
   * 流程：
   * 1. 检查前置条件（摄像头开启、工作流空闲）
   * 2. 从视频流捕获当前帧
   * 3. 转换为 base64 和 File 对象
   * 4. 调用 OCR 处理函数
   * 5. 根据检测结果决定下一步：
   *    - 合格 + 需要确认 → 等待用户确认
   *    - 合格 + 自动继续 → 直接进入下一轮
   *    - 存疑 → 等待用户确认
   *    - 无匹配 → 自动进入下一轮
   */
  const handleManualCapture = useCallback(async () => {
    if (!videoRef.current || !isCameraOn || workflowState !== 'idle') {
      return;
    }

    console.log('手动触发抓拍');
    setWorkflowState('capturing');

    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        setWorkflowState('idle');
        return;
      }

      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      const base64Data = dataUrl.split(',')[1];

      if (!base64Data) {
        setWorkflowState('idle');
        return;
      }

      // 创建抓拍图片的File对象用于二维码检测
      const capturedImageFile = new File(
        [
          canvas.toBlob
            ? await new Promise<Blob>((resolve) => {
              canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.8); // 统一使用 0.8 质量
            })
            : new Blob(),
        ],
        'captured_image.jpg',
        { type: 'image/jpeg' }
      );

      // 设置预览图片
      setSelectedImage(capturedImageFile);
      setImagePreview(dataUrl);

      // 进入处理状态
      setWorkflowState('processing');

      // 使用公共的图像处理函数
      const { finalMatchStatus } = await processCapturedImage(
        base64Data,
        capturedImageFile,
        'manual'
      );

      // 判断合格性并决定下一步
      if (finalMatchStatus === 'qualified') {
        if (requireQualifiedConfirmation) {
          console.log('检测结果：合格，等待回车键确认');
          setWorkflowState('waiting_for_approval');
          setIsWaitingForSpace(true);
        } else {
          console.log('检测结果：合格，自动进入下一个循环');
          setWorkflowState('completed');
          // 重置YOLO检测状态
          setDetectedElements([]);
          detectedElementsRef.current = []; // 同步更新ref
          setElementDetectionStartTime(null);
          elementDetectionStartTimeRef.current = null; // 同步更新ref
          setTimeout(() => {
            setWorkflowState('idle');
            setMatchStatus('none');
            setWorkflowResult(null);
            setAiAnalysisResult(null);
            setFinalResult('none');
          }, 1000); // 减少延迟时间，提升响应速度
        }
      } else {
        // 存疑、存疑、无匹配等所有非合格状态，都需要等待确认
        console.log(`检测结果：${finalMatchStatus === 'unqualified' ? '存疑' : '存疑/无匹配'}，等待回车键确认`);
        setWorkflowState('waiting_for_approval');
        setIsWaitingForSpace(true);
      }
    } catch (error) {
      console.error('手动抓拍失败:', error);
      setWorkflowState('idle');
    }
  }, [
    videoRef,
    isCameraOn,
    workflowState,
    selectedTargets,
    requireQualifiedConfirmation,
    processCapturedImage,
    setWorkflowState,
    setSelectedImage,
    setImagePreview,
    setDetectedElements,
    setElementDetectionStartTime,
    setIsWaitingForSpace,
    setMatchStatus,
    setWorkflowResult,
    setAiAnalysisResult,
    setFinalResult,
    detectedElementsRef,
    elementDetectionStartTimeRef,
  ]);

  return {
    handleManualCapture,
  };
};
