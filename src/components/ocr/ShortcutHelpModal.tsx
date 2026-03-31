/**
 * ShortcutHelpModal Component
 *
 * 用途：显示快捷键说明模态框
 * 功能：帮助用户了解可用的键盘快捷键
 * 使用位置：OCRDetectionScreen, OCRErrorPreventionScreen 等
 */

import React from 'react';
import { Button } from '@/components/ui/Button';
import { X } from 'lucide-react';

interface ShortcutHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutHelpModal: React.FC<ShortcutHelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg border border-slate-600 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-600">
          <h2 className="text-xl font-semibold text-slate-200 flex items-center gap-2">
            <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
            快捷键说明
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-slate-700/50 rounded-lg">
                <span className="text-slate-300 font-medium">空格键</span>
                <span className="text-slate-400">手动触发抓拍 (等同于点击拍照按键)</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-700/50 rounded-lg">
                <span className="text-slate-300 font-medium">回车键</span>
                <span className="text-slate-400">确认存疑结果继续</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-700/50 rounded-lg">
                <span className="text-slate-300 font-medium">F键</span>
                <span className="text-slate-400">切换全屏模式</span>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-slate-700/50 rounded-lg">
                <span className="text-slate-300 font-medium">R键</span>
                <span className="text-slate-400">重置工作流状态</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-700/50 rounded-lg">
                <span className="text-slate-300 font-medium">C键</span>
                <span className="text-slate-400">开启/关闭摄像头</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-700/50 rounded-lg">
                <span className="text-slate-300 font-medium">D键</span>
                <span className="text-slate-400">开启/关闭实时检测</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-700/50 rounded-lg">
                <span className="text-slate-300 font-medium">P键</span>
                <span className="text-slate-400">暂停/继续实时检测</span>
              </div>
            </div>
          </div>
          <div className="mt-6 p-4 bg-blue-900/20 border border-blue-500/50 rounded-lg">
            <p className="text-sm text-blue-200">
              💡 <strong>使用提示：</strong>这些快捷键可以帮助您更高效地使用OCR检测功能。建议在使用前熟悉这些快捷键。
            </p>
          </div>
        </div>
        <div className="flex justify-end p-6 border-t border-slate-600">
          <Button
            onClick={onClose}
            className="px-6"
          >
            关闭
          </Button>
        </div>
      </div>
    </div>
  );
};
