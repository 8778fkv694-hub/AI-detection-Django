import React from 'react';
import AIFeatureConfig from '@/components/AIFeatureConfig';
import { Button } from '@/components/ui/Button';
import {
  Camera,
  Shield,
  FileText,
  Layers,
  ExternalLink,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const HomeScreen: React.FC = () => {
  const navigate = useNavigate();

  // 快速导航模块数据

  // 快速导航模块数据
  const navModules = [
    {
      title: '实时检测',
      description: '生产线实时监控',
      icon: Camera,
      href: '/live-inspection',
      allowNewWindow: true,
      color: 'bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/30'
    },
    {
      title: 'PPE检测',
      description: '安全防护检测',
      icon: Shield,
      href: '/safety-equipment',
      allowNewWindow: true,
      color: 'bg-green-500/10 hover:bg-green-500/20 border-green-500/30'
    },
    /*
    {
      title: '齐套化检测',
      description: '齐套化完整性检测',
      icon: Shield,
      href: '/kit-matching',
      allowNewWindow: true,
      color: 'bg-green-500/10 hover:bg-green-500/20 border-green-500/30'
    },
    */
    {
      title: 'OCR检测',
      description: '文字识别分析',
      icon: FileText,
      href: '/ocr',
      allowNewWindow: true,
      color: 'bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/30'
    },
    /*
    {
      title: 'YOLO模型',
      description: '模型管理',
      icon: Cpu,
      href: '/models',
      allowNewWindow: false,
      color: 'bg-slate-500/10 hover:bg-slate-500/20 border-slate-500/30'
    },
    */
    {
      title: '提示词模版',
      description: '标准配置',
      icon: Layers,
      href: '/standards',
      allowNewWindow: false,
      color: 'bg-indigo-500/10 hover:bg-indigo-500/20 border-indigo-500/30'
    },
    /*
    {
      title: '系统设置',
      description: '本地LLM配置',
      icon: Settings,
      href: '/config',
      allowNewWindow: false,
      color: 'bg-gray-500/10 hover:bg-gray-500/20 border-gray-500/30'
    }
    */
  ];

  return (
    <div className="space-y-6 pt-4">
      {/* 快速导航 */}
      <div>
        <h2 className="text-xl font-semibold mb-4">快速导航</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {navModules.map((module) => (
            <Button
              key={module.title}
              variant="ghost"
              className={`h-auto p-4 flex flex-col items-center gap-2 transition-all duration-200 ${module.color}`}
              onClick={() => {
                if (module.allowNewWindow) {
                  const windowId = `window_${module.title}_${Date.now()}`;
                  const urlWithId = `${module.href}?windowId=${windowId}`;
                  const newWindow = window.open(
                    urlWithId,
                    windowId,
                    'width=1200,height=800,resizable=yes,scrollbars=yes,status=yes'
                  );
                  if (!newWindow) {
                    alert('无法打开新窗口，请检查浏览器弹窗设置');
                  }
                } else {
                  navigate(module.href);
                }
              }}
            >
              <div className="flex items-center gap-1">
                <module.icon className="h-5 w-5" />
                {module.allowNewWindow && <ExternalLink className="h-3 w-3 opacity-60" />}
              </div>
              <div className="text-center">
                <div className="text-base font-medium">{module.title}</div>
                <div className="text-sm opacity-70">{module.description}</div>
              </div>
            </Button>
          ))}
        </div>
      </div>

      {/* 在这里植入全新的AI配置组件 */}
      <div>
        <AIFeatureConfig />
      </div>
    </div>
  );
};

export default HomeScreen;
