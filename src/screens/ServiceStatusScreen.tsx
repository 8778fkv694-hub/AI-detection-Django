
import React, { useState, useEffect } from 'react'; import { testConnection } from '@/api/aiService'; import { useAIConfigStore } from '@/state/aiConfigStore'; import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'; import { Button } from '@/components/ui/Button'; import { CheckCircle, XCircle, AlertTriangle, Loader } from 'lucide-react'; import { Link } from 'react-router-dom';
type Status = 'unknown' | 'testing' | 'success' | 'failed';
const ServiceStatusScreen: React.FC = () => {
    const { config } = useAIConfigStore(); const [status, setStatus] = useState<Status>('unknown');
    const checkStatus = async () => {
        setStatus('testing'); if (!config.apiKey || !config.apiBaseUrl) { setStatus('failed'); return; }
        try { await testConnection(config); setStatus('success'); } catch (error) { setStatus('failed'); }
    };
    useEffect(() => { checkStatus(); }, [config]);
    const StatusIndicator = () => { switch (status) { case 'testing': return <div className="flex items-center gap-2 text-gray-600"><Loader className="animate-spin" /> 正在测试...</div>; case 'success': return <div className="flex items-center gap-2 text-success-600"><CheckCircle /> 服务连接正常</div>; case 'failed': return <div className="flex items-center gap-2 text-danger-600"><XCircle /> 服务连接失败</div>; default: return <div className="flex items-center gap-2 text-warning-600"><AlertTriangle /> 状态未知或未配置</div>; } };
    return <div className="animate-fade-in max-w-lg mx-auto"><h1 className="page-header">服务状态</h1><Card><CardHeader><CardTitle>AI 服务连接状态</CardTitle><CardDescription>检查当前配置的AI服务是否可以正常访问。</CardDescription></CardHeader><CardContent className="space-y-4"><div className="text-lg font-semibold p-4 border rounded-lg flex justify-center items-center"><StatusIndicator /></div>{status === 'failed' && <p className="text-sm text-center text-danger-700">请检查您的 <Link to="/ai-config" className="underline">AI配置</Link> 是否正确，包括API密钥、基础URL以及网络连接。</p>}<div className="flex justify-center"><Button onClick={checkStatus} disabled={status === 'testing'} isLoading={status === 'testing'}>重新检测</Button></div></CardContent></Card></div>;
};
export default ServiceStatusScreen;
