import React, { useState, useMemo } from 'react';
import AIFeatureConfig from '@/components/AIFeatureConfig';
import HomeDashboard from '@/components/HomeDashboard';
import { useAppStore } from '@/state/appStore';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  ChevronUp,
  Settings2,
  Camera,
  Shield,
  FileText,
  Clock,
  ExternalLink,
} from 'lucide-react';

const DETECTION_TYPE_MAP: Record<string, { label: string; icon: typeof Camera; href: string; openNewWindow: boolean }> = {
  cleanroom_ppe: { label: 'PPE检测', icon: Shield, href: '/safety-equipment', openNewWindow: true },
  standard_inspection: { label: '实时检测', icon: Camera, href: '/live-inspection', openNewWindow: true },
  general_quality: { label: '实时检测', icon: Camera, href: '/live-inspection', openNewWindow: true },
  ocr_inspection: { label: 'OCR检测', icon: FileText, href: '/ocr', openNewWindow: true },
  ocr_fusion_inspection: { label: 'OCR检测', icon: FileText, href: '/ocr', openNewWindow: true },
  kit_matching: { label: '齐套化检测', icon: Shield, href: '/kit-matching', openNewWindow: true },
};

const QUALITY_COLOR: Record<string, string> = {
  '合格': 'text-green-400',
  '存疑': 'text-yellow-400',
  '需复检': 'text-red-400',
};

const HomeScreen: React.FC = () => {
  const navigate = useNavigate();
  const [modelConfigCollapsed, setModelConfigCollapsed] = useState(true);
  const { results } = useAppStore();

  const lastResult = useMemo(() => {
    if (results.length === 0) return null;
    return [...results].sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )[0];
  }, [results]);

  const handleOpen = (href: string, openNewWindow: boolean) => {
    if (openNewWindow) {
      const windowId = `window_${Date.now()}`;
      const newWindow = window.open(
        `${href}?windowId=${windowId}`,
        windowId,
        'width=1200,height=800,resizable=yes,scrollbars=yes,status=yes'
      );
      if (!newWindow) {
        alert('无法打开新窗口，请检查浏览器弹窗设置');
      }
    } else {
      navigate(href);
    }
  };

  const formatTime = (ts: string) => {
    try {
      return new Date(ts).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const recentEntry = lastResult ? DETECTION_TYPE_MAP[lastResult.detectionType || ''] : null;

  return (
    <div className="space-y-6 pt-4">
      {/* 继续上次检测 */}
      <div>
        <h2 className="text-xl font-semibold mb-4">继续检测</h2>
        {lastResult && recentEntry ? (
          <button
            onClick={() => handleOpen(recentEntry.href, recentEntry.openNewWindow)}
            className="w-full flex items-center gap-4 rounded-lg border border-slate-700/50 bg-slate-800/30 p-4 text-left transition-colors hover:bg-slate-700/40 hover:border-slate-600/60"
          >
            <div className={`rounded-full p-2.5 ${
              lastResult.detectionType === 'cleanroom_ppe' ? 'bg-green-500/10' :
              lastResult.detectionType?.startsWith('ocr') ? 'bg-purple-500/10' : 'bg-blue-500/10'
            }`}>
              <recentEntry.icon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-base font-medium">{recentEntry.label}</span>
                <span className={`text-sm font-semibold ${QUALITY_COLOR[lastResult.overallQuality] || 'text-slate-400'}`}>
                  {lastResult.overallQuality}
                  {lastResult.score !== undefined && lastResult.score > 0 ? ` ${lastResult.score}分` : ''}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5 truncate">
                {lastResult.reason ? lastResult.reason.slice(0, 80) : '—'}
              </p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-muted-foreground/60">{formatTime(lastResult.timestamp)}</span>
                {(lastResult.processStageCode || lastResult.cameraId) && (
                  <span className="text-xs text-muted-foreground/60 truncate">
                    {lastResult.processStageCode || lastResult.cameraId}
                  </span>
                )}
              </div>
            </div>
            <ExternalLink className="h-4 w-4 text-muted-foreground/50 shrink-0" />
          </button>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-600 p-6 text-center">
            <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">暂无检测记录，选择检测类型开始</p>
            <div className="flex items-center justify-center gap-3 mt-3">
              {[
                { label: '实时检测', icon: Camera, href: '/live-inspection', color: 'bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/30 text-blue-400' },
                { label: 'PPE检测', icon: Shield, href: '/safety-equipment', color: 'bg-green-500/10 hover:bg-green-500/20 border-green-500/30 text-green-400' },
                { label: 'OCR检测', icon: FileText, href: '/ocr', color: 'bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/30 text-purple-400' },
              ].map(m => (
                <button
                  key={m.label}
                  onClick={() => handleOpen(m.href, true)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${m.color}`}
                >
                  <m.icon className="h-4 w-4" />
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Dashboard */}
      <HomeDashboard />

      {/* AI模型配置 - 可折叠 */}
      <div>
        <button
          className="flex w-full items-center justify-between p-2 text-left rounded-t-lg transition-colors hover:bg-accent/50 mb-2"
          onClick={() => setModelConfigCollapsed(!modelConfigCollapsed)}
          aria-expanded={!modelConfigCollapsed}
        >
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-muted-foreground" />
            <span className="text-lg font-semibold">AI 模型配置</span>
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            {modelConfigCollapsed ? '展开' : '收起'}
            {modelConfigCollapsed ? (
              <ChevronDown className="h-5 w-5" />
            ) : (
              <ChevronUp className="h-5 w-5" />
            )}
          </div>
        </button>
        <div
          className={`overflow-hidden transition-all duration-300 ease-in-out ${
            modelConfigCollapsed ? 'max-h-0 opacity-0' : 'max-h-[8000px] opacity-100'
          }`}
        >
          <AIFeatureConfig />
        </div>
      </div>
    </div>
  );
};

export default HomeScreen;