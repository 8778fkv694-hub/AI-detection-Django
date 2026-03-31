import React, { useState } from 'react';
import type { FQCRecord } from '@/lib/fqcApi';

interface FQCResultCardProps {
  record: FQCRecord;
}

const qualityColor = (q: string) => {
  if (q === '合格') return 'text-green-400';
  if (q === '不合格') return 'text-red-400';
  return 'text-amber-400';
};

const qualityBg = (q: string) => {
  if (q === '合格') return 'bg-green-500/10 border-green-500/30';
  if (q === '不合格') return 'bg-red-500/10 border-red-500/30';
  return 'bg-amber-500/10 border-amber-500/30';
};

export const FQCResultCard: React.FC<FQCResultCardProps> = ({ record }) => {
  // Auto-expand when validation failed or result is 不合格
  const [expanded, setExpanded] = useState(
    record.validation_passed === false || record.overall_result === '不合格'
  );

  const validationSummary = record.validation_passed !== null && record.validation_details?.length
    ? `${record.validation_details.filter(d => d.passed).length}/${record.validation_details.length} 通过`
    : null;

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${qualityBg(record.overall_result)}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            FQC
          </span>
          <span className={`text-sm font-semibold ${qualityColor(record.overall_result)}`}>
            {record.overall_result}
          </span>
          {validationSummary && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
              record.validation_passed ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`}>
              {validationSummary}
            </span>
          )}
        </div>
        <span className="text-xs text-slate-500">
          {record.created_at ? new Date(record.created_at).toLocaleString('zh-CN') : ''}
        </span>
      </div>

      {/* Summary line */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
        <span>工装: <span className="text-slate-200">{record.fixture_qr}</span></span>
        <span>配方: <span className="text-slate-200">{record.product_recipe_name || '未知'}</span></span>
        <span>触发工序: <span className="text-slate-200">{record.fqc_stage_name || record.fqc_stage_code}</span></span>
      </div>

      {/* Result reason */}
      {record.result_reason && (
        <p className="text-xs text-slate-300">{record.result_reason}</p>
      )}

      {/* Stage summary table */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
      >
        {expanded ? '收起详情' : `展开详情 (${record.stage_summary.length} 个工序)`}
      </button>

      {expanded && (
        <div className="space-y-2">
          {/* Stage results */}
          <div className="text-xs">
            <div className="font-semibold text-slate-300 mb-1">各工序检验结果</div>
            <div className="space-y-1">
              {record.stage_summary.map((stage, idx) => (
                <div key={idx} className="flex items-center gap-2 px-2 py-1 rounded bg-slate-800/50">
                  <span className="text-slate-500 w-5">{idx + 1}.</span>
                  <span className="text-slate-200 min-w-[80px]">{stage.stageName || stage.stageCode}</span>
                  <span className={`font-medium ${qualityColor(stage.quality)}`}>{stage.quality}</span>
                  {stage.score > 0 && <span className="text-slate-500">{stage.score}分</span>}
                  {stage.businessCode && <span className="text-slate-500 truncate max-w-[120px]">{stage.businessCode}</span>}
                  <span className="text-slate-600 ml-auto">
                    {stage.timestamp ? new Date(stage.timestamp).toLocaleTimeString('zh-CN') : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Trace flow */}
          {record.trace_flow.length > 0 && (
            <div className="text-xs">
              <div className="font-semibold text-slate-300 mb-1">流转记录</div>
              <div className="flex flex-wrap gap-1">
                {record.trace_flow.map((flow, idx) => (
                  <React.Fragment key={idx}>
                    {idx > 0 && <span className="text-slate-600">→</span>}
                    <span className={`px-1.5 py-0.5 rounded ${qualityColor(flow.quality)} bg-slate-800/50`}>
                      {flow.stageName || flow.stageCode || '?'}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}

          {/* Trace conclusion */}
          {record.trace_conclusion && (
            <div className="text-xs text-slate-400">
              追踪结论: <span className={qualityColor(record.trace_conclusion)}>{record.trace_conclusion}</span>
            </div>
          )}

          {/* Validation details */}
          {record.validation_passed !== null && record.validation_details && record.validation_details.length > 0 && (
            <div className="text-xs">
              <div className="font-semibold text-slate-300 mb-1 flex items-center gap-1">
                规则校验
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${record.validation_passed ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                  {record.validation_passed ? '通过' : '未通过'}
                </span>
              </div>
              <div className="space-y-1">
                {record.validation_details.map((detail, idx) => (
                  <div key={idx} className={`px-2 py-1 rounded ${detail.passed ? 'bg-green-900/20 border border-green-500/20' : 'bg-red-900/20 border border-red-500/20'}`}>
                    <div className="flex items-center gap-1">
                      <span className={detail.passed ? 'text-green-400' : 'text-red-400'}>{detail.passed ? '✓' : '✗'}</span>
                      <span className="text-slate-200">{detail.ruleName}</span>
                    </div>
                    <div className="text-slate-500 ml-4">{detail.message}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
