import React, { useEffect, useState } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { 
  Home, Camera, Layers, BarChart2, Shield, FileText, 
  Eye, ExternalLink, HelpCircle, AlertTriangle, Cpu, 
  Video, Menu, X } from 'lucide-react';
import { useAppStore } from '@/state/appStore';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/Button';
import { StreamSettingsPopover } from '@/components/StreamSettingsPopover';
import { ServerConfigPopover } from '@/components/ServerConfigPopover';
import { cn } from '@/lib/utils';
import { initCsrfToken } from '@/lib/config';
import { buildClientRouteUrl } from '@/lib/navigation';

import HomeScreen from '@/screens/HomeScreen';
import LiveInspectionScreen from '@/screens/LiveInspectionScreen';
import BatchInspectionScreen from '@/screens/BatchInspectionScreen';
import TemplatesScreen from '@/screens/TemplatesScreen';
import EnhancedInspectionScreen from '@/screens/EnhancedInspectionScreen';
import SafetyEquipmentScreen from '@/screens/SafetyEquipmentScreen';
import CleanroomInspectionResultsScreen from '@/screens/CleanroomInspectionResultsScreen';
import KitMatchingScreen from '@/screens/KitMatchingScreen';
import KitMatchingResultsScreen from '@/screens/KitMatchingResultsScreen';
import OCRDetectionScreen from '@/screens/OCRDetectionScreen';
import GuidedWeChatQRTestScreen from '@/screens/GuidedWeChatQRTestScreen';
import OCRGuidedTestScreen from '@/screens/OCRGuidedTestScreen';
import LiveInspectionResultsScreen from '@/screens/LiveInspectionResultsScreen';
import BatchInspectionResultsScreen from '@/screens/BatchInspectionResultsScreen';
import OCRInspectionResultsScreen from '@/screens/OCRInspectionResultsScreen';
import AnomalyDashboardScreen from '@/screens/AnomalyDashboardScreen';
import ResultsDebugScreen from '@/screens/ResultsDebugScreen';
import ResultDetailScreen from '@/screens/ResultDetailScreen';
import HelpScreen from '@/screens/HelpScreen';
import ModelManagementScreen from '@/screens/ModelManagementScreen';
import StreamSettingsScreen from '@/screens/StreamSettingsScreen';

// 导航项定义
const primaryNavItems = [
  { name: '首页看板', href: '/', icon: Home },
  { name: '实时检测', href: '/live-inspection', icon: Camera },
  { name: '安全防护', href: '/safety-equipment', icon: Shield },
  { name: '质检模版', href: '/standards', icon: Layers },
];

const secondaryNavItems = [
  { name: '模型管理', href: '/models', icon: Cpu, allowNewWindow: false },
  { name: '异常看板', href: '/anomalies', icon: AlertTriangle, allowNewWindow: false },
  { name: '流媒体管理', href: '/streams', icon: Video, allowNewWindow: false },
  { name: 'OCR融合模式', href: '/ocr', icon: FileText, allowNewWindow: true },
  { name: 'OCR检测结果', href: '/ocr-results', icon: FileText, allowNewWindow: false },
  { name: '实时检测结果', href: '/live-inspection-results', icon: Eye, allowNewWindow: false },
  { name: 'PPE检测结果', href: '/cleanroom-results', icon: BarChart2, allowNewWindow: false },
  { name: '二维码检出评估', href: '/wechat-qr-guided', icon: FileText, allowNewWindow: true },
  { name: 'OCR检出能力评估', href: '/ocr-guided', icon: FileText, allowNewWindow: true },
  { name: '帮助指南', href: '/help', icon: HelpCircle, allowNewWindow: false },
];

const allNavItems = [
  ...primaryNavItems.map(item => ({ ...item, allowNewWindow: false })),
  ...secondaryNavItems
];

const getMobileNavLabel = (name: string) => {
  if (name === '安全防护') return '防护';
  if (name === '质检模版') return '模版';
  return name;
};

const AppMobile: React.FC = () => {
  const { fetchResults, fetchStandards } = useAppStore();
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [isTablet, setIsTablet] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [serverUrl, setServerUrl] = useState<string | null>(null);

  // 初始化设备宽度检测与CSRF token
  useEffect(() => {
    initCsrfToken().catch(err => {
      console.warn('CSRF token初始化失败:', err);
    });

    const checkDevice = () => {
      setIsTablet(window.innerWidth >= 1024); // 使用1024px作为平板/桌面侧边栏的阈值
    };
    checkDevice();
    window.addEventListener('resize', checkDevice);

    // 监控 Server URL 的变化
    setServerUrl(localStorage.getItem('API_SERVER_URL'));

    return () => {
      window.removeEventListener('resize', checkDevice);
    };
  }, []);

  useEffect(() => {
    fetchResults();
    fetchStandards();

    // 监听 Node 服务就绪事件，如果服务是在 React 挂载后才就绪，则重新拉取数据
    const handleNodeReady = () => {
      console.log('⚡️ [AppMobile] 检测到 Node 服务就绪，重新获取初始化数据...');
      fetchResults();
      fetchStandards();
    };

    window.addEventListener('node-server-ready', handleNodeReady);
    return () => {
      window.removeEventListener('node-server-ready', handleNodeReady);
    };
  }, [fetchResults, fetchStandards]);

  const toggleSidebar = () => {
    setSidebarVisible(!sidebarVisible);
  };

  // 打开新窗口功能
  const openInNewWindow = (href: string, name: string) => {
    const windowId = `window_${name}_${Date.now()}`;
    const separator = href.includes('?') ? '&' : '?';
    const urlWithId = buildClientRouteUrl(`${href}${separator}windowId=${windowId}`);

    const newWindow = window.open(
      urlWithId,
      windowId,
      'width=1200,height=800,resizable=yes,scrollbars=yes,status=yes'
    );

    if (!newWindow) {
      alert('无法打开新窗口，请检查浏览器弹窗设置');
    }
  };

  // 侧边栏 NavLink 样式
  const sidebarNavLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${isActive
      ? 'bg-accent/15 text-accent shadow-[0_0_15px_-3px] shadow-accent/40 border-l-2 border-accent'
      : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
    }`;

  // 底部导航项样式
  const mobileNavItemClass = ({ isActive }: { isActive: boolean }) =>
    `flex flex-col items-center justify-center transition-all flex-1 py-1 ${
      isActive 
        ? 'text-accent font-semibold scale-105' 
        : 'text-muted-foreground hover:text-foreground'
    }`;

  // 抽屉导航项样式
  const drawerNavItemClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3.5 py-3 text-sm font-medium transition-all ${isActive
      ? 'bg-accent/10 text-accent border-r-2 border-accent'
      : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
    }`;

  return (
    <div className="flex h-screen bg-background font-sans text-foreground overflow-hidden">
      {/* ========================================================
          平板/桌面侧边栏布局 (Tablet & Desktop Sidebar)
          ======================================================== */}
      {isTablet && (
        <nav className={cn(
          "border-r border-border/50 bg-background/50 backdrop-blur-sm transition-all duration-300 ease-in-out",
          sidebarVisible ? "w-64" : "w-0",
          "relative overflow-hidden flex-shrink-0"
        )}>
          <div className={cn(
            "h-full transition-opacity duration-300 flex flex-col w-64",
            sidebarVisible ? "opacity-100" : "opacity-0"
          )}>
            <div className="mb-8 pl-4 pt-6 flex-shrink-0 flex items-center justify-between pr-4">
              <Logo />
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>{serverUrl ? '远程连接' : '本地离线'}</span>
              </div>
            </div>
            
            <div className="flex flex-col gap-1.5 px-4 flex-1 overflow-y-auto pb-4 scrollbar-thin">
              {allNavItems.map(item => (
                <div key={item.name} className="group relative">
                  <NavLink to={item.href} className={sidebarNavLinkClass} end={item.href === '/'}>
                    <item.icon className="h-5 w-5" />
                    <span>{item.name}</span>
                  </NavLink>

                  {/* 新窗口按钮 */}
                  {item.allowNewWindow && !(typeof window !== 'undefined' && ((window as any).Capacitor || (window as any).__IS_MOBILE_APP__)) && (
                    <Button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openInNewWindow(item.href, item.name);
                      }}
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      title={`在新窗口打开 ${item.name}`}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {/* 全局服务与视频流配置（底部固定） */}
            <div className="px-4 pb-4 border-t border-border/50 pt-3 flex flex-col gap-1.5 flex-shrink-0">
              <ServerConfigPopover />
              <StreamSettingsPopover />
            </div>
          </div>
        </nav>
      )}

      {/* ========================================================
          平板侧边栏切换按钮 (Tablet Sidebar Toggle)
          ======================================================== */}
      {isTablet && (
        <Button
          onClick={toggleSidebar}
          variant="ghost"
          size="sm"
          className={cn(
            "fixed top-1/2 z-50 h-12 w-6 -translate-y-1/2 rounded-r-lg border border-l-0 border-border/50 bg-background/80 backdrop-blur-sm transition-all duration-300 hover:bg-background/90",
            sidebarVisible ? "left-64" : "left-0",
            "flex items-center justify-center p-0"
          )}
          title={sidebarVisible ? "隐藏侧边栏" : "显示侧边栏"}
        >
          <svg
            className={cn(
              "h-4 w-4 transition-transform duration-300",
              sidebarVisible ? "rotate-0" : "rotate-180"
            )}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            viewBox="0 0 24 24"
          >
            {sidebarVisible ? (
              <path d="M15 18l-6-6 6-6" />
            ) : (
              <path d="M9 18l6-6-6-6" />
            )}
          </svg>
        </Button>
      )}

      {/* ========================================================
          手机端顶部导航栏 (Mobile Top Bar)
          ======================================================== */}
      {!isTablet && (
        <header className="fixed top-0 left-0 right-0 h-14 bg-background/90 backdrop-blur-md border-b border-border/40 flex items-center justify-between px-4 z-40">
          <div className="flex items-center gap-2">
            <Logo />
            <span className="text-xs font-semibold tracking-wider bg-gradient-to-r from-accent to-accent/70 bg-clip-text text-transparent uppercase font-sans">移动终端</span>
          </div>
          <div className="flex items-center gap-3">
            {serverUrl ? (
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] text-blue-400 max-w-[140px] truncate">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse shrink-0" />
                <span className="truncate">{serverUrl.replace(/^https?:\/\//, '').split('/')[0]}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>本地离线</span>
              </div>
            )}
            <div className="w-8 h-8 rounded-full bg-slate-800/40 flex items-center justify-center border border-slate-700/30 overflow-hidden relative [&_button]:p-1.5 [&_button]:w-full [&_button]:h-full [&_button_span]:hidden [&_button_svg]:mx-auto [&_button_svg]:h-4 [&_button_svg]:w-4">
              <ServerConfigPopover />
            </div>
          </div>
        </header>
      )}

      {/* ========================================================
          手机端抽屉导航栏 (Mobile Lateral Drawer Menu)
          ======================================================== */}
      {!isTablet && (
        <>
          {/* 抽屉背景遮罩 */}
          <div 
            className={cn(
              "fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 transition-opacity duration-300",
              drawerOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
            )}
            onClick={() => setDrawerOpen(false)}
          />
          {/* 抽屉面板内容 */}
          <div 
            className={cn(
              "fixed inset-y-0 left-0 w-72 bg-slate-900 border-r border-slate-800/80 p-5 flex flex-col justify-between shadow-2xl z-50 transform transition-transform duration-300",
              drawerOpen ? "translate-x-0" : "-translate-x-full"
            )}
          >
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between pb-6 border-b border-border/30 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Logo />
                  <span className="text-sm font-semibold">功能菜单</span>
                </div>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground transition-all"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* 滚动菜单区 */}
              <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-1.5 scrollbar-none">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-3.5 mb-1">主功能</p>
                {primaryNavItems.map(item => (
                  <NavLink
                    key={item.name}
                    to={item.href}
                    onClick={() => setDrawerOpen(false)}
                    className={drawerNavItemClass}
                    end={item.href === '/'}
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    <span>{item.name}</span>
                  </NavLink>
                ))}

                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-3.5 mt-4 mb-1">更多检测与看板</p>
                {secondaryNavItems.map(item => (
                  <NavLink
                    key={item.name}
                    to={item.href}
                    onClick={() => setDrawerOpen(false)}
                    className={drawerNavItemClass}
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    <span>{item.name}</span>
                  </NavLink>
                ))}
              </div>

              {/* 抽屉底部设置区 */}
              <div className="border-t border-border/30 pt-4 flex flex-col gap-2 flex-shrink-0">
                <div className="grid grid-cols-2 gap-2">
                  <div className="[&_button]:w-full [&_button]:justify-center [&_button]:bg-slate-800/50 [&_button]:border [&_button]:border-slate-700/30">
                    <ServerConfigPopover />
                  </div>
                  <div className="[&_button]:w-full [&_button]:justify-center [&_button]:bg-slate-800/50 [&_button]:border [&_button]:border-slate-700/30">
                    <StreamSettingsPopover />
                  </div>
                </div>
                <div className="text-[10px] text-center text-slate-500 mt-2">
                  WYL 智能检测系统 • v1.0.0
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ========================================================
          手机端底部导航栏 (Mobile Bottom Tab Bar)
          ======================================================== */}
      {!isTablet && (
        <nav className="fixed bottom-0 left-0 right-0 h-16 bg-background/95 backdrop-blur-lg border-t border-border/40 flex items-center justify-around px-2 z-40 shadow-lg pb-safe">
          {primaryNavItems.map(item => (
            <NavLink
              key={item.name}
              to={item.href}
              className={mobileNavItemClass}
              end={item.href === '/'}
            >
              <item.icon className="h-5.5 w-5.5" />
              <span className="text-[10px] mt-0.5">{getMobileNavLabel(item.name)}</span>
            </NavLink>
          ))}
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex flex-col items-center justify-center text-muted-foreground hover:text-foreground transition-all flex-1 py-1"
          >
            <Menu className="h-5.5 w-5.5" />
            <span className="text-[10px] mt-0.5">更多</span>
          </button>
        </nav>
      )}

      {/* ========================================================
          主内容视口 (Main Content Viewport)
          ======================================================== */}
      <main className={cn(
        "flex-1 overflow-y-auto transition-all duration-300 ease-in-out bg-slate-950/20",
        isTablet 
          ? (sidebarVisible ? "p-8" : "p-4") 
          : "pt-[4.5rem] pb-[5rem] px-4"
      )}>
        <div className="max-w-7xl mx-auto h-full">
          <Routes>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/models" element={<ModelManagementScreen />} />
            <Route path="/standards" element={<TemplatesScreen />} />
            <Route path="/anomalies" element={<AnomalyDashboardScreen />} />
            <Route path="/streams" element={<StreamSettingsScreen />} />
            <Route path="/live-inspection" element={<LiveInspectionScreen />} />
            <Route path="/batch" element={<BatchInspectionScreen />} />
            <Route path="/safety-equipment" element={<SafetyEquipmentScreen />} />
            <Route path="/cleanroom-results" element={<CleanroomInspectionResultsScreen />} />
            <Route path="/kit-matching" element={<KitMatchingScreen />} />
            <Route path="/kit-matching-results" element={<KitMatchingResultsScreen />} />
            <Route path="/ocr" element={<OCRDetectionScreen />} />
            <Route path="/wechat-qr-guided" element={<GuidedWeChatQRTestScreen />} />
            <Route path="/ocr-guided" element={<OCRGuidedTestScreen />} />
            <Route path="/live-inspection-results" element={<LiveInspectionResultsScreen />} />
            <Route path="/batch-results" element={<BatchInspectionResultsScreen />} />
            <Route path="/ocr-results" element={<OCRInspectionResultsScreen />} />
            <Route path="/results-debug" element={<ResultsDebugScreen />} />
            {/* 兼容结果页及旧版返回链接 */}
            <Route path="/results" element={<ResultsDebugScreen />} />
            <Route path="/results/:resultId" element={<ResultDetailScreen />} />
            <Route path="/live" element={<Navigate to="/live-inspection" replace />} />
            <Route path="/model-management" element={<Navigate to="/models" replace />} />
            <Route path="/help" element={<HelpScreen />} />
            <Route path="/enhance/:resultId" element={<EnhancedInspectionScreen />} />
          </Routes>
        </div>
      </main>

      <Toaster
        position="bottom-right"
        toastOptions={{
          className: 'font-sans',
          style: { background: '#111827', color: '#F9FAFB', border: '1px solid #374151' }
        }}
      />
    </div>
  );
};

export default AppMobile;
