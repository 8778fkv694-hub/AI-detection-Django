import React, { useEffect, useState } from 'react';
import { fetchRecipes, type StageRecipe } from '@/lib/stageRecipeApi';
import { Button } from '@/components/ui/Button';
import { X, CheckCircle, BookOpen, Tag, Hash, Code2 } from 'lucide-react';

interface RecipeSelectModalProps {
  onApply: (recipe: StageRecipe) => void;
  onSkip: () => void;
}

const RecipeSelectModal: React.FC<RecipeSelectModalProps> = ({ onApply, onSkip }) => {
  const [recipes, setRecipes] = useState<StageRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<StageRecipe | null>(null);

  useEffect(() => {
    fetchRecipes()
      .then((list) => {
        setRecipes(list.filter(r => r.isActive));
        const def = list.find(r => r.isDefault && r.isActive);
        if (def) setSelected(def);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative flex h-[80vh] w-[90vw] max-w-4xl flex-col rounded-xl border border-border/50 bg-background shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">选择工序配方</h2>
            <p className="text-xs text-muted-foreground mt-0.5">选择一个配方一键应用全部参数，或跳过手动配置</p>
          </div>
          <button onClick={onSkip} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Recipe list */}
          <div className="w-72 flex-shrink-0 overflow-y-auto border-r border-border/50 p-3 space-y-1.5">
            {loading && (
              <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">加载中...</div>
            )}
            {!loading && recipes.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground text-sm gap-2">
                <BookOpen className="h-8 w-8 opacity-40" />
                <span>暂无配方</span>
                <span className="text-xs text-center px-4">请先在"模版页面 → 工序配方"中创建</span>
              </div>
            )}
            {recipes.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelected(r)}
                className={`w-full rounded-lg border p-3 text-left transition-all ${
                  selected?.id === r.id
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border/40 bg-slate-800 hover:border-border hover:bg-slate-800/80 text-foreground'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium leading-snug">{r.name}</span>
                  {r.isDefault && (
                    <span className="flex-shrink-0 rounded bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent">默认</span>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {r.processStageCode && (
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
                      {r.processStageCode}
                    </span>
                  )}
                  {r.enableKeywordAnalysis && (
                    <span className="rounded bg-blue-900/40 px-1.5 py-0.5 text-[10px] text-blue-300">
                      关键词×{r.keywordConfigs.length}
                    </span>
                  )}
                  {r.enableBarcodeDetection && (
                    <span className="rounded bg-purple-900/40 px-1.5 py-0.5 text-[10px] text-purple-300">
                      条码×{r.barcodeConfigs.length}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Right: Preview */}
          <div className="flex-1 overflow-y-auto p-6">
            {!selected ? (
              <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                请在左侧选择一个配方
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <h3 className="text-base font-semibold text-foreground">{selected.name}</h3>
                  {selected.description && (
                    <p className="mt-1 text-sm text-muted-foreground">{selected.description}</p>
                  )}
                </div>

                {/* 工序信息 */}
                <section className="space-y-2">
                  <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Tag className="h-3.5 w-3.5" />工序信息
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: '工序标识', value: selected.processStageCode },
                      { label: '工序名称', value: selected.processStageName },
                      { label: '工装前缀', value: selected.fixtureQrPrefixes },
                      { label: '工装正则', value: selected.fixtureQrPattern },
                      { label: '相机ID', value: selected.cameraId },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded border border-border/40 bg-slate-800 p-2">
                        <div className="text-[10px] text-muted-foreground">{label}</div>
                        <div className="mt-0.5 text-xs text-foreground break-all">
                          {value || <span className="text-muted-foreground/60">未设置</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* 关键词 */}
                <section className="space-y-2">
                  <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Hash className="h-3.5 w-3.5" />关键词检测
                    <span className={`ml-1 rounded px-1.5 py-0.5 text-[10px] ${selected.enableKeywordAnalysis ? 'bg-green-900/30 text-green-400' : 'bg-slate-800 text-slate-400'}`}>
                      {selected.enableKeywordAnalysis ? '启用' : '关闭'}
                    </span>
                  </h4>
                  {selected.enableKeywordAnalysis && (
                    <div className="rounded border border-border/40 bg-slate-800 p-2 space-y-1.5">
                      <div className="text-[10px] text-muted-foreground">
                        匹配模式: {selected.keywordMatchMode === 'contains' ? '包含' : '完全匹配'}
                        &nbsp;·&nbsp;默认置信度: ≥{Math.round(selected.minConfidence * 100)}%
                      </div>
                      {selected.keywordConfigs.length === 0 && (
                        <div className="text-xs text-muted-foreground/60">未配置关键词规则</div>
                      )}
                      {selected.keywordConfigs.map((kw, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${kw.type === 'negative' ? 'bg-red-400' : 'bg-green-400'}`} />
                          <span className="text-foreground font-medium">{kw.text}</span>
                          <span className="text-muted-foreground">≥{Math.round(kw.confidence * 100)}%</span>
                          {kw.type === 'negative' && <span className="text-red-400/70 text-[10px]">排除</span>}
                          {kw.requiredCount && kw.requiredCount > 1 && (
                            <span className="text-amber-400/70 text-[10px]">×{kw.requiredCount}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* 条码 */}
                <section className="space-y-2">
                  <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Code2 className="h-3.5 w-3.5" />条码检测
                    <span className={`ml-1 rounded px-1.5 py-0.5 text-[10px] ${selected.enableBarcodeDetection ? 'bg-green-900/30 text-green-400' : 'bg-slate-800 text-slate-400'}`}>
                      {selected.enableBarcodeDetection ? '启用' : '关闭'}
                    </span>
                  </h4>
                  {selected.enableBarcodeDetection && selected.barcodeConfigs.length > 0 && (
                    <div className="rounded border border-border/40 bg-slate-800 p-2 space-y-1">
                      {selected.barcodeConfigs.map((bc, i) => (
                        <div key={i} className="text-xs text-foreground">
                          {(bc.codeType || 'qr') === 'qr' ? '二维码' : `一维条码/${bc.barcodeFormat || 'auto'}`}：
                          {bc.expectedText || <span className="text-muted-foreground">任意内容</span>}
                          <span className="ml-2 text-muted-foreground">({bc.matchMode})</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* OCR引擎 */}
                <section className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">OCR引擎配置</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded border border-border/40 bg-slate-800 p-2">
                      <div className="text-[10px] text-muted-foreground">引擎模型</div>
                      <div className="mt-0.5 text-xs text-foreground">{selected.ocrEngineModel}</div>
                    </div>
                    <div className="rounded border border-border/40 bg-slate-800 p-2">
                      <div className="text-[10px] text-muted-foreground">检测置信度</div>
                      <div className="mt-0.5 text-xs text-foreground">{Math.round(selected.detectionConfidence * 100)}%</div>
                    </div>
                    {selected.fusionModeEnabled && (
                      <div className="rounded border border-border/40 bg-slate-800 p-2 col-span-2">
                        <div className="text-[10px] text-muted-foreground">融合模式</div>
                        <div className="mt-0.5 text-xs text-foreground">
                          启用 {selected.selectedStandardId ? `(规范ID: ${selected.selectedStandardId})` : ''}
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-border/50 px-6 py-4">
          <button
            onClick={onSkip}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            跳过，稍后配置
          </button>
          <Button
            onClick={() => selected && onApply(selected)}
            disabled={!selected}
            className="flex items-center gap-2"
          >
            <CheckCircle className="h-4 w-4" />
            应用配方
          </Button>
        </div>
      </div>
    </div>
  );
};

export default RecipeSelectModal;
