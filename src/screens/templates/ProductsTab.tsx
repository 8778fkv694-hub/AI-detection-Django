import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Layers,
  Package,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { fetchRecipes, type StageRecipe } from '@/lib/stageRecipeApi';
import { productRecipeApi, type ProductRecipe, type ProductStage, type FQCValidationRule } from '@/lib/productRecipeApi';

function ProductFormField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string | number;
  onChange: (value: string | number) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] text-muted-foreground mb-1">{label}</label>
      <input
        type={type}
        value={String(value ?? '')}
        onChange={(event) => onChange(type === 'number' ? parseFloat(event.target.value) : event.target.value)}
        className="w-full rounded border border-border/50 bg-slate-800 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent"
      />
    </div>
  );
}

function ProductFormToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-accent"
      />
      <span className="text-sm text-foreground">{label}</span>
    </label>
  );
}

type ProductRecipeFormData = Omit<ProductRecipe, 'id' | 'created_at' | 'updated_at' | 'stages'>;

const EMPTY_PRODUCT_RECIPE: ProductRecipeFormData = {
  name: '',
  description: '',
  is_active: true,
  fqc_validation_enabled: false,
  fqc_validation_rules: [],
};

const EMPTY_FQC_RULE: FQCValidationRule = {
  name: '',
  type: 'target_match',
  source_field: 'businessCode',
  extract_mode: 'full',
  extract_length: 0,
  expected_count: 1,
  operator: 'eq',
  stage_codes: [],
  target_labels: [],
  min_target_count: 1,
  contains_text: '',
  same_prefix_length: 0,
  same_suffix_length: 0,
  regex_pattern: '',
  description: '',
};

const SOURCE_FIELD_OPTIONS = [
  { value: 'businessCode', label: '业务码 (businessCode)' },
  { value: 'quality', label: '质量结果 (quality)' },
  { value: 'stageCode', label: '工序代码 (stageCode)' },
  { value: 'stageName', label: '工序名称 (stageName)' },
  { value: 'detectionType', label: '检测类型 (detectionType)' },
];

function validateFQCRules(
  rules: FQCValidationRule[],
  stageOptions: { code: string; name: string }[],
  targetOptions: string[],
): string | null {
  const validStageCodes = new Set(stageOptions.map((stage) => stage.code).filter(Boolean));
  const validTargetLabels = new Set(targetOptions);

  for (let index = 0; index < rules.length; index += 1) {
    const rule = rules[index];
    const prefix = `第 ${index + 1} 条规则`;

    if (!rule.name.trim()) {
      return `${prefix}缺少规则名称`;
    }
    if (!rule.source_field.trim()) {
      return `${prefix}缺少来源字段`;
    }
    if (rule.extract_mode !== 'full' && (!Number.isInteger(rule.extract_length) || rule.extract_length <= 0)) {
      return `${prefix}截取长度必须大于 0`;
    }
    if (rule.type === 'occurrence_count') {
      if (!rule.operator) {
        return `${prefix}缺少运算符`;
      }
      if (!Number.isInteger(rule.expected_count) || (rule.expected_count ?? -1) < 0) {
        return `${prefix}期望次数必须为大于等于 0 的整数`;
      }
    }
    if (rule.type === 'cross_stage_match' && validStageCodes.size > 0 && (rule.stage_codes?.length || 0) > 0) {
      const invalidCode = rule.stage_codes?.find((code) => !validStageCodes.has(code));
      if (invalidCode) {
        return `${prefix}包含无效工序代码: ${invalidCode}`;
      }
    }
    if (rule.type === 'target_match') {
      if ((rule.target_labels?.length || 0) === 0) {
        return `${prefix}至少选择一个目标`;
      }
      if (validTargetLabels.size > 0) {
        const invalidLabel = rule.target_labels?.find((label) => !validTargetLabels.has(label));
        if (invalidLabel) {
          return `${prefix}包含无效目标: ${invalidLabel}`;
        }
      }
      if (!Number.isInteger(rule.min_target_count) || (rule.min_target_count ?? 0) < 1) {
        return `${prefix}最少命中目标数必须大于等于 1`;
      }
      if ((rule.same_prefix_length ?? 0) < 0 || (rule.same_suffix_length ?? 0) < 0) {
        return `${prefix}前后缀位数不能小于 0`;
      }
      if (!rule.contains_text?.trim() && !rule.regex_pattern?.trim() && !(rule.same_prefix_length && rule.same_prefix_length > 0) && !(rule.same_suffix_length && rule.same_suffix_length > 0)) {
        return `${prefix}至少配置一种匹配条件`;
      }
    }
  }

  return null;
}

function FQCRuleEditorRow({
  rule,
  index,
  onChange,
  onDelete,
  stageOptions,
  targetOptions,
}: {
  rule: FQCValidationRule;
  index: number;
  onChange: (updated: FQCValidationRule) => void;
  onDelete: () => void;
  stageOptions: { code: string; name: string }[];
  targetOptions: string[];
}) {
  const [expanded, setExpanded] = useState(true);

  const set = <K extends keyof FQCValidationRule>(field: K, value: FQCValidationRule[K]) =>
    onChange({ ...rule, [field]: value });

  return (
    <div className="rounded border border-border/40 bg-slate-800/60 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setExpanded(!expanded)} className="text-muted-foreground hover:text-foreground shrink-0">
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        <span className="text-[10px] text-muted-foreground shrink-0">#{index + 1}</span>
        <input
          value={rule.name}
          onChange={(event) => set('name', event.target.value)}
          placeholder="规则名称 *"
          className="flex-1 rounded border border-border/50 bg-slate-900 px-2 py-1 text-sm text-foreground outline-none focus:border-accent"
        />
        <select
          value={rule.type}
          onChange={(event) => {
            const nextType = event.target.value as FQCValidationRule['type'];
            onChange({
              ...rule,
              type: nextType,
              source_field: nextType === 'target_match' ? 'businessCode' : (rule.source_field || 'businessCode'),
              extract_mode: nextType === 'target_match' ? 'full' : (rule.extract_mode || 'full'),
              extract_length: nextType === 'target_match' ? 0 : (rule.extract_length || 0),
            });
          }}
          className="rounded border border-border/50 bg-slate-900 px-2 py-1 text-xs text-foreground outline-none focus:border-accent"
        >
          <option value="target_match">目标匹配逻辑</option>
          <option value="occurrence_count">纯文本逻辑: 出现次数</option>
          <option value="cross_stage_match">纯文本逻辑: 跨工序一致</option>
        </select>
        <button type="button" onClick={onDelete} className="text-muted-foreground hover:text-red-400 p-1 shrink-0" title="删除规则">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {expanded && (
        <div className="grid grid-cols-2 gap-3">
          {rule.type !== 'target_match' && (
            <>
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">来源字段</label>
                <select
                  value={rule.source_field}
                  onChange={(event) => set('source_field', event.target.value)}
                  className="w-full rounded border border-border/50 bg-slate-900 px-2 py-1 text-sm text-foreground outline-none focus:border-accent"
                >
                  {SOURCE_FIELD_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">截取模式</label>
                <select
                  value={rule.extract_mode}
                  onChange={(event) => set('extract_mode', event.target.value as FQCValidationRule['extract_mode'])}
                  className="w-full rounded border border-border/50 bg-slate-900 px-2 py-1 text-sm text-foreground outline-none focus:border-accent"
                >
                  <option value="full">完整值</option>
                  <option value="prefix">前缀截取</option>
                  <option value="suffix">后缀截取</option>
                </select>
              </div>

              {rule.extract_mode !== 'full' && (
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">截取长度</label>
                  <input
                    type="number"
                    value={rule.extract_length}
                    onChange={(event) => set('extract_length', Math.max(1, parseInt(event.target.value, 10) || 1))}
                    min={1}
                    className="w-full rounded border border-border/50 bg-slate-900 px-2 py-1 text-sm text-foreground outline-none focus:border-accent"
                  />
                </div>
              )}
            </>
          )}

          {rule.type === 'occurrence_count' && (
            <>
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">运算符</label>
                <select
                  value={rule.operator || 'eq'}
                  onChange={(event) => set('operator', event.target.value as FQCValidationRule['operator'])}
                  className="w-full rounded border border-border/50 bg-slate-900 px-2 py-1 text-sm text-foreground outline-none focus:border-accent"
                >
                  <option value="eq">等于 (=)</option>
                  <option value="gte">大于等于 (&ge;)</option>
                  <option value="lte">小于等于 (&le;)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">期望次数</label>
                <input
                  type="number"
                  value={rule.expected_count ?? 1}
                  onChange={(event) => set('expected_count', Math.max(0, parseInt(event.target.value, 10) || 0))}
                  min={0}
                  className="w-full rounded border border-border/50 bg-slate-900 px-2 py-1 text-sm text-foreground outline-none focus:border-accent"
                />
              </div>
            </>
          )}

          {rule.type === 'cross_stage_match' && (
            <div className="col-span-2">
              <label className="block text-[11px] text-muted-foreground mb-1">
                参与比对的工序 <span className="text-muted-foreground/60">(不选则比对所有工序)</span>
              </label>
              {stageOptions.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {stageOptions.map((stage) => {
                    const selected = (rule.stage_codes || []).includes(stage.code);
                    return (
                      <button
                        key={stage.code}
                        type="button"
                        onClick={() => {
                          const codes = rule.stage_codes || [];
                          set('stage_codes', selected ? codes.filter((code) => code !== stage.code) : [...codes, stage.code]);
                        }}
                        className={`rounded px-2 py-1 text-[10px] border transition-colors ${
                          selected
                            ? 'bg-accent/20 text-accent border-accent/50'
                            : 'bg-slate-900 text-slate-400 border-border/30 hover:border-accent/30'
                        }`}
                      >
                        {stage.name} ({stage.code})
                      </button>
                    );
                  })}
                </div>
              ) : (
                <input
                  value={(rule.stage_codes || []).join(', ')}
                  onChange={(event) => set('stage_codes', event.target.value.split(',').map((item) => item.trim()).filter(Boolean))}
                  placeholder="工序代码，逗号分隔，如 ST01, ST02"
                  className="w-full rounded border border-border/50 bg-slate-900 px-2 py-1 text-sm text-foreground outline-none focus:border-accent"
                />
              )}
            </div>
          )}

          {rule.type === 'target_match' && (
            <>
              <div className="col-span-2">
                <label className="block text-[11px] text-muted-foreground mb-1">选择目标标签</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {targetOptions.map((label) => {
                    const selected = (rule.target_labels || []).includes(label);
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => {
                          const labels = rule.target_labels || [];
                          set('target_labels', selected ? labels.filter((item) => item !== label) : [...labels, label]);
                        }}
                        className={`rounded px-2 py-1 text-[10px] border transition-colors ${
                          selected
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                            : 'bg-slate-900 text-slate-400 border-border/30 hover:border-cyan-500/30'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                  {targetOptions.length === 0 && (
                    <div className="text-xs text-muted-foreground">所选工序尚未配置目标标签</div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">最少命中目标数</label>
                <input
                  type="number"
                  value={rule.min_target_count ?? 1}
                  onChange={(event) => set('min_target_count', Math.max(1, parseInt(event.target.value, 10) || 1))}
                  min={1}
                  className="w-full rounded border border-border/50 bg-slate-900 px-2 py-1 text-sm text-foreground outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">同时包含字符串</label>
                <input
                  value={rule.contains_text || ''}
                  onChange={(event) => set('contains_text', event.target.value)}
                  placeholder="可选，如 ABC"
                  className="w-full rounded border border-border/50 bg-slate-900 px-2 py-1 text-sm text-foreground outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">前几位相同</label>
                <input
                  type="number"
                  value={rule.same_prefix_length ?? 0}
                  onChange={(event) => set('same_prefix_length', Math.max(0, parseInt(event.target.value, 10) || 0))}
                  min={0}
                  className="w-full rounded border border-border/50 bg-slate-900 px-2 py-1 text-sm text-foreground outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">后几位相同</label>
                <input
                  type="number"
                  value={rule.same_suffix_length ?? 0}
                  onChange={(event) => set('same_suffix_length', Math.max(0, parseInt(event.target.value, 10) || 0))}
                  min={0}
                  className="w-full rounded border border-border/50 bg-slate-900 px-2 py-1 text-sm text-foreground outline-none focus:border-accent"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-[11px] text-muted-foreground mb-1">正则表达式</label>
                <input
                  value={rule.regex_pattern || ''}
                  onChange={(event) => set('regex_pattern', event.target.value)}
                  placeholder="可选，如 ^ABC\\d{4}$"
                  className="w-full rounded border border-border/50 bg-slate-900 px-2 py-1 text-sm text-foreground outline-none focus:border-accent"
                />
              </div>
            </>
          )}

          <div className="col-span-2">
            <label className="block text-[11px] text-muted-foreground mb-1">规则说明</label>
            <input
              value={rule.description || ''}
              onChange={(event) => set('description', event.target.value)}
              placeholder="可选，描述该规则的用途"
              className="w-full rounded border border-border/50 bg-slate-900 px-2 py-1 text-sm text-foreground outline-none focus:border-accent"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ProductRecipeForm({
  initial,
  allStageRecipes,
  initialStages,
  onSave,
  onCancel,
}: {
  initial: ProductRecipeFormData;
  allStageRecipes: StageRecipe[];
  initialStages: ProductStage[];
  onSave: (data: ProductRecipeFormData, stages: { stage_recipe_id: string; order: number; is_fqc?: boolean }[]) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<ProductRecipeFormData>(initial);
  const [rules, setRules] = useState<FQCValidationRule[]>(initial.fqc_validation_rules || []);
  const [selectedStages, setSelectedStages] = useState<{ id: string; stage_recipe_id: string; order: number; is_fqc: boolean }[]>(
    initialStages.map((stage) => ({ id: stage.id, stage_recipe_id: stage.stage_recipe, order: stage.order, is_fqc: stage.is_fqc ?? false }))
  );

  const stageOptions = selectedStages
    .map((stage) => {
      const recipe = allStageRecipes.find((item) => item.id === stage.stage_recipe_id);
      return { code: recipe?.processStageCode || '', name: recipe?.name || '' };
    })
    .filter((stage) => stage.code);

  const targetOptions = Array.from(new Set(
    selectedStages.flatMap((stage) => {
      const recipe = allStageRecipes.find((item) => item.id === stage.stage_recipe_id);
      return recipe?.selectedTargets || [];
    }).filter(Boolean)
  ));

  const set = (field: keyof ProductRecipeFormData, value: any) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const addStage = () => {
    const newStage = {
      id: `temp-${Date.now()}`,
      stage_recipe_id: allStageRecipes[0]?.id || '',
      order: selectedStages.length,
      is_fqc: false,
    };
    setSelectedStages([...selectedStages, newStage]);
  };

  const removeStage = (id: string) => {
    setSelectedStages((prev) => prev.filter((stage) => stage.id !== id).map((stage, index) => ({ ...stage, order: index })));
  };

  const updateStage = (id: string, stageRecipeId: string) => {
    setSelectedStages((prev) => prev.map((stage) => (stage.id === id ? { ...stage, stage_recipe_id: stageRecipeId } : stage)));
  };

  const moveStage = (index: number, direction: 'up' | 'down') => {
    const nextStages = [...selectedStages];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= nextStages.length) {
      return;
    }
    [nextStages[index], nextStages[targetIndex]] = [nextStages[targetIndex], nextStages[index]];
    setSelectedStages(nextStages.map((stage, stageIndex) => ({ ...stage, order: stageIndex })));
  };

  return (
    <div className="space-y-6">
      <section>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">基本信息</h4>
        <div className="grid grid-cols-1 gap-4">
          <ProductFormField label="产品名称 *" value={form.name} onChange={(value) => set('name', value)} />
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">描述</label>
            <textarea
              value={form.description}
              onChange={(event) => set('description', event.target.value)}
              rows={2}
              className="w-full rounded border border-border/50 bg-slate-800 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent resize-none"
            />
          </div>
          <ProductFormToggle label="启用" checked={form.is_active} onChange={(checked) => set('is_active', checked)} />
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">工序组成与顺序</h4>
          <Button variant="outline" size="sm" onClick={addStage} className="h-7 text-[10px]">
            <Plus className="h-3 w-3 mr-1" />添加工序
          </Button>
        </div>
        <div className="space-y-2">
          {selectedStages.length === 0 && (
            <div className="text-center py-6 border border-dashed border-border/50 rounded text-muted-foreground text-xs">
              尚未添加工序，点击按钮开始配置
            </div>
          )}
          {selectedStages.map((stage, index) => (
            <div key={stage.id} className="flex items-center gap-2 bg-slate-800/50 p-2 rounded border border-border/30">
              <div className="flex flex-col gap-1">
                <button onClick={() => moveStage(index, 'up')} disabled={index === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-20">
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button onClick={() => moveStage(index, 'down')} disabled={index === selectedStages.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-20">
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>
              <div className="bg-slate-700 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-slate-400">
                {index + 1}
              </div>
              <select
                value={stage.stage_recipe_id}
                onChange={(event) => updateStage(stage.id, event.target.value)}
                className="flex-1 rounded border border-border/50 bg-slate-800 px-2 py-1 text-sm text-foreground outline-none focus:border-accent"
              >
                {allStageRecipes.map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>{recipe.name} ({recipe.processStageCode})</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setSelectedStages((prev) => prev.map((item) => (item.id === stage.id ? { ...item, is_fqc: !item.is_fqc } : item)))}
                className={`shrink-0 rounded px-2 py-1 text-[10px] font-bold transition-colors border ${
                  stage.is_fqc
                    ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50'
                    : 'bg-slate-800 text-slate-500 border-border/30 hover:border-indigo-500/30'
                }`}
                title="标记为FQC终检工序"
              >
                FQC
              </button>
              <button onClick={() => removeStage(stage.id)} className="text-muted-foreground hover:text-red-400 p-1">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {selectedStages.some((stage) => stage.is_fqc) && (
        <section>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">FQC 规则校验配置</h4>
          <div className="space-y-3">
            <ProductFormToggle
              label="启用 FQC 规则校验"
              checked={form.fqc_validation_enabled}
              onChange={(checked) => set('fqc_validation_enabled', checked)}
            />

            {!form.fqc_validation_enabled && (
              <div className="rounded border border-border/40 bg-slate-900/60 px-3 py-2 text-xs text-muted-foreground">
                当前仅记录该工序为 FQC 终检工序，不执行规则校验。
              </div>
            )}

            {form.fqc_validation_enabled && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">校验规则 ({rules.length})</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRules((prev) => [...prev, { ...EMPTY_FQC_RULE }])}
                    className="h-7 text-[10px]"
                  >
                    <Plus className="h-3 w-3 mr-1" />添加规则
                  </Button>
                </div>

                {rules.length === 0 && (
                  <div className="text-center py-6 border border-dashed border-border/50 rounded text-muted-foreground text-xs">
                    尚未添加校验规则，点击上方按钮开始配置
                  </div>
                )}

                <div className="space-y-2">
                  {rules.map((rule, index) => (
                    <FQCRuleEditorRow
                      key={index}
                      rule={rule}
                      index={index}
                      onChange={(updated) => setRules((prev) => prev.map((item, itemIndex) => (itemIndex === index ? updated : item)))}
                      onDelete={() => setRules((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
                      stageOptions={stageOptions}
                      targetOptions={targetOptions}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
      )}

      <div className="flex gap-3 pt-2">
        <Button
          onClick={() => {
            if (form.fqc_validation_enabled) {
              const validationError = validateFQCRules(rules, stageOptions, targetOptions);
              if (validationError) {
                toast.error(validationError);
                return;
              }
            }
            const payload = form.fqc_validation_enabled
              ? { ...form, fqc_validation_rules: rules }
              : { ...form, fqc_validation_rules: undefined };
            onSave(
              payload as ProductRecipeFormData,
              selectedStages.map((stage) => ({ stage_recipe_id: stage.stage_recipe_id, order: stage.order, is_fqc: stage.is_fqc })),
            );
          }}
          disabled={!form.name.trim()}
        >
          <Check className="h-4 w-4 mr-1.5" />保存产品配方
        </Button>
        <Button variant="outline" onClick={onCancel}>取消</Button>
      </div>
    </div>
  );
}

export function ProductsTab() {
  const [products, setProducts] = useState<ProductRecipe[]>([]);
  const [allStageRecipes, setAllStageRecipes] = useState<StageRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ProductRecipe | null | 'new'>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([productRecipeApi.list(), fetchRecipes()])
      .then(([productsData, recipesData]) => {
        setProducts(productsData);
        setAllStageRecipes(recipesData);
      })
      .catch(() => toast.error('加载产线数据失败'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (data: ProductRecipeFormData, stageLinks: { stage_recipe_id: string; order: number; is_fqc?: boolean }[]) => {
    try {
      let product: ProductRecipe;
      if (editing === 'new') {
        product = await productRecipeApi.create(data);
        toast.success('产品配方已创建');
      } else if (editing) {
        product = await productRecipeApi.update(editing.id, data);
        toast.success('产品配方已更新');
      } else {
        return;
      }

      await productRecipeApi.assignStages(product.id, stageLinks);
      setEditing(null);
      load();
    } catch (error: any) {
      toast.error(error.message || '保存失败');
    }
  };

  const handleDelete = async (product: ProductRecipe) => {
    if (!window.confirm(`确认删除产品「${product.name}」？`)) {
      return;
    }
    try {
      await productRecipeApi.delete(product.id);
      toast.success('已删除');
      load();
    } catch (error: any) {
      toast.error(error.message || '删除失败');
    }
  };

  const filtered = products.filter((product) =>
    product.name.toLowerCase().includes(search.toLowerCase())
  );

  if (editing !== null) {
    const initial: ProductRecipeFormData = editing === 'new'
      ? EMPTY_PRODUCT_RECIPE
      : { ...editing };

    return (
      <div>
        <div className="mb-4 flex items-center gap-2">
          <button onClick={() => setEditing(null)} className="text-muted-foreground hover:text-foreground">
            ← 返回列表
          </button>
          <span className="text-muted-foreground">/</span>
          <span className="text-foreground">{editing === 'new' ? '新建产品配方' : `编辑：${editing.name}`}</span>
        </div>
        <ProductRecipeForm
          initial={initial}
          allStageRecipes={allStageRecipes}
          initialStages={editing === 'new' ? [] : (editing as ProductRecipe).stages}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="搜索产品名称..."
          className="flex-1 rounded border border-border/50 bg-slate-800 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
        />
        <Button onClick={() => setEditing('new')} className="flex items-center gap-1.5">
          <Plus className="h-4 w-4" />新建产品
        </Button>
      </div>

      {loading && <div className="py-8 text-center text-muted-foreground">加载中...</div>}
      {!loading && filtered.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          {search ? '无匹配结果' : '暂无产品配方，点击"新建产品"开始'}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.map((product) => (
          <div
            key={product.id}
            className="rounded-lg border border-border/50 bg-slate-800 p-4 relative overflow-hidden group"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-accent" />
                  <span className="text-sm font-medium text-foreground">{product.name}</span>
                  {!product.is_active && (
                    <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] text-muted-foreground">停用</span>
                  )}
                </div>
                {product.description && <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{product.description}</p>}
                <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400">
                  <Layers className="h-3 w-3" />
                  <span>包含 {product.stages?.length || 0} 个工序</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {product.stages?.slice(0, 3).map((stage) => (
                    <span key={stage.id} className={`rounded px-1.5 py-0.5 text-[9px] border ${stage.is_fqc ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300' : 'bg-slate-900/50 border-border/30'}`}>
                      {stage.stage_recipe_name}{stage.is_fqc ? ' [FQC]' : ''}
                    </span>
                  ))}
                  {(product.stages?.length || 0) > 3 && <span className="text-[9px] px-1">...</span>}
                </div>
                {product.fqc_validation_enabled && (
                  <div className="mt-1.5">
                    <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[9px] text-indigo-300 border border-indigo-500/30">
                      FQC校验: {product.fqc_validation_rules?.length || 0} 条规则
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setEditing(product)}
                  title="编辑"
                  className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-slate-700 transition-colors"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(product)}
                  title="删除"
                  className="rounded p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors"
                >
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
