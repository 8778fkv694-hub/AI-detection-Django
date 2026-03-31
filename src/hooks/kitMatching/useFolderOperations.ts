/**
 * useFolderOperations Hook
 *
 * 用途：管理齐套化页面的文件夹操作
 * 功能：保存图片、打开文件夹、清空文件夹等
 * 使用位置：KitMatchingScreen
 */

import { useCallback } from 'react';
import toast from 'react-hot-toast';

export interface FolderOperationsOptions {
  tempFolderPath: string;
  localCapturedImages: string[];
  setCapturedImages: (images: string[]) => void;
  setLocalCapturedImages: (images: string[]) => void;
  setForceUpdate: React.Dispatch<React.SetStateAction<number>>;
}

export interface UseFolderOperationsReturn {
  handleClearCapturedImages: () => void;
  handleSaveToTempFolder: () => Promise<void>;
  handleOpenTempFolder: () => Promise<void>;
  handleClearTempFolder: () => Promise<void>;
}

export const useFolderOperations = (options: FolderOperationsOptions): UseFolderOperationsReturn => {
  const {
    tempFolderPath,
    localCapturedImages,
    setCapturedImages,
    setLocalCapturedImages,
    setForceUpdate,
  } = options;

  // 清空抓拍图片
  const handleClearCapturedImages = useCallback(() => {
    setCapturedImages([]);
    setLocalCapturedImages([]);
    setForceUpdate(prev => prev + 1);
    toast.success('已清空精选抓拍图片');
  }, [setCapturedImages, setLocalCapturedImages, setForceUpdate]);

  // 保存到临时文件夹
  const handleSaveToTempFolder = useCallback(async () => {
    if (localCapturedImages.length === 0) {
      toast.error('没有图片可保存，请先抓拍图片');
      return;
    }

    console.log(`开始保存 ${localCapturedImages.length} 张图片到临时文件夹`);
    let successCount = 0;

    for (let i = 0; i < localCapturedImages.length; i++) {
      const fileName = `clean_capture_${Date.now()}_${i}.jpg`;
      const base64Image = localCapturedImages[i];

      try {
        console.log(`保存第 ${i + 1} 张图片: ${fileName}`);
        const saveResponse = await fetch('/api/rpa/save-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64Image, fileName, folder: tempFolderPath })
        });

        if (saveResponse.ok) {
          const result = await saveResponse.json();
          console.log(`第 ${i + 1} 张图片保存成功:`, result);
          successCount++;
        } else {
          console.error(`第 ${i + 1} 张图片保存失败:`, saveResponse.status, saveResponse.statusText);
        }
      } catch (error) {
        console.error(`第 ${i + 1} 张图片保存出错:`, error);
      }
    }

    if (successCount > 0) {
      toast.success(`成功保存 ${successCount}/${localCapturedImages.length} 张图片到临时文件夹`);
    } else {
      toast.error('保存图片失败，请检查控制台日志');
    }
  }, [localCapturedImages, tempFolderPath]);

  // 打开临时文件夹
  const handleOpenTempFolder = useCallback(async () => {
    const response = await fetch('/api/rpa/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath: tempFolderPath })
    });
    if (response.ok) {
      toast.success('已打开临时文件夹');
    } else {
      toast.error('打开临时文件夹失败');
    }
  }, [tempFolderPath]);

  // 清空临时文件夹
  const handleClearTempFolder = useCallback(async () => {
    const response = await fetch('/api/rpa/clear-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath: tempFolderPath })
    });
    if (response.ok) {
      const result = await response.json();
      toast.success(`已清空临时文件夹，删除了 ${result.deletedCount} 个文件`);
    } else {
      toast.error('清空临时文件夹失败');
    }
  }, [tempFolderPath]);

  return {
    handleClearCapturedImages,
    handleSaveToTempFolder,
    handleOpenTempFolder,
    handleClearTempFolder,
  };
};
