
import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Home, Camera, Layers, BarChart2, Shield, FileText, Eye, ExternalLink, HelpCircle, Video, Cpu, Settings, AlertTriangle } from 'lucide-react';
import { useAppStore } from '@/state/appStore';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/Button';
import { StreamSettingsPopover } from '@/components/StreamSettingsPopover';
import { cn } from '@/lib/utils';
import { initCsrfToken } from '@/lib/config';

import HomeScreen from '@/screens/HomeScreen';
import LiveInspectionScreen from '@/screens/LiveInspectionScreen';
// import InspectionScreen from '@/screens/InspectionScreen';
import BatchInspectionScreen from '@/screens/BatchInspectionScreen';
import TemplatesScreen from '@/screens/TemplatesScreen';
import LocalModelScreen from '@/screens/LocalModelScreen';
import EnhancedInspectionScreen from '@/screens/EnhancedInspectionScreen';
import SafetyEquipmentScreen from '@/screens/SafetyEquipmentScreen';
import CleanroomInspectionResultsScreen from '@/screens/CleanroomInspectionResultsScreen';
import KitMatchingScreen from '@/screens/KitMatchingScreen';
// import KitMatchingScreenTest from '@/screens/KitMatchingScreenTest'; // 已隐藏，移至备份文件夹
import KitMatchingResultsScreen from '@/screens/KitMatchingResultsScreen';
import ModelManagementScreen from '@/screens/ModelManagementScreen';
import OCRDetectionScreen from '@/screens/OCRDetectionScreen';
// import OCRErrorPreventionScreen from '@/screens/OCRErrorPreventionScreen'; // 已隐藏，移至备份文件夹
import GuidedWeChatQRTestScreen from '@/screens/GuidedWeChatQRTestScreen';
import OCRGuidedTestScreen from '@/screens/OCRGuidedTestScreen';
import LiveInspectionResultsScreen from '@/screens/LiveInspectionResultsScreen';
import BatchInspectionResultsScreen from '@/screens/BatchInspectionResultsScreen';
import OCRInspectionResultsScreen from '@/screens/OCRInspectionResultsScreen';
import AnomalyDashboardScreen from '@/screens/AnomalyDashboardScreen';
// import OCRErrorPreventionResultsScreen from '@/screens/OCRErrorPreventionResultsScreen'; // 已隐藏，移至备份文件夹
import ResultsDebugScreen from '@/screens/ResultsDebugScreen';
import HelpScreen from '@/screens/HelpScreen';
import StreamSettingsScreen from '@/screens/StreamSettingsScreen';
// import OCRTestScreen from '@/screens/OCRTestScreen';

const navItems = [
  { name: '首页设置', href: '/', icon: Home, allowNewWindow: false },
  { name: '模型管理', href: '/models', icon: Cpu, allowNewWindow: false },
  { name: '本地LLM（测试）', href: '/config', icon: Settings, allowNewWindow: false },
  { name: '模版页面', href: '/standards', icon: Layers, allowNewWindow: false },
  { name: '异常看板', href: '/anomalies', icon: AlertTriangle, allowNewWindow: false },
  { name: '流媒体管理', href: '/streams', icon: Video, allowNewWindow: false },
  { name: 'OCR融合模式', href: '/ocr', icon: FileText, allowNewWindow: true },
  { name: 'OCR检测结果', href: '/ocr-results', icon: FileText, allowNewWindow: false },
  { name: '实时检测', href: '/live-inspection', icon: Camera, allowNewWindow: true },
  { name: '实时检测结果', href: '/live-inspection-results', icon: Eye, allowNewWindow: false },
  // { name: '单件检测', href: '/inspection', icon: Zap },
  { name: 'PPE检测', href: '/safety-equipment', icon: Shield, allowNewWindow: true },
  { name: 'PPE检测结果', href: '/cleanroom-results', icon: BarChart2, allowNewWindow: false },
  // { name: '齐套化检测', href: '/kit-matching', icon: Shield, allowNewWindow: true },
  // { name: '齐套化检测测试版', href: '/kit-matching-test', icon: Shield, allowNewWindow: true }, // 已隐藏，移至备份文件夹
  // { name: '齐套化检测结果', href: '/kit-matching-results', icon: BarChart2, allowNewWindow: false },
  // { name: 'OCR防呆检测', href: '/ocr-error-prevention', icon: FileText, allowNewWindow: true }, // 已隐藏，移至备份文件夹
  // { name: 'OCR防呆检测结果', href: '/ocr-error-prevention-results', icon: FileText, allowNewWindow: false }, // 已隐藏，移至备份文件夹
  { name: '二维码检出能力评估', href: '/wechat-qr-guided', icon: FileText, allowNewWindow: true },
  { name: 'OCR检出能力评估', href: '/ocr-guided', icon: FileText, allowNewWindow: true },
  { name: '帮助指南', href: '/help', icon: HelpCircle, allowNewWindow: false },
];

const App: React.FC = () => {
  const { fetchResults, fetchStandards } = useAppStore();
  const [sidebarVisible, setSidebarVisible] = useState(true);

  // 初始化CSRF token
  useEffect(() => {
    initCsrfToken().catch(err => {
      console.warn('CSRF token初始化失败:', err);
    });
  }, []);

  useEffect(() => {
    fetchResults();
    fetchStandards();
  }, [fetchResults, fetchStandards]);

  const toggleSidebar = () => {
    setSidebarVisible(!sidebarVisible);
  };

  // 打开新窗口功能
  const openInNewWindow = (href: string, name: string) => {
    const windowId = `window_${name}_${Date.now()}`;
    const urlWithId = `${href}?windowId=${windowId}`;

    const newWindow = window.open(
      urlWithId,
      windowId,
      'width=1200,height=800,resizable=yes,scrollbars=yes,status=yes'
    );

    if (!newWindow) {
      alert('无法打开新窗口，请检查浏览器弹窗设置');
    }
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${isActive
      ? 'bg-accent/10 text-accent shadow-[0_0_15px_-3px] shadow-accent/40'
      : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
    }`;

  return (
    <BrowserRouter>
      <div className="flex h-screen bg-background font-sans text-foreground overflow-hidden">
        {/* 侧边栏 */}
        <nav className={cn(
          "border-r border-border/50 bg-background/50 backdrop-blur-sm transition-all duration-300 ease-in-out",
          sidebarVisible ? "w-64" : "w-0",
          "relative overflow-hidden"
        )}>
          <div className={cn(
            "h-full transition-opacity duration-300 flex flex-col",
            sidebarVisible ? "opacity-100" : "opacity-0"
          )}>
            <div className="mb-10 pl-2 pt-4 flex-shrink-0">
              <Logo />
            </div>
            <div className="flex flex-col gap-2 px-4 flex-1 overflow-y-auto pb-4">
              {navItems.map(item => (
                <div key={item.name} className="group relative">
                  <NavLink to={item.href} className={navLinkClass} end={item.href === '/'}>
                    <item.icon className="h-5 w-5" />
                    <span>{item.name}</span>
                  </NavLink>

                  {/* 新窗口按钮 */}
                  {item.allowNewWindow && (
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

            {/* 全局视频流设置（底部固定） */}
            <div className="px-4 pb-4 border-t border-border/50 pt-3">
              <StreamSettingsPopover />
            </div>
          </div>
        </nav>

        {/* 侧边栏切换按钮 */}
        <Button
          onClick={toggleSidebar}
          variant="ghost"
          size="sm"
          className={cn(
            "fixed left-0 top-1/2 z-50 h-12 w-6 -translate-y-1/2 rounded-r-lg border border-l-0 border-border/50 bg-background/80 backdrop-blur-sm transition-all duration-300 hover:bg-background/90",
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
              // 向左箭头 - 隐藏侧边栏
              <path d="M15 18l-6-6 6-6" />
            ) : (
              // 向右箭头 - 显示侧边栏
              <path d="M9 18l6-6-6-6" />
            )}
          </svg>
        </Button>

        {/* 主内容区域 */}
        <main className={cn(
          "flex-1 overflow-y-auto transition-all duration-300 ease-in-out",
          sidebarVisible ? "p-8" : "p-4"
        )}>
          <Routes>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/standards" element={<TemplatesScreen />} />
            <Route path="/anomalies" element={<AnomalyDashboardScreen />} />
            <Route path="/streams" element={<StreamSettingsScreen />} />
            <Route path="/live-inspection" element={<LiveInspectionScreen />} />
            {/* <Route path="/inspection" element={<InspectionScreen />} /> */}
            <Route path="/batch" element={<BatchInspectionScreen />} />
            <Route path="/safety-equipment" element={<SafetyEquipmentScreen />} />
            <Route path="/cleanroom-results" element={<CleanroomInspectionResultsScreen />} />
            <Route path="/kit-matching" element={<KitMatchingScreen />} />
            {/* <Route path="/kit-matching-test" element={<KitMatchingScreenTest />} /> */} {/* 已隐藏，移至备份文件夹 */}
            <Route path="/kit-matching-results" element={<KitMatchingResultsScreen />} />
            <Route path="/ocr" element={<OCRDetectionScreen />} />
            {/* <Route path="/ocr-error-prevention" element={<OCRErrorPreventionScreen />} /> */} {/* 已隐藏，移至备份文件夹 */}
            <Route path="/wechat-qr-guided" element={<GuidedWeChatQRTestScreen />} />
            <Route path="/ocr-guided" element={<OCRGuidedTestScreen />} />
            <Route path="/live-inspection-results" element={<LiveInspectionResultsScreen />} />
            <Route path="/batch-results" element={<BatchInspectionResultsScreen />} />
            <Route path="/ocr-results" element={<OCRInspectionResultsScreen />} />
            {/* <Route path="/ocr-error-prevention-results" element={<OCRErrorPreventionResultsScreen />} /> */} {/* 已隐藏，移至备份文件夹 */}
            <Route path="/results-debug" element={<ResultsDebugScreen />} />
            <Route path="/help" element={<HelpScreen />} />
            {/* <Route path="/ocr-test" element={<OCRTestScreen />} /> */}
            <Route path="/config" element={<LocalModelScreen />} />
            <Route path="/models" element={<ModelManagementScreen />} />
            <Route path="/enhance/:resultId" element={<EnhancedInspectionScreen />} />
          </Routes>
        </main>
      </div>
      <Toaster
        position="bottom-right"
        toastOptions={{
          className: 'font-sans',
          style: { background: '#111827', color: '#F9FAFB', border: '1px solid #374151' }
        }}
      />
    </BrowserRouter>
  );
};
export default App;
