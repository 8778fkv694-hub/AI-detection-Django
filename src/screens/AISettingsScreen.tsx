
import React, { useState } from 'react';
import { useAIConfigStore } from '@/state/aiConfigStore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Label } from '@/components/ui/Label';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Switch } from '@/components/ui/Switch';
import { Slider } from '@/components/ui/Slider';
import { Button } from '@/components/ui/Button';
import { Save, PlugZap, DollarSign } from 'lucide-react';
import toast from 'react-hot-toast';
import { testAIConnection, checkAPIBalance, type BalanceData } from '@/lib/api';
import { DEFAULT_LLM_USER_MESSAGE, LLM_HANDSHAKE_SYSTEM_PROMPT } from '@/lib/llmPrompt';

const AISettingsScreen: React.FC = () => {
    const { config, setConfig } = useAIConfigStore();
    const [isTesting, setIsTesting] = useState(false);
    const [isCheckingBalance, setIsCheckingBalance] = useState(false);
    const [balanceData, setBalanceData] = useState<BalanceData | null>(null);

    const handleSave = () => {
        toast.success('配置已保存！');
    };

    const handleTestConnection = async () => {
        setIsTesting(true);
        const toastId = toast.loading('正在测试连接...');
        try {
            await testAIConnection(config);
            toast.success('连接成功，配置有效！', { id: toastId });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : '发生未知错误', { id: toastId });
        } finally {
            setIsTesting(false);
        }
    };

    const handleCheckBalance = async () => {
        setIsCheckingBalance(true);
        const toastId = toast.loading('正在查询余额...');
        try {
            const balance = await checkAPIBalance(config);
            setBalanceData(balance);
            toast.success(`余额查询成功！当前余额：${balance.formatted_balance}`, { id: toastId });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : '余额查询失败', { id: toastId });
            setBalanceData(null);
        } finally {
            setIsCheckingBalance(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>AI模型配置</CardTitle>
                    <CardDescription>配置连接AI服务的必要参数。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><Label htmlFor="model-name">模型名称</Label><Input id="model-name" value={config.modelName} onChange={(e) => setConfig({ modelName: e.target.value })} placeholder="例如: gpt-4o" /></div>
                        <div>
                            <Label htmlFor="api-key">API Key</Label>
                            <Input id="api-key" type="password" value={config.apiKey} onChange={(e) => setConfig({ apiKey: e.target.value })} placeholder="请输入您的API Key" />
                            {balanceData && (
                                <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
                                    <div className="flex items-center gap-2 text-sm">
                                        <DollarSign className="h-4 w-4 text-green-600" />
                                        <span className="text-green-700 dark:text-green-300 font-medium">
                                            当前余额：{balanceData.formatted_balance}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    <div><Label htmlFor="api-base-url">API Base URL (可修改)</Label><Input id="api-base-url" value={config.apiBaseUrl} onChange={(e) => setConfig({ apiBaseUrl: e.target.value })} placeholder="例如: https://api.wcode.net/v1/chat/completions" /></div>
                    <div>
                        <Label htmlFor="handshake-prompt">固定握手提示词</Label>
                        <p className="text-sm text-muted-foreground mb-2">每次新的 LLM 请求开始时都会自动注入，用于定义模型职责和回复规范。提示词来源文档：项目根目录 `AGENTS.md`。</p>
                        <Textarea id="handshake-prompt" value={LLM_HANDSHAKE_SYSTEM_PROMPT} rows={10} readOnly className="resize-none bg-muted/40 text-muted-foreground" />
                    </div>
                    <div>
                        <Label htmlFor="system-prompt">业务补充提示词</Label>
                        <p className="text-sm text-muted-foreground mb-2">这是可编辑部分，会在固定握手提示词之后注入，用于补充当前业务规则。</p>
                        <Textarea id="system-prompt" value={config.systemPrompt} onChange={(e) => setConfig({ systemPrompt: e.target.value })} rows={6} />
                    </div>
                    <div>
                        <Label htmlFor="user-message">随图片发送的用户消息</Label>
                        <p className="text-sm text-muted-foreground mb-2">每次检测图片时都会再注入一次，通常用于强调只返回 JSON 和本次任务要求。</p>
                        <Textarea id="user-message" value={config.userMessage || DEFAULT_LLM_USER_MESSAGE} onChange={(e) => setConfig({ userMessage: e.target.value })} rows={4} />
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader><CardTitle>图片处理设置</CardTitle><CardDescription>在上传前对图片进行预处理，可显著提升速度和成功率。</CardDescription></CardHeader>
                <CardContent className="space-y-6 pt-6">
                    <div className="flex items-center justify-between">
                        <Label htmlFor="compression-enabled" className="flex flex-col"><span className="font-medium">启用图片压缩</span><span className="text-sm text-slate-400">推荐开启以优化性能。</span></Label>
                        <Switch id="compression-enabled" checked={config.compressionEnabled} onCheckedChange={(checked) => setConfig({ compressionEnabled: checked })} />
                    </div>
                    {config.compressionEnabled && (
                        <div className="space-y-4">
                            <div>
                                <div className="flex justify-between items-baseline"><Label htmlFor="compression-quality">压缩质量</Label><span className="text-sm font-medium text-accent">{Math.round(config.compressionQuality * 100)}%</span></div>
                                <Slider id="compression-quality" min={0.1} max={1} step={0.05} value={[config.compressionQuality]} onValueChange={(value) => setConfig({ compressionQuality: value[0] })} className="mt-2" />
                            </div>

                            <div>
                                <div className="flex justify-between items-baseline"><Label htmlFor="image-width">图片宽度</Label><span className="text-sm font-medium text-accent">{config.imageWidth}px</span></div>
                                <Slider id="image-width" min={100} max={1920} step={50} value={[config.imageWidth]} onValueChange={(value) => setConfig({ imageWidth: value[0] })} className="mt-2" />
                            </div>

                            <div>
                                <div className="flex justify-between items-baseline"><Label htmlFor="image-height">图片高度</Label><span className="text-sm font-medium text-accent">{config.imageHeight}px</span></div>
                                <Slider id="image-height" min={100} max={1920} step={50} value={[config.imageHeight]} onValueChange={(value) => setConfig({ imageHeight: value[0] })} className="mt-2" />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <Button variant="outline" size="sm" onClick={() => setConfig({ imageWidth: 800, imageHeight: 800 })}>800x800</Button>
                                <Button variant="outline" size="sm" onClick={() => setConfig({ imageWidth: 1280, imageHeight: 1280 })}>1280x1280</Button>
                                <Button variant="outline" size="sm" onClick={() => setConfig({ imageWidth: 1600, imageHeight: 1600 })}>1600x1600</Button>
                                <Button variant="outline" size="sm" onClick={() => setConfig({ imageWidth: 1920, imageHeight: 1920 })}>1920x1920</Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
            <div className="flex justify-end gap-4">
                <Button variant="outline" onClick={handleTestConnection} isLoading={isTesting} disabled={isTesting || isCheckingBalance}>
                    <PlugZap className="mr-2 h-4 w-4" />
                    测试连接
                </Button>
                <Button variant="outline" onClick={handleCheckBalance} isLoading={isCheckingBalance} disabled={isTesting || isCheckingBalance || !config.apiKey}>
                    <DollarSign className="mr-2 h-4 w-4" />
                    查询余额
                </Button>
                <Button onClick={handleSave} disabled={isTesting || isCheckingBalance}>
                    <Save className="mr-2 h-4 w-4" />
                    保存配置
                </Button>
            </div>
        </div>
    );
};
export default AISettingsScreen;
