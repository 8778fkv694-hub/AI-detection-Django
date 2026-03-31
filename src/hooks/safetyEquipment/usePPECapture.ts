/**
 * PPE Capture Hook
 *
 * 用途：抓拍逻辑
 * 功能：手动抓拍、自动抓拍、获取当前帧
 * 使用位置：SafetyEquipmentScreen
 */

import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import type { YoloDetection } from '@/lib/yoloDetector';

export interface UsePPECaptureOptions {
  /** 视频元素引用 */
  videoRef: React.RefObject<HTMLVideoElement>;
  /** 摄像头是否开启 */
  isCameraOn: boolean;
  /** 设置抓拍图片（store） */
  setCapturedImages: (images: string[]) => void;
}

export interface UsePPECaptureResult {
  /** 本地抓拍图片 */
  localCapturedImages: string[];
  /** 设置本地抓拍图片 */
  setLocalCapturedImages: (images: string[]) => void;
  /** 强制更新计数器 */
  forceUpdate: number;
  /** 设置强制更新计数器 */
  setForceUpdate: React.Dispatch<React.SetStateAction<number>>;
  /** 获取当前帧 */
  captureCurrentFrame: () => Promise<string | null>;
  /** 手动抓拍 */
  handleManualCapture: () => void;
  /** 自动抓拍 */
  handleAutoCapture: (
    detections: YoloDetection[],
    imageData?: string
  ) => Promise<string[] | null>;
  /** 清空抓拍图片 */
  handleClearCapturedImages: () => void;
}

export const usePPECapture = ({
  videoRef,
  isCameraOn,
  setCapturedImages,
}: UsePPECaptureOptions): UsePPECaptureResult => {
  const [localCapturedImages, setLocalCapturedImages] = useState<string[]>([]);
  const [forceUpdate, setForceUpdate] = useState(0);

  // 获取当前帧图片数据
  const captureCurrentFrame = useCallback(async (): Promise<string | null> => {
    const videoElement = videoRef.current;
    if (!videoElement || !isCameraOn) {
      console.log('获取当前帧失败：摄像头未开启');
      return null;
    }

    if (videoElement.readyState < 2) {
      console.log('获取当前帧失败：视频流未准备好，readyState:', videoElement.readyState);
      return null;
    }

    if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
      console.log('获取当前帧失败：video尺寸为0');
      return null;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.log('获取当前帧失败：无法创建canvas上下文');
      return null;
    }

    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    ctx.drawImage(videoElement, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hasContent = imageData.data.some((pixel) => pixel !== 0);

    if (!hasContent) {
      console.log('获取当前帧失败：无法获取视频内容');
      return null;
    }

    try {
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      const base64Data = dataUrl.split(',')[1];
      return base64Data;
    } catch (error) {
      console.error('获取当前帧失败：转换图片格式失败', error);
      return null;
    }
  }, [isCameraOn, videoRef]);

  // 手动抓拍
  const handleManualCapture = useCallback(() => {
    if (!videoRef.current || !isCameraOn) {
      toast.error('摄像头未开启');
      return;
    }

    const videoElement = videoRef.current;

    if (videoElement.readyState < 2) {
      toast.error('视频流未准备好，请稍后再试');
      return;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      toast.error('无法创建canvas上下文');
      return;
    }

    canvas.width = videoElement.videoWidth || 640;
    canvas.height = videoElement.videoHeight || 480;

    try {
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const hasContent = imageData.data.some((pixel) => pixel !== 0);

      if (!hasContent) {
        toast.error('抓拍失败：无法获取视频内容');
        return;
      }

      const base64Image = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];

      const newImages = [base64Image];

      setCapturedImages(newImages);
      setLocalCapturedImages(newImages);

      setForceUpdate((prev) => prev + 1);

      toast.success('已手动抓拍!');
    } catch (error) {
      console.error('手动抓拍错误:', error);
      toast.error('抓拍失败');
    }
  }, [isCameraOn, videoRef, setCapturedImages]);

  // 自动抓拍
  const handleAutoCapture = useCallback(
    async (detections: YoloDetection[] = [], imageData?: string) => {
      if (!videoRef.current || !isCameraOn) {
        console.log('自动抓拍失败：摄像头未开启');
        return null;
      }

      if (videoRef.current.readyState < 2) {
        console.log('自动抓拍失败：视频流未准备好');
        return null;
      }
      if (videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) {
        console.log('自动抓拍失败：video尺寸为0');
        return null;
      }

      const base64Image = imageData || (await captureCurrentFrame());
      if (!base64Image) {
        console.log('自动抓拍失败：未获取到有效图片数据');
        return null;
      }

      const newImages = [base64Image];

      setCapturedImages(newImages);
      setLocalCapturedImages(newImages);
      setForceUpdate((prev) => prev + 1);

      const personCount = detections.filter((d) => d.class === 'person').length;
      toast.success(`检测到 ${personCount} 名人员，已精选抓拍!`);

      return newImages;
    },
    [captureCurrentFrame, isCameraOn, setCapturedImages, videoRef]
  );

  // 清空抓拍图片
  const handleClearCapturedImages = useCallback(() => {
    setCapturedImages([]);
    setLocalCapturedImages([]);
    setForceUpdate((prev) => prev + 1);
    toast.success('已清空精选抓拍图片');
  }, [setCapturedImages]);

  return {
    localCapturedImages,
    setLocalCapturedImages,
    forceUpdate,
    setForceUpdate,
    captureCurrentFrame,
    handleManualCapture,
    handleAutoCapture,
    handleClearCapturedImages,
  };
};
