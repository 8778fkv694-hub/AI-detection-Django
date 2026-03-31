import { useEffect, useMemo } from 'react';
import { usePPEDetectionStore } from '@/state/ppeDetectionStore';

export interface PPETraceContext {
  processStageCode: string;
  processStageName: string;
  pageInstanceId: string;
  cameraId: string;
}

export interface PPEBindingSources {
  processStageCode: 'url' | 'store' | 'fallback';
  processStageName: 'url' | 'store' | 'fallback';
  pageInstanceId: 'url' | 'store' | 'fallback';
  cameraId: 'url' | 'store' | 'fallback';
}

export interface UsePPEBindingOptions {
  windowId: string;
  selectedDeviceId?: string;
}

export interface UsePPEBindingResult {
  processStageCode: string;
  processStageName: string;
  pageInstanceId: string;
  cameraId: string;
  effectiveStageCode: string;
  effectiveStageName: string;
  effectivePageId: string;
  effectiveCameraId: string;
  bindingSources: PPEBindingSources;
  traceContext: PPETraceContext;
}

export const usePPEBinding = ({
  windowId,
  selectedDeviceId,
}: UsePPEBindingOptions): UsePPEBindingResult => {
  const storedProcessStageCode = usePPEDetectionStore((state) => state.processStageCode);
  const storedProcessStageName = usePPEDetectionStore((state) => state.processStageName);
  const storedPageInstanceId = usePPEDetectionStore((state) => state.pageInstanceId);
  const storedCameraId = usePPEDetectionStore((state) => state.cameraId);
  const setBindingConfig = usePPEDetectionStore((state) => state.setBindingConfig);

  const search =
    typeof window === 'undefined'
      ? ''
      : window.location.search;

  const urlParams = useMemo(() => new URLSearchParams(search), [search]);

  const processStageCode = urlParams.get('stage_code')?.trim() || '';
  const processStageName = urlParams.get('stage_name')?.trim() || processStageCode;
  const pageInstanceId = urlParams.get('page_instance_id')?.trim() || '';
  const cameraId = urlParams.get('camera_id')?.trim() || '';

  useEffect(() => {
    const nextBindingConfig: Partial<{
      processStageCode: string;
      processStageName: string;
      pageInstanceId: string;
      cameraId: string;
    }> = {};

    if (processStageCode && processStageCode !== storedProcessStageCode) {
      nextBindingConfig.processStageCode = processStageCode;
    }

    if (processStageName && processStageName !== storedProcessStageName) {
      nextBindingConfig.processStageName = processStageName;
    }

    if (pageInstanceId && pageInstanceId !== storedPageInstanceId) {
      nextBindingConfig.pageInstanceId = pageInstanceId;
    }

    if (cameraId && cameraId !== storedCameraId) {
      nextBindingConfig.cameraId = cameraId;
    }

    if (Object.keys(nextBindingConfig).length > 0) {
      setBindingConfig(nextBindingConfig);
    }
  }, [
    cameraId,
    pageInstanceId,
    processStageCode,
    processStageName,
    setBindingConfig,
    storedCameraId,
    storedPageInstanceId,
    storedProcessStageCode,
    storedProcessStageName,
  ]);

  return useMemo(() => {
    const effectiveStageCode = processStageCode || storedProcessStageCode;
    const effectiveStageName = processStageName || storedProcessStageName || effectiveStageCode;
    const effectivePageId = pageInstanceId || storedPageInstanceId || windowId;
    const effectiveCameraId = cameraId || storedCameraId || selectedDeviceId || '';

    return {
      processStageCode,
      processStageName,
      pageInstanceId,
      cameraId,
      effectiveStageCode,
      effectiveStageName,
      effectivePageId,
      effectiveCameraId,
      bindingSources: {
        processStageCode: processStageCode ? 'url' : storedProcessStageCode ? 'store' : 'fallback',
        processStageName: processStageName ? 'url' : storedProcessStageName ? 'store' : 'fallback',
        pageInstanceId: pageInstanceId ? 'url' : storedPageInstanceId ? 'store' : 'fallback',
        cameraId: cameraId ? 'url' : storedCameraId ? 'store' : 'fallback',
      },
      traceContext: {
        processStageCode: effectiveStageCode,
        processStageName: effectiveStageName,
        pageInstanceId: effectivePageId,
        cameraId: effectiveCameraId,
      },
    };
  }, [
    cameraId,
    pageInstanceId,
    processStageCode,
    processStageName,
    selectedDeviceId,
    storedCameraId,
    storedPageInstanceId,
    storedProcessStageCode,
    storedProcessStageName,
    windowId,
  ]);
};
