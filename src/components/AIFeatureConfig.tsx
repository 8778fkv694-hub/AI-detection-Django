
import React, { useState, useEffect } from 'react';
import { useAIConfigStore } from '@/state/aiConfigStore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/Card';
import { Label } from '@/components/ui/Label';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Switch } from '@/components/ui/Switch';
import { Slider } from '@/components/ui/Slider';
import { Button } from '@/components/ui/Button';
import { Save, PlugZap, RotateCcw, DollarSign } from 'lucide-react';
import toast from 'react-hot-toast';
import { testAIConnection, checkAPIBalance, type BalanceData } from '@/lib/api';
import { apiFetch } from '@/lib/config';
import { DEFAULT_LLM_TASK_PROMPT, DEFAULT_LLM_USER_MESSAGE, LLM_HANDSHAKE_SYSTEM_PROMPT } from '@/lib/llmPrompt';

// This is a new, self-contained component for AI configuration.
const AIFeatureConfig: React.FC = () => {
    const { config, setConfig } = useAIConfigStore();
    const [isTesting, setIsTesting] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isCheckingBalance, setIsCheckingBalance] = useState(false);
    const [balanceData, setBalanceData] = useState<BalanceData | null>(null);

    // 组件加载时从后端获取已保存的配置
    useEffect(() => {
        loadSavedConfig();
    }, []);

    // 从后端加载已保存的配置
    const loadSavedConfig = async () => {
        try {
            const response = await apiFetch('/ai-configs/');
            if (response.ok) {
                const text = await response.text();
                if (text.trim()) {
                    try {
                        const savedConfig = JSON.parse(text);
                        if (savedConfig && Object.keys(savedConfig).length > 0) {
                            setConfig(savedConfig);
                            toast.success('已加载保存的配置');
                        }
                    } catch (parseError) {
                        console.warn('配置JSON解析失败:', parseError);
                    }
                }
            }
        } catch (error) {
            console.log('加载配置失败，使用默认配置:', error);
        }
    };

    // 保存配置到后端
    const handleSave = async () => {
        setIsSaving(true);
        try {
            const response = await apiFetch('/ai-configs/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(config)
            });

            if (response.ok) {
                toast.success('配置已保存到服务器！');
            } else {
                const errorText = await response.text();
                let errorMessage = '保存失败';
                try {
                    const errorData = JSON.parse(errorText);
                    errorMessage = errorData.message || errorMessage;
                } catch {
                    errorMessage = errorText || errorMessage;
                }
                throw new Error(errorMessage);
            }
        } catch (error) {
            toast.error(`保存配置失败: ${error instanceof Error ? error.message : '未知错误'}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleReset = () => {
        setConfig({
            apiKey: '',
            apiBaseUrl: 'https://wcode.net/api/gpt/v1/chat/completions',
            modelName: 'qwen2.5-vl-32b-instruct',
            systemPrompt: DEFAULT_LLM_TASK_PROMPT,
            userMessage: DEFAULT_LLM_USER_MESSAGE,
            compressionEnabled: true,
            compressionQuality: 0.8, // 24GB内存模式：高质量
            imageWidth: 600, // 24GB内存模式：高分辨率
            imageHeight: 600, // 24GB内存模式：高分辨率
        });
        toast.success('配置已重置为24GB高内存模式！');
    };

    const handleClearCache = () => {
        // 清除localStorage中的AI配置缓存
        localStorage.removeItem('wyl-ai-config-storage');
        // 重新加载页面以应用新的默认配置
        window.location.reload();
        toast.success('AI配置缓存已清除，页面将重新加载！');
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
        <Card className="h-full">
            <CardHeader>
                <CardTitle>AI 配置</CardTitle>
                <CardDescription>配置用于图像分析的AI接入点。支持在线AI和本地部署的AI，此处为在线AI配置页面。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><Label htmlFor="home-model-name">AI名称</Label><Input id="home-model-name" value={config.modelName} onChange={(e) => setConfig({ modelName: e.target.value })} placeholder="qwen2.5-vl-32b-instruct (在线) 或 moondream:latest (本地)" /></div>
                    <div>
                        <Label htmlFor="home-api-key">API Key</Label>
                        <Input id="home-api-key" type="password" value={config.apiKey} onChange={(e) => setConfig({ apiKey: e.target.value })} placeholder="请输入您的API Key" />
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
                <div><Label htmlFor="home-api-base-url">API Base URL (可修改)</Label><Input id="home-api-base-url" value={config.apiBaseUrl} onChange={(e) => setConfig({ apiBaseUrl: e.target.value })} placeholder="https://wcode.net/api/gpt/v1/chat/completions" /></div>
                <div>
                    <Label htmlFor="home-handshake-prompt">固定握手提示词</Label>
                    <p className="text-sm text-muted-foreground mb-2">每次新的 LLM 请求开始时自动注入，定义模型职责、边界和回复要求。提示词来源文档：项目根目录 `AGENTS.md`。</p>
                    <Textarea id="home-handshake-prompt" value={LLM_HANDSHAKE_SYSTEM_PROMPT} rows={10} readOnly className="resize-none bg-muted/40 text-muted-foreground" />
                </div>
                <div>
                    <Label htmlFor="home-system-prompt">业务补充提示词</Label>
                    <p className="text-sm text-muted-foreground mb-2">这是可编辑部分，会接在固定握手提示词后面，用于补充本项目的检测规则。</p>
                    <Textarea id="home-system-prompt" value={config.systemPrompt} onChange={(e) => setConfig({ systemPrompt: e.target.value })} rows={4} />
                </div>
                <div>
                    <Label htmlFor="home-user-message">随图片发送的用户消息</Label>
                    <p className="text-sm text-muted-foreground mb-2">每次图片检测都会再注入一次，适合放本次检测指令和 JSON 返回要求。</p>
                    <Textarea id="home-user-message" value={config.userMessage} onChange={(e) => setConfig({ userMessage: e.target.value })} rows={4} />
                </div>
            </CardContent>

            {/* 图片处理设置 */}
            <Card className="mt-4">
                <CardHeader>
                    <CardTitle>图片处理设置（全局）</CardTitle>
                    <CardDescription>在上传前对图片进行预处理，可显著提升速度和成功率。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                    <div className="flex items-center justify-between">
                        <Label htmlFor="compression-enabled" className="flex flex-col">
                            <span className="font-medium">启用图片压缩</span>
                            <span className="text-sm text-slate-400">推荐开启以优化性能。</span>
                        </Label>
                        <Switch
                            id="compression-enabled"
                            checked={config.compressionEnabled}
                            onCheckedChange={(checked) => setConfig({ compressionEnabled: checked })}
                        />
                    </div>
                    {config.compressionEnabled && (
                        <div className="space-y-4">
                            <div>
                                <div className="flex justify-between items-baseline">
                                    <Label htmlFor="compression-quality">压缩质量</Label>
                                    <span className="text-sm font-medium text-accent">{Math.round(config.compressionQuality * 100)}%</span>
                                </div>
                                <Slider
                                    id="compression-quality"
                                    min={0.1}
                                    max={1}
                                    step={0.05}
                                    value={[config.compressionQuality]}
                                    onValueChange={(value) => setConfig({ compressionQuality: value[0] })}
                                    className="mt-2"
                                />
                            </div>

                            <div>
                                <div className="flex justify-between items-baseline">
                                    <Label htmlFor="image-width">图片宽度</Label>
                                    <span className="text-sm font-medium text-accent">{config.imageWidth}px</span>
                                </div>
                                <Slider
                                    id="image-width"
                                    min={100}
                                    max={1920}
                                    step={50}
                                    value={[config.imageWidth]}
                                    onValueChange={(value) => setConfig({ imageWidth: value[0] })}
                                    className="mt-2"
                                />
                            </div>

                            <div>
                                <div className="flex justify-between items-baseline">
                                    <Label htmlFor="image-height">图片高度</Label>
                                    <span className="text-sm font-medium text-accent">{config.imageHeight}px</span>
                                </div>
                                <Slider
                                    id="image-height"
                                    min={100}
                                    max={1920}
                                    step={50}
                                    value={[config.imageHeight]}
                                    onValueChange={(value) => setConfig({ imageHeight: value[0] })}
                                    className="mt-2"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <Button variant="outline" size="sm" onClick={() => setConfig({ imageWidth: 800, imageHeight: 800 })}>
                                    800x800
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => setConfig({ imageWidth: 1280, imageHeight: 1280 })}>
                                    1280x1280
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => setConfig({ imageWidth: 1600, imageHeight: 1600 })}>
                                    1600x1600
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => setConfig({ imageWidth: 1920, imageHeight: 1920 })}>
                                    1920x1920
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
            <CardFooter className="flex justify-between gap-4">
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handleReset} disabled={isTesting}>
                        <RotateCcw className="mr-2 h-4 w-4" />
                        重置为默认
                    </Button>
                    <Button variant="outline" onClick={handleClearCache} disabled={isTesting}>
                        <RotateCcw className="mr-2 h-4 w-4" />
                        清除缓存
                    </Button>
                </div>
                <div className="flex gap-4">
                    <Button variant="outline" onClick={handleTestConnection} isLoading={isTesting} disabled={isTesting || isCheckingBalance}>
                        <PlugZap className="mr-2 h-4 w-4" />
                        测试连接
                    </Button>
                    <Button variant="outline" onClick={handleCheckBalance} isLoading={isCheckingBalance} disabled={isTesting || isCheckingBalance || !config.apiKey}>
                        <DollarSign className="mr-2 h-4 w-4" />
                        查询余额
                    </Button>
                    <Button onClick={handleSave} disabled={isTesting || isSaving || isCheckingBalance} isLoading={isSaving}>
                        <Save className="mr-2 h-4 w-4" />
                        {isSaving ? '保存中...' : '保存配置'}
                    </Button>
                </div>
            </CardFooter>
        </Card>
    );
};

export default AIFeatureConfig;
