import React, { useState, useEffect } from 'react';
import { Wifi, X, Check, AlertCircle, RefreshCw } from 'lucide-react';

export const ServerConfigPopover: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ status: 'idle' | 'success' | 'error'; message: string }>({
    status: 'idle',
    message: ''
  });

  useEffect(() => {
    const saved = localStorage.getItem('API_SERVER_URL') || '';
    setUrl(saved);
  }, []);

  const handleSave = () => {
    const trimmed = url.trim();
    if (trimmed) {
      localStorage.setItem('API_SERVER_URL', trimmed);
    } else {
      localStorage.removeItem('API_SERVER_URL');
    }
    setOpen(false);
    // 重新加载页面以应用新的 API 地址
    window.location.reload();
  };

  const handleTest = async () => {
    const trimmed = url.trim();
    const testUrl = trimmed ? `${trimmed.replace(/\/$/, '')}/health` : 'http://127.0.0.1:5001/health';

    setTesting(true);
    setTestResult({ status: 'idle', message: '正在连接测试...' });

    try {
      const res = await fetch(testUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        mode: 'cors'
      });
      
      if (res.ok) {
        setTestResult({
          status: 'success',
          message: '连接成功！API 服务正常运行。'
        });
      } else {
        setTestResult({
          status: 'error',
          message: `连接失败，状态码: ${res.status}`
        });
      }
    } catch (e: any) {
      setTestResult({
        status: 'error',
        message: `无法连接服务器，请检查网络和 IP 地址`
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-white/5 hover:text-foreground transition-all w-full"
        title="设置 API 后端服务器地址"
      >
        <Wifi className="h-5 w-5" />
        <span>API 服务配置</span>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-72 rounded-xl border border-border/50 bg-background/95 backdrop-blur-md shadow-xl p-4 z-50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">API 服务器配置</h3>
            <button
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="text-xs text-muted-foreground mb-4">
            配置移动端要连接的后端地址。留空则自动运行本地内置 Node 离线服务（端口 5001）。
          </p>

          <div className="space-y-3 mb-4">
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">
                服务器地址 (例如 http://192.168.55.1:3005)
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="自动启用内置离线服务"
                className="w-full text-xs rounded-lg border border-slate-700 bg-slate-900/50 p-2 text-foreground focus:outline-none focus:border-blue-500"
              />
            </div>

            {testResult.status !== 'idle' && (
              <div className={`flex gap-2 rounded-lg p-2 text-[11px] ${
                testResult.status === 'success' 
                  ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
                  : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}>
                {testResult.status === 'success' ? (
                  <Check className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleTest}
              disabled={testing}
              className="flex-1 flex items-center justify-center gap-1 text-[11px] py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors disabled:opacity-50"
            >
              {testing ? <RefreshCw className="h-3 w-3 animate-spin" /> : null}
              测试连接
            </button>
            <button
              onClick={handleSave}
              className="flex-1 text-[11px] py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors"
            >
              保存并重启
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
