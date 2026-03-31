import React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export interface PPEShortcutHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const shortcutItems = [
  { key: '空格', description: '手动抓拍当前画面' },
  { key: '回车', description: '开始 PPE 检测' },
  { key: 'M', description: '开始或停止实时监控' },
  { key: 'L', description: '预加载 YOLO 模型' },
  { key: 'H', description: '打开快捷键帮助' },
  { key: 'Esc', description: '关闭帮助弹窗' },
];

export const PPEShortcutHelpModal: React.FC<PPEShortcutHelpModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="max-h-[80vh] w-full max-w-xl overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700 p-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">PPE 快捷键帮助</h2>
            <p className="mt-1 text-sm text-slate-400">实时监控页面可用的键盘操作</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-400">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-3 p-5">
          {shortcutItems.map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-800/60 px-4 py-3"
            >
              <span className="font-mono text-sm font-semibold text-cyan-300">{item.key}</span>
              <span className="text-sm text-slate-300">{item.description}</span>
            </div>
          ))}
        </div>

        <div className="flex justify-end border-t border-slate-700 p-5">
          <Button onClick={onClose}>关闭</Button>
        </div>
      </div>
    </div>
  );
};
