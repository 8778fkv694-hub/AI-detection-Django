/**
 * MiniWorkflowOverlay - 检测页面可选呼出的迷你工作流状态浮层
 *
 * 在实时检测视图（含全屏视频）中以紧凑横条形式展示当前工作流阶段。
 * 默认折叠为一个小按钮，点击展开后显示简易流程条 + 当前步骤高亮。
 * 不遮挡视频主画面。
 *
 * portalToVideoContainer 开关：若启用，浮层会被 Portal 渲染到 #video-container 内，
 * 保证在原生 Fullscreen API 触发后仍处于全屏元素子树中可见（OCR/PPE 页面需要）；
 * 未找到容器时自动回退到当前位置渲染（Live 页面 CSS 全屏保持原样）。
 */

import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { GitBranch, X, ChevronRight, Play, Shield, Cpu, AlertTriangle, CheckCircle } from 'lucide-react';

export type WorkflowPhase =
  | 'idle'       // 待机
  | 'triggered'  // 已触发
  | 'sensor'     // 外设校验中
  | 'capturing'  // 图像采集中
  | 'detecting'  // AI 检测中
  | 'pass'       // 合格
  | 'fail';      // 存疑/不合格

interface MiniWorkflowOverlayProps {
  /** 当前工作流阶段 */
  phase?: WorkflowPhase;
  /** 自定义位置 class（默认右下角） */
  positionClass?: string;
  /** 将浮层 Portal 渲染到 #video-container 内，使原生全屏下仍可见 */
  portalToVideoContainer?: boolean;
}

const NODES: { id: WorkflowPhase; label: string; icon: typeof Play; color: string; activeColor: string }[] = [
  { id: 'idle',      label: '待机',   icon: Play,          color: '#64748b', activeColor: '#94a3b8' },
  { id: 'triggered', label: '触发',   icon: Play,          color: '#06b6d4', activeColor: '#22d3ee' },
  { id: 'sensor',    label: '校验',   icon: Shield,        color: '#3b82f6', activeColor: '#60a5fa' },
  { id: 'capturing', label: '采集',   icon: Cpu,           color: '#8b5cf6', activeColor: '#a78bfa' },
  { id: 'detecting', label: '检测',   icon: Cpu,           color: '#f59e0b', activeColor: '#fbbf24' },
  { id: 'pass',      label: '合格',   icon: CheckCircle,   color: '#10b981', activeColor: '#34d399' },
  { id: 'fail',      label: '存疑',   icon: AlertTriangle, color: '#ef4444', activeColor: '#f87171' },
];

export function MiniWorkflowOverlay({
  phase = 'idle',
  positionClass = 'fixed bottom-4 right-4 z-[60]',
  portalToVideoContainer = false,
}: MiniWorkflowOverlayProps) {
  const [expanded, setExpanded] = useState(false);
  // Portal 渲染目标：检测到 #video-container 挂载后立即捕获
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!portalToVideoContainer) {
      setPortalTarget(null);
      return;
    }
    let cancelled = false;
    let retryTimer = 0;
    const tryFind = () => {
      const el = document.getElementById('video-container');
      if (cancelled) return;
      if (el) {
        setPortalTarget(el);
        return;
      }
      retryTimer = window.setTimeout(tryFind, 100);
    };
    tryFind();
    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
    };
  }, [portalToVideoContainer]);

  const toggle = useCallback(() => setExpanded(v => !v), []);

  const currentIdx = NODES.findIndex(n => n.id === phase);

  // ── 渲染内容 ──
  const content = (() => {
    if (!expanded) {
      // ── 折叠态：一个小圆按钮 ──
      const currentNode = NODES[currentIdx] || NODES[0];
      return (
        <button
          onClick={toggle}
          className={`${positionClass} group flex items-center gap-1.5 px-3 py-2 rounded-full border border-border/50 bg-slate-900/90 backdrop-blur-md shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105`}
          style={{ borderColor: `${currentNode.activeColor}40` }}
          title="展开工作流状态"
        >
          <GitBranch className="h-3.5 w-3.5" style={{ color: currentNode.activeColor }} />
          <span className="text-[10px] font-semibold" style={{ color: currentNode.activeColor }}>
            {currentNode.label}
          </span>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: currentNode.activeColor }} />
        </button>
      );
    }

    // ── 展开态：紧凑横向流程条 ──
    return (
      <div className={`${positionClass} flex flex-col items-end gap-1`}>
        <div className="relative flex items-center gap-0 rounded-xl border border-border/40 bg-slate-950/95 backdrop-blur-lg shadow-2xl px-3 py-2.5 overflow-hidden"
          style={{ maxWidth: '520px' }}
        >
          {/* 关闭按钮 */}
          <button onClick={toggle} className="absolute top-1 right-1 text-slate-500 hover:text-slate-300 p-0.5 z-10">
            <X className="h-3 w-3" />
          </button>

          {/* 节点序列 */}
          {NODES.map((node, i) => {
            const isActive = i === currentIdx;
            const isPast = i < currentIdx;
            const isFuture = i > currentIdx;
            const Icon = node.icon;

            return (
              <div key={node.id} className="flex items-center">
                {/* 节点圆点 + 标签 */}
                <div className={`flex flex-col items-center transition-all duration-300 ${
                  isActive ? 'scale-110' : isPast ? 'opacity-70' : 'opacity-30'
                }`}>
                  <div
                    className={`relative flex items-center justify-center rounded-full transition-all duration-300 ${
                      isActive
                        ? 'w-7 h-7'
                        : 'w-5 h-5'
                    }`}
                    style={{
                      backgroundColor: isActive ? `${node.activeColor}25` : isPast ? `${node.color}15` : '#1e293b',
                      borderColor: isActive ? node.activeColor : isPast ? node.color : '#334155',
                      borderWidth: '1.5px',
                      boxShadow: isActive ? `0 0 0 2px ${node.activeColor}50` : undefined,
                    }}
                  >
                    <Icon
                      className={`${isActive ? 'h-3.5 w-3.5' : 'h-2.5 w-2.5'}`}
                      style={{ color: isActive ? node.activeColor : isPast ? node.color : '#475569' }}
                    />
                    {/* 当前步骤脉冲动画 */}
                    {isActive && (
                      <span
                        className="absolute inset-0 rounded-full animate-ping opacity-30"
                        style={{ backgroundColor: node.activeColor }}
                      />
                    )}
                  </div>
                  <span
                    className={`text-[8px] font-semibold mt-0.5 whitespace-nowrap ${isActive ? '' : 'opacity-60'}`}
                    style={{ color: isActive ? node.activeColor : isPast ? node.color : '#64748b' }}
                  >
                    {node.label}
                  </span>
                </div>

                {/* 连线箭头 */}
                {i < NODES.length - 1 && (
                  <div className="flex items-center mx-0.5 mb-3">
                    {/* 连线段 */}
                    <div
                      className="h-[1.5px] transition-all duration-300"
                      style={{
                        width: '16px',
                        background: isPast
                          ? `linear-gradient(to right, ${node.color}, ${NODES[i + 1].color})`
                          : isActive
                            ? `linear-gradient(to right, ${node.activeColor}80, ${node.activeColor}20)`
                            : '#1e293b',
                      }}
                    />
                    {/* 小箭头 */}
                    <ChevronRight
                      className="h-2.5 w-2.5 -ml-1"
                      style={{ color: isPast ? NODES[i + 1].color : isFuture ? '#334155' : `${node.activeColor}50` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  })();

  // 启用 Portal 但容器尚未就绪时，渲染占位 null（容器找到后 State 触发重渲染）
  if (portalToVideoContainer) {
    return portalTarget ? createPortal(content, portalTarget) : null;
  }
  return content;
}
