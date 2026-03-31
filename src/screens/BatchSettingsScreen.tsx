
    import React, { useState } from 'react'; import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'; import { Label } from '@/components/ui/Label'; import { Input } from '@/components/ui/Input'; import { Button } from '@/components/ui/Button'; import { useBatchSettingsStore } from '@/state/batchSettingsStore'; import toast from 'react-hot-toast';
    const BatchSettingsScreen: React.FC = () => {
        const { settings, setSettings } = useBatchSettingsStore(); const [localSettings, setLocalSettings] = useState(settings);
        const handleSave = () => { if (localSettings.concurrentRequests < 1 || localSettings.concurrentRequests > 10) { toast.error("并发请求数必须在 1 到 10 之间。"); return; } setSettings(localSettings); toast.success("设置已保存！"); };
        return <div className="animate-fade-in max-w-lg mx-auto"><h1 className="page-header">批量检测设置</h1><Card><CardHeader><CardTitle>性能配置</CardTitle><CardDescription>调整批量处理的性能参数。更高的并发数会更快完成，但可能导致API服务速率限制。</CardDescription></CardHeader><CardContent><form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-4">
            <div><Label htmlFor="concurrentRequests">并发请求数</Label><Input id="concurrentRequests" type="number" min="1" max="10" value={localSettings.concurrentRequests} onChange={(e) => setLocalSettings(prev => ({...prev, concurrentRequests: parseInt(e.target.value, 10)}))} /><p className="text-sm text-gray-500 mt-1">建议范围: 1-5。请根据您的API提供商的限制进行调整。</p></div>
            <div className="flex justify-end"><Button type="submit">保存设置</Button></div>
        </form></CardContent></Card></div>;
    };
    export default BatchSettingsScreen;
  