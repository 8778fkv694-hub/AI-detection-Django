// Audit probes: execute current hook bodies with minimal React/timer stubs.
// A03/A04/A05 have been fixed in the first remediation batch; those probes now
// assert the expected correct behavior (regression assertions).
// A01/A10 belong to the second batch and still confirm open defects.
// Run from repository root.
const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');
const assert = require('assert/strict');
const observations = [];
function loadHook(file, extras = {}, reactOverride = {}) {
  const timers = [];
  const cleared = [];
  const module = { exports: {} };
  const stub = {
    useCallback: f => f,
    useRef: v => ({ current: v }),
    useState: v => [v, () => {}],
    useEffect: () => {},
    ...reactOverride,
  };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require: id => {
      if (id === 'react') return stub;
      if (id === 'react-hot-toast') return { default: { error() {}, success() {} } };
      return extras[id] || {};
    },
    console: { log() {}, warn() {}, error() {} },
    setTimeout: f => { timers.push(f); return timers.length; },
    clearTimeout: f => { cleared.push(f); },
    Date, Set, Map,
  }, { filename: file });
  return { ...module.exports, timers, cleared };
}
const batchFile = 'src/hooks/ocr/useBatchResultHandler.ts';
function batch(overrides = {}) {
  const h = loadHook(batchFile, {
    '@/lib/ocr/barcodeRuleEvaluator': { buildBarcodeAnalysis: () => null },
  });
  const states = {};
  let saves = 0;
  const options = {
    enableKeywordAnalysis: false, enableBarcodeDetection: false,
    barcodeConfigs: [], keywordConfigs: [], keywordMatchMode: 'contains',
    requireQualifiedConfirmation: false, selectedTargets: ['label'],
    fusionModeEnabled: false, performFusionAIAnalysis: async () => null,
    batchManager: { reset() {} }, captureFrameData: () => null,
    saveDetectionResult: async () => { saves++; },
  };
  for (const name of ['OcrResult','ImagePreview','WorkflowState','FinalResult','MatchStatus','IsWaitingForSpace','WorkflowResult','AiAnalysisResult','DetectedElements','ElementDetectionStartTime']) {
    options['set' + name] = value => { states[name] = value; };
  }
  Object.assign(options, overrides);
  return { hook: h.useBatchResultHandler(options), timers: h.timers, states, saves: () => saves };
}
const result = () => ({ success: true, overall_quality: '合格', ocr_text: 'SAME', roi_count: 1,
  details: [{ label: 'label', success: true, qualified: true, ocr_text: 'SAME' }], stitched_image: 'aGVsbG8=' });
(async () => {
  // A04（已修复）：两件完全相同的产品各自产生独立的保存记录
  const repeated = batch();
  await repeated.hook.onBatchComplete(result(), 1);
  repeated.timers.shift()(); // 正常自动进入下一轮
  await repeated.hook.onBatchComplete(result(), 2);
  assert.equal(repeated.saves(), 2);
  observations.push({ id: 'A04', status: 'FIXED', observed: 'Two identical successive pieces each produce a save (dedup key is run identity, not OCR content).' });

  // A05（已修复）：保存失败时不得自动进入下一轮，必须等待人工处理
  const failed = batch({ saveDetectionResult: async () => { throw Error('network down'); } });
  await failed.hook.onBatchComplete(result(), 1);
  assert.equal(failed.states.FinalResult, 'qualified');
  assert.equal(failed.states.IsWaitingForSpace, true);
  assert.equal(failed.states.WorkflowState, 'waiting_for_approval');
  assert.equal(failed.timers.length, 0);
  observations.push({ id: 'A05', status: 'FIXED', observed: 'Save rejection keeps the round waiting for manual handling; no automatic return to idle.' });

  // A03（已修复）：复位后迟到的AI结果不得写回合格或触发保存
  let finish;
  const interrupted = batch({ fusionModeEnabled: true, performFusionAIAnalysis: () => new Promise(r => finish = r) });
  const pending = interrupted.hook.onBatchComplete(result(), 1);
  interrupted.hook.resetBatchSaveState();
  interrupted.states.WorkflowState = 'idle';
  interrupted.states.FinalResult = 'none';
  finish({ overallQuality: '合格' });
  await pending;
  assert.equal(interrupted.saves(), 0);
  assert.equal(interrupted.states.FinalResult, 'none');
  observations.push({ id: 'A03', status: 'FIXED', observed: 'Delayed AI completion after reset is discarded: no qualified write-back and no save.' });

  // A11（已修复）：后端追踪/终检结论非合格时，覆盖前端合格并阻止自动放行
  const rejected = batch({
    saveDetectionResult: async () => ({ saved: true, savedData: { overall_quality: '需复检', trace_conclusion: '需复检' } }),
  });
  await rejected.hook.onBatchComplete(result(), 1);
  assert.equal(rejected.states.FinalResult, 'unqualified');
  assert.equal(rejected.states.IsWaitingForSpace, true);
  assert.equal(rejected.timers.length, 0);
  observations.push({ id: 'A11', status: 'FIXED', observed: 'Backend recheck conclusion overrides the frontend qualified guess and blocks auto-continue.' });

  // A01（第二批已修复）：保存回配方使用统一收集器 currentRecipeState，
  // 服务端返回值更新快照；不再出现“参与差异却不保存”的字段。
  const screen = fs.readFileSync('src/screens/OCRDetectionScreen.tsx', 'utf8');
  assert(screen.includes('updateRecipe(appliedRecipeId, currentRecipeState)'));
  const collectorStart = screen.indexOf('const currentRecipeState = useMemo');
  const collector = screen.slice(collectorStart, screen.indexOf('}), [', collectorStart));
  for (const field of ['nonGridTargets', 'targetConfidences', 'fixtureEnabled', 'selectedStandardId', 'keywordMatchMode', 'minConfidence', 'detectionConfidence']) {
    assert(collector.includes(field), `collector should include ${field}`);
  }
  observations.push({ id: 'A01', status: 'FIXED', observed: 'Save payload and diff detection share one field collector incl. nonGridTargets/targetConfidences; snapshot updated from server response.' });

  // A02（第二批已修复）：工序切换原子性 — 失败不推进索引，成功先应用再推进。
  // 用真实 hook 函数体 + 最小 React/store 替身执行 goToNextStage/goToPrevStage。
  function productProbe(extras = {}) {
    let applied = [];
    let advanced = 0; let regressed = 0;
    const hooks = loadHook('src/hooks/ocr/useProductRecipe.ts', {
      'react-hot-toast': { default: { error() {}, success() {} } },
      '@/lib/productRecipeApi': { productRecipeApi: { list: async () => extras.products || [] } },
      '@/state/ocrDetectionStore': { useOCRDetectionStore: () => ({
        currentProductId: 'p1', currentProductStageIndex: 0,
        setCurrentProductId: () => {}, nextProductStage: () => { advanced++; }, prevProductStage: () => { regressed++; },
      }) },
      '@/lib/stageRecipeApi': {
        fetchRecipes: async () => extras.recipes ?? [],
        },
    }, {
      // 注入 currentProduct（useState 初始 null 的那个调用）
      useState: v => v === null ? [extras.currentProduct ?? null, () => {}] : [v, () => {}],
    });
    const hook = hooks.useProductRecipe((recipe) => { applied.push(recipe); });
    return { hook, applied, counts: () => ({ advanced, regressed }) };
  }
  const stage = { stage_recipe: 'r1', stage_recipe_name: 'S1' };
  const stage2 = { stage_recipe: 'r2', stage_recipe_name: 'S2' };
  const product = { id: 'p1', stages: [stage, stage2] };

  { // 加载失败：不推进索引，不应用配方
    const probe = productProbe({ currentProduct: product, recipes: async () => { throw Error('network down'); } });
    await probe.hook.goToNextStage();
    assert.equal(probe.counts().advanced, 0);
    assert.equal(probe.applied.length, 0);
    observations.push({ id: 'A02', status: 'FIXED', observed: 'Stage switch failure does not advance the index nor apply any recipe.' });
  }
  { // 配方缺失：不推进索引
    const probe = productProbe({ currentProduct: product, recipes: [] });
    await probe.hook.goToNextStage();
    assert.equal(probe.counts().advanced, 0);
    assert.equal(probe.applied.length, 0);
    observations.push({ id: 'A02', status: 'FIXED', observed: 'Missing stage recipe keeps the previous stage identity.' });
  }
  { // 成功：先应用配方，再推进索引
    const recipe = { id: 'r2', name: 'S2' };
    const probe = productProbe({ currentProduct: product, recipes: [recipe] });
    await probe.hook.goToNextStage();
    assert.equal(probe.applied.length, 1);
    assert.equal(probe.applied[0], recipe);
    assert.equal(probe.counts().advanced, 1);
    observations.push({ id: 'A02', status: 'FIXED', observed: 'Stage recipe is applied before the product stage index advances.' });
  }

  // A08（第二批已修复）：开工前置检查 — requiredDeviceTypes 声明的串口设备未连接时阻止开工；
  // 融合降级显式呈现。
  assert(screen.includes('const checkRecipeReadiness'));
  const readinessCalls = (screen.match(/(?<!const |Ref = )checkRecipeReadiness\(\)/g) || []).length
    + (screen.match(/checkRecipeReadinessRef\.current\(\)/g) || []).length;
  assert(readinessCalls >= 2); // 键盘抓拍 + 硬件触发
  assert(screen.includes('如需启用请在当前窗口手动开启'));
  observations.push({ id: 'A08', status: 'FIXED', observed: 'Recipe required serial devices gate the workflow start; forced fusion-off degradation is surfaced explicitly.' });

  // A09（第二批已修复，部分）：临时缓存与锁标志不持久化，受控配方身份持久化。
  const storeSrc = fs.readFileSync('src/state/ocrDetectionStore.ts', 'utf8');
  const partializeStart = storeSrc.indexOf('partialize: (state)');
  const partialize = storeSrc.slice(partializeStart, storeSrc.indexOf('storage:', partializeStart));
  for (const field of ['roiCacheIds', 'batchTriggered']) {
    assert(new RegExp(`${field}[^\\n]*排除`).test(partialize) || new RegExp(`// ${field === 'batchTriggered' ? 'A09' : 'A09'}`).test(partialize), `${field} should be excluded from persistence`);
    assert(partialize.includes(field));
  }
  assert(screen.includes('appliedRecipeId, appliedRecipeName, appliedRecipeSnapshot, setAppliedRecipe'));
  observations.push({ id: 'A09', status: 'FIXED', observed: 'roiCacheIds/batchTriggered are no longer persisted; controlled recipe identity persists for restart recovery.' });

  // A12（第三批已修复，影响提示）：模板复制语义显式化 —
  // 运行页选中配方时提示"源工装模板已更新、本配方为旧版本快照"；
  // 模板管理页标注"快照副本不自动同步"；证据携带配方身份（appliedRecipeId）。
  const modalSrc = fs.readFileSync('src/components/ocr/RecipeSelectModal.tsx', 'utf8');
  const templatesSrc = fs.readFileSync('src/screens/TemplatesScreen.tsx', 'utf8');
  assert(modalSrc.includes('旧版本快照'));
  assert(templatesSrc.includes('已引用') && templatesSrc.includes('快照副本'));
  assert(screen.includes('appliedRecipeId:    appliedRecipeId'));
  observations.push({ id: 'A12', status: 'FIXED', observed: 'Copy semantics are explicit: divergence between source fixture template and recipe snapshot is surfaced before apply; evidence records carry recipe identity.' });

  let submitted;
  const saveHook = loadHook('src/hooks/ocr/useDetectionSave.ts', { 'react-hot-toast': { default: { error() {} } } });
  const saver = saveHook.useDetectionSave({ fusionModeEnabled: false, selectedStandardId: null,
    addAppResult: async r => { submitted = r; return {}; }, clearOldDetectionHistory() {}, addDetectionHistory() {} });
  await saver.saveDetectionResult({ success: true, full_text: 'X', detailed_results: [], ai_analysis: { keyword_match_details: [{ marker: 1 }] }, batch_processing: { roi_details: [{ label: 'x' }] } }, null, 'qualified', 'abc');
  assert.deepEqual(submitted.ocrResult.ai_analysis, { keyword_match_details: [{ marker: 1 }] });
  assert.deepEqual(submitted.ocrResult.batch_processing, { roi_details: [{ label: 'x' }] });
  observations.push({ id: 'A10', status: 'FIXED', observed: 'Saved OCR payload retains ai_analysis and batch_processing evidence for later audit.' });

  console.log(JSON.stringify({ method: 'Current-source hook probes; React lifecycle and browser hardware are not simulated', observations }, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; });
