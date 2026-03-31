import { useCallback, useState } from 'react';

export interface PPEModelUnavailableDialogState {
  isOpen: boolean;
  errorMessage: string;
  errorType: 'model_unavailable' | 'specific_model_unavailable';
}

export interface UsePPELocalStateResult {
  windowId: string;
  tempFolderPath: string;
  modelUnavailableDialog: PPEModelUnavailableDialogState;
  setModelUnavailableDialog: React.Dispatch<React.SetStateAction<PPEModelUnavailableDialogState>>;
  closeModelUnavailableDialog: () => void;
}

const DEFAULT_TEMP_FOLDER_PATH =
  '/Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django/temp_clean';

const createWindowId = () => {
  if (typeof window === 'undefined') {
    return `ppe_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  const urlParams = new URLSearchParams(window.location.search);
  return (
    urlParams.get('windowId')?.trim() ||
    `ppe_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  );
};

export const usePPELocalState = (): UsePPELocalStateResult => {
  const [windowId] = useState<string>(createWindowId);
  const [tempFolderPath] = useState(DEFAULT_TEMP_FOLDER_PATH);
  const [modelUnavailableDialog, setModelUnavailableDialog] =
    useState<PPEModelUnavailableDialogState>({
      isOpen: false,
      errorMessage: '',
      errorType: 'model_unavailable',
    });

  const closeModelUnavailableDialog = useCallback(() => {
    setModelUnavailableDialog((prev) => ({ ...prev, isOpen: false }));
  }, []);

  return {
    windowId,
    tempFolderPath,
    modelUnavailableDialog,
    setModelUnavailableDialog,
    closeModelUnavailableDialog,
  };
};
