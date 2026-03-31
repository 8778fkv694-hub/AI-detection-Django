/**
 * ImageInfoCard Component
 *
 * 用途：显示选中图片的基本信息
 * 包含：文件名、文件大小、文件类型
 * 使用位置：OCRDetectionScreen, OCRErrorPreventionScreen 等
 */

import React from 'react';

interface ImageInfoCardProps {
  imageFile: File | null;
}

export const ImageInfoCard: React.FC<ImageInfoCardProps> = ({ imageFile }) => {
  if (!imageFile) return null;

  return (
    <div className="bg-slate-800/50 rounded-lg p-3 text-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-slate-400">文件名:</span>
        <span className="text-slate-300">{imageFile.name}</span>
      </div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-slate-400">文件大小:</span>
        <span className="text-slate-300">{(imageFile.size / 1024).toFixed(1)} KB</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-slate-400">文件类型:</span>
        <span className="text-slate-300">{imageFile.type}</span>
      </div>
    </div>
  );
};
