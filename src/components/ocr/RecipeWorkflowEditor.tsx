import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play, Shield, Cpu, Lightbulb,
  Zap, Info, Trash2, Sliders, Settings,
  GitBranch, AlertTriangle, RotateCw, MapPin
} from 'lucide-react';
import { useAppStore } from '@/state/appStore';
import type { RecipeFormData } from '@/screens/TemplatesScreen';
import type { ModelConfig } from '@/lib/api';
import type { FixtureTemplate } from '@/lib/fixtureTemplateApi';
import { DEVICE_TYPE_META, type DeviceType } from '@/types/device';

interface RecipeWorkflowEditorProps {
  form: RecipeFormData;
  onChange: (form: RecipeFormData) => void;
  availableModels: ModelConfig[];
  fixtureTemplates: FixtureTemplate[];
}

type NodeType = 'trigger' | 'sensor' | 'detection' | 'gateway' | 'pass-action' | 'fail-action';

export function RecipeWorkflowEditor({
  form,
  onChange,
  availableModels,
  fixtureTemplates: _fixtureTemplates,
}: RecipeWorkflowEditorProps) {
  void _fixtureTemplates;
  const [activeNode, setActiveNode] = useState<NodeType>('trigger');
  const [coords, setCoords] = useState<Record<string, { x: number; y: number }>>({});
  const canvasRef = useRef<HTMLDivElement>(null);
  // SVG 与 handles 同父容器(svgCanvasRef),用作坐标测量的参考原点,
  // 避免 canvasRef(grid 外层带 p-6 padding)使 SVG 路径整体偏移 24px
  const svgCanvasRef = useRef<HTMLDivElement>(null);
  const { standards } = useAppStore();

  const set = (field: keyof RecipeFormData, value: any) => {
    onChange({ ...form, [field]: value });
  };

  // 动态测量端口坐标(参考系:svgCanvasRef,即 SVG absolute inset-0 同一父容器)
  const updateCoords = useCallback(() => {
    const host = svgCanvasRef.current || canvasRef.current;
    if (!host) return;
    const hostRect = host.getBoundingClientRect();
    const newCoords: Record<string, { x: number; y: number }> = {};

    const handles = host.querySelectorAll('[data-handle]');
    handles.forEach((el) => {
      const name = el.getAttribute('data-handle');
      if (name) {
        const rect = el.getBoundingClientRect();
        newCoords[name] = {
          x: rect.left + rect.width / 2 - hostRect.left,
          y: rect.top + rect.height / 2 - hostRect.top,
        };
      }
    });
    setCoords(newCoords);
  }, []);

  useEffect(() => {
    updateCoords();
    window.addEventListener('resize', updateCoords);
    const timer = setTimeout(updateCoords, 300);

    // 侧边栏收纳/详情面板折叠会引发容器尺寸变化但不触发 window resize,
    // 用 ResizeObserver 监听 SVG 容器与外层 grid 的尺寸变化以重新测绘坐标。
    const roTargets = [svgCanvasRef.current, canvasRef.current].filter(Boolean) as HTMLElement[];
    let ro: ResizeObserver | null = null;
    if (roTargets.length && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => updateCoords());
      roTargets.forEach((t) => ro!.observe(t));
    }

    return () => {
      window.removeEventListener('resize', updateCoords);
      clearTimeout(timer);
      ro?.disconnect();
    };
  }, [updateCoords, form.fixtureEnabled, form.requiredDeviceTypes, activeNode]);

  // 计算平滑贝塞尔曲线路径 (优化弧度与控制点偏移)
  const drawBezier = (startKey: string, endKey: string) => {
    const start = coords[startKey];
    const end = coords[endKey];
    if (!start || !end) return '';

    const dx = Math.abs(end.x - start.x);
    const dy = end.y - start.y;
    // 水平距离大时用大偏移，垂直差大时增加弯曲
    const hOffset = Math.max(60, dx * 0.45);
    const vBias = dy * 0.15;

    return `M ${start.x} ${start.y} C ${start.x + hOffset} ${start.y + vBias}, ${end.x - hOffset} ${end.y - vBias}, ${end.x} ${end.y}`;
  };

  // 计算路径的中点坐标（用于放置标签）
  const getMidpoint = (startKey: string, endKey: string) => {
    const start = coords[startKey];
    const end = coords[endKey];
    if (!start || !end) return null;
    return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  };

  // YOLO 目标管理辅助
  const toggleTarget = (target: string) => {
    if (form.selectedTargets.includes(target)) {
      set('selectedTargets', form.selectedTargets.filter((t: string) => t !== target));
      const nextConf = { ...form.targetConfidences };
      delete nextConf[target];
      set('targetConfidences', nextConf);
      set('nonGridTargets', (form.nonGridTargets || []).filter((t: string) => t !== target));
    } else {
      set('selectedTargets', [...form.selectedTargets, target]);
    }
  };

  const toggleMini = (target: string) => {
    const list = form.nonGridTargets || [];
    if (list.includes(target)) {
      set('nonGridTargets', list.filter((t: string) => t !== target));
    } else {
      set('nonGridTargets', [...list, target]);
    }
  };

  const activeModel = availableModels.find(m => m.id === form.currentModelId);
  const activeStandard = standards.find(s => s.id === form.selectedStandardId);

  // 设备响应映射管理
  const getDeviceAction = (deviceType: DeviceType, status: 'qualified' | 'unqualified' | 'idle') => {
    return form.deviceActionMap?.[deviceType]?.[status] || '';
  };

  const setDeviceAction = (deviceType: DeviceType, status: 'qualified' | 'unqualified' | 'idle', val: string) => {
    const currentMap = form.deviceActionMap || {};
    const deviceActions = currentMap[deviceType] || { qualified: '', unqualified: '', idle: '' };
    const nextMap = {
      ...currentMap,
      [deviceType]: {
        ...deviceActions,
        [status]: val
      }
    };
    set('deviceActionMap', nextMap);
  };

  const removeDeviceAction = (deviceType: DeviceType) => {
    const currentMap = { ...form.deviceActionMap };
    delete currentMap[deviceType];
    set('deviceActionMap', currentMap);
  };

  const addDeviceAction = (deviceType: DeviceType) => {
    const currentMap = form.deviceActionMap || {};
    const nextMap = {
      ...currentMap,
      [deviceType]: { qualified: '', unqualified: '', idle: '' }
    };
    set('deviceActionMap', nextMap);
  };

  const isSensorActive = form.requiredDeviceTypes && form.requiredDeviceTypes.length > 0;

  return (
    <div 
      ref={canvasRef} 
      className="relative grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6 rounded-xl border border-border/40 bg-slate-950/70 p-6 min-h-[650px] overflow-hidden animate-in fade-in duration-300"
      style={{
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.02) 1.5px, transparent 1.5px)',
        backgroundSize: '16px 16px',
      }}
    >
      {/* ─── 左侧：SVG 画布及分支工作流节点 ─── */}
      <div ref={svgCanvasRef} className="relative flex flex-col justify-center py-4 space-y-12">
        {/* SVG 连线背景图层 - 高级视觉效果 */}
        <svg className="absolute inset-0 pointer-events-none w-full h-full z-0">
          <defs>
            {/* 渐变：蓝→青主通道 */}
            <linearGradient id="edgeCyan" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.9" />
              <stop offset="50%" stopColor="#06b6d4" stopOpacity="1" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.9" />
            </linearGradient>
            {/* 渐变：合格通道 */}
            <linearGradient id="edgePass" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#34d399" stopOpacity="1" />
            </linearGradient>
            {/* 渐变：存疑通道 */}
            <linearGradient id="edgeFail" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#f87171" stopOpacity="1" />
            </linearGradient>
            {/* 外层辉光 */}
            <filter id="glowSoft" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {/* 流动粒子动画 */}
            <circle id="particle" r="3" fill="#67e8f9" opacity="0.9">
              <animate attributeName="opacity" values="0.9;0.4;0.9" dur="1.5s" repeatCount="indefinite" />
            </circle>
          </defs>

          {/* ── 连线 1: 触发器 → 外设校验分支 ── */}
          {(() => {
            const d = drawBezier('trigger-out', 'sensor-in');
            const mid = getMidpoint('trigger-out', 'sensor-in');
            return d ? (
              <g>
                {/* 底层光晕 */}
                <path d={d} fill="none" stroke={isSensorActive ? '#0ea5e9' : '#334155'} strokeWidth={isSensorActive ? 6 : 2} opacity={isSensorActive ? 0.15 : 0.1} />
                {/* 主线 */}
                <path d={d} fill="none" stroke={isSensorActive ? 'url(#edgeCyan)' : '#475569'}
                  strokeWidth={isSensorActive ? 2 : 1}
                  strokeDasharray={isSensorActive ? 'none' : '6,4'}
                  strokeLinecap="round" filter={isSensorActive ? 'url(#glowSoft)' : undefined} />
                {/* 流动粒子 */}
                {isSensorActive && <circle r="2.5" fill="#67e8f9" opacity="0.85">
                  <animateMotion dur="2.5s" repeatCount="indefinite" path={d} />
                </circle>}
                {/* 分支标签 */}
                {mid && <g transform={`translate(${mid.x},${mid.y - 8})`}>
                  <rect x="-18" y="-8" width="36" height="14" rx="4" fill="#0f172a" fillOpacity="0.85" stroke={isSensorActive ? '#0ea5e9' : '#475569'} strokeWidth="0.5" />
                  <text textAnchor="middle" y="3" fill={isSensorActive ? '#67e8f9' : '#64748b'} fontSize="7" fontFamily="monospace">{isSensorActive ? '已启用' : '旁路'}</text>
                </g>}
              </g>
            ) : null;
          })()}

          {/* ── 连线 2: 触发器 → 图像检测流 ── */}
          {(() => {
            const d = drawBezier('trigger-out', 'detect-in');
            const mid = getMidpoint('trigger-out', 'detect-in');
            return d ? (
              <g>
                <path d={d} fill="none" stroke="#0ea5e9" strokeWidth="8" opacity="0.1" />
                <path d={d} fill="none" stroke="url(#edgeCyan)" strokeWidth="2.5" strokeLinecap="round" filter="url(#glowSoft)" />
                <circle r="3" fill="#22d3ee" opacity="0.9">
                  <animateMotion dur="2s" repeatCount="indefinite" path={d} />
                </circle>
                {mid && <g transform={`translate(${mid.x},${mid.y - 8})`}>
                  <rect x="-14" y="-8" width="28" height="14" rx="4" fill="#0f172a" fillOpacity="0.85" stroke="#0ea5e9" strokeWidth="0.5" />
                  <text textAnchor="middle" y="3" fill="#67e8f9" fontSize="7" fontFamily="monospace">主管</text>
                </g>}
              </g>
            ) : null;
          })()}

          {/* ── 连线 3: 外设校验 → 判定网关 ── */}
          {(() => {
            const d = drawBezier('sensor-out', 'gateway-in-top');
            return d ? (
              <g>
                <path d={d} fill="none" stroke={isSensorActive ? '#0ea5e9' : '#334155'} strokeWidth={isSensorActive ? 6 : 2} opacity={isSensorActive ? 0.12 : 0.08} />
                <path d={d} fill="none" stroke={isSensorActive ? 'url(#edgeCyan)' : '#475569'}
                  strokeWidth={isSensorActive ? 2 : 1}
                  strokeDasharray={isSensorActive ? 'none' : '6,4'}
                  strokeLinecap="round" filter={isSensorActive ? 'url(#glowSoft)' : undefined} />
                {isSensorActive && <circle r="2" fill="#67e8f9" opacity="0.7">
                  <animateMotion dur="2.2s" repeatCount="indefinite" path={d} />
                </circle>}
              </g>
            ) : null;
          })()}

          {/* ── 连线 4: 图像检测流 → 判定网关 ── */}
          {(() => {
            const d = drawBezier('detect-out', 'gateway-in-bottom');
            return d ? (
              <g>
                <path d={d} fill="none" stroke="#0ea5e9" strokeWidth="8" opacity="0.1" />
                <path d={d} fill="none" stroke="url(#edgeCyan)" strokeWidth="2.5" strokeLinecap="round" filter="url(#glowSoft)" />
                <circle r="3" fill="#22d3ee" opacity="0.9">
                  <animateMotion dur="1.8s" repeatCount="indefinite" path={d} />
                </circle>
              </g>
            ) : null;
          })()}

          {/* ── 连线 5: 判定网关 → 合格出口 ── */}
          {(() => {
            const d = drawBezier('gateway-pass', 'pass-action-in');
            const mid = getMidpoint('gateway-pass', 'pass-action-in');
            return d ? (
              <g>
                <path d={d} fill="none" stroke="#10b981" strokeWidth="8" opacity="0.1" />
                <path d={d} fill="none" stroke="url(#edgePass)" strokeWidth="2.5" strokeLinecap="round" filter="url(#glowSoft)" />
                <circle r="3" fill="#34d399" opacity="0.9">
                  <animateMotion dur="2s" repeatCount="indefinite" path={d} />
                </circle>
                {mid && <g transform={`translate(${mid.x},${mid.y - 9})`}>
                  <rect x="-12" y="-8" width="24" height="14" rx="4" fill="#022c22" fillOpacity="0.9" stroke="#10b981" strokeWidth="0.5" />
                  <text textAnchor="middle" y="3" fill="#6ee7b7" fontSize="7" fontFamily="monospace">PASS</text>
                </g>}
              </g>
            ) : null;
          })()}

          {/* ── 连线 6: 判定网关 → 存疑出口 ── */}
          {(() => {
            const d = drawBezier('gateway-fail', 'fail-action-in');
            const mid = getMidpoint('gateway-fail', 'fail-action-in');
            return d ? (
              <g>
                <path d={d} fill="none" stroke="#ef4444" strokeWidth="8" opacity="0.1" />
                <path d={d} fill="none" stroke="url(#edgeFail)" strokeWidth="2.5" strokeLinecap="round" filter="url(#glowSoft)" />
                <circle r="3" fill="#f87171" opacity="0.9">
                  <animateMotion dur="2.2s" repeatCount="indefinite" path={d} />
                </circle>
                {mid && <g transform={`translate(${mid.x},${mid.y - 9})`}>
                  <rect x="-12" y="-8" width="24" height="14" rx="4" fill="#450a0a" fillOpacity="0.9" stroke="#ef4444" strokeWidth="0.5" />
                  <text textAnchor="middle" y="3" fill="#fca5a5" fontSize="7" fontFamily="monospace">FAIL</text>
                </g>}
              </g>
            ) : null;
          })()}
        </svg>

        {/* 4列网络节点布局 */}
        <div className="grid grid-cols-4 gap-6 items-center relative z-10">
          
          {/* Column 1: 触发配置 */}
          <div className="flex flex-col space-y-6">
            <div 
              onClick={() => setActiveNode('trigger')}
              className={`relative flex flex-col rounded-xl border p-4 cursor-pointer transition-all duration-300 ${
                activeNode === 'trigger' 
                  ? 'border-cyan-500/80 bg-slate-900/90 shadow-[0_0_15px_rgba(6,182,212,0.15)] scale-[1.02]' 
                  : 'border-slate-800/60 bg-slate-900/60 hover:border-slate-700/80'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-400">
                  <Play className="h-3.5 w-3.5 fill-cyan-400/20" />
                  触发控制
                </div>
              </div>
              <div className="text-[11px] text-slate-400 space-y-1">
                <p>触发源: {form.autoCapture ? '自动循环' : '外部脉冲'}</p>
                <p>延时: {form.captureDelaySeconds}s</p>
                <p className={`flex items-center gap-1 ${form.turntableEnabled ? 'text-amber-400' : 'text-slate-500'}`}>
                  <RotateCw className="h-3 w-3" />
                  移动视角: {form.turntableEnabled ? '联控 (就位等待)' : '旁路 (无)'}
                </p>
              </div>

              {/* Output Handle */}
              <div 
                data-handle="trigger-out" 
                className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-cyan-500 bg-slate-950 flex items-center justify-center cursor-crosshair z-20 hover:scale-125 transition-transform"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              </div>
            </div>
          </div>

          {/* Column 2: 并行流 (Top: 外设前置校验, Bottom: 图像检测管线) */}
          <div className="flex flex-col space-y-8">
            
            {/* Top Card: 外设校验 */}
            <div 
              onClick={() => setActiveNode('sensor')}
              className={`relative flex flex-col rounded-xl border p-4 cursor-pointer transition-all duration-300 ${
                !isSensorActive ? 'opacity-40 filter grayscale border-dashed border-slate-800' : ''
              } ${
                activeNode === 'sensor' 
                  ? 'border-cyan-500/80 bg-slate-900/90 shadow-[0_0_15px_rgba(6,182,212,0.15)] scale-[1.02]' 
                  : 'border-slate-800/60 bg-slate-900/60 hover:border-slate-700/80'
              }`}
            >
              {/* Input Handle */}
              <div 
                data-handle="sensor-in" 
                className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-slate-750 bg-slate-950 flex items-center justify-center cursor-crosshair z-20"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-slate-700" />
              </div>

              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-400">
                  <Shield className="h-3.5 w-3.5" />
                  外置硬件校验
                </div>
              </div>
              <div className="text-[11px] text-slate-400 space-y-1">
                <p>状态: {isSensorActive ? `已接入 ${form.requiredDeviceTypes.length} 传感器` : '无外设限制'}</p>
                {isSensorActive && <p className="truncate text-[10px] text-slate-500">
                  {form.requiredDeviceTypes.map((t: string) => DEVICE_TYPE_META[t as DeviceType]?.label || t).join(', ')}
                </p>}
              </div>

              {/* Output Handle */}
              <div 
                data-handle="sensor-out" 
                className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-blue-500 bg-slate-950 flex items-center justify-center cursor-crosshair z-20 hover:scale-125 transition-transform"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              </div>
            </div>

            {/* Bottom Card: 图像检测管线 */}
            <div 
              onClick={() => setActiveNode('detection')}
              className={`relative flex flex-col rounded-xl border p-4 cursor-pointer transition-all duration-300 ${
                activeNode === 'detection' 
                  ? 'border-cyan-500/80 bg-slate-900/90 shadow-[0_0_15px_rgba(6,182,212,0.15)] scale-[1.02]' 
                  : 'border-slate-800/60 bg-slate-900/60 hover:border-slate-700/80'
              }`}
            >
              {/* Input Handle */}
              <div 
                data-handle="detect-in" 
                className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-cyan-500 bg-slate-950 flex items-center justify-center cursor-crosshair z-20"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              </div>

              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-400">
                  <Cpu className="h-3.5 w-3.5" />
                  图像AI检测流
                </div>
              </div>
              <div className="text-[11px] text-slate-400 space-y-1">
                <p className="truncate">YOLO: {activeModel?.name || '未选'}</p>
                <p className="truncate">标准: {activeStandard?.name || '无参考标准'}</p>
              </div>

              {/* Output Handle */}
              <div 
                data-handle="detect-out" 
                className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-cyan-500 bg-slate-950 flex items-center justify-center cursor-crosshair z-20 hover:scale-125 transition-transform"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              </div>
            </div>

          </div>

          {/* Column 3: 判定网关 (Dify Decision Gateway) */}
          <div className="flex flex-col justify-center">
            <div 
              onClick={() => setActiveNode('gateway')}
              className={`relative flex flex-col rounded-xl border p-4 cursor-pointer transition-all duration-300 ${
                activeNode === 'gateway' 
                  ? 'border-indigo-500/80 bg-slate-900/90 shadow-[0_0_15px_rgba(99,102,241,0.15)] scale-[1.02]' 
                  : 'border-slate-800/60 bg-slate-900/60 hover:border-slate-700/80'
              }`}
            >
              {/* Input Handle (Top from sensor) */}
              <div 
                data-handle="gateway-in-top" 
                className="absolute -left-2 top-1/3 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-slate-700 bg-slate-950 flex items-center justify-center cursor-crosshair z-20"
              >
                <span className="w-1 h-1 bg-slate-600 rounded-full" />
              </div>
              
              {/* Input Handle (Bottom from detection) */}
              <div 
                data-handle="gateway-in-bottom" 
                className="absolute -left-2 top-2/3 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-cyan-500 bg-slate-950 flex items-center justify-center cursor-crosshair z-20"
              >
                <span className="w-1 h-1 bg-cyan-400 rounded-full" />
              </div>

              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-400">
                  <GitBranch className="h-3.5 w-3.5" />
                  条件判定网关
                </div>
              </div>
              <div className="text-[10px] text-slate-400 space-y-1">
                <p>YOLO规则: <span className="text-slate-300 font-semibold">{form.yoloDetectionMode === 'and' ? 'ALL' : 'ANY'}</span></p>
                <p>文字过滤: <span className="text-slate-300">{form.enableKeywordAnalysis ? 'ON' : 'OFF'}</span></p>
                <p>条码过滤: <span className="text-slate-300">{form.enableBarcodeDetection ? 'ON' : 'OFF'}</span></p>
              </div>

              {/* Output Handles */}
              {/* Pass Handle (Qualified - green) */}
              <div 
                data-handle="gateway-pass" 
                className="absolute -right-2 top-1/3 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-emerald-500 bg-slate-950 flex items-center justify-center cursor-crosshair z-20 hover:scale-125 transition-transform"
                title="合格出口"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              </div>
              {/* Fail Handle (Unqualified - red) */}
              <div 
                data-handle="gateway-fail" 
                className="absolute -right-2 top-2/3 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-rose-500 bg-slate-950 flex items-center justify-center cursor-crosshair z-20 hover:scale-125 transition-transform"
                title="存疑出口"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
              </div>
            </div>
          </div>

          {/* Column 4: 输出分支 (Top: 合格响应, Bottom: 存疑响应) */}
          <div className="flex flex-col space-y-8">
            
            {/* Top Action: 合格输出 */}
            <div 
              onClick={() => setActiveNode('pass-action')}
              className={`relative flex flex-col rounded-xl border p-4 cursor-pointer transition-all duration-300 ${
                activeNode === 'pass-action' 
                  ? 'border-emerald-500/80 bg-slate-900/90 shadow-[0_0_15px_rgba(16,185,129,0.15)] scale-[1.02]' 
                  : 'border-slate-800/60 bg-slate-900/60 hover:border-slate-700/80'
              }`}
            >
              {/* Input Handle */}
              <div 
                data-handle="pass-action-in" 
                className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-emerald-500 bg-slate-950 flex items-center justify-center cursor-crosshair z-20"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              </div>

              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                  <Lightbulb className="h-3.5 w-3.5" />
                  合格响应控制
                </div>
              </div>
              <div className="text-[11px] text-slate-400 space-y-1">
                <p>响应设备: {Object.keys(form.deviceActionMap || {}).length} 处</p>
                <p className="truncate text-[10px] text-emerald-500 font-mono">
                  {Object.keys(form.deviceActionMap || {}).map(k => getDeviceAction(k as DeviceType, 'qualified') ? `${k}:OK` : '').filter(Boolean).join(', ') || '无输出'}
                </p>
              </div>
            </div>

            {/* Bottom Action: 存疑/停机输出 */}
            <div 
              onClick={() => setActiveNode('fail-action')}
              className={`relative flex flex-col rounded-xl border p-4 cursor-pointer transition-all duration-300 ${
                activeNode === 'fail-action' 
                  ? 'border-rose-500/80 bg-slate-900/90 shadow-[0_0_15px_rgba(244,63,94,0.15)] scale-[1.02]' 
                  : 'border-slate-800/60 bg-slate-900/60 hover:border-slate-700/80'
              }`}
            >
              {/* Input Handle */}
              <div 
                data-handle="fail-action-in" 
                className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-rose-500 bg-slate-950 flex items-center justify-center cursor-crosshair z-20"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
              </div>

              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  存疑停机响应
                </div>
              </div>
              <div className="text-[11px] text-slate-400 space-y-1">
                <p>停机警报: {Object.keys(form.deviceActionMap || {}).length} 处</p>
                <p className="truncate text-[10px] text-rose-500 font-mono">
                  {Object.keys(form.deviceActionMap || {}).map(k => getDeviceAction(k as DeviceType, 'unqualified') ? `${k}:ERR` : '').filter(Boolean).join(', ') || '无输出'}
                </p>
              </div>
            </div>

          </div>

        </div>
      </div>

      {/* ─── 右侧：抽屉面板配置区 (Details Slider Panel) ─── */}
      <div className="border border-border/30 bg-slate-900/90 rounded-lg p-5 flex flex-col space-y-4 overflow-y-auto max-h-[750px] shadow-2xl relative z-20">
        
        {/* Panel Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border/30">
          <div className="flex items-center gap-2">
            <Settings className="h-4.5 w-4.5 text-cyan-400" />
            <h4 className="text-sm font-semibold text-foreground">
              {activeNode === 'trigger' && '触发配置'}
              {activeNode === 'sensor' && '硬件外设前置校验'}
              {activeNode === 'detection' && '图像AI检测管线'}
              {activeNode === 'gateway' && '条件网关门槛配置'}
              {activeNode === 'pass-action' && '合格响应输出指令'}
              {activeNode === 'fail-action' && '存疑/停机输出指令'}
            </h4>
          </div>
          <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono uppercase">
            {activeNode}
          </span>
        </div>

        {/* Panel Body */}
        <div className="flex-1 space-y-4 text-sm text-slate-300">
          
          {/* 1. Trigger config */}
          {activeNode === 'trigger' && (
            <div className="space-y-4">
              <div className="rounded-lg bg-cyan-950/20 border border-cyan-500/20 p-3 flex gap-2">
                <Zap className="h-4 w-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-cyan-400/90">
                  配置质检管线的自动/手动触发逻辑。
                </p>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-border/10">
                <span className="text-xs text-muted-foreground">自动持续检测 (Loop)</span>
                <input 
                  type="checkbox" 
                  checked={form.autoCapture} 
                  onChange={e => set('autoCapture', e.target.checked)}
                  className="h-4 w-4 accent-cyan-500 cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">触发前延迟时间 (秒)</label>
                <input 
                  type="number" step="0.5" min="0"
                  value={form.captureDelaySeconds}
                  onChange={e => set('captureDelaySeconds', parseFloat(e.target.value) || 0)}
                  className="w-full rounded border border-border/50 bg-slate-800/80 px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">检测频率间隔 (秒)</label>
                <input 
                  type="number" step="0.05" min="0.05"
                  value={form.detectionInterval}
                  onChange={e => set('detectionInterval', parseFloat(e.target.value) || 0.1)}
                  className="w-full rounded border border-border/50 bg-slate-800/80 px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">条码/二维码识别冷却期 (秒)</label>
                <input
                  type="number" step="1" min="1"
                  value={form.qrDetectIntervalSeconds}
                  onChange={e => set('qrDetectIntervalSeconds', parseInt(e.target.value) || 3)}
                  className="w-full rounded border border-border/50 bg-slate-800/80 px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-cyan-500"
                />
              </div>

              {/* 移动视角 / 就位信号 (可选) */}
              <div className="border-t border-border/20 pt-3 space-y-3">
                <div className="flex items-center justify-between py-1">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                    <RotateCw className="h-3.5 w-3.5" />
                    移动视角多面采集联控 (可选)
                  </span>
                  <input
                    type="checkbox"
                    checked={form.turntableEnabled}
                    onChange={e => set('turntableEnabled', e.target.checked)}
                    className="h-4 w-4 accent-amber-500 cursor-pointer"
                  />
                </div>
                {!form.turntableEnabled ? (
                  <div className="rounded-lg bg-slate-950/40 border border-border/20 p-2.5">
                    <p className="text-[10px] text-slate-500">
                      已旁路。不反向下发启动移动指令、不布防就位看门狗；适用于无移动视角的产线，避免对串口控制器造成干扰。
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 pl-3 border-l border-amber-500/30">
                    <div className="rounded-lg bg-amber-950/20 border border-amber-500/20 p-2.5 flex gap-2">
                      <MapPin className="h-3.5 w-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                      <p className="text-[10px] text-amber-400/90 leading-relaxed">
                        触发采集时下发启动移动指令 → 移动视角到位 → 到位后串口回传就位信号 → 网页结束采集并启动评估。若 {form.turntableTimeoutSeconds}s 内未收到就位信号，自动降级评估防卡死。
                      </p>
                    </div>
                    <div>
                      <label className="block text-[10px] text-muted-foreground mb-1">启动移动视角指令 (反向写串口)</label>
                      <input
                        type="text"
                        value={form.turntableStartCommand}
                        onChange={e => set('turntableStartCommand', e.target.value)}
                        placeholder="如: START_ROTATE\n"
                        className="w-full rounded border border-border/50 bg-slate-800/80 px-2.5 py-1.5 text-xs font-mono text-foreground outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-muted-foreground mb-1">就位完成信号 (串口上行字符串)</label>
                      <input
                        type="text"
                        value={form.turntableStopSignal}
                        onChange={e => set('turntableStopSignal', e.target.value)}
                        placeholder="如: STOP_CAPTURE"
                        className="w-full rounded border border-border/50 bg-slate-800/80 px-2.5 py-1.5 text-xs font-mono text-foreground outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-muted-foreground mb-1">
                        就位等待超时 ({form.turntableTimeoutSeconds}s)
                      </label>
                      <input
                        type="number" step="1" min="3" max="300"
                        value={form.turntableTimeoutSeconds}
                        onChange={e => set('turntableTimeoutSeconds', Math.max(3, parseInt(e.target.value) || 30))}
                        className="w-full rounded border border-border/50 bg-slate-800/80 px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2. Sensor Verify Node */}
          {activeNode === 'sensor' && (
            <div className="space-y-4">
              <div className="rounded-lg bg-blue-950/20 border border-blue-500/20 p-3">
                <p className="text-xs text-blue-400">
                  勾选此工序必须的物理硬件外设。当物料到来触发时，网页会校验指定的串口硬件是否全部在线就绪，否则给出未就绪警告。
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">必需设备校验限制</label>
                <div className="flex flex-col gap-2 border border-border/30 rounded p-3 bg-slate-950/40">
                  {(Object.keys(DEVICE_TYPE_META) as DeviceType[]).map(t => {
                    const isChecked = (form.requiredDeviceTypes || []).includes(t);
                    return (
                      <label key={t} className="flex items-center justify-between text-xs text-foreground cursor-pointer select-none p-1.5 hover:bg-slate-900 rounded">
                        <span className="flex items-center gap-2">
                          <input 
                            type="checkbox" 
                            checked={isChecked}
                            onChange={e => {
                              const current = form.requiredDeviceTypes || [];
                              set('requiredDeviceTypes', e.target.checked ? [...current, t] : current.filter((x: string) => x !== t));
                            }}
                            className="h-3.5 w-3.5 accent-cyan-500"
                          />
                          {DEVICE_TYPE_META[t].label}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono capitalize">{t}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* 3. Detection Pipe (YOLO + OCR/LLM) */}
          {activeNode === 'detection' && (
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">1. 目标检测 YOLO 模型</label>
                <select
                  value={form.currentModelId ?? ''}
                  onChange={e => set('currentModelId', e.target.value || null)}
                  className="w-full rounded border border-border/50 bg-slate-800/80 px-2 py-1.5 text-xs text-foreground outline-none focus:border-cyan-500"
                >
                  <option value="">-- 未部署 YOLO 模型 --</option>
                  {availableModels.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">YOLO 置信度过滤 ({(form.detectionConfidence * 100).toFixed(0)}%)</label>
                <input 
                  type="range" min="0.1" max="0.95" step="0.05"
                  value={form.detectionConfidence}
                  onChange={e => set('detectionConfidence', parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
              </div>

              <div className="border-t border-border/20 pt-3">
                <label className="block text-[11px] text-muted-foreground mb-1">2. OCR 本地文字识别引擎模式</label>
                <select
                  value={form.ocrEngineModel}
                  onChange={e => set('ocrEngineModel', e.target.value)}
                  className="w-full rounded border border-border/50 bg-slate-800/80 px-2 py-1.5 text-xs text-foreground outline-none focus:border-cyan-500"
                >
                  <option value="auto">Auto (多引擎智能降级)</option>
                  <option value="rapidocr">RapidOCR (轻量离线端侧)</option>
                  <option value="paddleocr">PaddleOCR (后端高精度)</option>
                </select>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-border/10">
                <span className="text-xs text-muted-foreground">开启 LLM 双向多模态融合校验</span>
                <input 
                  type="checkbox" 
                  checked={form.fusionModeEnabled} 
                  onChange={e => set('fusionModeEnabled', e.target.checked)}
                  className="h-4 w-4 accent-cyan-500 cursor-pointer"
                />
              </div>

              {form.fusionModeEnabled && (
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">绑定质检/合规大模型标准</label>
                  <select
                    value={form.selectedStandardId ?? ''}
                    onChange={e => set('selectedStandardId', e.target.value || null)}
                    className="w-full rounded border border-border/50 bg-slate-800/80 px-2 py-1.5 text-xs text-foreground outline-none focus:border-cyan-500"
                  >
                    <option value="">-- 不绑定 / 纯特征匹配 --</option>
                    {standards.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* 4. Condition Gateway */}
          {activeNode === 'gateway' && (
            <div className="space-y-4">
              <div className="rounded-lg bg-indigo-950/20 border border-indigo-500/20 p-3 flex gap-2">
                <GitBranch className="h-4 w-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-indigo-400/90">
                  判定网关：配置从 AI 检测流流出的门槛规则。当且仅当所有条件都达成时，判定流才会路由到“合格分支”，否则走“存疑分支”。
                </p>
              </div>

              <div>
                <label className="block text-[11px] text-indigo-300 font-semibold mb-1">1. YOLO 多目标匹配门槛</label>
                <select
                  value={form.yoloDetectionMode}
                  onChange={e => set('yoloDetectionMode', e.target.value)}
                  className="w-full rounded border border-border/50 bg-slate-800/80 px-2 py-1.5 text-xs text-foreground outline-none focus:border-cyan-500"
                >
                  <option value="or">OR 逻辑 (发现选定类别中的任意一个即判定通过)</option>
                  <option value="and">AND 逻辑 (配方中选定的所有分类必须全部被识别出)</option>
                </select>
              </div>

              {/* 勾选需要校验的目标类别 */}
              <div className="space-y-1">
                <span className="block text-[10px] text-muted-foreground font-semibold">
                  参与判定门槛的 YOLO 目标类别（共 {form.selectedTargets.length} 个）：
                </span>
                {activeModel?.classes && activeModel.classes.length > 0 ? (
                  <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto border border-border/30 rounded p-1.5 bg-slate-950/40">
                    {activeModel.classes.map((cls: string) => {
                      const isSelected = form.selectedTargets.includes(cls);
                      const isMini = (form.nonGridTargets || []).includes(cls);
                      return (
                        <div key={cls} className="flex flex-col gap-1 p-1 bg-slate-900/60 border border-slate-800/20 rounded">
                          <label className="flex items-center gap-1.5 text-[10px] text-slate-300 cursor-pointer select-none">
                            <input 
                              type="checkbox" 
                              checked={isSelected} 
                              onChange={() => toggleTarget(cls)}
                              className="h-3 w-3 accent-indigo-500"
                            />
                            {cls}
                          </label>
                          {isSelected && (
                            <div className="flex items-center gap-1 pl-4.5 text-[8px] text-slate-500">
                              <label className="flex items-center gap-1 cursor-pointer">
                                <input 
                                  type="checkbox" 
                                  checked={isMini} 
                                  onChange={() => toggleMini(cls)}
                                  className="h-2.5 w-2.5 accent-indigo-500"
                                />
                                Mini模式
                              </label>
                              <span className="ml-2">
                                阈值: {((form.targetConfidences[cls] ?? form.detectionConfidence) * 100).toFixed(0)}%
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-500 italic">当前模型无可用分类</p>
                )}
              </div>

              <div className="border-t border-border/20 pt-3 flex items-center justify-between py-1">
                <span className="text-xs text-indigo-300 font-semibold">2. 启用文本关键词过滤条件</span>
                <input 
                  type="checkbox" 
                  checked={form.enableKeywordAnalysis} 
                  onChange={e => set('enableKeywordAnalysis', e.target.checked)}
                  className="h-4 w-4 accent-indigo-500 cursor-pointer"
                />
              </div>

              {form.enableKeywordAnalysis && (
                <div className="space-y-2 pl-3 border-l border-indigo-500/30">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] text-muted-foreground">关键词匹配模式</label>
                    <select
                      value={form.keywordMatchMode}
                      onChange={e => set('keywordMatchMode', e.target.value)}
                      className="rounded border border-border/50 bg-slate-800 px-2 py-0.5 text-[10px] text-foreground outline-none focus:border-cyan-500"
                    >
                      <option value="contains">包含匹配</option>
                      <option value="exact">精确匹配</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-muted-foreground mb-0.5">期望文本 (英文逗号分隔)</label>
                    <input 
                      value={form.keywords}
                      onChange={e => set('keywords', e.target.value)}
                      placeholder="如: 合格, PASS"
                      className="w-full rounded border border-border/50 bg-slate-800/80 px-2 py-1 text-xs text-foreground outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
              )}

              <div className="border-t border-border/20 pt-3 flex items-center justify-between py-1">
                <span className="text-xs text-indigo-300 font-semibold">3. 启用二维码条码过滤条件</span>
                <input 
                  type="checkbox" 
                  checked={form.enableBarcodeDetection} 
                  onChange={e => set('enableBarcodeDetection', e.target.checked)}
                  className="h-4 w-4 accent-indigo-500 cursor-pointer"
                />
              </div>
              {form.enableBarcodeDetection && (
                <p className="text-[10px] text-slate-500 pl-3">
                  已开启条码校验分支。条码的配置规则请在“传统表单视图”中进行规则添加。
                </p>
              )}
            </div>
          )}

          {/* 5. Pass Action Node */}
          {activeNode === 'pass-action' && (
            <div className="space-y-4">
              <div className="rounded-lg bg-emerald-950/20 border border-emerald-500/20 p-3 flex gap-2">
                <Info className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-emerald-400/90">
                  合格响应分支：当所有检测项与传感器逻辑成功通过时，网页应下发何种串口控制字符。
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-2">配置合格响应动作 (合格输出)</label>
                <div className="space-y-3">
                  {Object.entries(form.deviceActionMap || {}).map(([deviceType, actions]: [string, any]) => {
                    const devType = deviceType as DeviceType;
                    return (
                      <div key={deviceType} className="border border-border/40 rounded p-2.5 bg-slate-950/40 space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                          <span>{DEVICE_TYPE_META[devType]?.label ?? deviceType}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">输出指令:</span>
                          <input 
                            value={actions.qualified || ''}
                            onChange={e => setDeviceAction(devType, 'qualified', e.target.value)}
                            placeholder="如: GREEN\n"
                            className="flex-1 rounded border border-border/50 bg-slate-800 px-2 py-0.5 font-mono text-xs text-foreground"
                          />
                        </div>
                      </div>
                    );
                  })}
                  
                  {Object.keys(form.deviceActionMap || {}).length === 0 && (
                    <p className="text-xs text-slate-500 italic text-center py-4">无绑定设备动作。请点击下方添加。</p>
                  )}
                </div>
              </div>

              {/* 快速加减设备 */}
              <div className="border-t border-border/20 pt-3">
                <select
                  className="bg-slate-800 border border-border/50 rounded px-2 py-1 text-xs text-slate-400 w-full"
                  value=""
                  onChange={e => {
                    if (e.target.value) {
                      addDeviceAction(e.target.value as DeviceType);
                      e.target.value = '';
                    }
                  }}
                >
                  <option value="">+ 新增外部响应设备...</option>
                  {(Object.keys(DEVICE_TYPE_META) as DeviceType[])
                    .filter((t: string) => !(form.deviceActionMap || {})[t])
                    .map(t => <option key={t} value={t}>{DEVICE_TYPE_META[t].label}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* 6. Fail Action Node */}
          {activeNode === 'fail-action' && (
            <div className="space-y-4">
              <div className="rounded-lg bg-rose-950/20 border border-rose-500/20 p-3 flex gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-rose-400/90">
                  存疑停机响应分支：当判定网关得出的结论为“存疑”、“缺陷”或“设备报错”时，向串口控制下发报警灯闪烁或触发 PLC 停机指令。
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-2">配置异常报警输出 (存疑 & 空闲指令)</label>
                <div className="space-y-3">
                  {Object.entries(form.deviceActionMap || {}).map(([deviceType, actions]: [string, any]) => {
                    const devType = deviceType as DeviceType;
                    return (
                      <div key={deviceType} className="border border-border/40 rounded p-2.5 bg-slate-950/40 space-y-2">
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-350 border-b border-border/20 pb-1">
                          <span>{DEVICE_TYPE_META[devType]?.label ?? deviceType}</span>
                          <button onClick={() => removeDeviceAction(devType)} className="text-slate-500 hover:text-red-400">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                        
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-rose-400/80 whitespace-nowrap w-12">存疑报警:</span>
                            <input 
                              value={actions.unqualified || ''}
                              onChange={e => setDeviceAction(devType, 'unqualified', e.target.value)}
                              placeholder="如: RED\n"
                              className="flex-1 rounded border border-border/50 bg-slate-800 px-2 py-0.5 font-mono text-xs text-foreground"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap w-12">空闲复位:</span>
                            <input 
                              value={actions.idle || ''}
                              onChange={e => setDeviceAction(devType, 'idle', e.target.value)}
                              placeholder="如: OFF\n"
                              className="flex-1 rounded border border-border/50 bg-slate-800 px-2 py-0.5 font-mono text-xs text-foreground"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {Object.keys(form.deviceActionMap || {}).length === 0 && (
                    <p className="text-xs text-slate-500 italic text-center py-4">无绑定设备动作。</p>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Panel Footer */}
        <div className="pt-3 border-t border-border/30 text-[10px] text-slate-500 flex items-center justify-between">
          <span>提示: 点击流程图节点切换配置栏</span>
          <span className="flex items-center gap-1 font-semibold text-cyan-400/80">
            <Sliders className="h-3 w-3" />
            修改即时双向同步
          </span>
        </div>

      </div>

    </div>
  );
}
