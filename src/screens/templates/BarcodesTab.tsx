import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Trash2 } from 'lucide-react';
import {
  fetchBarcodeTemplates,
  deleteBarcodeTemplate,
} from '@/lib/ocrTemplatesApi';
import type { BarcodeTemplate } from '@/types/ocr';

export function BarcodesTab() {
  const [templates, setTemplates] = useState<BarcodeTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetchBarcodeTemplates()
      .then(setTemplates)
      .catch(() => toast.error('加载条码模版失败'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (template: BarcodeTemplate) => {
    if (!window.confirm(`确认删除「${template.name}」？`)) return;
    try {
      await deleteBarcodeTemplate(template.id);
      toast.success('已删除');
      load();
    } catch (error: any) {
      toast.error(error.message || '删除失败');
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        条码模版在 OCR 检测页面中使用。可在检测页面设置面板中将当前配置保存为模版，或从此处查看和删除。
      </p>
      {loading && <div className="py-8 text-center text-muted-foreground">加载中...</div>}
      {!loading && templates.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">暂无条码模版</div>
      )}
      <div className="space-y-2">
        {templates.map((template) => (
          <div
            key={template.id}
            className="flex items-start justify-between gap-3 rounded-lg border border-border/50 bg-slate-800 p-4"
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-foreground">{template.name}</div>
              {template.description && (
                <p className="mt-0.5 text-xs text-muted-foreground">{template.description}</p>
              )}
              <div className="mt-1.5 flex flex-wrap gap-1">
                {template.configs.map((config, index) => (
                  <span
                    key={index}
                    className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300"
                  >
                    {config.expectedText || '任意'} ({config.matchMode})
                  </span>
                ))}
              </div>
            </div>
            <button
              onClick={() => handleDelete(template)}
              className="p-1 text-muted-foreground hover:text-red-400"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
