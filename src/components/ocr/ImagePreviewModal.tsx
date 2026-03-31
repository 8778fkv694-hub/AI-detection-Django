/**
 * ImagePreviewModal Component
 *
 * 用途：图片预览模态框
 * 功能：显示放大的图片，支持关闭
 * 使用位置：OCRResultDisplay
 */

import React from 'react';
import { X } from 'lucide-react';

interface ImagePreviewModalProps {
  /** 图片URL或data URL */
  imageUrl: string;
  /** 是否显示 */
  isOpen: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 图片alt文本 */
  alt?: string;
}

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  imageUrl,
  isOpen,
  onClose,
  alt = '图片预览'
}) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      {/* 模态框容器 */}
      <div 
        className="relative max-w-4xl max-h-[90vh] w-full h-full flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors shadow-lg"
          title="关闭预览"
        >
          <X className="h-6 w-6" />
        </button>

        {/* 图片容器 */}
        <div className="relative w-full h-full flex items-center justify-center overflow-auto">
          <img
            src={imageUrl}
            alt={alt}
            className="max-w-full max-h-full object-contain"
          />
        </div>
      </div>
    </div>
  );
};

