import { useEffect, useRef, MutableRefObject } from 'react';

interface UseOCRSideEffectsProps {
  // Sync refs
  detectedElements: string[];
  detectedElementsRef: MutableRefObject<string[]>;
  elementDetectionStartTime: number | null;
  elementDetectionStartTimeRef: MutableRefObject<number | null>;

  // Video Info update
  isCameraOn: boolean;
  videoRef: React.RefObject<HTMLVideoElement>;
  setVideoInfo: (info: { width: number; height: number; readyState: number }) => void;

  // Barcode sync (Used for auto-enabling)
  enableBarcodeDetection: boolean;
  barcodeConfigs: any[];

  // Model standards

  // Model standards
  standards: any[];
  selectedStandardId: string | undefined;
  setSelectedStandardId: (id: string) => void;
  setKeywords: (keywords: string) => void;
  updateKeywordConfigs: (keywordText: string) => void;
  setEnableBarcodeDetection: (enabled: boolean) => void;
  fetchStandards: () => Promise<void>;
  setTemplates: any; // Used in checkOCRStatus
}

export const useOCRSideEffects = ({
  detectedElements,
  detectedElementsRef,
  elementDetectionStartTime,
  elementDetectionStartTimeRef,
  isCameraOn,
  videoRef,
  setVideoInfo,
  enableBarcodeDetection,
  barcodeConfigs,
  standards,
  selectedStandardId,
  setSelectedStandardId,
  setKeywords,
  updateKeywordConfigs,
  setEnableBarcodeDetection,
  fetchStandards,
  setTemplates
}: UseOCRSideEffectsProps) => {
  const lastAppliedStandardRef = useRef<string | null>(null);

  // 同步 detectedElements 到 ref
  useEffect(() => {
    detectedElementsRef.current = detectedElements;
  }, [detectedElements, detectedElementsRef]);

  // 同步 elementDetectionStartTime 到 ref
  useEffect(() => {
    elementDetectionStartTimeRef.current = elementDetectionStartTime;
  }, [elementDetectionStartTime, elementDetectionStartTimeRef]);

  // 定期更新视频信息
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (isCameraOn && videoRef.current) {
      intervalId = setInterval(() => {
        if (videoRef.current) {
          setVideoInfo({
            width: videoRef.current.videoWidth,
            height: videoRef.current.videoHeight,
            readyState: videoRef.current.readyState
          });
        }
      }, 1000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isCameraOn, videoRef, setVideoInfo]);

  // 批处理管理器逻辑已迁移至 useBatchProcessingManager 内部处理，此处不再手动同步

  // 加载标准数据
  useEffect(() => {
    fetchStandards().catch(console.error);
  }, [fetchStandards]);

  // 设置默认标准ID
  useEffect(() => {
    if (standards.length > 0 && !selectedStandardId) {
      setSelectedStandardId(standards[0].id);
      console.log('🔧 自动选择默认检测标准:', standards[0].name);
    }
  }, [standards, selectedStandardId, setSelectedStandardId]);

  // 当选择标准时，自动更新关键词配置
  useEffect(() => {
    if (selectedStandardId && standards.length > 0) {
      const selectedStandard = standards.find(s => s.id === selectedStandardId);
      if (selectedStandard && selectedStandard.keywords) {
        const standardSignature = `${selectedStandard.id}:${selectedStandard.keywords}`;
        if (lastAppliedStandardRef.current !== standardSignature) {
          console.log('🔧 从标准中提取关键词:', selectedStandard.keywords);
          setKeywords(selectedStandard.keywords);
          updateKeywordConfigs(selectedStandard.keywords);
          lastAppliedStandardRef.current = standardSignature;
        }
      }
    }
  }, [selectedStandardId, standards]);

  // 保留二维码配置但允许用户手动关闭检测，避免“配置存在就强制启用”。

  // 检查OCR服务状态
  useEffect(() => {
    const checkOCRStatus = async () => {
      try {
        const response = await fetch('/api/ocr/status/');
        if (response.ok) {
          const status = await response.json();
          if (status.available) {
            console.log('OCR服务可用');
          }
        }
      } catch (error) {
        console.error('检查OCR服务状态失败:', error);
      }
    };

    checkOCRStatus();
  }, [setTemplates]); // Dependency was originally setTemplates
};
