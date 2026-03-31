import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  createAnomalyRule,
  deleteAnomalyRule,
  fetchAnomalyRules,
  updateAnomalyRule,
  type AnomalyRule,
  type AnomalyType,
} from '@/lib/anomalyApi';
import { fetchRecipes, type StageRecipe } from '@/lib/stageRecipeApi';

type AnomalyRuleFormData = Omit<AnomalyRule, 'id' | 'createdAt' | 'updatedAt'>;

const EMPTY_ANOMALY_RULE: AnomalyRuleFormData = {
  name: '',
  description: '',
  recipe: null,
  processStageCode: '',
  anomalyType: 'consecutive_fail',
  severity: 'warning',
  thresholds: { consecutive_count: 3 },
  autoEscalateMinutes: null,
  passwordSuspend: '',
  passwordResolve: '',
  passwordEscalate: '',
  passwordScrap: '',
  isActive: true,
  externalNotifyUrl: '',
  externalNotifyPayloadTemplate: {},
};

function createDefaultThresholds(type: AnomalyType): Record<string, any> {
  switch (type) {
    case 'batch_anomaly':
      return { time_window_minutes: 60, failure_rate_threshold: 0.3, min_sample_size: 10 };
    case 'trace_break':
      return {};
    case 'timeout':
      return { timeout_minutes: 30 };
    case 'critical_defect':
      return { defect_keywords: ['裂缝', '致命'] };
    case 'consecutive_fail':
    default:
      return { consecutive_count: 3 };
  }
}

function AnomalyRuleForm({
  initial,
  recipes,
  onSave,
  onCancel,
}: {
  initial: AnomalyRuleFormData;
  recipes: StageRecipe[];
  onSave: (data: AnomalyRuleFormData) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<AnomalyRuleFormData>(initial);

  const setField = (field: keyof AnomalyRuleFormData, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const setThreshold = (field: string, value: any) => {
    setForm((prev) => ({ ...prev, thresholds: { ...prev.thresholds, [field]: value } }));
  };

  return (
    <div className="space-y-5">
      <section>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">基本信息</h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-[11px] text-muted-foreground mb-1">规则名称</label>
            <input
              value={form.name}
              onChange={(event) => setField('name', event.target.value)}
              className="w-full rounded border border-border/50 bg-slate-800 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[11px] text-muted-foreground mb-1">描述</label>
            <textarea
              value={form.description}
              onChange={(event) => setField('description', event.target.value)}
              rows={2}
              className="w-full resize-none rounded border border-border/50 bg-slate-800 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">关联配方</label>
            <select
              value={form.recipe ?? ''}
              onChange={(event) => setField('recipe', event.target.value || null)}
              className="w-full rounded border border-border/50 bg-slate-800 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent"
            >
              <option value="">不绑定</option>
              {recipes.map((recipe) => (
                <option key={recipe.id} value={recipe.id}>{recipe.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">工序代码</label>
            <input
              value={form.processStageCode}
              onChange={(event) => setField('processStageCode', event.target.value)}
              className="w-full rounded border border-border/50 bg-slate-800 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setField('isActive', event.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            启用规则
          </label>
        </div>
      </section>

      <section>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">规则定义</h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">异常类型</label>
            <select
              value={form.anomalyType}
              onChange={(event) => {
                const nextType = event.target.value as AnomalyType;
                setForm((prev) => ({
                  ...prev,
                  anomalyType: nextType,
                  thresholds: createDefaultThresholds(nextType),
                }));
              }}
              className="w-full rounded border border-border/50 bg-slate-800 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent"
            >
              <option value="consecutive_fail">连续不合格</option>
              <option value="batch_anomaly">批量异常</option>
              <option value="trace_break">追踪断裂</option>
              <option value="timeout">超时未检</option>
              <option value="critical_defect">关键缺陷</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">严重度</label>
            <select
              value={form.severity}
              onChange={(event) => setField('severity', event.target.value)}
              className="w-full rounded border border-border/50 bg-slate-800 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent"
            >
              <option value="warning">警告</option>
              <option value="critical">严重</option>
              <option value="emergency">紧急</option>
            </select>
          </div>
          {form.anomalyType === 'consecutive_fail' && (
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">连续不合格次数</label>
              <input
                type="number"
                min="1"
                value={form.thresholds.consecutive_count ?? 3}
                onChange={(event) => setThreshold('consecutive_count', Number(event.target.value))}
                className="w-full rounded border border-border/50 bg-slate-800 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent"
              />
            </div>
          )}
          {form.anomalyType === 'batch_anomaly' && (
            <>
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">时间窗口（分钟）</label>
                <input
                  type="number"
                  min="1"
                  value={form.thresholds.time_window_minutes ?? 60}
                  onChange={(event) => setThreshold('time_window_minutes', Number(event.target.value))}
                  className="w-full rounded border border-border/50 bg-slate-800 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">失败率阈值</label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  value={form.thresholds.failure_rate_threshold ?? 0.3}
                  onChange={(event) => setThreshold('failure_rate_threshold', Number(event.target.value))}
                  className="w-full rounded border border-border/50 bg-slate-800 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">最小样本数</label>
                <input
                  type="number"
                  min="1"
                  value={form.thresholds.min_sample_size ?? 10}
                  onChange={(event) => setThreshold('min_sample_size', Number(event.target.value))}
                  className="w-full rounded border border-border/50 bg-slate-800 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent"
                />
              </div>
            </>
          )}
          {form.anomalyType === 'timeout' && (
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">超时分钟数</label>
              <input
                type="number"
                min="1"
                value={form.thresholds.timeout_minutes ?? 30}
                onChange={(event) => setThreshold('timeout_minutes', Number(event.target.value))}
                className="w-full rounded border border-border/50 bg-slate-800 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent"
              />
            </div>
          )}
          {form.anomalyType === 'critical_defect' && (
            <div className="sm:col-span-2">
              <label className="block text-[11px] text-muted-foreground mb-1">关键缺陷关键词（逗号分隔）</label>
              <input
                value={Array.isArray(form.thresholds.defect_keywords) ? form.thresholds.defect_keywords.join(', ') : ''}
                onChange={(event) =>
                  setThreshold(
                    'defect_keywords',
                    event.target.value.split(',').map((item) => item.trim()).filter(Boolean)
                  )
                }
                className="w-full rounded border border-border/50 bg-slate-800 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent"
              />
            </div>
          )}
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">自动升级时间（分钟）</label>
            <input
              type="number"
              min="0"
              value={form.autoEscalateMinutes ?? ''}
              onChange={(event) => setField('autoEscalateMinutes', event.target.value ? Number(event.target.value) : null)}
              className="w-full rounded border border-border/50 bg-slate-800 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent"
            />
          </div>
        </div>
      </section>

      <section>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">操作密码</h4>
        <p className="text-[11px] text-muted-foreground mb-2">状态流转时需要输入对应密码验证。留空则不修改已有密码。</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">挂起密码</label>
            <input type="password" value={form.passwordSuspend ?? ''} onChange={(event) => setField('passwordSuspend', event.target.value)} placeholder="留空不修改" className="w-full rounded border border-border/50 bg-slate-800 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent" />
          </div>
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">关闭密码</label>
            <input type="password" value={form.passwordResolve ?? ''} onChange={(event) => setField('passwordResolve', event.target.value)} placeholder="留空不修改" className="w-full rounded border border-border/50 bg-slate-800 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent" />
          </div>
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">升级密码</label>
            <input type="password" value={form.passwordEscalate ?? ''} onChange={(event) => setField('passwordEscalate', event.target.value)} placeholder="留空不修改" className="w-full rounded border border-border/50 bg-slate-800 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent" />
          </div>
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">报废密码</label>
            <input type="password" value={form.passwordScrap ?? ''} onChange={(event) => setField('passwordScrap', event.target.value)} placeholder="留空不修改" className="w-full rounded border border-border/50 bg-slate-800 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent" />
          </div>
        </div>
      </section>

      <section>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">外部通知</h4>
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">Webhook URL</label>
            <input
              value={form.externalNotifyUrl ?? ''}
              onChange={(event) => setField('externalNotifyUrl', event.target.value)}
              placeholder="https://example.com/webhook"
              className="w-full rounded border border-border/50 bg-slate-800 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent"
            />
          </div>
        </div>
      </section>

      <div className="flex gap-3 pt-2">
        <Button onClick={() => onSave(form)} disabled={!form.name.trim()}>
          <Check className="h-4 w-4 mr-1.5" />
          保存规则
        </Button>
        <Button variant="outline" onClick={onCancel}>取消</Button>
      </div>
    </div>
  );
}

export function AnomalyRulesTab() {
  const [rules, setRules] = useState<AnomalyRule[]>([]);
  const [recipes, setRecipes] = useState<StageRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AnomalyRule | null | 'new'>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([fetchAnomalyRules(), fetchRecipes()])
      .then(([ruleData, recipeData]) => {
        setRules(ruleData);
        setRecipes(recipeData);
      })
      .catch(() => toast.error('加载异常规则失败'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (data: AnomalyRuleFormData) => {
    try {
      const payload = { ...data };
      if (editing !== 'new') {
        const pwdKeys = ['passwordSuspend', 'passwordResolve', 'passwordEscalate', 'passwordScrap'] as const;
        for (const key of pwdKeys) {
          if (!payload[key]) {
            delete payload[key];
          }
        }
      }
      if (editing === 'new') {
        await createAnomalyRule(payload);
        toast.success('异常规则已创建');
      } else if (editing) {
        await updateAnomalyRule(editing.id, payload);
        toast.success('异常规则已更新');
      }
      setEditing(null);
      load();
    } catch (error: any) {
      toast.error(error.message || '保存异常规则失败');
    }
  };

  const handleDelete = async (rule: AnomalyRule) => {
    if (!window.confirm(`确认删除异常规则「${rule.name}」？`)) {
      return;
    }
    try {
      await deleteAnomalyRule(rule.id);
      toast.success('异常规则已删除');
      load();
    } catch (error: any) {
      toast.error(error.message || '删除异常规则失败');
    }
  };

  const handleToggleActive = async (rule: AnomalyRule) => {
    try {
      await updateAnomalyRule(rule.id, { isActive: !rule.isActive });
      toast.success(rule.isActive ? '规则已停用' : '规则已启用');
      load();
    } catch (error: any) {
      toast.error(error.message || '更新状态失败');
    }
  };

  const filteredRules = rules.filter((rule) =>
    rule.name.toLowerCase().includes(search.toLowerCase()) ||
    rule.processStageCode.toLowerCase().includes(search.toLowerCase())
  );

  if (editing !== null) {
    const initial = editing === 'new' ? EMPTY_ANOMALY_RULE : { ...editing };
    return (
      <div>
        <div className="mb-4 flex items-center gap-2">
          <button onClick={() => setEditing(null)} className="text-muted-foreground hover:text-foreground">← 返回列表</button>
          <span className="text-muted-foreground">/</span>
          <span className="text-foreground">{editing === 'new' ? '新建异常规则' : `编辑：${editing.name}`}</span>
        </div>
        <AnomalyRuleForm initial={initial} recipes={recipes} onSave={handleSave} onCancel={() => setEditing(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="搜索规则名称或工序代码..."
          className="flex-1 rounded border border-border/50 bg-slate-800 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
        />
        <Button onClick={() => setEditing('new')} className="flex items-center gap-1.5">
          <Plus className="h-4 w-4" />
          新建规则
        </Button>
      </div>

      {loading && <div className="py-8 text-center text-muted-foreground">加载中...</div>}
      {!loading && filteredRules.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">{search ? '无匹配结果' : '暂无异常规则'}</div>
      )}

      <div className="space-y-2">
        {filteredRules.map((rule) => (
          <div key={rule.id} className="rounded-lg border border-border/50 bg-slate-800 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-foreground">{rule.name}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${rule.isActive ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700 text-slate-400'}`}>
                    {rule.isActive ? '启用中' : '已停用'}
                  </span>
                  <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">
                    {rule.anomalyType}
                  </span>
                </div>
                {rule.description && <p className="mt-1 text-xs text-muted-foreground">{rule.description}</p>}
                <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                  <span className="rounded bg-slate-900 px-1.5 py-0.5 text-slate-300">工序: {rule.processStageCode || '全局'}</span>
                  <span className="rounded bg-slate-900 px-1.5 py-0.5 text-slate-300">严重度: {rule.severity}</span>
                  {rule.recipe && <span className="rounded bg-slate-900 px-1.5 py-0.5 text-slate-300">已绑定配方</span>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => handleToggleActive(rule)} className="rounded p-1.5 text-muted-foreground hover:text-foreground" title={rule.isActive ? '停用' : '启用'}>
                  <Check className="h-4 w-4" />
                </button>
                <button onClick={() => setEditing(rule)} className="rounded p-1.5 text-muted-foreground hover:text-foreground" title="编辑">
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => handleDelete(rule)} className="rounded p-1.5 text-muted-foreground hover:text-red-400" title="删除">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
