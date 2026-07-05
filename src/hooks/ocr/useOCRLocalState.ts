import { useState } from 'react';
import type { TestResult } from '@/types/ocr';
import type { CameraDevice } from '@/lib/cameraUtils';
import { OCR_DETECTION_CONFIG } from '@/screens/ocrDetection/config';

export const useOCRLocalState = () => {
  // UI 展开状态
  const [expandedTargetGroups, setExpandedTargetGroups] = useState<Set<string>>(new Set(['names', 'labels', 'others']));
  const [isDetectionStatusExpanded, setIsDetectionStatusExpanded] = useState<boolean>(false);
  const [showCompressionSettings, setShowCompressionSettings] = useState<boolean>(false);
  const [showKeywordSettings, setShowKeywordSettings] = useState<boolean>(false);
  const [showBarcodeTemplateList, setShowBarcodeTemplateList] = useState<boolean>(false);
  const [isSettingsExpanded, setIsSettingsExpanded] = useState<boolean>(false);

  // 图像与识别状态
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [ocrResult, setOcrResult] = useState<TestResult | null>(null);
  const [testHistory, setTestHistory] = useState<TestResult[]>([]);
  const [requireQualifiedConfirmation, setRequireQualifiedConfirmation] = useState<boolean>(OCR_DETECTION_CONFIG.defaultRequireQualifiedConfirmation);
  const [matchStatus, setMatchStatus] = useState<'none' | 'qualified' | 'unqualified'>('none');
  const [finalResult, setFinalResult] = useState<'qualified' | 'unqualified' | 'none'>('none');
  const [isInPostDetectionDelay, setIsInPostDetectionDelay] = useState<boolean>(false);

  // 摄像头相关状态
  const [isCameraOn, setIsCameraOn] = useState<boolean>(false);
  const [isRealtimeActive, setIsRealtimeActive] = useState<boolean>(false);
  const [availableDevices, setAvailableDevices] = useState<CameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [videoInfo, setVideoInfo] = useState<{ width: number, height: number, readyState: number } | null>(null);
  const [currentSharpness, setCurrentSharpness] = useState<number>(0);
  const [bestSharpness, setBestSharpness] = useState<number>(0);

  // 窗口标识符
  const [windowId] = useState<string>(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('windowId') || `ocr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  });

  return {
    // UI State
    expandedTargetGroups,
    setExpandedTargetGroups,
    isDetectionStatusExpanded,
    setIsDetectionStatusExpanded,
    showCompressionSettings,
    setShowCompressionSettings,
    showKeywordSettings,
    setShowKeywordSettings,
    showBarcodeTemplateList,
    setShowBarcodeTemplateList,
    isSettingsExpanded,
    setIsSettingsExpanded,

    // Image & Processing State
    selectedImage,
    setSelectedImage,
    imagePreview,
    setImagePreview,
    isProcessing,
    setIsProcessing,
    ocrResult,
    setOcrResult,
    testHistory,
    setTestHistory,
    requireQualifiedConfirmation,
    setRequireQualifiedConfirmation,
    matchStatus,
    setMatchStatus,
    finalResult,
    setFinalResult,
    isInPostDetectionDelay,
    setIsInPostDetectionDelay,

    // Camera State
    isCameraOn,
    setIsCameraOn,
    isRealtimeActive,
    setIsRealtimeActive,
    availableDevices,
    setAvailableDevices,
    selectedDeviceId,
    setSelectedDeviceId,
    videoInfo,
    setVideoInfo,
    currentSharpness,
    setCurrentSharpness,
    bestSharpness,
    setBestSharpness,

    // Identifiers
    windowId,
  };
};
