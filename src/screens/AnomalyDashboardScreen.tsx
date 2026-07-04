import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, Clock3, ShieldAlert, RefreshCw } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import {
  fetchAnomalyRecords,
  fetchDashboard,
  transitionAnomaly,
  type AnomalyRecord,
} from '@/lib/anomalyApi';
import { enqueueAnomalyTransition, flushAnomalyOfflineQueue, getAnomalyOfflineQueue } from '@/lib/anomalyOfflineQueue';

const statusLabelMap: Record<string, string> = {
  open: '待处理',
  suspended: '挂起',
  in_progress: '处理中',
  resolved: '已关闭',
  escalated: '已升级',
  scrapped: '已报废',
};

const severityLabelMap: Record<string, string> = {
  warning: '警告',
  critical: '严重',
  emergency: '紧急',
};

const severityClassMap: Record<string, string> = {
  warning: 'text-amber-300',
  critical: 'text-red-300',
  emergency: 'text-red-400',
};

type TransitionAction = 'suspend' | 'resume' | 'resolve' | 'escalate' | 'scrap';

const actionOptions: Array<{ value: TransitionAction; label: string }> = [
  { value: 'suspend', label: '挂起' },
  { value: 'resume', label: '恢复' },
  { value: 'resolve', label: '关闭' },
  { value: 'escalate', label: '升级' },
  { value: 'scrap', label: '报废' },
];

function StatCard({
  title,
  value,
  hint,
  icon,
}: {
  title: string;
  value: number;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-slate-900/70 p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">{title}</div>
          <div className="mt-2 text-2xl font-semibold text-slate-100">{value}</div>
          <div className="mt-1 text-xs text-slate-500">{hint}</div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/80 p-3 text-slate-300">{icon}</div>
      </div>
    </div>
  );
}

const AnomalyDashboardScreen: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [records, setRecords] = useState<AnomalyRecord[]>([]);
  const [dashboard, setDashboard] = useState({
    openCount: 0,
    suspendedCount: 0,
    inProgressCount: 0,
    resolvedToday: 0,
    byType: {} as Record<string, number>,
    bySeverity: {} as Record<string, number>,
    trend: [] as Array<{ date: string; count: number }>,
  });
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [password, setPassword] = useState('password');
  const [comment, setComment] = useState('');
  const [operator, setOperator] = useState('');
  const [action, setAction] = useState<TransitionAction>('resolve');
  const [syncingOffline, setSyncingOffline] = useState(false);

  const filters = {
    status: searchParams.get('status') || '',
    severity: searchParams.get('severity') || '',
    processStageCode: searchParams.get('process_stage_code') || '',
    timeRange: searchParams.get('time_range') || '24h',
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [dashboardData, recordData] = await Promise.all([
        fetchDashboard({
          timeRange: filters.timeRange,
          processStageCode: filters.processStageCode,
        }),
        fetchAnomalyRecords({
          status: filters.status || undefined,
          severity: filters.severity || undefined,
          processStageCode: filters.processStageCode || undefined,
          limit: 100,
        }),
      ]);
      setDashboard({
        openCount: dashboardData.openCount,
        suspendedCount: dashboardData.suspendedCount,
        inProgressCount: dashboardData.inProgressCount,
        resolvedToday: dashboardData.resolvedToday,
        byType: dashboardData.byType,
        bySeverity: dashboardData.bySeverity,
        trend: dashboardData.trend,
      });
      setRecords(recordData);
      setSelectedId((current) => current && recordData.some((item) => item.id === current) ? current : recordData[0]?.id ?? null);
    } catch (error: any) {
      toast.error(error.message || '加载异常看板失败');
    } finally {
      setLoading(false);
    }
  }, [filters.processStageCode, filters.severity, filters.status, filters.timeRange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const handleOnline = async () => {
      setSyncingOffline(true);
      try {
        const result = await flushAnomalyOfflineQueue();
        if (result.processed > 0) {
          toast.success(`已同步 ${result.processed} 条离线异常操作`);
          loadData();
        }
      } finally {
        setSyncingOffline(false);
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [loadData]);

  const selectedRecord = useMemo(
    () => records.find((item) => item.id === selectedId) ?? null,
    [records, selectedId]
  );

  const trendMax = useMemo(
    () => Math.max(1, ...dashboard.trend.map((item) => item.count)),
    [dashboard.trend]
  );

  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    setSearchParams(next);
  };

  const handleTransition = async () => {
    if (!selectedRecord) {
      return;
    }

    if (!navigator.onLine) {
      enqueueAnomalyTransition({
        id: selectedRecord.id,
        action,
        password,
        comment,
        operator,
      });
      toast.success('当前离线，异常操作已进入同步队列');
      return;
    }

    try {
      await transitionAnomaly(selectedRecord.id, action, password, comment, operator);
      toast.success(`异常已${actionOptions.find((item) => item.value === action)?.label ?? action}`);
      setComment('');
      loadData();
    } catch (error: any) {
      toast.error(error.message || '状态流转失败');
    }
  };

  const offlineCount = getAnomalyOfflineQueue().length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">异常看板</h1>
          <p className="mt-1 text-sm text-muted-foreground">查看告警总览、趋势与处理闭环。</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-slate-500">
            离线队列 {offlineCount} 条{syncingOffline ? '，正在同步' : ''}
          </div>
          <Button variant="outline" onClick={loadData} className="flex items-center gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="待处理" value={dashboard.openCount} hint="当前 open 状态" icon={<AlertTriangle className="h-5 w-5" />} />
        <StatCard title="处理中" value={dashboard.inProgressCount} hint="恢复或处理中状态" icon={<Clock3 className="h-5 w-5" />} />
        <StatCard title="已挂起" value={dashboard.suspendedCount} hint="等待进一步处置" icon={<ShieldAlert className="h-5 w-5" />} />
        <StatCard title="今日关闭" value={dashboard.resolvedToday} hint="今日 resolved 数量" icon={<CheckCircle2 className="h-5 w-5" />} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="rounded-xl border border-border/50 bg-slate-900/70 p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-100">趋势</div>
              <div className="text-xs text-slate-500">按时间范围统计异常数</div>
            </div>
            <select
              value={filters.timeRange}
              onChange={(event) => updateFilter('time_range', event.target.value)}
              className="rounded border border-border/50 bg-slate-800 px-2.5 py-1.5 text-sm text-foreground outline-none"
            >
              <option value="24h">24小时</option>
              <option value="7d">7天</option>
              <option value="30d">30天</option>
            </select>
          </div>
          <div className="flex h-52 items-end gap-3">
            {dashboard.trend.length === 0 && <div className="text-sm text-slate-500">当前时间范围内暂无异常趋势数据</div>}
            {dashboard.trend.map((point) => (
              <div key={point.date} className="flex flex-1 flex-col items-center gap-2">
                <div className="text-[11px] text-slate-400">{point.count}</div>
                <div
                  className="w-full rounded-t bg-cyan-500/70 transition-all"
                  style={{ height: `${Math.max(12, (point.count / trendMax) * 140)}px` }}
                />
                <div className="text-[11px] text-slate-500">{point.date.slice(5)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-xl border border-border/50 bg-slate-900/70 p-4">
            <div className="text-sm font-semibold text-slate-100">按类型</div>
            <div className="mt-3 space-y-2 text-sm">
              {Object.keys(dashboard.byType).length === 0 && <div className="text-slate-500">暂无数据</div>}
              {Object.entries(dashboard.byType).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-slate-300">{key}</span>
                  <span className="text-slate-100">{value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-border/50 bg-slate-900/70 p-4">
            <div className="text-sm font-semibold text-slate-100">按严重度</div>
            <div className="mt-3 space-y-2 text-sm">
              {Object.keys(dashboard.bySeverity).length === 0 && <div className="text-slate-500">暂无数据</div>}
              {Object.entries(dashboard.bySeverity).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className={severityClassMap[key] ?? 'text-slate-300'}>{severityLabelMap[key] ?? key}</span>
                  <span className="text-slate-100">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-border/50 bg-slate-900/70 p-4">
          <div className="mb-4 flex flex-wrap gap-3">
            <select
              value={filters.status}
              onChange={(event) => updateFilter('status', event.target.value)}
              className="rounded border border-border/50 bg-slate-800 px-2.5 py-1.5 text-sm text-foreground outline-none"
            >
              <option value="">全部状态</option>
              <option value="open">待处理</option>
              <option value="suspended">挂起</option>
              <option value="in_progress">处理中</option>
              <option value="resolved">已关闭</option>
              <option value="escalated">已升级</option>
              <option value="scrapped">已报废</option>
            </select>
            <select
              value={filters.severity}
              onChange={(event) => updateFilter('severity', event.target.value)}
              className="rounded border border-border/50 bg-slate-800 px-2.5 py-1.5 text-sm text-foreground outline-none"
            >
              <option value="">全部严重度</option>
              <option value="warning">警告</option>
              <option value="critical">严重</option>
              <option value="emergency">紧急</option>
            </select>
            <input
              value={filters.processStageCode}
              onChange={(event) => updateFilter('process_stage_code', event.target.value.trim())}
              placeholder="工序代码筛选"
              className="min-w-[220px] rounded border border-border/50 bg-slate-800 px-3 py-1.5 text-sm text-foreground outline-none"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-slate-500">
                  <th className="pb-2 pr-3 font-medium">标题</th>
                  <th className="pb-2 pr-3 font-medium">工序</th>
                  <th className="pb-2 pr-3 font-medium">状态</th>
                  <th className="pb-2 pr-3 font-medium">严重度</th>
                  <th className="pb-2 font-medium">时间</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr
                    key={record.id}
                    onClick={() => setSelectedId(record.id)}
                    className={`cursor-pointer border-b border-slate-900/80 transition-colors hover:bg-slate-800/40 ${
                      selectedId === record.id ? 'bg-slate-800/50' : ''
                    }`}
                  >
                    <td className="py-3 pr-3 text-slate-100">{record.title}</td>
                    <td className="py-3 pr-3 text-slate-400">{record.processStageCode || '-'}</td>
                    <td className="py-3 pr-3 text-slate-300">{statusLabelMap[record.status]}</td>
                    <td className={`py-3 pr-3 ${severityClassMap[record.severity] ?? 'text-slate-300'}`}>
                      {severityLabelMap[record.severity] ?? record.severity}
                    </td>
                    <td className="py-3 text-slate-500">{record.openedAt ? new Date(record.openedAt).toLocaleString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && records.length === 0 && (
              <div className="py-10 text-center text-sm text-slate-500">暂无匹配的异常记录</div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border/50 bg-slate-900/70 p-4">
          {!selectedRecord && <div className="text-sm text-slate-500">选择左侧异常查看详情</div>}
          {selectedRecord && (
            <div className="space-y-4">
              <div>
                <div className="text-lg font-semibold text-slate-100">{selectedRecord.title}</div>
                <div className="mt-1 text-sm text-slate-400">{selectedRecord.description || '暂无说明'}</div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded border border-slate-800 bg-slate-950/60 p-3">
                  <div className="text-slate-500">状态</div>
                  <div className="mt-1 text-slate-100">{statusLabelMap[selectedRecord.status]}</div>
                </div>
                <div className="rounded border border-slate-800 bg-slate-950/60 p-3">
                  <div className="text-slate-500">严重度</div>
                  <div className={`mt-1 ${severityClassMap[selectedRecord.severity] ?? 'text-slate-100'}`}>
                    {severityLabelMap[selectedRecord.severity] ?? selectedRecord.severity}
                  </div>
                </div>
                <div className="rounded border border-slate-800 bg-slate-950/60 p-3">
                  <div className="text-slate-500">工序</div>
                  <div className="mt-1 text-slate-100">{selectedRecord.processStageCode || '-'}</div>
                </div>
                <div className="rounded border border-slate-800 bg-slate-950/60 p-3">
                  <div className="text-slate-500">工装码</div>
                  <div className="mt-1 break-all text-slate-100">{selectedRecord.fixtureQr || '-'}</div>
                </div>
              </div>

              <div>
                <div className="mb-2 text-sm font-medium text-slate-100">处理时间线</div>
                <div className="space-y-2">
                  {selectedRecord.resolutions.length === 0 && <div className="text-xs text-slate-500">暂无处理记录</div>}
                  {selectedRecord.resolutions.map((item) => (
                    <div key={item.id} className="rounded border border-slate-800 bg-slate-950/60 p-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-200">{item.action}</span>
                        <span className="text-slate-500">{new Date(item.createdAt).toLocaleString()}</span>
                      </div>
                      {(item.operator || item.comment) && (
                        <div className="mt-1 text-slate-400">{[item.operator, item.comment].filter(Boolean).join(' / ')}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3 rounded border border-slate-800 bg-slate-950/60 p-3">
                <div className="text-sm font-medium text-slate-100">操作</div>
                <select
                  value={action}
                  onChange={(event) => setAction(event.target.value as TransitionAction)}
                  className="w-full rounded border border-border/50 bg-slate-800 px-2.5 py-2 text-sm text-foreground outline-none"
                >
                  {actionOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="操作密码"
                  className="w-full rounded border border-border/50 bg-slate-800 px-3 py-2 text-sm text-foreground outline-none"
                />
                <input
                  value={operator}
                  onChange={(event) => setOperator(event.target.value)}
                  placeholder="操作人"
                  className="w-full rounded border border-border/50 bg-slate-800 px-3 py-2 text-sm text-foreground outline-none"
                />
                <textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  rows={3}
                  placeholder="备注"
                  className="w-full resize-none rounded border border-border/50 bg-slate-800 px-3 py-2 text-sm text-foreground outline-none"
                />
                <Button onClick={handleTransition} className="w-full">
                  提交操作
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnomalyDashboardScreen;
