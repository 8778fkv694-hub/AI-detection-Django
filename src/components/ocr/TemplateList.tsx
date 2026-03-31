/**
 * TemplateList Component
 *
 * 用途：显示已保存的OCR关键词模板列表
 * 功能：加载模板、删除模板
 * 使用位置：OCRDetectionScreen, OCRErrorPreventionScreen 等
 */

import React from 'react';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';
import type { OCRTemplate } from '@/types/ocr';

interface TemplateListProps {
  templates: OCRTemplate[];
  onLoadTemplate: (template: OCRTemplate) => void;
  onDeleteTemplate: (templateId: string) => void;
}

export const TemplateList: React.FC<TemplateListProps> = ({
  templates,
  onLoadTemplate,
  onDeleteTemplate,
}) => {
  if (templates.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <Label className="text-sm">已保存的模板</Label>
      <div className="space-y-1 max-h-32 overflow-y-auto">
        {templates.map((template) => (
          <div key={template.id} className="flex items-center justify-between p-2 bg-slate-700/30 rounded border border-slate-600/30">
            <div className="flex-1">
              <div className="text-sm font-medium text-slate-200">{template.name}</div>
              <div className="text-xs text-slate-400">
                {template.keywords} | {template.keywordMatchMode} | {template.minConfidence.toFixed(2)}
              </div>
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onLoadTemplate(template)}
                className="text-xs px-2 py-1 h-6"
              >
                加载
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDeleteTemplate(template.id)}
                className="text-xs px-2 py-1 h-6 text-red-400 hover:text-red-300"
              >
                删除
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
