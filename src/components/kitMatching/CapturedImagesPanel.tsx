/**
 * 抓拍图片面板组件
 *
 * 用途：显示和管理齐套化检测抓拍的图片
 * 功能：图片预览、清空、保存到文件夹等
 * 使用位置：KitMatchingScreen
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Target, Trash2, Download, FolderOpen } from 'lucide-react';

interface CapturedImagesPanelProps {
  // 图片数据
  localCapturedImages: string[];
  forceUpdate: number;

  // 预览功能
  setPreviewImage: (image: string | null) => void;
  setShowPreviewModal: (show: boolean) => void;

  // 文件夹操作
  handleClearCapturedImages: () => void;
  handleSaveToTempFolder: () => Promise<void>;
  handleOpenTempFolder: () => Promise<void>;
  handleClearTempFolder: () => Promise<void>;
}

export const CapturedImagesPanel: React.FC<CapturedImagesPanelProps> = ({
  localCapturedImages,
  forceUpdate,
  setPreviewImage,
  setShowPreviewModal,
  handleClearCapturedImages,
  handleSaveToTempFolder,
  handleOpenTempFolder,
  handleClearTempFolder,
}) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          抓拍图片 ({localCapturedImages.length}) {forceUpdate > 0 && `[更新${forceUpdate}]`}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-xs text-slate-500 mb-2">
          精选抓拍：每次只保留一张最佳图片
        </div>
        {localCapturedImages.length > 0 ? (
          <div key={`captured-images-${forceUpdate}`} className="grid grid-cols-4 gap-2 max-h-60 overflow-y-auto pb-2">
            {localCapturedImages.map((img, i) => {
              return (
                <img
                  key={`${i}-${forceUpdate}`}
                  src={`data:image/jpeg;base64,${img}`}
                  className="h-20 w-full rounded-md object-cover border-2 border-transparent hover:border-blue-500 cursor-pointer transition-all"
                  alt={`抓拍图片 ${i + 1}`}
                  title="点击查看大图"
                  onClick={() => {
                    setPreviewImage(`data:image/jpeg;base64,${img}`);
                    setShowPreviewModal(true);
                  }}
                  onLoad={() => {
                    // 抓拍图片加载成功（仅在开发模式下输出日志）
                    if (process.env.NODE_ENV === 'development') {
                      console.log(`抓拍图片 ${i + 1} 加载成功`);
                    }
                  }}
                  onError={(e) => console.error(`抓拍图片 ${i + 1} 加载失败:`, e)}
                />
              );
            })}
          </div>
        ) : (
          <p key={`waiting-${forceUpdate}`} className="text-center text-xs text-slate-600 pt-4">
            等待精选抓拍... (当前数量: {localCapturedImages.length})
          </p>
        )}

        {/* 抓拍图片操作按钮 */}
        <div className="space-y-2">
          <div className="text-xs text-slate-400 text-center">
            精选抓拍模式：每次只显示一张最佳图片
          </div>
          {!(typeof window !== 'undefined' && ((window as any).Capacitor || (window as any).__IS_MOBILE_APP__)) ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={handleClearCapturedImages} className="flex-1">
                  <Trash2 className="mr-2 h-4 w-4" />清空抓拍图片
                </Button>
                <Button variant="outline" onClick={handleSaveToTempFolder} className="flex-1">
                  <Download className="mr-2 h-4 w-4" />保存到临时文件夹
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={handleOpenTempFolder} className="flex-1">
                  <FolderOpen className="mr-2 h-4 w-4" />打开临时文件夹
                </Button>
                <Button variant="outline" onClick={handleClearTempFolder} className="flex-1">
                  <Trash2 className="mr-2 h-4 w-4" />清空临时文件夹
                </Button>
              </div>
            </>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClearCapturedImages} className="w-full">
                <Trash2 className="mr-2 h-4 w-4" />清空抓拍图片
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
