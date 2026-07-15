import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Layers, FileText, Hash, Code2, Plus, Pencil, Trash2, Star, Copy, Check, AlertTriangle, Package, Cpu, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import StandardSetupScreen from '@/screens/StandardSetupScreen';
import {
  fetchRecipes, createRecipe, updateRecipe, deleteRecipe,
  type StageRecipe,
} from '@/lib/stageRecipeApi';
import { RecipeWorkflowEditor } from '@/components/ocr/RecipeWorkflowEditor';
import {
  getAvailableModels, getModelConfig, type ModelConfig
} from '@/lib/api';
import { fixtureTemplateApi, type FixtureTemplate } from '@/lib/fixtureTemplateApi';
import { DEVICE_TYPE_META } from '@/types/device';
import type { DeviceType } from '@/types/device';
import { FixturesTab } from '@/screens/templates/FixturesTab';
import { KeywordsTab } from '@/screens/templates/KeywordsTab';
import { BarcodesTab } from '@/screens/templates/BarcodesTab';
import { DevicesTab } from '@/screens/templates/DevicesTab';
import { AnomalyRulesTab } from '@/screens/templates/AnomalyRulesTab';
import { ProductsTab } from '@/screens/templates/ProductsTab';
import { getStreamSources } from '@/api/streamApi';
import type { StreamSource } from '@/types/stream';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'products',  label: '产品配方',   icon: <Package className="h-4 w-4" /> },
  { id: 'recipes',   label: '工序配方',   icon: <Layers className="h-4 w-4" /> },
  { id: 'fixtures',  label: '工装模板',   icon: <Star className="h-4 w-4" /> },
  { id: 'standards', label: 'AI检测规范', icon: <FileText className="h-4 w-4" /> },
  { id: 'keywords',  label: '关键词模版', icon: <Hash className="h-4 w-4" /> },
  { id: 'barcodes',  label: '条码模版',   icon: <Code2 className="h-4 w-4" /> },
  { id: 'anomaly-rules', label: '异常规则', icon: <AlertTriangle className="h-4 w-4" /> },
  { id: 'devices',       label: '硬件设备', icon: <Cpu className="h-4 w-4" /> },
];

type TabId = 'recipes' | 'products' | 'standards' | 'keywords' | 'barcodes' | 'anomaly-rules' | 'fixtures' | 'devices';

// ─── Recipe Tab ────────────────────────────────────────────────────────────────
const EMPTY_RECIPE: Omit<StageRecipe, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '',
  description: '',
  processStageCode: '',
  processStageName: '',
  fixtureEnabled: true,
  fixtureQrPrefixes: '',
  fixtureQrPattern: '',
  fixtureTemplateId: null,
  cameraId: '',
  currentModelId: '',
  selectedTargets: [],
  nonGridTargets: [],
  targetConfidences: {},
  enableKeywordAnalysis: false,
  keywords: '',
  keywordConfigs: [],
  keywordMatchMode: 'contains',
  minConfidence: 0.5,
  enableBarcodeDetection: false,
  barcodeConfigs: [],
  ocrEngineModel: 'auto',
  detectionConfidence: 0.7,
  fusionModeEnabled: false,
  selectedStandardId: null,
  autoCapture: true,
  captureDelaySeconds: 0,
  detectionInterval: 0.1,
  yoloTimeoutSeconds: -1,
  yoloDetectionMode: 'or',
  qrDetectIntervalSeconds: 3,
  imageSaveMode: 'full',
  batchProcessingMode: 'batch',
  batchApplyRules: true,
  compressionEnabled: false,
  compressionConfig: { maxWidth: 1920, maxHeight: 1080, quality: 0.9, maxSizeMB: 1 },
  roiWeightRatio: { area: 0.4, clarity: 0.6 },
  isDefault: false,
  isActive: true,
  createdBy: '',
  deviceActionMap: { alarm: { qualified: 'GREEN\n', unqualified: 'RED\n', idle: 'OFF\n' } },
  requiredDeviceTypes: [],
  turntableEnabled: false,
  turntableStartCommand: 'START_ROTATE\n',
  turntableStopSignal: 'STOP_CAPTURE',
  turntableTimeoutSeconds: 30,
};

export type RecipeFormData = Omit<StageRecipe, 'id' | 'createdAt' | 'updatedAt'>;

function RecipeFormField({
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

function RecipeFormToggle({
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

function RecipeForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: RecipeFormData;
  onSave: (data: RecipeFormData) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<RecipeFormData>(initial);
  const [isWorkflowMode, setIsWorkflowMode] = useState(true);
  const [availableModels, setAvailableModels] = useState<ModelConfig[]>([]);
  const [currentModelConfig, setCurrentModelConfig] = useState<ModelConfig | null>(null);
  const [availableStreams, setAvailableStreams] = useState<StreamSource[]>([]);

  useEffect(() => {
    getAvailableModels().then(res => setAvailableModels(res.models || []));
    getStreamSources()
      .then(setAvailableStreams)
      .catch(() => toast.error('加载摄像头列表失败'));
  }, []);

  const renderCameraSelect = (compact = false) => (
    <div>
      <label className="block text-[11px] text-muted-foreground mb-1">
        独立摄像头 (camera_id)
      </label>
      <select
        value={form.cameraId || ''}
        onChange={event => set('cameraId', event.target.value)}
        className={`w-full rounded border border-border/50 bg-slate-800 px-2.5 ${compact ? 'py-1.5 text-xs' : 'py-1.5 text-sm'} text-foreground outline-none focus:border-accent`}
      >
        <option value="">-- 请选择配方专用摄像头 --</option>
        {form.cameraId && !availableStreams.some(stream => stream.id === form.cameraId) && (
          <option value={form.cameraId}>原配置：{form.cameraId}</option>
        )}
        {availableStreams.map(stream => (
          <option key={stream.id} value={stream.id}>
            {stream.name} · {stream.status === 'active' ? '在线' : stream.status} · {stream.display_url || stream.id}
          </option>
        ))}
      </select>
      {!compact && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          双窗口并行时，两套配方应选择不同摄像头；保存的是 StreamSource ID。
        </p>
      )}
    </div>
  );

  useEffect(() => {
    if (form.currentModelId) {
      getModelConfig(form.currentModelId).then(res => setCurrentModelConfig(res.model || null));
    } else {
      setCurrentModelConfig(null);
    }
  }, [form.currentModelId]);

  const [fixtureTemplates, setFixtureTemplates] = useState<FixtureTemplate[]>([]);
  useEffect(() => {
    fixtureTemplateApi.list().then(setFixtureTemplates);
  }, []);

  const handleFixtureTemplateChange = (templateId: string) => {
    const template = fixtureTemplates.find(t => t.id === templateId);
    if (template) {
      setForm(prev => ({
        ...prev,
        fixtureTemplateId: template.id,
        fixtureQrPrefixes: template.prefixes,
        fixtureQrPattern: template.pattern,
      }));
    } else {
      set('fixtureTemplateId', null);
    }
  };

  const set = (field: keyof RecipeFormData, value: any) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const toggleTarget = (target: string) => {
    if (form.selectedTargets.includes(target)) {
      set('selectedTargets', form.selectedTargets.filter(t => t !== target));
      // 同时清除该目标的独立置信度和mini标记
      const next = { ...form.targetConfidences };
      delete next[target];
      set('targetConfidences', next);
      set('nonGridTargets', (form.nonGridTargets || []).filter(t => t !== target));
    } else {
      set('selectedTargets', [...form.selectedTargets, target]);
    }
  };

  const toggleMini = (target: string) => {
    const list = form.nonGridTargets || [];
    if (list.includes(target)) {
      set('nonGridTargets', list.filter(t => t !== target));
    } else {
      set('nonGridTargets', [...list, target]);
    }
  };

  return (
    <div className="space-y-5">
      {/* 视图模式切换 */}
      <div className="flex items-center justify-between border-b border-border/30 pb-3">
        <div className="flex flex-col">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">配方设计视图</h4>
          <p className="text-[10px] text-muted-foreground font-normal">切换工作流以图形化方式搭建管线，或使用表单查看全量配置</p>
        </div>
        <div className="flex bg-slate-900 border border-border/40 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setIsWorkflowMode(false)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              !isWorkflowMode 
                ? 'bg-slate-850 text-foreground shadow-sm' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            📋 传统表单
          </button>
          <button
            type="button"
            onClick={() => setIsWorkflowMode(true)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              isWorkflowMode 
                ? 'bg-accent/20 text-accent shadow-sm' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            🌿 可视化工作流 (Dify)
          </button>
        </div>
      </div>

      {isWorkflowMode ? (
        <div className="space-y-4">
          {/* 基本信息快速预览区 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-900/40 border border-border/30 p-4 rounded-xl">
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">配方名称 *</label>
              <input
                value={form.name}
                onChange={e => set('name', e.target.value)}
                className="w-full rounded border border-border/50 bg-slate-850 px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">描述</label>
              <input
                value={form.description}
                onChange={e => set('description', e.target.value)}
                placeholder="添加描述..."
                className="w-full rounded border border-border/50 bg-slate-850 px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-accent"
              />
            </div>
            {renderCameraSelect(true)}
            <div className="flex gap-4 items-center pl-2 pt-5">
              <label className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer select-none">
                <input type="checkbox" checked={form.isDefault} onChange={e => set('isDefault', e.target.checked)} className="h-3.5 w-3.5 accent-accent" />
                默认配方
              </label>
              <label className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer select-none">
                <input type="checkbox" checked={form.isActive} onChange={e => set('isActive', e.target.checked)} className="h-3.5 w-3.5 accent-accent" />
                启用
              </label>
            </div>
          </div>

          <RecipeWorkflowEditor 
            form={form} 
            onChange={setForm}
            availableModels={availableModels}
            fixtureTemplates={fixtureTemplates}
          />
          
          <div className="flex gap-3 pt-2 border-t border-border/20">
            <Button onClick={() => onSave(form)} disabled={!form.name.trim()}>
              <Check className="h-4 w-4 mr-1.5" />保存配方
            </Button>
            <Button variant="outline" onClick={onCancel}>取消</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* 基本信息 */}
      <section>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">基本信息</h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <RecipeFormField label="配方名称 *" value={form.name} onChange={(value) => set('name', value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[11px] text-muted-foreground mb-1">描述</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={2}
              className="w-full rounded border border-border/50 bg-slate-800 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent resize-none"
            />
          </div>
          <RecipeFormToggle label="设为默认配方" checked={form.isDefault} onChange={(checked) => set('isDefault', checked)} />
          <RecipeFormToggle label="启用" checked={form.isActive} onChange={(checked) => set('isActive', checked)} />
        </div>
      </section>

      {/* 模型与目标选择 */}
      <section>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">模型与目标</h4>
        <div className="space-y-4 rounded-lg bg-slate-900/50 p-3 border border-border/30">
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1.5">检测模型</label>
            <select
              value={form.currentModelId || ''}
              onChange={e => {
                set('currentModelId', e.target.value || null);
                set('selectedTargets', []); // 切换模型时重置目标
              }}
              className="w-full rounded border border-border/50 bg-slate-800 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent"
            >
              <option value="">未选择模型</option>
              {availableModels.map(m => (
                <option key={m.id} value={m.id}>{m.name || m.id}</option>
              ))}
            </select>
          </div>

          {currentModelConfig && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-[11px] text-muted-foreground">检测目标选择</label>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">整体阈值:</span>
                  <input
                    type="number" min={0} max={1} step={0.05}
                    value={form.detectionConfidence}
                    onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) set('detectionConfidence', v); }}
                    className="w-16 rounded border border-border/50 bg-slate-800 px-1.5 py-0.5 text-[11px] text-foreground text-center outline-none focus:border-accent"
                  />
                  <span className="text-[10px] text-muted-foreground">单独设置可覆盖</span>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {(currentModelConfig.classes || []).map(cls => {
                  const isSelected = form.selectedTargets.includes(cls);
                  const hasCustomConf = form.targetConfidences[cls] !== undefined;
                  const effectiveConf = hasCustomConf ? form.targetConfidences[cls] : form.detectionConfidence;
                  return (
                    <div key={cls} className={`flex items-center gap-2 rounded px-2 py-1 ${isSelected ? 'bg-accent/10 border border-accent/30' : 'bg-slate-800/50 border border-transparent'}`}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleTarget(cls)}
                        className="h-3.5 w-3.5 accent-accent shrink-0"
                      />
                      <span className="text-[12px] text-slate-300 truncate min-w-0 flex-1">
                        {currentModelConfig.class_names?.[cls] || cls}
                      </span>
                      {isSelected && (
                        <>
                          <input
                            type="number"
                            min={0} max={1} step={0.05}
                            value={effectiveConf}
                            onChange={e => {
                              const v = parseFloat(e.target.value);
                              if (!isNaN(v)) set('targetConfidences', { ...form.targetConfidences, [cls]: v });
                            }}
                            title={`${currentModelConfig.class_names?.[cls] || cls} 置信度`}
                            className="w-16 shrink-0 rounded border border-border/50 bg-slate-900 px-1.5 py-0.5 text-[11px] text-foreground text-center outline-none focus:border-accent"
                          />
                          <button
                            type="button"
                            onClick={() => toggleMini(cls)}
                            title="mini模式：不占格子，智能填充到空白区域"
                            className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] border transition-colors ${
                              (form.nonGridTargets || []).includes(cls)
                                ? 'bg-blue-600/30 border-blue-500/50 text-blue-300'
                                : 'bg-slate-800/50 border-border/30 text-slate-500 hover:text-slate-300'
                            }`}
                          >
                            mini
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 工序与工装信息 */}
      <section>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">工序与工装信息</h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <RecipeFormField label="工序标识 (stage_code) *" value={form.processStageCode} onChange={(value) => set('processStageCode', value)} />
          <RecipeFormField label="工序名称 (stage_name) *" value={form.processStageName} onChange={(value) => set('processStageName', value)} />

          <div className="sm:col-span-2">
            <RecipeFormToggle label="启用工装追踪" checked={form.fixtureEnabled} onChange={(checked) => set('fixtureEnabled', checked)} />
          </div>

          {form.fixtureEnabled && (
            <>
              <div className="sm:col-span-2 space-y-3 rounded-lg bg-emerald-900/10 p-3 border border-emerald-500/20">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-emerald-400">工装模板引用 (可选)</label>
                  <span className="text-[10px] text-muted-foreground italic">选择模板后将自动填充规则</span>
                </div>
                <select
                  value={form.fixtureTemplateId || ''}
                  onChange={e => handleFixtureTemplateChange(e.target.value)}
                  className="w-full rounded border border-emerald-500/30 bg-slate-800 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-emerald-500/60"
                >
                  <option value="">-- 手动输入模式 --</option>
                  {fixtureTemplates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <RecipeFormField label="工装前缀规则 (逗号分隔)" value={form.fixtureQrPrefixes} onChange={(value) => set('fixtureQrPrefixes', value)} />
              <RecipeFormField label="工装正则规则" value={form.fixtureQrPattern} onChange={(value) => set('fixtureQrPattern', value)} />
              <RecipeFormField label="QR检测间隔（秒）" value={form.qrDetectIntervalSeconds} onChange={(v) => set('qrDetectIntervalSeconds', Number(v))} type="number" />
            </>
          )}
          <div className="sm:col-span-2">{renderCameraSelect()}</div>
        </div>
      </section>

      {/* 关键词规则 */}
      <section>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">关键词规则</h4>
        <div className="space-y-3">
          <RecipeFormToggle label="启用关键词分析" checked={form.enableKeywordAnalysis} onChange={(checked) => set('enableKeywordAnalysis', checked)} />
          {form.enableKeywordAnalysis && (
            <div className="space-y-3 pl-4 border-l-2 border-blue-500/30">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">默认匹配模式</label>
                  <select
                    value={form.keywordMatchMode}
                    onChange={e => set('keywordMatchMode', e.target.value)}
                    className="w-full rounded border border-border/50 bg-slate-800 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent"
                  >
                    <option value="contains">包含</option>
                    <option value="exact">完全匹配</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">默认最低置信度</label>
                  <input
                    type="number" min="0" max="1" step="0.05"
                    value={form.minConfidence}
                    onChange={e => set('minConfidence', parseFloat(e.target.value))}
                    className="w-full rounded border border-border/50 bg-slate-800 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent"
                  />
                </div>
              </div>
              <KeywordConfigEditor
                configs={form.keywordConfigs}
                onChange={configs => {
                  set('keywordConfigs', configs);
                  set('keywords', configs.map(c => c.text).join(','));
                }}
                availableTargets={form.selectedTargets}
              />
            </div>
          )}
        </div>
      </section>

      {/* 条码规则 */}
      <section>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">条码规则</h4>
        <div className="space-y-3">
          <RecipeFormToggle label="启用条码检测" checked={form.enableBarcodeDetection} onChange={(checked) => set('enableBarcodeDetection', checked)} />
          {form.enableBarcodeDetection && (
            <div className="pl-4 border-l-2 border-purple-500/30">
              <BarcodeConfigEditor
                configs={form.barcodeConfigs}
                onChange={configs => set('barcodeConfigs', configs)}
                availableTargets={form.selectedTargets}
              />
            </div>
          )}
        </div>
      </section>

      {/* OCR引擎 */}
      <section>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">OCR引擎配置</h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">OCR引擎模型</label>
            <select
              value={form.ocrEngineModel}
              onChange={e => set('ocrEngineModel', e.target.value)}
              className="w-full rounded border border-border/50 bg-slate-800 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent"
            >
              <option value="auto">auto（自动）</option>
              <option value="rapidocr">rapidocr</option>
              <option value="paddleocr">paddleocr</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">检测置信度阈值</label>
            <input
              type="number" min="0" max="1" step="0.05"
              value={form.detectionConfidence}
              onChange={e => set('detectionConfidence', parseFloat(e.target.value))}
              className="w-full rounded border border-border/50 bg-slate-800 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent"
            />
          </div>
          <div className="sm:col-span-2 space-y-2">
            <RecipeFormToggle label="启用融合模式（AI规范检测）" checked={form.fusionModeEnabled} onChange={(checked) => set('fusionModeEnabled', checked)} />
            {form.fusionModeEnabled && (
              <div className="pl-6">
                <RecipeFormField label="AI规范ID (selectedStandardId)" value={form.selectedStandardId ?? ''} onChange={(value) => set('selectedStandardId', value)} />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 检测流程参数 */}
      <section>
        <h3 className="text-sm font-semibold mb-2">检测流程参数</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <RecipeFormToggle label="自动抓拍" checked={form.autoCapture} onChange={(checked) => set('autoCapture', checked)} />
          <RecipeFormField label="抓拍延迟（秒）" value={form.captureDelaySeconds} onChange={(v) => set('captureDelaySeconds', Number(v))} type="number" />
          <div>
            <label className="text-xs text-muted-foreground">检测间隔</label>
            <select
              className="w-full mt-1 rounded border border-border/50 bg-slate-800 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent"
              value={form.detectionInterval.toString()}
              onChange={e => set('detectionInterval', parseFloat(e.target.value))}
            >
              <option value="0">自适应(最快)</option>
              <option value="0.05">0.05秒</option>
              <option value="0.1">0.1秒</option>
              <option value="0.2">0.2秒</option>
              <option value="0.3">0.3秒</option>
              <option value="0.5">0.5秒</option>
              <option value="1">1秒</option>
              <option value="3">3秒</option>
            </select>
          </div>
          <RecipeFormField label="YOLO超时（秒，-1=永不）" value={form.yoloTimeoutSeconds} onChange={(v) => set('yoloTimeoutSeconds', Number(v))} type="number" />
          <div>
            <label className="text-xs text-muted-foreground">YOLO检测模式</label>
            <select className="w-full mt-1 rounded border bg-background px-2 py-1.5 text-sm" value={form.yoloDetectionMode} onChange={(e) => set('yoloDetectionMode', e.target.value as 'or' | 'and')}>
              <option value="or">任一目标 (OR)</option>
              <option value="and">全部目标 (AND)</option>
            </select>
          </div>

        </div>
      </section>

      {/* 图像处理参数 */}
      <section>
        <h3 className="text-sm font-semibold mb-2">图像处理参数</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">图片保存模式</label>
            <select className="w-full mt-1 rounded border bg-background px-2 py-1.5 text-sm" value={form.imageSaveMode} onChange={(e) => set('imageSaveMode', e.target.value as 'full' | 'roi')}>
              <option value="full">完整图</option>
              <option value="roi">ROI裁切</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">批处理模式</label>
            <select className="w-full mt-1 rounded border bg-background px-2 py-1.5 text-sm" value={form.batchProcessingMode} onChange={(e) => set('batchProcessingMode', e.target.value as 'stitching' | 'batch' | 'traditional')}>
              <option value="batch">批处理</option>
              <option value="stitching">拼接</option>
              <option value="traditional">传统</option>
            </select>
          </div>
          <RecipeFormToggle label="批处理时应用规则" checked={form.batchApplyRules} onChange={(checked) => set('batchApplyRules', checked)} />
          <RecipeFormToggle label="启用图片压缩" checked={form.compressionEnabled} onChange={(checked) => set('compressionEnabled', checked)} />
          {form.compressionEnabled && (
            <>
              <RecipeFormField label="最大宽度 (px)" value={form.compressionConfig.maxWidth} onChange={(v) => set('compressionConfig', { ...form.compressionConfig, maxWidth: Number(v) })} type="number" />
              <RecipeFormField label="最大高度 (px)" value={form.compressionConfig.maxHeight} onChange={(v) => set('compressionConfig', { ...form.compressionConfig, maxHeight: Number(v) })} type="number" />
              <RecipeFormField label="压缩质量 (0-1)" value={form.compressionConfig.quality} onChange={(v) => set('compressionConfig', { ...form.compressionConfig, quality: Number(v) })} type="number" />
              <RecipeFormField label="最大文件大小 (MB)" value={form.compressionConfig.maxSizeMB} onChange={(v) => set('compressionConfig', { ...form.compressionConfig, maxSizeMB: Number(v) })} type="number" />
            </>
          )}
        </div>
        {/* ROI 权重比例（面积 vs 清晰度） */}
        <div className="mt-3">
          <label className="text-xs text-muted-foreground block mb-1">评分权重 (面积:清晰度)</label>
          <select
            value={`${form.roiWeightRatio.area}/${form.roiWeightRatio.clarity}`}
            onChange={(e) => {
              const [area, clarity] = e.target.value.split('/').map(Number);
              set('roiWeightRatio', { area, clarity });
            }}
            className="w-full rounded border border-border/50 bg-slate-800 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent"
          >
            <option value="100/0">100/0 (仅面积)</option>
            <option value="90/10">90/10</option>
            <option value="80/20">80/20</option>
            <option value="60/40">60/40</option>
            <option value="40/60">40/60</option>
            <option value="20/80">20/80</option>
            <option value="0/100">0/100 (仅清晰度)</option>
          </select>
        </div>
      </section>

      {/* 设备动作配置 */}
      <section>
        <h3 className="text-sm font-semibold mb-2">设备动作配置</h3>
        <p className="text-xs text-muted-foreground mb-3">配置检测结果对应的硬件设备指令（报警灯、工控板等）</p>
        <div className="space-y-3">
          {/* 动作映射表 */}
          <div className="rounded border border-border/50 overflow-hidden">
            <div className="grid grid-cols-4 gap-0 bg-muted/30 text-xs font-medium text-muted-foreground px-3 py-2 border-b border-border/50">
              <span>设备类型</span><span>合格指令</span><span>存疑指令</span><span>空闲指令</span>
            </div>
            {Object.entries(form.deviceActionMap || {}).map(([deviceType, actions]) => (
              <div key={deviceType} className="grid grid-cols-4 gap-0 px-3 py-2 border-b border-border/30 items-center">
                <div className="flex items-center gap-1">
                  <span className="text-xs text-foreground">{DEVICE_TYPE_META[deviceType as DeviceType]?.label ?? deviceType}</span>
                  <button
                    onClick={() => {
                      const newMap = { ...form.deviceActionMap };
                      delete newMap[deviceType];
                      set('deviceActionMap', newMap);
                    }}
                    className="text-muted-foreground hover:text-red-400"
                  ><X className="h-3 w-3" /></button>
                </div>
                {(['qualified', 'unqualified', 'idle'] as const).map(outcome => (
                  <input
                    key={outcome}
                    className="bg-muted/30 border border-border/50 rounded px-2 py-1 text-xs font-mono text-foreground mr-1"
                    value={(actions as any)?.[outcome] ?? ''}
                    placeholder="指令..."
                    onChange={e => {
                      const newMap = { ...form.deviceActionMap };
                      newMap[deviceType] = { ...newMap[deviceType], [outcome]: e.target.value };
                      set('deviceActionMap', newMap);
                    }}
                  />
                ))}
              </div>
            ))}
            <div className="px-3 py-2">
              <select
                className="bg-muted/50 border border-border/50 rounded px-2 py-1 text-xs text-muted-foreground"
                value=""
                onChange={e => {
                  if (e.target.value) {
                    const newMap = { ...form.deviceActionMap, [e.target.value]: { qualified: '', unqualified: '', idle: '' } };
                    set('deviceActionMap', newMap);
                    e.target.value = '';
                  }
                }}
              >
                <option value="">+ 添加设备类型...</option>
                {(Object.keys(DEVICE_TYPE_META) as DeviceType[])
                  .filter(t => !(form.deviceActionMap || {})[t])
                  .map(t => <option key={t} value={t}>{DEVICE_TYPE_META[t].label}</option>)}
              </select>
            </div>
          </div>

          {/* 必需设备类型 */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">必需设备类型（缺少时检测页面提示警告）</label>
            <div className="flex gap-2 flex-wrap">
              {(Object.keys(DEVICE_TYPE_META) as DeviceType[]).map(t => (
                <label key={t} className="flex items-center gap-1 text-xs text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(form.requiredDeviceTypes || []).includes(t)}
                    onChange={e => {
                      const current = form.requiredDeviceTypes || [];
                      set('requiredDeviceTypes', e.target.checked ? [...current, t] : current.filter(x => x !== t));
                    }}
                    className="rounded border-border"
                  />
                  {DEVICE_TYPE_META[t].label}
                </label>
              ))}
            </div>
          </div>
        </div>
      </section>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button onClick={() => onSave(form)} disabled={!form.name.trim()}>
              <Check className="h-4 w-4 mr-1.5" />保存配方
            </Button>
            <Button variant="outline" onClick={onCancel}>取消</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── KeywordConfigEditor ───────────────────────────────────────────────────────
interface KeywordConfigItem {
  id: string;
  text: string;
  confidence: number;
  type?: 'positive' | 'negative';
  requiredCount?: number;
  targetRoi?: string;
}

function KeywordConfigEditor({
  configs,
  onChange,
  availableTargets = [],
}: {
  configs: KeywordConfigItem[];
  onChange: (configs: KeywordConfigItem[]) => void;
  availableTargets?: string[];
}) {
  const add = () =>
    onChange([...configs, { id: `${Date.now()}`, text: '', confidence: 0.5, type: 'positive', requiredCount: 1, targetRoi: '' }]);
  const remove = (id: string) => onChange(configs.filter(c => c.id !== id));
  const update = (id: string, field: keyof KeywordConfigItem, value: any) =>
    onChange(configs.map(c => (c.id === id ? { ...c, [field]: value } : c)));

  const hasTargets = availableTargets.length > 0;
  const gridCols = hasTargets
    ? 'grid-cols-[1fr_80px_80px_60px_100px_24px]'
    : 'grid-cols-[1fr_80px_80px_60px_24px]';

  return (
    <div className="space-y-2">
      {configs.length === 0 && (
        <div className="text-xs text-muted-foreground py-1">暂无关键词规则，点击下方添加</div>
      )}
      {/* Header */}
      {configs.length > 0 && (
        <div className={`grid ${gridCols} gap-1.5 px-1 text-[10px] text-muted-foreground`}>
          <span>关键词文本</span>
          <span>置信度</span>
          <span>类型</span>
          <span>出现次数</span>
          {hasTargets && <span>绑定目标</span>}
          <span />
        </div>
      )}
      {configs.map(c => (
        <div key={c.id} className={`grid ${gridCols} gap-1.5 items-center`}>
          <input
            value={c.text}
            onChange={e => update(c.id, 'text', e.target.value)}
            placeholder="关键词"
            className="rounded border border-border/50 bg-slate-800 px-2 py-1.5 text-xs text-foreground outline-none focus:border-accent"
          />
          <input
            type="number" min="0" max="1" step="0.05"
            value={c.confidence}
            onChange={e => update(c.id, 'confidence', parseFloat(e.target.value))}
            className="rounded border border-border/50 bg-slate-800 px-2 py-1.5 text-xs text-foreground outline-none focus:border-accent"
          />
          <select
            value={c.type ?? 'positive'}
            onChange={e => update(c.id, 'type', e.target.value)}
            className={`rounded border border-border/50 bg-slate-800 px-1.5 py-1.5 text-xs outline-none focus:border-accent ${
              c.type === 'negative' ? 'text-red-400' : 'text-green-400'
            }`}
          >
            <option value="positive" className="text-foreground">必须出现</option>
            <option value="negative" className="text-foreground">排除清单</option>
          </select>
          <input
            type="number" min="1" step="1"
            value={c.requiredCount ?? 1}
            onChange={e => update(c.id, 'requiredCount', parseInt(e.target.value))}
            disabled={c.type === 'negative'}
            className="rounded border border-border/50 bg-slate-800 px-2 py-1.5 text-xs text-foreground outline-none focus:border-accent disabled:opacity-40"
          />
          {hasTargets && (
            <select
              value={c.targetRoi ?? ''}
              onChange={e => update(c.id, 'targetRoi', e.target.value || undefined)}
              className="rounded border border-border/50 bg-slate-800 px-1.5 py-1.5 text-xs text-foreground outline-none focus:border-accent"
            >
              <option value="">不绑定</option>
              {availableTargets.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          )}
          <button onClick={() => remove(c.id)} className="text-muted-foreground hover:text-red-400 flex justify-center">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        onClick={add}
        className="flex items-center gap-1 text-xs text-blue-400 hover:underline mt-1"
      >
        <Plus className="h-3.5 w-3.5" />添加关键词规则
      </button>
    </div>
  );
}

// ─── BarcodeConfigEditor ───────────────────────────────────────────────────────
interface BarcodeConfigItem {
  id: string;
  expectedText: string;
  matchMode: 'contains' | 'exact';
  enabled: boolean;
  targetRoi?: string;
  codeType?: 'qr' | 'linear';
  barcodeFormat?: 'auto' | 'code128' | 'ean13' | 'ean8' | 'upca' | 'upce' | 'itf' | 'codabar' | 'code39';
  allowOcrFallback?: boolean;
}

function BarcodeConfigEditor({
  configs,
  onChange,
  availableTargets = [],
}: {
  configs: BarcodeConfigItem[];
  onChange: (configs: BarcodeConfigItem[]) => void;
  availableTargets?: string[];
}) {
  const add = (codeType: 'qr' | 'linear') =>
    onChange([...configs, {
      id: `${Date.now()}`,
      expectedText: '',
      matchMode: 'contains',
      enabled: true,
      targetRoi: '',
      codeType,
      ...(codeType === 'linear' ? { barcodeFormat: 'auto' as const, allowOcrFallback: true } : {}),
    }]);
  const remove = (id: string) => onChange(configs.filter(c => c.id !== id));
  const update = (id: string, field: keyof BarcodeConfigItem, value: any) =>
    onChange(configs.map(c => (c.id === id ? { ...c, [field]: value } : c)));

  const hasTargets = availableTargets.length > 0;

  return (
    <div className="space-y-2">
      {configs.length === 0 && (
        <div className="text-xs text-muted-foreground py-1">暂无条码规则，点击下方添加</div>
      )}
      {(['qr', 'linear'] as const).map(codeType => (
        <div key={codeType} className="space-y-2 rounded border border-border/30 p-2">
          <div className="text-xs font-medium text-slate-300">
            {codeType === 'qr' ? '二维码规则' : '一维条码规则'}
          </div>
          {configs.filter(c => (c.codeType || 'qr') === codeType).map(c => (
            <div key={c.id} className="space-y-2 rounded bg-slate-900/30 p-2">
              <div className="flex items-center gap-2">
                <input
                  value={c.expectedText}
                  onChange={e => update(c.id, 'expectedText', e.target.value)}
                  placeholder={codeType === 'qr' ? '二维码期望内容（空=任意）' : '条码数字/内容（空=任意）'}
                  className="flex-1 rounded border border-border/50 bg-slate-800 px-2 py-1 text-xs text-foreground outline-none focus:border-accent"
                />
                <select
                  value={c.matchMode}
                  onChange={e => update(c.id, 'matchMode', e.target.value)}
                  className="rounded border border-border/50 bg-slate-800 px-1.5 py-1 text-xs text-foreground outline-none focus:border-accent"
                >
                  <option value="contains">包含</option>
                  <option value="exact">精确</option>
                </select>
                <button onClick={() => remove(c.id)} className="text-muted-foreground hover:text-red-400">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {codeType === 'linear' && (
                  <>
                    <select
                      value={c.barcodeFormat || 'auto'}
                      onChange={e => update(c.id, 'barcodeFormat', e.target.value)}
                      className="rounded border border-border/50 bg-slate-800 px-1.5 py-1 text-xs text-foreground"
                    >
                      <option value="auto">自动码制</option><option value="code128">Code 128</option>
                      <option value="code39">Code 39</option><option value="ean13">EAN-13</option>
                      <option value="ean8">EAN-8</option><option value="upca">UPC-A</option>
                      <option value="upce">UPC-E</option><option value="itf">ITF</option>
                      <option value="codabar">Codabar</option>
                    </select>
                    <label className="flex items-center gap-1 text-xs text-amber-300">
                      <input
                        type="checkbox"
                        checked={c.allowOcrFallback ?? true}
                        onChange={e => update(c.id, 'allowOcrFallback', e.target.checked)}
                      />
                      OCR数字兜底
                    </label>
                  </>
                )}
                {hasTargets && (
                  <select
                    value={c.targetRoi ?? ''}
                    onChange={e => update(c.id, 'targetRoi', e.target.value || undefined)}
                    className="rounded border border-border/50 bg-slate-800 px-1.5 py-1 text-xs text-foreground outline-none focus:border-accent w-[120px]"
                  >
                    <option value="">不绑定目标</option>
                    {availableTargets.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                )}
              </div>
            </div>
          ))}
          <button onClick={() => add(codeType)} className="flex items-center gap-1 text-xs text-accent hover:underline">
            <Plus className="h-3.5 w-3.5" />添加{codeType === 'qr' ? '二维码' : '一维条码'}规则
          </button>
        </div>
      ))}
    </div>
  );
}
function RecipesTab() {
  const [recipes, setRecipes] = useState<StageRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<StageRecipe | null | 'new'>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    fetchRecipes()
      .then(setRecipes)
      .catch(() => toast.error('加载配方失败'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (data: RecipeFormData) => {
    try {
      if (editing === 'new') {
        await createRecipe(data);
        toast.success('配方已创建');
      } else if (editing) {
        await updateRecipe(editing.id, data);
        toast.success('配方已更新');
      }
      setEditing(null);
      load();
    } catch (e: any) {
      toast.error(e.message || '保存失败');
    }
  };

  const handleDelete = async (r: StageRecipe) => {
    if (!window.confirm(`确认删除配方「${r.name}」？`)) return;
    try {
      await deleteRecipe(r.id);
      toast.success('已删除');
      load();
    } catch (e: any) {
      toast.error(e.message || '删除失败');
    }
  };

  const handleSetDefault = async (r: StageRecipe) => {
    try {
      // Clear existing default first
      const existing = recipes.find(x => x.isDefault && x.id !== r.id);
      if (existing) await updateRecipe(existing.id, { isDefault: false });
      await updateRecipe(r.id, { isDefault: !r.isDefault });
      toast.success(r.isDefault ? '已取消默认' : `已设「${r.name}」为默认配方`);
      load();
    } catch (e: any) {
      toast.error(e.message || '操作失败');
    }
  };

  const handleCopyLink = (r: StageRecipe) => {
    const base = `${window.location.origin}/ocr`;
    const params = new URLSearchParams();
    if (r.processStageCode) params.set('stage_code', r.processStageCode);
    if (r.processStageName) params.set('stage_name', r.processStageName);
    if (r.fixtureQrPrefixes) params.set('fixture_qr_prefixes', r.fixtureQrPrefixes);
    if (r.fixtureQrPattern) params.set('fixture_qr_pattern', r.fixtureQrPattern);
    if (r.cameraId) params.set('camera_id', r.cameraId);
    // Handle null/undefined ocrEngineModel by providing a default or omitting
    if (r.ocrEngineModel && r.ocrEngineModel !== 'auto') params.set('ocr_model', r.ocrEngineModel);
    const url = params.toString() ? `${base}?${params.toString()}` : base;
    navigator.clipboard.writeText(url).then(
      () => toast.success('链接已复制'),
      () => toast.error('复制失败')
    );
  };

  const filtered = recipes.filter(
    r => r.name.toLowerCase().includes(search.toLowerCase()) ||
         r.processStageCode.toLowerCase().includes(search.toLowerCase())
  );

  if (editing !== null) {
    const initial: RecipeFormData = editing === 'new'
      ? EMPTY_RECIPE
      : { ...editing };
    return (
      <div>
        <div className="mb-4 flex items-center gap-2">
          <button onClick={() => setEditing(null)} className="text-muted-foreground hover:text-foreground">
            ← 返回列表
          </button>
          <span className="text-muted-foreground">/</span>
          <span className="text-foreground">{editing === 'new' ? '新建配方' : `编辑：${editing.name}`}</span>
        </div>
        <RecipeForm initial={initial} onSave={handleSave} onCancel={() => setEditing(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="搜索配方名称或工序标识..."
          className="flex-1 rounded border border-border/50 bg-slate-800 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
        />
        <Button onClick={() => setEditing('new')} className="flex items-center gap-1.5">
          <Plus className="h-4 w-4" />新建配方
        </Button>
      </div>

      {loading && <div className="py-8 text-center text-muted-foreground">加载中...</div>}
      {!loading && filtered.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          {search ? '无匹配结果' : '暂无配方，点击"新建配方"开始'}
        </div>
      )}

      <div className="space-y-2">
        {filtered.map(r => (
          <div
            key={r.id}
            className="rounded-lg border border-border/50 bg-slate-800 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-foreground">{r.name}</span>
                  {r.isDefault && (
                    <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent">默认</span>
                  )}
                  {!r.isActive && (
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-muted-foreground">已停用</span>
                  )}
                </div>
                {r.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{r.description}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {r.processStageCode && (
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
                      工序: {r.processStageCode}
                    </span>
                  )}
                  {r.enableKeywordAnalysis && (
                    <span className="rounded bg-blue-900/30 px-1.5 py-0.5 text-[10px] text-blue-300">
                      关键词×{r.keywordConfigs.length}
                    </span>
                  )}
                  {r.enableBarcodeDetection && (
                    <span className="rounded bg-purple-900/30 px-1.5 py-0.5 text-[10px] text-purple-300">
                      条码×{r.barcodeConfigs.length}
                    </span>
                  )}
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
                    OCR: {r.ocrEngineModel}
                  </span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${r.cameraId ? 'bg-cyan-900/30 text-cyan-300' : 'bg-amber-900/30 text-amber-300'}`}>
                    摄像头: {r.cameraId || '未绑定'}
                  </span>
                  <span className="rounded bg-indigo-900/30 px-1.5 py-0.5 text-[10px] text-indigo-300">
                    YOLO: {r.currentModelId || '未绑定'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => handleSetDefault(r)}
                  title={r.isDefault ? '取消默认' : '设为默认'}
                  className={`rounded p-1.5 transition-colors ${r.isDefault ? 'text-accent hover:text-accent/70' : 'text-muted-foreground hover:text-accent'}`}
                >
                  <Star className="h-4 w-4" fill={r.isDefault ? 'currentColor' : 'none'} />
                </button>
                <button
                  onClick={() => handleCopyLink(r)}
                  title="复制链接"
                  className="rounded p-1.5 text-muted-foreground hover:text-foreground"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setEditing(r)}
                  title="编辑"
                  className="rounded p-1.5 text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(r)}
                  title="删除"
                  className="rounded p-1.5 text-muted-foreground hover:text-red-400"
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

const TemplatesScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('products');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">模版页面</h1>
        <p className="mt-1 text-sm text-muted-foreground">管理工序配方、AI检测规范与关键词/条码模版</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-border/50">
        <nav className="flex gap-0.5 overflow-x-auto scrollbar-hide">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 rounded-t px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-accent text-accent'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'recipes'   && <RecipesTab />}
        {activeTab === 'products'  && <ProductsTab />}
        {activeTab === 'fixtures'  && <FixturesTab />}
        {activeTab === 'standards' && <StandardSetupScreen />}
        {activeTab === 'keywords'  && <KeywordsTab />}
        {activeTab === 'barcodes'  && <BarcodesTab />}
        {activeTab === 'anomaly-rules' && <AnomalyRulesTab />}
        {activeTab === 'devices' && <DevicesTab />}
      </div>
    </div>
  );
};

export default TemplatesScreen;
