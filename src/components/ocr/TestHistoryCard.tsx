/**
 * 测试历史卡片组件
 *
 * 用途：显示 OCR 测试历史记录列表
 * 使用位置：OCRDetectionScreen
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { CheckCircle, XCircle } from 'lucide-react';
import type { TestResult } from '@/types/ocr';

interface TestHistoryCardProps {
  testHistory: TestResult[];
}

export const TestHistoryCard: React.FC<TestHistoryCardProps> = ({ testHistory }) => {
  if (testHistory.length === 0) {
    return null;
  }

  const formatTimestamp = (timestamp?: string) => {
    if (!timestamp) return '--:--:--';
    const parsed = new Date(timestamp);
    return Number.isNaN(parsed.getTime()) ? '--:--:--' : parsed.toLocaleTimeString();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">测试历史</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {testHistory.map((result, index) => (
            <div key={index} className="p-2 rounded bg-slate-800/50 border border-slate-700/50">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  {formatTimestamp(result.timestamp)}
                </span>
                <div className="flex items-center gap-1">
                  {result.success ? (
                    <CheckCircle className="h-3 w-3 text-green-400" />
                  ) : (
                    <XCircle className="h-3 w-3 text-red-400" />
                  )}
                  <span className={result.success ? 'text-green-400' : 'text-red-400'}>
                    {result.success ? '成功' : '失败'}
                  </span>
                </div>
              </div>
              <div className="text-xs text-slate-300 mt-1">
                {result.success ? `${result.text_count}个文字` : result.error}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
