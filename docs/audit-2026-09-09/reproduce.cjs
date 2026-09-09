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
function loadHook(file, extras = {}) {
  const timers = [];
  const cleared = [];
  const module = { exports: {} };
  const stub = {
    useCallback: f => f,
    useRef: v => ({ current: v }),
    useState: v => [v, () => {}],
    useEffect: () => {},
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

  const screen = fs.readFileSync('src/screens/OCRDetectionScreen.tsx', 'utf8');
  const updateStart = screen.indexOf('await updateRecipe(appliedRecipeId');
  const updateEnd = screen.indexOf('// Refresh snapshot', updateStart);
  const payload = screen.slice(updateStart, updateEnd);
  const snapshot = screen.slice(updateEnd, screen.indexOf('toast.success', updateEnd));
  for (const field of ['nonGridTargets', 'targetConfidences']) {
    assert(!payload.includes(field)); assert(snapshot.includes(field));
  }
  observations.push({ id: 'A01', observed: 'Save payload omits nonGridTargets and targetConfidences while local snapshot accepts both.' });

  let submitted;
  const saveHook = loadHook('src/hooks/ocr/useDetectionSave.ts', { 'react-hot-toast': { default: { error() {} } } });
  const saver = saveHook.useDetectionSave({ fusionModeEnabled: false, selectedStandardId: null,
    addAppResult: async r => { submitted = r; return {}; }, clearOldDetectionHistory() {}, addDetectionHistory() {} });
  await saver.saveDetectionResult({ success: true, full_text: 'X', detailed_results: [], ai_analysis: { marker: 1 }, batch_processing: { roi_details: [] } }, null, 'qualified', 'abc');
  assert.equal(submitted.ocrResult.ai_analysis, undefined);
  assert.equal(submitted.ocrResult.batch_processing, undefined);
  observations.push({ id: 'A10', observed: 'Saved OCR payload discards ai_analysis and batch_processing evidence.' });

  console.log(JSON.stringify({ method: 'Current-source hook probes; React lifecycle and browser hardware are not simulated', observations }, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; });
