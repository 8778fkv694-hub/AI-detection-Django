import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { type ActiveAlert } from '@/lib/anomalyApi';

interface AnomalyAlertBannerProps {
  alerts: ActiveAlert[];
  processStageCode?: string;
}

const severityClassMap: Record<string, string> = {
  warning: 'text-amber-300',
  critical: 'text-red-300',
  emergency: 'text-red-400',
};

const severityLabelMap: Record<string, string> = {
  warning: '警告',
  critical: '严重',
  emergency: '紧急',
};

export const AnomalyAlertBanner: React.FC<AnomalyAlertBannerProps> = ({ alerts, processStageCode }) => {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  const summary = useMemo(() => {
    const criticalCount = alerts.filter((item) => item.severity === 'critical' || item.severity === 'emergency').length;
    return {
      total: alerts.length,
      criticalCount,
    };
  }, [alerts]);

  if (!alerts.length) {
    return null;
  }

  return (
    <div className="space-y-2 rounded border border-amber-500/20 bg-amber-500/5 p-2">
      <div
        className="flex items-center justify-between cursor-pointer hover:bg-slate-700/30 active:bg-slate-700/50 rounded-md p-2 transition-colors select-none"
        onClick={() => setExpanded((value) => !value)}
      >
        <div className="flex items-center gap-2 text-xs">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
          <span className="text-slate-400">{summary.total}件异常待处理</span>
          {summary.criticalCount > 0 && (
            <span className="text-red-400">({summary.criticalCount}严重)</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">{expanded ? '收起' : '展开'}</span>
          {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </div>
      </div>

      <div className={`transition-all duration-300 ${expanded ? 'max-h-[240px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
        <div className="space-y-1 px-1 pb-1">
          {alerts.map((alert) => (
            <div key={alert.id} className="flex items-center justify-between gap-2 rounded px-2 py-1 text-xs hover:bg-slate-800/40">
              <div className="min-w-0 flex-1">
                <div className="truncate text-slate-300">{alert.title}</div>
                <div className="text-[11px] text-slate-500">{new Date(alert.openedAt).toLocaleString()}</div>
              </div>
              <span className={severityClassMap[alert.severity] ?? 'text-slate-300'}>
                {severityLabelMap[alert.severity] ?? alert.severity}
              </span>
              <button
                type="button"
                className="text-cyan-400 text-[11px] hover:text-cyan-300"
                onClick={(event) => {
                  event.stopPropagation();
                  const query = processStageCode ? `?process_stage_code=${encodeURIComponent(processStageCode)}` : '';
                  navigate(`/anomalies${query}`);
                }}
              >
                处理
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
