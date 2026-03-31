/**
 * TemplateSaveInput Component
 *
 * 用途：保存OCR关键词模板的输入框
 * 功能：输入模板名称、保存、取消
 * 使用位置：OCRDetectionScreen, OCRErrorPreventionScreen 等
 */

import React from 'react';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';

interface TemplateSaveInputProps {
  isVisible: boolean;
  templateName: string;
  onTemplateNameChange: (name: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export const TemplateSaveInput: React.FC<TemplateSaveInputProps> = ({
  isVisible,
  templateName,
  onTemplateNameChange,
  onSave,
  onCancel,
}) => {
  if (!isVisible) return null;

  return (
    <div className="p-3 bg-slate-700/50 rounded-lg border border-slate-600/50">
      <div className="space-y-2">
        <Label className="text-sm">保存当前配置为模板</Label>
        <div className="flex gap-2">
          <input
            type="text"
            value={templateName}
            onChange={(e) => onTemplateNameChange(e.target.value)}
            placeholder="输入模板名称..."
            className="flex-1 px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
          <Button
            onClick={onSave}
            size="sm"
            className="px-3"
          >
            保存
          </Button>
          <Button
            variant="outline"
            onClick={onCancel}
            size="sm"
            className="px-3"
          >
            取消
          </Button>
        </div>
      </div>
    </div>
  );
};
