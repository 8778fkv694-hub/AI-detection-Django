import React from 'react';
import { Progress } from '@/components/ui/Progress';
import { Badge } from '@/components/ui/Badge';
import { Loader2, CheckCircle, XCircle, Clock } from 'lucide-react';

interface ProgressDisplayProps {
  isInspecting: boolean;
  totalImages: number;
  completedImages: number;
  currentImageIndex?: number;
  currentStatus?: string;
  errors?: string[];
}

export const ProgressDisplay: React.FC<ProgressDisplayProps> = ({
  isInspecting,
  totalImages,
  completedImages,
  currentImageIndex,
  currentStatus,
  errors = []
}) => {
  if (!isInspecting && totalImages === 0) {
    return null;
  }

  const progress = totalImages > 0 ? (completedImages / totalImages) * 100 : 0;
  const remainingImages = totalImages - completedImages;

  return (
    <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isInspecting ? (
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          ) : (
            <CheckCircle className="h-4 w-4 text-green-500" />
          )}
          <span className="font-medium">
            {isInspecting ? 'AI分析进行中...' : 'AI分析完成'}
          </span>
        </div>
        <Badge variant={isInspecting ? "default" : "secondary"}>
          {completedImages}/{totalImages}
        </Badge>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
          <span>进度</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {currentStatus && (
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <Clock className="h-3 w-3" />
          <span>{currentStatus}</span>
        </div>
      )}

      {errors.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
            <XCircle className="h-3 w-3" />
            <span>错误 ({errors.length})</span>
          </div>
          <div className="space-y-1">
            {errors.map((error, index) => (
              <div key={index} className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 p-2 rounded">
                {error}
              </div>
            ))}
          </div>
        </div>
      )}

      {isInspecting && remainingImages > 0 && (
        <div className="text-sm text-slate-600 dark:text-slate-400">
          剩余 {remainingImages} 张图片待分析...
        </div>
      )}
    </div>
  );
};
