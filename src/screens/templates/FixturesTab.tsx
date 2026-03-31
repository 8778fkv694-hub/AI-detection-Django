import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { fixtureTemplateApi, type FixtureTemplate } from '@/lib/fixtureTemplateApi';

function FixtureFormField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] text-muted-foreground">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded border border-border/50 bg-slate-800 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent"
      />
    </div>
  );
}

function FixtureTemplateForm({
  template,
  onSave,
  onCancel,
}: {
  template?: FixtureTemplate;
  onSave: (data: Partial<FixtureTemplate>) => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState<Partial<FixtureTemplate>>(
    template || { name: '', description: '', prefixes: '', pattern: '' }
  );

  return (
    <div className="space-y-4 rounded-lg border border-border/50 bg-slate-900/50 p-4">
      <div className="grid grid-cols-2 gap-4">
        <FixtureFormField
          label="模板名称"
          value={formData.name || ''}
          onChange={(value) => setFormData({ ...formData, name: value })}
        />
        <FixtureFormField
          label="工装描述"
          value={formData.description || ''}
          onChange={(value) => setFormData({ ...formData, description: value })}
        />
        <FixtureFormField
          label="码前缀 (逗号分隔)"
          value={formData.prefixes || ''}
          onChange={(value) => setFormData({ ...formData, prefixes: value })}
        />
        <FixtureFormField
          label="正则表达式"
          value={formData.pattern || ''}
          onChange={(value) => setFormData({ ...formData, pattern: value })}
        />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          取消
        </Button>
        <Button variant="default" size="sm" onClick={() => onSave(formData)}>
          {template ? '更新模板' : '创建模板'}
        </Button>
      </div>
    </div>
  );
}

export function FixturesTab() {
  const [templates, setTemplates] = useState<FixtureTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fixtureTemplateApi.list();
      setTemplates(data);
    } catch {
      toast.error('加载工装模板失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCreate = async (data: Partial<FixtureTemplate>) => {
    try {
      await fixtureTemplateApi.create(data);
      toast.success('模板创建成功');
      setIsCreating(false);
      void loadData();
    } catch {
      toast.error('创建失败');
    }
  };

  const handleUpdate = async (id: string, data: Partial<FixtureTemplate>) => {
    try {
      await fixtureTemplateApi.update(id, data);
      toast.success('模板更新成功');
      setEditingId(null);
      void loadData();
    } catch {
      toast.error('更新失败');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('确定要删除此模板吗？')) return;
    try {
      await fixtureTemplateApi.delete(id);
      toast.success('模板已删除');
      void loadData();
    } catch {
      toast.error('删除失败');
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">加载中...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-foreground">工装模板管理</h2>
          <p className="text-sm text-muted-foreground">预设工装识别参数，提高配方配置效率</p>
        </div>
        {!isCreating && (
          <Button variant="default" size="sm" onClick={() => setIsCreating(true)}>
            <Plus className="mr-2 h-4 w-4" />
            新建工装模板
          </Button>
        )}
      </div>

      {isCreating && (
        <FixtureTemplateForm onSave={handleCreate} onCancel={() => setIsCreating(false)} />
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) =>
          editingId === template.id ? (
            <div key={template.id} className="col-span-1 md:col-span-2 lg:col-span-3">
              <FixtureTemplateForm
                template={template}
                onSave={(data) => handleUpdate(template.id, data)}
                onCancel={() => setEditingId(null)}
              />
            </div>
          ) : (
            <div
              key={template.id}
              className="group relative rounded-lg border border-border/50 p-4 transition-colors hover:border-accent"
            >
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-foreground">{template.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {template.description || '无描述'}
                  </p>
                </div>
                <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => setEditingId(template.id)}
                    className="p-1 hover:text-accent"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(template.id)}
                    className="p-1 hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="mt-4 space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">前缀:</span>
                  <code className="rounded bg-slate-800 px-1 text-foreground">
                    {template.prefixes || '-'}
                  </code>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">正则:</span>
                  <code className="rounded bg-slate-800 px-1 text-foreground">
                    {template.pattern || '-'}
                  </code>
                </div>
              </div>
            </div>
          )
        )}
      </div>

      {templates.length === 0 && !isCreating && (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
          暂无工装模板，点击“新建工装模板”开始
        </div>
      )}
    </div>
  );
}
