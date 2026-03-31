/**
 * 检测结果卡片组件
 *
 * 用途：显示齐套化检测结果列表
 * 功能：结果展示、图片预览、清空操作
 * 使用位置：KitMatchingScreen
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { User, Keyboard, Download, Trash2, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/state/appStore';
import toast from 'react-hot-toast';
import type { InspectionResult } from '@/types';

interface DetectionResultsCardProps {
  kitMatchingResults: InspectionResult[];
  setResults: (results: InspectionResult[]) => void;
  setPreviewImage: (image: string | null) => void;
  setShowPreviewModal: (show: boolean) => void;
}

export const DetectionResultsCard: React.FC<DetectionResultsCardProps> = ({
  kitMatchingResults,
  setResults,
  setPreviewImage,
  setShowPreviewModal,
}) => {
  const navigate = useNavigate();

  const handleClearAllResults = async () => {
    if (confirm('确定要清空所有检测结果吗？此操作将永久删除数据库中的所有记录，无法恢复！')) {
      try {
        // 清空本地显示
        setResults([]);

        // 清空全局状态
        const { clearAllResults } = useAppStore.getState();
        clearAllResults();

        // 清空后端数据库中的齐套化检测结果
        const response = await fetch('/api/results/clear-cleanroom/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            reason: '用户手动清空所有检测结果',
            count: kitMatchingResults.length
          })
        });

        if (response.ok) {
          toast.success('已清空所有检测结果（包括数据库记录）');
        } else {
          toast.error('清空数据库记录失败，但已清空本地显示');
        }
      } catch (error) {
        console.error('清空结果失败:', error);
        toast.error('清空失败，请重试');
      }
    }
  };

  const getImageSrc = (image: string | undefined): string => {
    if (!image) return '';
    if (image.startsWith('data:image/')) {
      return image;
    } else if (image.length > 0) {
      return `data:image/jpeg;base64,${image}`;
    }
    return '';
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          齐套化检测结果
          <span className="text-xs text-slate-400 ml-2">
            ({kitMatchingResults.length}/20)
          </span>
        </CardTitle>
        <div className="flex items-center gap-1 text-xs text-slate-400">
          <Keyboard size={14}/>
          <span>空格=抓拍 / 回车=检测 / M=监控 / L=加载模型</span>
        </div>
      </CardHeader>
      <CardContent className="overflow-y-auto h-full space-y-4">
        {/* 显示说明 */}
        <div className="text-xs text-slate-400 bg-slate-800/50 p-2 rounded">
          <p>显示: 最近20个检测结果 | 存储: 最多1000张图片 (新替旧)</p>
        </div>
        {/* 清空按钮 */}
        {kitMatchingResults.length > 0 && (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/kit-matching-results')}
              className="text-blue-400 hover:text-blue-300"
            >
              <Download className="mr-2 h-4 w-4" />
              查看所有存储结果
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearAllResults}
              className="text-red-400 hover:text-red-300"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              清空所有结果
            </Button>
          </div>
        )}
        {kitMatchingResults.length > 0 ? (
          kitMatchingResults.slice(0, 20).map(result => {
            const imageSrc = getImageSrc(result.image);
            return (
              <div key={result.id} className="p-3 rounded-lg bg-white/5 space-y-3">
                <div className="flex gap-4 items-start">
                  {imageSrc ? (
                    <img
                      src={imageSrc}
                      alt="检测图片"
                      className="w-24 h-auto object-contain rounded-md bg-black cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all"
                      title="点击查看大图"
                      onClick={() => {
                        setPreviewImage(imageSrc);
                        setShowPreviewModal(true);
                      }}
                      onLoad={() => {
                        if (process.env.NODE_ENV === 'development') {
                          console.log(`检测结果图片加载成功: ${result.id}`);
                        }
                      }}
                      onError={(e) => {
                        console.error('检测结果图片加载失败:', result.id, '图片数据长度:', result.image?.length);
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-24 h-24 bg-slate-700 rounded-md flex items-center justify-center">
                      <span className="text-slate-400 text-xs">无图片</span>
                    </div>
                  )}
                  <div className="flex-grow space-y-2">
                    <div className="flex items-center gap-2">
                      <p className={cn("font-bold",
                        result.overallQuality === '合格' ? 'text-green-400' :
                        result.overallQuality === '需复检' ? 'text-yellow-400' : 'text-red-400'
                      )}>
                        {result.overallQuality} ({result.score.toFixed(1)}%)
                      </p>
                    </div>

                    {/* 检测原因 */}
                    <div className="text-xs text-slate-300">
                      <p>{result.reason}</p>
                    </div>

                    {/* 缺陷信息 */}
                    {result.defects && result.defects.length > 0 && (
                      <div className="text-xs text-yellow-400">
                        <p className="font-medium">检测到的问题:</p>
                        <ul className="list-disc list-inside space-y-1">
                          {result.defects.map((defect, idx) => (
                            <li key={idx}>{defect.description}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <Shield className="h-16 w-16" />
            <p className="mt-4">等待齐套化检测...</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
