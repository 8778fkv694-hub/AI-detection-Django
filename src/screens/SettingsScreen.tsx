
    import React from 'react'; import { Link } from 'react-router-dom'; import { Card, CardContent } from '@/components/ui/Card'; import { ChevronRight } from 'lucide-react';
    const settingsItems = [ { name: 'AI 服务配置', path: '/ai-config', description: '管理您的自定义 AI 服务连接。' }, { name: '模板管理', path: '/template-management', description: '创建和编辑检测标准模板。' }, { name: '批量检测设置', path: '/batch-settings', description: '配置批量检测的并发数等参数。' }, { name: '服务状态', path: '/service-status', description: '检查已连接服务的运行状态。' }, ];
    const SettingsScreen: React.FC = () => (
        <div className="animate-fade-in max-w-2xl mx-auto"><h1 className="page-header">系统设置</h1><Card><CardContent className="p-0"><ul className="divide-y divide-gray-200">{settingsItems.map((item) => <li key={item.name}><Link to={item.path} className="block hover:bg-gray-50"><div className="flex items-center px-4 py-4 sm:px-6"><div className="min-w-0 flex-1 flex items-center"><div className="min-w-0 flex-1 px-4 md:grid md:grid-cols-2 md:gap-4"><div><p className="text-sm font-medium text-primary-600 truncate">{item.name}</p><p className="mt-2 flex items-center text-sm text-gray-500">{item.description}</p></div></div></div><div><ChevronRight className="h-5 w-5 text-gray-400" /></div></div></Link></li>)}</ul></CardContent></Card></div>
    );
    export default SettingsScreen;
  