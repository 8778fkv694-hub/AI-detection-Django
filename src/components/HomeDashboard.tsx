import React, { useState, useEffect, useCallback } from 'react';
import { useAIConfigStore } from '@/state/aiConfigStore';
import { useAppStore } from '@/state/appStore';
import { apiRequest, apiFetch, isLocalOfflineMode } from '@/lib/config';
import { getLocalEngineInfo } from '@/services/detect';
import { extractText, getOcrStatus } from '@/services/ocr';
import { getDataStats, getYoloStatus, getModelPoolStatus, testAIConnection } from '@/lib/api';
import { getStreamManagerStatus } from '@/api/streamApi';
import { getPreprocessingStatus } from '@/lib/imagePreprocessingApi';
import toast from 'react-hot-toast';
import {
  Activity,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Eye,
  Shield,
  FileText,
  Layers,
  BarChart3,
  Network,
} from 'lucide-react';

interface ServiceStatus {
  name: string;
  ok: boolean;
  detail?: string;
  loading: boolean;
  testAction?: () => Promise<{ ok: boolean; detail?: string }>;
}

interface StatsData {
  total: number;
  qualified: number;
  unqualified: number;
  kitCount: number;
  ocrCount: number;
  timestamp: string | null;
}

const SAMPLE_IMAGE_B64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMCwsKCwsMEhASDBAQEhMTExMTExMTExP/2wBDAQMEBAUEBQkFBQkUDQsNCwwLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AKwA//9k=';

const COMPACT_SAMPLE_IMAGE = 'data:image/jpeg;base64,' + SAMPLE_IMAGE_B64;

const withTimeout = async <T,>(
  promise: Promise<T>,
  fallback: T,
  timeoutMs: number = 8000
): Promise<T> => {
  let timer: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = window.setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      window.clearTimeout(timer);
    }
  }
};

async function triggerQRModelLoad(): Promise<{ ok: boolean; detail?: string }> {
  try {
    const res = await apiFetch('/wechat-qr/detect/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: COMPACT_SAMPLE_IMAGE }),
    });
    const data = await res.json();
    if (data.success || data.model_used) {
      return { ok: true, detail: data.model_used || 'wechat_qr' };
    }
    if (data.error && data.error.includes('模型加载')) {
      return { ok: false, detail: '模型文件缺失，无法加载' };
    }
    if (data.success === false && data.count === 0) {
      const statusRes = await apiFetch('/wechat-qr/status/');
      if (statusRes.ok) {
        const status = await statusRes.json();
        if (status.available || status.model_loaded) {
          return { ok: true, detail: status.model_name || '已加载' };
        }
      }
      return { ok: false, detail: data.error || '检测失败' };
    }
    return { ok: true, detail: data.model_used || '已激活' };
  } catch (e) {
    return { ok: false, detail: '请求失败' };
  }
}

async function triggerOCRModelLoad(): Promise<{ ok: boolean; detail?: string }> {
  try {
    const data = await getOcrStatus();
    if (data.available) return { ok: true, detail: String(data.engine || data.model || '可用') };
    try {
      const detectData = await extractText<{ success?: boolean; text?: string; engine?: string; error?: string }>({
        image: COMPACT_SAMPLE_IMAGE,
      });
      if (detectData.success || detectData.text !== undefined) {
        return { ok: true, detail: String(detectData.engine || data.engine || '已激活') };
      }
      return { ok: false, detail: detectData.error || '不可用' };
    } catch {
      return { ok: false, detail: String(data.engine || '不可用') };
    }
  } catch {
    return { ok: false, detail: '服务未响应' };
  }
}

const HomeDashboard: React.FC = () => {
  const { config } = useAIConfigStore();
  const { results } = useAppStore();

  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [modelPoolInfo, setModelPoolInfo] = useState<{
    loaded_models: string[];
    pool_size: number;
    current_model: string | null;
  } | null>(null);
  const [stats, setStats] = useState<StatsData>({
    total: 0,
    qualified: 0,
    unqualified: 0,
    kitCount: 0,
    ocrCount: 0,
    timestamp: null,
  });
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [testingService, setTestingService] = useState<string | null>(null);

  const checkAll = useCallback(async () => {
    const isOffline = isLocalOfflineMode();
    setServices(prev => prev.map(s => ({ ...s, loading: true })));

    const backendPromise = (async () => {
      try {
        await apiRequest('/results/ppe-model-status/');
        return true;
      } catch { return false; }
    })();

    const yoloPromise = (async () => {
      if (isOffline) {
        const engineInfo = getLocalEngineInfo();
        const engineLabel = engineInfo.engine === 'native' ? '原生' : 'WASM';
        return { ok: true, detail: `${engineLabel} 引擎已就绪 (${engineInfo.modelFileName})` };
      }
      try {
        const status = await getYoloStatus();
        const pool = await getModelPoolStatus();
        setModelPoolInfo({
          loaded_models: pool.loaded_models,
          pool_size: pool.pool_size,
          current_model: pool.current_model,
        });
        return { ok: status.loaded, detail: `当前: ${pool.current_model || '未加载'}` };
      } catch { return { ok: false }; }
    })();

    const aiPromise = (async () => {
      if (isOffline) return { ok: false, detail: '未配置' };
      if (!config.apiKey && !config.apiBaseUrl) return { ok: false, detail: '未配置' };
      try {
        await testAIConnection(config);
        return { ok: true, detail: config.modelName };
      } catch { return { ok: false, detail: config.modelName }; }
    })();

    const ollamaPromise = (async () => {
      if (isOffline) return { ok: false, detail: '未配置' };
      try {
        const res = await apiFetch('/ollama/status/');
        if (!res.ok) throw new Error('ollama status error');
        const data = await res.json();
        if (data.success && data.status === 'running') {
          const modelNames = (data.models || []).map((m: any) => m.name || m).join(', ');
          return { ok: true, detail: modelNames || '运行中' };
        }
        return { ok: false, detail: data.status || '未运行' };
      } catch { return { ok: false, detail: '不可用' }; }
    })();

    const ocrPromise = (async () => {
      if (isOffline) return { ok: false, detail: '未配置' };
      try {
        const data = await getOcrStatus();
        if (data.available) {
          return { ok: true, detail: String(data.engine || data.model || '可用') };
        }
        return { ok: false, detail: String(data.engine || '不可用') };
      } catch { return { ok: false, detail: '不可用' }; }
    })();

    const qrPromise = (async () => {
      if (isOffline) return { ok: false, detail: '未配置' };
      try {
        const res = await apiFetch('/wechat-qr/status/');
        if (!res.ok) throw new Error('qr status error');
        const data = await res.json();
        if (data.available || data.model_loaded) {
          return { ok: true, detail: data.model_name || data.description || '可用' };
        }
        const reason = data.model_loaded === false ? '模型未加载' : (data.error || '不可用');
        return { ok: false, detail: reason };
      } catch { return { ok: false, detail: '服务未响应' }; }
    })();

    const streamPromise = (async () => {
      if (isOffline) return { ok: false, detail: '未配置' };
      try {
        const status = await getStreamManagerStatus();
        const activeCount = Object.values(status.streams || {}).filter((s: any) => s.is_running).length;
        return { ok: true, detail: `${activeCount}/${status.total_streams || 0} 活跃` };
      } catch { return { ok: false, detail: '不可用' }; }
    })();

    const preprocessPromise = (async () => {
      try {
        const data = await getPreprocessingStatus();
        if (data.success) {
          return { ok: true, detail: data.version ? `v${data.version}` : '可用' };
        }
        return { ok: false, detail: '不可用' };
      } catch { return { ok: false, detail: '不可用' }; }
    })();

    const statsPromise = (async () => {
      try { return await getDataStats(); }
      catch { return null; }
    })();

    const [backendOk, yoloResult, aiResult, ollamaResult, ocrResult, qrResult, streamResult, preprocessResult, statsData] = await Promise.all([
      withTimeout(backendPromise, false, 5000),
      withTimeout(yoloPromise, { ok: false, detail: '检查超时' }, 10000),
      withTimeout(aiPromise, { ok: false, detail: '检查超时' }, 2000),
      withTimeout(ollamaPromise, { ok: false, detail: '检查超时' }, 2000),
      withTimeout(ocrPromise, { ok: false, detail: '检查超时' }, 2000),
      withTimeout(qrPromise, { ok: false, detail: '检查超时' }, 2000),
      withTimeout(streamPromise, { ok: false, detail: '检查超时' }, 5000),
      withTimeout(preprocessPromise, { ok: false, detail: '检查超时' }, 5000),
      withTimeout(statsPromise, null, 8000),
    ]);

    let serviceList: ServiceStatus[];
    if (isOffline) {
      serviceList = [
        { 
          name: 'Express 离线服务', 
          ok: backendOk as boolean, 
          loading: false, 
          detail: '本地端口: 5001' 
        },
        { 
          name: 'YOLO 本地推理', 
          ok: yoloResult.ok, 
          loading: false, 
          detail: yoloResult.detail 
        },
        { 
          name: '本地图片预处理', 
          ok: preprocessResult.ok, 
          loading: false, 
          detail: preprocessResult.detail 
        },
      ];
    } else {
      serviceList = [
        { name: '后端服务', ok: backendOk as boolean, loading: false, detail: window.location.port ? `:${window.location.port}` : undefined },
        { name: 'YOLO 检测', ok: yoloResult.ok, loading: false, detail: yoloResult.detail, testAction: async () => { const s = await getYoloStatus(); const p = await getModelPoolStatus(); setModelPoolInfo({ loaded_models: p.loaded_models, pool_size: p.pool_size, current_model: p.current_model }); return { ok: s.loaded, detail: `当前: ${p.current_model || '未加载'}` }; } },
        { name: '云端 AI', ok: aiResult.ok, loading: false, detail: aiResult.detail, testAction: async () => { if (!config.apiKey && !config.apiBaseUrl) return { ok: false, detail: '未配置' }; try { await testAIConnection(config); return { ok: true, detail: config.modelName }; } catch { return { ok: false, detail: config.modelName }; } } },
        { name: 'Ollama 本地', ok: ollamaResult.ok, loading: false, detail: ollamaResult.detail, testAction: async () => { const res = await apiFetch('/ollama/status/'); const data = await res.json(); if (data.success && data.status === 'running') { return { ok: true, detail: (data.models || []).map((m: any) => m.name || m).join(', ') || '运行中' }; } return { ok: false, detail: data.status || '未运行' }; } },
        { name: 'OCR 引擎', ok: ocrResult.ok, loading: false, detail: ocrResult.detail, testAction: triggerOCRModelLoad },
        { name: '二维码检测', ok: qrResult.ok, loading: false, detail: qrResult.detail, testAction: triggerQRModelLoad },
        { name: '视频流', ok: streamResult.ok, loading: false, detail: streamResult.detail, testAction: async () => { const status = await getStreamManagerStatus(); const ac = Object.values(status.streams || {}).filter((s: any) => s.is_running).length; return { ok: true, detail: `${ac}/${status.total_streams || 0} 活跃` }; } },
        { name: '图片预处理', ok: preprocessResult.ok, loading: false, detail: preprocessResult.detail, testAction: async () => { const data = await getPreprocessingStatus(); if (data.success) return { ok: true, detail: data.version ? `v${data.version}` : '可用' }; return { ok: false, detail: '不可用' }; } },
      ];
    }
    setServices(serviceList);

    if (statsData) {
      const computedQual = results.filter(r => r.overallQuality === '合格').length;
      const computedUnqual = results.filter(r => r.overallQuality === '存疑' || r.overallQuality === '需复检').length;
      setStats({
        total: statsData.total?.count ?? results.length,
        qualified: computedQual,
        unqualified: computedUnqual,
        kitCount: statsData.kit_matching?.count ?? 0,
        ocrCount: statsData.ocr_results?.count ?? 0,
        timestamp: statsData.timestamp,
      });
    } else {
      const computedQual = results.filter(r => r.overallQuality === '合格').length;
      const computedUnqual = results.filter(r => r.overallQuality === '存疑' || r.overallQuality === '需复检').length;
      setStats(prev => ({
        ...prev,
        total: results.length,
        qualified: computedQual,
        unqualified: computedUnqual,
        timestamp: prev.timestamp,
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.apiKey, config.apiBaseUrl, config.modelName, results]);

  useEffect(() => {
    const isOffline = isLocalOfflineMode();
    const initial: ServiceStatus[] = isOffline ? [
      { name: 'Express 离线服务', ok: false, loading: true },
      { name: 'YOLO 本地推理', ok: false, loading: true },
      { name: '本地图片预处理', ok: false, loading: true },
    ] : [
      { name: '后端服务', ok: false, loading: true },
      { name: 'YOLO 检测', ok: false, loading: true },
      { name: '云端 AI', ok: false, loading: true },
      { name: 'Ollama 本地', ok: false, loading: true },
      { name: 'OCR 引擎', ok: false, loading: true },
      { name: '二维码检测', ok: false, loading: true },
      { name: '视频流', ok: false, loading: true },
      { name: '图片预处理', ok: false, loading: true },
    ];
    setServices(initial);
    checkAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(checkAll, 30000);
    return () => clearInterval(timer);
  }, [autoRefresh, checkAll]);

  const statusIcon = (s: ServiceStatus) => {
    if (s.loading || testingService === s.name) return <RefreshCw className="h-3.5 w-3.5 text-yellow-500 animate-spin" />;
    return s.ok
      ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />
      : <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />;
  };

  const handleTestService = async (s: ServiceStatus) => {
    if (!s.testAction) return;
    setTestingService(s.name);
    setServices(prev => prev.map(sv =>
      sv.name === s.name ? { ...sv, loading: true, detail: '正在测试...' } : sv
    ));
    try {
      const result = await s.testAction();
      setServices(prev => prev.map(sv =>
        sv.name === s.name ? { ...sv, ok: result.ok, detail: result.detail || sv.detail, loading: false } : sv
      ));
      if (result.ok) {
        toast.success(`${s.name}: 测试通过${result.detail ? ` (${result.detail})` : ''}`, { duration: 3000 });
      } else {
        toast(`${s.name}: ${result.detail || '不可用'}`, { icon: '⚠️', duration: 4000 });
      }
    } catch (e) {
      setServices(prev => prev.map(sv =>
        sv.name === s.name ? { ...sv, ok: false, detail: '请求失败', loading: false } : sv
      ));
      toast.error(`${s.name}: 请求失败 - ${e instanceof Error ? e.message : '未知错误'}`);
    } finally {
      setTestingService(null);
    }
  };

  const qualRate = stats.total > 0 ? Math.round(stats.qualified / stats.total * 100) : 0;

  const onlineCount = services.filter(s => !s.loading && s.ok).length;
  const totalCount = services.length;

  return (
    <div className="space-y-4">
      {/* 服务状态 */}
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">服务状态</span>
            <span className="text-xs text-muted-foreground">
              {onlineCount}/{totalCount} 在线
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                autoRefresh
                  ? 'border-green-500/50 bg-green-500/10 text-green-400'
                  : 'border-slate-700 text-slate-400 hover:text-slate-300'
              }`}
            >
              {autoRefresh ? '自动30s' : '手动'}
            </button>
            <button onClick={checkAll} className="text-[11px] px-2 py-0.5 rounded border border-slate-700 text-slate-400 hover:text-slate-300 transition-colors">
              <RefreshCw className="h-3 w-3" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {services.map(s => (
            <div
              key={s.name}
              className={`rounded-lg border px-2.5 py-2 transition-all duration-300 ${
                s.loading || testingService === s.name
                  ? 'border-yellow-500/20 bg-yellow-500/5'
                  : s.ok
                    ? 'border-green-500/15 bg-green-500/5 hover:bg-green-500/10'
                    : 'border-red-500/15 bg-red-500/5 hover:bg-red-500/10'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-semibold truncate text-foreground/90">{s.name}</span>
                {statusIcon(s)}
              </div>
              <div className="flex items-center justify-between gap-1.5 mt-1 min-h-[20px]">
                {s.detail && !s.loading && testingService !== s.name ? (
                  <p className="text-[10px] text-muted-foreground truncate max-w-[70%]" title={s.detail}>{s.detail}</p>
                ) : (
                  <span className="flex-1" />
                )}
                {s.testAction && testingService !== s.name && (
                  <button
                    onClick={() => handleTestService(s)}
                    className="text-[10px] px-1.5 py-0.5 rounded border border-slate-700 bg-slate-800/40 text-slate-400 hover:text-accent hover:border-accent/40 hover:bg-accent/5 transition-all duration-200 shrink-0 font-medium"
                  >
                    测试
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {modelPoolInfo && (
          <p className="text-xs text-muted-foreground mt-2">
            已加载 {modelPoolInfo.pool_size} 个模型
            {modelPoolInfo.current_model ? ` · 当前: ${modelPoolInfo.current_model}` : ''}
          </p>
        )}
      </div>

      {/* 检测统计 */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          icon={<Eye className="h-4 w-4" />}
          label="总检测数"
          value={stats.total}
          color="blue"
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="合格"
          value={stats.qualified}
          subText={stats.total > 0 ? `${qualRate}%` : undefined}
          color="green"
        />
        <StatCard
          icon={<XCircle className="h-4 w-4" />}
          label="不合格/存疑"
          value={stats.unqualified}
          color="red"
        />
      </div>

      {/* 合格率 + 分类统计 */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">合格率</span>
          <span className="text-sm text-muted-foreground ml-auto">{qualRate}%</span>
        </div>
        <div className="h-2.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${qualRate}%`,
              background:
                qualRate >= 90
                  ? '#22c55e'
                  : qualRate >= 70
                    ? '#eab308'
                    : '#ef4444',
            }}
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1">
          <MiniStat icon={<Layers className="h-3.5 w-3.5" />} label="齐套化" value={stats.kitCount} />
          <MiniStat icon={<FileText className="h-3.5 w-3.5" />} label="OCR" value={stats.ocrCount} />
          <MiniStat icon={<Shield className="h-3.5 w-3.5" />} label="PPE" value={stats.total - stats.kitCount - stats.ocrCount} />
          <MiniStat icon={<Activity className="h-3.5 w-3.5" />} label="最近同步" value={stats.timestamp ? new Date(stats.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '--'} />
        </div>
      </div>
    </div>
  );
};

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  subText?: string;
  color: 'blue' | 'green' | 'red';
}

const StatCard: React.FC<StatCardProps> = ({ icon, label, value, subText, color }) => {
  const colorMap = {
    blue: 'border-blue-500/30 bg-blue-500/5 text-blue-400',
    green: 'border-green-500/30 bg-green-500/5 text-green-400',
    red: 'border-red-500/30 bg-red-500/5 text-red-400',
  };
  return (
    <div className={`rounded-xl border p-3 ${colorMap[color]}`}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-xs font-semibold opacity-85">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-bold">{value}</span>
        {subText && <span className="text-xs opacity-70">{subText}</span>}
      </div>
    </div>
  );
};

interface MiniStatProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}

const MiniStat: React.FC<MiniStatProps> = ({ icon, label, value }) => (
  <div className="flex items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-800/30 px-2.5 py-1.5">
    <div className="text-muted-foreground">{icon}</div>
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  </div>
);

export default HomeDashboard;
