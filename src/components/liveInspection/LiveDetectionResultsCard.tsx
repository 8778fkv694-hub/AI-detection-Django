/**
 * Live Detection Results Card Component
 *
 * 用途：检测结果列表显示
 * 功能：显示检测结果、图片缩略图、质量评分
 * 使用位置：LiveInspectionScreen
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InspectionResult } from '@/types';

export interface LiveDetectionResultsCardProps {
  /** 本地结果列表 */
  localResults: InspectionResult[];
}

export const LiveDetectionResultsCard: React.FC<LiveDetectionResultsCardProps> = ({
  localResults,
}) => {
  const navigate = useNavigate();

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center justify-between">
          <span>检测结果</span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">
              {Array.isArray(localResults) ? localResults.length : 0}/10
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/live-inspection-results')}
              className="text-xs h-6 px-2"
            >
              查看所有结果
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-y-auto h-full space-y-3">
        {Array.isArray(localResults) && localResults.length > 0 ? (
          localResults.map((result) => (
            <div key={result.id} className="p-3 rounded-lg bg-white/5 space-y-2">
              <div className="flex gap-3 items-start">
                <img
                  src={
                    result.image && result.image.startsWith('data:')
                      ? result.image
                      : result.image
                        ? `data:image/jpeg;base64,${result.image}`
                        : ''
                  }
                  alt="检测图片"
                  className="w-20 h-auto object-contain rounded-md bg-black"
                />
                <div className="flex-grow space-y-1">
                  <p
                    className={cn(
                      'font-bold text-sm',
                      result.overallQuality === '合格' ? 'text-green-400' : 'text-red-400'
                    )}
                  >
                    {result.overallQuality} ({result.score})
                  </p>
                  <p className="text-xs text-slate-300">{result.reason}</p>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <Sparkles className="h-12 w-12" />
            <p className="mt-2 text-sm">等待检测...</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
