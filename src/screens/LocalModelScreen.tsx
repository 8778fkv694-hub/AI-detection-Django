import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Label } from '@/components/ui/Label';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { 
  Server, 
  RefreshCw, 
  Settings, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Cpu,
  Zap,
  MessageSquare,
  Save,
  Copy,
  Check,
  Monitor,
  Gauge,
  Target
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { HIGH_MEMORY_CONFIG, ULTRA_HIGH_MEMORY_CONFIG, FAST_MODE_CONFIG, HIGH_RESOLUTION_CONFIG, GEMMA4_CONFIG } from '@/lib/optimizedLocalAI';
import { directBackendFetch } from '@/lib/config';
import { useModelMode } from '@/hooks/useModelMode';
import { LLM_HANDSHAKE_SYSTEM_PROMPT } from '@/lib/llmPrompt';

interface OllamaStatus {
  isRunning: boolean;
  isLoading: boolean;
  error: string | null;
  modelName: string;
  modelSize: string;
  lastChecked: Date | null;
}

interface LocalModelConfig {
  modelName: string;
  systemPrompt: string;
  userMessage: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  topK: number;
  repeatPenalty: number;
  // 性能优化参数
  contextLength?: number;
  timeout?: number;
  retryAttempts?: number;
  memoryOptimization?: boolean;
  batchSize?: number;
}

const LocalModelScreen: React.FC = () => {
  const { localModelConfig, updateLocalModelConfig } = useModelMode();
  
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus>({
    isRunning: false,
    isLoading: false,
    error: null,
    modelName: '',
    modelSize: '',
    lastChecked: null
  });

  const [config, setConfig] = useState<LocalModelConfig>(() => {
    // 如果localModelConfig是默认配置，则应用高内存模式
    const isDefaultConfig = (localModelConfig.modelName === 'moondream:latest' || localModelConfig.modelName === 'gemma4:e4b') &&
                           localModelConfig.maxTokens <= 1024;
    
    if (isDefaultConfig) {
      return { ...localModelConfig, ...HIGH_MEMORY_CONFIG };
    }
    
    return localModelConfig;
  });

  // 监听localModelConfig变化，同步到本地config（避免循环更新）
  useEffect(() => {
    // 只在localModelConfig确实有变化且不是由当前组件触发时才更新
    if (localModelConfig.modelName && localModelConfig.modelName !== config.modelName) {
      console.log('🔄 从localModelConfig同步配置:', localModelConfig);
      setConfig(prevConfig => ({ ...prevConfig, ...localModelConfig }));
    }
  }, [localModelConfig.modelName, localModelConfig.systemPrompt]);

  const [isSaving, setIsSaving] = useState(false);
  const [showPromptDialog, setShowPromptDialog] = useState(false);
  const [showUserMessageDialog, setShowUserMessageDialog] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string>('high-memory');

  // 同步配置变化到useModelMode
  useEffect(() => {
    updateLocalModelConfig(config);
    console.log('🔄 本地模型配置已更新:', config);
  }, [config, updateLocalModelConfig]);

  // 检查本地模型服务状态
  const checkOllamaStatus = useCallback(async () => {
    setOllamaStatus(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      // 直接请求 Django 8000 端口，避免经过静态服务器代理
      const statusResponse = await directBackendFetch('/ollama/status/', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        
        if (statusData.success && statusData.status === 'running') {
          // 服务运行正常，使用状态API返回的模型信息
          // 优先显示用户选择的模型，如果没有则显示第一个可用模型
          const selectedModel = statusData.models?.find((m: any) => m.name === config.modelName);
          const fallbackModel = statusData.models?.find((m: any) => m.name.includes('moondream')) || statusData.models?.[0];
          const currentModel = selectedModel || fallbackModel;
          
          setOllamaStatus({
            isRunning: true,
            isLoading: false,
            error: null,
            modelName: currentModel?.name || config.modelName || 'moondream:latest',
            modelSize: currentModel ? `${(currentModel.size / 1024 / 1024 / 1024).toFixed(1)}GB` : '',
            lastChecked: new Date()
          });
          
          toast.success('本地模型服务运行正常');
        } else {
          throw new Error(statusData.message || '服务未运行');
        }
      } else {
        throw new Error('状态检查失败');
      }
    } catch (error) {
      setOllamaStatus({
        isRunning: false,
        isLoading: false,
        error: error instanceof Error ? error.message : '连接失败',
        modelName: '',
        modelSize: '',
        lastChecked: new Date()
      });
      
      toast.error('无法连接到本地模型服务');
    }
  }, []);

  // 复制命令到剪贴板
  const copyCommand = useCallback(async (command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedCommand(command);
      toast.success('命令已复制到剪贴板', {
        duration: 2000,
        style: {
          background: '#10b981',
          color: '#fff',
        },
      });
      
      // 2秒后重置复制状态
      setTimeout(() => {
        setCopiedCommand(null);
      }, 2000);
    } catch (error) {
      toast.error('复制失败，请手动复制', {
        duration: 3000,
      });
    }
  }, []);

  // 显示启动指引
  const showStartGuide = useCallback(() => {
    toast.success('请使用终端启动本地模型服务', {
      duration: 8000,
      style: {
        background: '#363636',
        color: '#fff',
        maxWidth: '500px',
      },
    });
    
    // 显示详细指引
    setTimeout(() => {
      toast('终端命令: ollama serve', {
        duration: 5000,
        style: {
          background: '#1e40af',
          color: '#fff',
        },
      });
    }, 1000);
  }, []);

  // 启动本地模型服务
  const startOllama = useCallback(async () => {
    try {
      const isMobile = typeof window !== 'undefined' && (
        (window as any).Capacitor || (window as any).__IS_MOBILE_APP__
      );
      if (isMobile) {
        toast.error('移动端暂不支持直接运行 Ollama 服务，请在主机上启动。', { duration: 5000 });
        showStartGuide();
        return;
      }

      // 创建一个包含启动命令的HTML文件
      const command = 'ollama serve';
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>启动本地模型服务</title>
          <style>
            body { 
              font-family: 'Courier New', monospace; 
              background: #1a1a1a; 
              color: #00ff00; 
              padding: 20px;
              margin: 0;
            }
            .terminal {
              background: #000;
              padding: 15px;
              border-radius: 5px;
              border: 1px solid #333;
            }
            .command {
              color: #ffff00;
              font-weight: bold;
            }
            .note {
              color: #ffaa00;
              margin-top: 10px;
            }
          </style>
        </head>
        <body>
          <h2>🚀 启动本地模型服务</h2>
          <div class="terminal">
            <p>请在终端中运行以下命令：</p>
            <p class="command">${command}</p>
            <p class="note">💡 提示：复制命令后，在终端中粘贴并回车执行</p>
          </div>
          <script>
            // 自动复制命令到剪贴板
            navigator.clipboard.writeText('${command}').then(() => {
              console.log('命令已复制到剪贴板');
            });
          </script>
        </body>
        </html>
      `;
      
      // 在新窗口中打开
      const newWindow = window.open('', '_blank', 'width=600,height=400');
      if (newWindow) {
        newWindow.document.write(htmlContent);
        newWindow.document.close();
        
        toast.success('已打开启动页面，请按照指引操作');
        
        // 延迟检查服务状态
        setTimeout(() => {
          checkOllamaStatus();
        }, 3000);
      } else {
        throw new Error('无法打开新窗口');
      }
    } catch (error) {
      console.error('启动本地模型服务失败:', error);
      toast.error('启动本地模型服务失败，请手动启动');
      showStartGuide();
    }
  }, [checkOllamaStatus, showStartGuide]);

  // 配置预设选择（只影响性能参数，不改变模型选择）
  const handlePresetChange = useCallback((preset: string) => {
    setSelectedPreset(preset);
    
    // 保持当前模型选择，只更新性能参数
    const currentModel = config.modelName;
    let performanceConfig: Partial<LocalModelConfig>;
    
    switch (preset) {
      case 'fast':
        performanceConfig = { ...FAST_MODE_CONFIG };
        break;
      case 'high-memory':
        performanceConfig = { ...HIGH_MEMORY_CONFIG };
        break;
      case 'ultra-high':
        performanceConfig = { ...ULTRA_HIGH_MEMORY_CONFIG };
        break;
      case 'high-resolution':
        performanceConfig = { ...HIGH_RESOLUTION_CONFIG };
        break;
      case 'default':
      default:
        // 默认配置，保持当前模型
        performanceConfig = {
          temperature: 0.7,
          maxTokens: 2048,
          topP: 0.9,
          topK: 40,
          repeatPenalty: 1.1,
          contextLength: 32768,
          timeout: 900000,
          retryAttempts: 3,
          memoryOptimization: false
        };
        break;
    }
    
    // 合并配置，保持当前模型选择
    const newConfig = { 
      ...config, 
      ...performanceConfig,
      modelName: currentModel // 保持当前选择的模型
    };
    
    setConfig(newConfig);
    updateLocalModelConfig(newConfig);
    toast.success(`已切换到${preset === 'default' ? '默认' : preset}性能配置`);
  }, [config, updateLocalModelConfig]);

  // 保存配置
  const saveConfig = useCallback(async () => {
    setIsSaving(true);
    try {
      // 保存到localStorage，使用与useModelMode相同的键
      const modelModeConfig = {
        mode: 'local',
        localModelConfig: config
      };
      localStorage.setItem('modelModeConfig', JSON.stringify(modelModeConfig));
      
      // 验证保存是否成功
      const savedConfig = localStorage.getItem('modelModeConfig');
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        console.log('✅ 配置保存成功:', parsed);
        console.log('当前选择的模型:', parsed.localModelConfig?.modelName);
        toast.success(`配置保存成功！当前模型: ${parsed.localModelConfig?.modelName}`);
      } else {
        throw new Error('保存验证失败');
      }
    } catch (error) {
      console.error('保存配置失败:', error);
      toast.error('保存配置失败');
    } finally {
      setIsSaving(false);
    }
  }, [config]);

  // 测试本地模型
  const testLocalModel = useCallback(async () => {
    if (!ollamaStatus.isRunning) {
      toast.error('请先启动本地模型服务');
      return;
    }

    try {
      toast.loading('正在测试本地模型...', { id: 'test-model' });
      
      // 创建 AbortController 用于超时控制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时
      
      const response = await directBackendFetch('/ollama/chat/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.modelName,
          messages: [
            {
              role: 'user',
              content: '你好'
            }
          ],
          stream: false,
          ...(config.modelName.includes('gemma4') || config.modelName.includes('qwq') ? { think: false } : {})
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        toast.success(`测试成功: ${data.message?.content?.substring(0, 50)}...`, { id: 'test-model' });
      } else {
        throw new Error(`模型响应异常: ${response.status}`);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        toast.error('测试超时，模型响应时间过长', { id: 'test-model' });
      } else {
        toast.error(`测试失败: ${error instanceof Error ? error.message : '未知错误'}`, { id: 'test-model' });
      }
    }
  }, [ollamaStatus.isRunning, config.modelName]);

  // 组件加载时检查状态和加载配置
  useEffect(() => {
    checkOllamaStatus();
    
    // 从localStorage加载配置
    try {
      const savedConfig = localStorage.getItem('modelModeConfig');
      if (savedConfig) {
        const parsedConfig = JSON.parse(savedConfig);
        console.log('📂 从localStorage加载配置:', parsedConfig);
        if (parsedConfig.localModelConfig) {
          console.log('📋 加载的模型配置:', parsedConfig.localModelConfig);
          console.log('🎯 当前选择的模型:', parsedConfig.localModelConfig.modelName);
          setConfig(prev => ({ ...prev, ...parsedConfig.localModelConfig }));
        }
      } else {
        console.log('📂 localStorage中没有找到配置，使用默认配置');
      }
    } catch (error) {
      console.error('加载本地模型配置失败:', error);
    }
  }, [checkOllamaStatus]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* 服务状态卡片 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            本地模型服务状态
          </CardTitle>
          <CardDescription>
            管理本地大模型服务的启动和状态监控
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                {ollamaStatus.isLoading ? (
                  <RefreshCw className="h-4 w-4 animate-spin text-blue-400" />
                ) : ollamaStatus.isRunning ? (
                  <CheckCircle className="h-4 w-4 text-green-400" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-400" />
                )}
                <span className="font-medium">
                  {ollamaStatus.isLoading ? '检查中...' : 
                   ollamaStatus.isRunning ? '运行中' : '已停止'}
                </span>
              </div>
              
              {ollamaStatus.isRunning && (
                <Badge variant="outline" className="text-green-400 border-green-400">
                  <Cpu className="h-3 w-3 mr-1" />
                  {ollamaStatus.modelName}
                </Badge>
              )}
              
              {ollamaStatus.modelSize && (
                <Badge variant="outline" className="text-blue-400 border-blue-400">
                  {ollamaStatus.modelSize}
                </Badge>
              )}
            </div>
            
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={checkOllamaStatus}
                disabled={ollamaStatus.isLoading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${ollamaStatus.isLoading ? 'animate-spin' : ''}`} />
                刷新状态
              </Button>
              
              {!ollamaStatus.isRunning && (
                <Button
                  size="sm"
                  onClick={startOllama}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Zap className="h-4 w-4 mr-2" />
                  启动本地模型服务
                </Button>
              )}
              
              <Button
                size="sm"
                onClick={showStartGuide}
                variant="outline"
              >
                <Settings className="h-4 w-4 mr-2" />
                启动指引
              </Button>
            </div>
          </div>
          
          {ollamaStatus.error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertCircle className="h-4 w-4 text-red-400" />
              <span className="text-sm text-red-400">{ollamaStatus.error}</span>
            </div>
          )}
          
          {ollamaStatus.lastChecked && (
            <div className="text-sm text-slate-400">
              最后检查: {ollamaStatus.lastChecked.toLocaleString()}
            </div>
          )}
          
          {/* 启动指引信息 */}
          <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <div className="flex items-start gap-3">
              <Settings className="h-5 w-5 text-blue-400 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-sm font-medium text-blue-400 mb-2">本地模型服务启动指引</h4>
                <div className="text-xs text-slate-300 space-y-2">
                  <p>1. <strong>自动启动</strong>：点击上方"启动本地模型服务"按钮，系统会自动打开终端并启动服务</p>
                  
                  <p>2. <strong>手动启动</strong>：打开终端，运行以下命令启动本地模型服务：</p>
                  <div className="flex items-center gap-2 bg-slate-800 px-3 py-2 rounded">
                    <code className="flex-1 text-green-400 font-mono">
                      ollama serve
                    </code>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyCommand('ollama serve')}
                      className="h-6 w-6 p-0 hover:bg-slate-700"
                    >
                      {copiedCommand === 'ollama serve' ? (
                        <Check className="h-3 w-3 text-green-400" />
                      ) : (
                        <Copy className="h-3 w-3 text-slate-400" />
                      )}
                    </Button>
                  </div>
                  
                  <p>3. <strong>优化启动</strong>：或者使用项目提供的内存优化启动脚本：</p>
                  <div className="flex items-center gap-2 bg-slate-800 px-3 py-2 rounded">
                    <code className="flex-1 text-green-400 font-mono">
                      ./ollama-memory-optimized.sh
                    </code>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyCommand('./ollama-memory-optimized.sh')}
                      className="h-6 w-6 p-0 hover:bg-slate-700"
                    >
                      {copiedCommand === './ollama-memory-optimized.sh' ? (
                        <Check className="h-3 w-3 text-green-400" />
                      ) : (
                        <Copy className="h-3 w-3 text-slate-400" />
                      )}
                    </Button>
                  </div>
                  
                  <p>4. 启动后点击"刷新状态"按钮检查服务状态</p>
                  <p className="text-yellow-400">
                    💡 当前使用模型: {ollamaStatus.modelName || config.modelName || '未选择'} 
                    {ollamaStatus.modelSize && ` (${ollamaStatus.modelSize})`}
                    {config.modelName?.includes('moondream') && ' - 轻量级多模态AI'}
                    {config.modelName?.includes('qwen') && ' - 高质量多模态AI'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 模型配置卡片 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            模型配置
          </CardTitle>
          <CardDescription>
            配置本地模型的参数和提示词
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 模型选择 */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="model-selector">选择模型</Label>
              <Select value={config.modelName} onValueChange={(value) => {
                console.log('🔄 用户选择模型:', value);
                console.log('🔄 当前config.modelName:', config.modelName);
                
                // 根据选择的模型更新系统提示词
                let systemPrompt = config.systemPrompt;
                let userMessage = config.userMessage;
                
                if (value.includes('moondream')) {
                  systemPrompt = '你是一个专业的图像分析AI助手，擅长快速准确地分析图像内容。请用简洁明了的中文回答。';
                  userMessage = '请分析图片质量，返回JSON格式：{"overallQuality": "合格/存疑/需复检", "score": 85, "reason": "检测原因", "reasonKeywords": "关键词", "defects": []}';
                } else if (value.includes('minicpm-v')) {
                  systemPrompt = '你是一个专业的工业质检AI助手，擅长精确分析产品图像，识别缺陷和特征。请用专业、准确的中文回答。';
                  userMessage = '请按照标准严格分析这张图，返回JSON格式：{"overallQuality": "合格/存疑/需复检", "score": 85, "reason": "检测原因", "reasonKeywords": "关键词1,关键词2,关键词3", "defects": []}';
                } else if (value.includes('qwen')) {
                  systemPrompt = '你是一个强大的多模态AI助手，可以理解和分析图像与文本内容，特别擅长视觉理解任务。请用中文回答用户的问题。';
                  userMessage = '请分析图片质量，返回JSON格式：{"overallQuality": "合格/存疑/需复检", "score": 85, "reason": "检测原因", "reasonKeywords": "关键词", "defects": []}';
                } else if (value.includes('gemma')) {
                  systemPrompt = GEMMA4_CONFIG.systemPrompt!;
                  userMessage = GEMMA4_CONFIG.userMessage!;
                }
                
                const newConfig = { 
                  ...config, 
                  modelName: value,
                  systemPrompt: systemPrompt,
                  userMessage: userMessage
                };
                console.log('🔄 新配置:', newConfig);
                setConfig(newConfig);
                // 只更新模型相关的配置，保留其他用户设置
                updateLocalModelConfig({
                  modelName: value,
                  systemPrompt: systemPrompt,
                  userMessage: userMessage
                });
                
                // 自动刷新状态显示
                setTimeout(() => {
                  checkOllamaStatus();
                }, 500);
                
                toast.success(`已切换到模型: ${value}`);
              }}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择要使用的模型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="moondream:latest">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      <div>
                        <div className="font-medium">Moondream</div>
                        <div className="text-xs text-slate-500">轻量级多模态AI，3-4GB内存</div>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="moondream-fast">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4" />
                      <div>
                        <div className="font-medium">Moondream-Fast</div>
                        <div className="text-xs text-slate-500">优化版本，极快响应速度</div>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="moondream3-preview">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      <div>
                        <div className="font-medium">Moondream3</div>
                        <div className="text-xs text-slate-500">最新版本，4-6GB内存</div>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="minicpm-v:latest">
                    <div className="flex items-center gap-2">
                      <Monitor className="h-4 w-4" />
                      <div>
                        <div className="font-medium">MiniCPM-V</div>
                        <div className="text-xs text-slate-500">轻量级视觉模型，5GB内存</div>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="qwen2.5-vl-7b:latest">
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      <div>
                        <div className="font-medium">Qwen2.5-VL-7B</div>
                        <div className="text-xs text-slate-500">高质量AI，8-12GB内存</div>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="gemma4:e4b">
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      <div>
                        <div className="font-medium">Gemma 4</div>
                        <div className="text-xs text-slate-500">Google多模态模型，9.6GB，支持图像理解</div>
                      </div>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 配置预设选择 */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="config-preset">性能配置预设</Label>
              <Select value={selectedPreset} onValueChange={handlePresetChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择性能配置预设" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">
                    <div className="flex items-center gap-2">
                      <Monitor className="h-4 w-4" />
                      <div>
                        <div className="font-medium">默认配置</div>
                        <div className="text-xs text-slate-500">平衡性能和速度，适合日常使用</div>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="fast">
                    <div className="flex items-center gap-2">
                      <Gauge className="h-4 w-4" />
                      <div>
                        <div className="font-medium">快速模式</div>
                        <div className="text-xs text-slate-500">优先速度，适合批量处理</div>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="high-memory">
                    <div className="flex items-center gap-2">
                      <Cpu className="h-4 w-4" />
                      <div>
                        <div className="font-medium">高内存模式</div>
                        <div className="text-xs text-slate-500">充分利用24GB内存，高质量分析</div>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="ultra-high">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4" />
                      <div>
                        <div className="font-medium">超高内存模式</div>
                        <div className="text-xs text-slate-500">最大性能，适合复杂任务</div>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="high-resolution">
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      <div>
                        <div className="font-medium">高分辨率模式</div>
                        <div className="text-xs text-slate-500">支持大图片，细节检测</div>
                      </div>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 当前模型状态 */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-blue-500" />
              <Label className="text-sm font-medium">当前模型状态</Label>
            </div>
            <div className="p-4 bg-slate-800/50 border border-slate-700/50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-slate-200">
                    {config.modelName || '未选择模型'}
                    <span className="text-xs text-slate-500 ml-2">
                      (调试: {config.modelName})
                    </span>
                  </div>
                  <div className="text-sm text-slate-400">
                    {config.modelName?.includes('moondream') ? '轻量级多模态AI' : 
                     config.modelName?.includes('qwen') ? '高质量多模态AI' : 
                     '未知AI类型'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-green-400 border-green-400">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    {config.modelName ? '已选择' : '未选择'}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      console.log('🔄 手动刷新配置');
                      console.log('当前config:', config);
                      console.log('localModelConfig:', localModelConfig);
                      const saved = localStorage.getItem('modelModeConfig');
                      console.log('localStorage中的配置:', saved ? JSON.parse(saved) : '无');
                    }}
                    className="h-6 px-2 text-xs"
                  >
                    调试
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* 性能优化参数显示 */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-blue-500" />
              <Label className="text-sm font-medium">当前性能配置</Label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-800/50 border border-slate-700/50 rounded-lg">
              <div>
                <Label className="text-xs text-slate-400">上下文长度</Label>
                <div className="text-sm font-mono text-slate-200">{config.contextLength || 32768} tokens</div>
              </div>
              <div>
                <Label className="text-xs text-slate-400">超时时间</Label>
                <div className="text-sm font-mono text-slate-200">{Math.round((config.timeout || 900000) / 1000)}秒</div>
              </div>
              <div>
                <Label className="text-xs text-slate-400">重试次数</Label>
                <div className="text-sm font-mono text-slate-200">{config.retryAttempts || 3}次</div>
              </div>
              <div>
                <Label className="text-xs text-slate-400">内存优化</Label>
                <div className="text-sm font-mono text-slate-200">{config.memoryOptimization ? '启用' : '禁用'}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="model-name">模型名称</Label>
              <Input
                id="model-name"
                value={config.modelName}
                onChange={(e) => setConfig(prev => ({ ...prev, modelName: e.target.value }))}
                placeholder="moondream:latest"
              />
            </div>
            
            <div>
              <Label htmlFor="temperature">温度 (Temperature)</Label>
              <Input
                id="temperature"
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={config.temperature}
                onChange={(e) => setConfig(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="max-tokens">最大令牌数</Label>
              <Input
                id="max-tokens"
                type="number"
                min="1"
                max="4096"
                value={config.maxTokens}
                onChange={(e) => setConfig(prev => ({ ...prev, maxTokens: parseInt(e.target.value) }))}
              />
            </div>
            
            <div>
              <Label htmlFor="top-p">Top P</Label>
              <Input
                id="top-p"
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={config.topP}
                onChange={(e) => setConfig(prev => ({ ...prev, topP: parseFloat(e.target.value) }))}
              />
            </div>
            
            <div>
              <Label htmlFor="top-k">Top K</Label>
              <Input
                id="top-k"
                type="number"
                min="1"
                max="100"
                value={config.topK}
                onChange={(e) => setConfig(prev => ({ ...prev, topK: parseInt(e.target.value) }))}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label htmlFor="handshake-prompt">固定握手提示词</Label>
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              每次新的本地 LLM 请求开始时自动注入，固定定义模型职责、输出要求和判定边界。提示词来源文档：项目根目录 `AGENTS.md`。
            </p>
            <Textarea
              id="handshake-prompt"
              value={LLM_HANDSHAKE_SYSTEM_PROMPT}
              rows={8}
              className="resize-none bg-muted/40 text-muted-foreground"
              readOnly
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label htmlFor="system-prompt">业务补充提示词</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPromptDialog(true)}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                编辑提示词
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              这是可编辑部分，会接在固定握手提示词后面，用于补充当前业务规则和模型偏好。
            </p>
            <Textarea
              id="system-prompt"
              value={config.systemPrompt}
              onChange={(e) => setConfig(prev => ({ ...prev, systemPrompt: e.target.value }))}
              rows={4}
              className="resize-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label htmlFor="user-message">随图片发送的用户消息</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowUserMessageDialog(true)}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                编辑用户消息
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              每次检测图片时都会再次注入，适合放本次检测指令、返回 JSON 要求和图片相关说明。
            </p>
            <Textarea
              id="user-message"
              value={config.userMessage}
              onChange={(e) => setConfig(prev => ({ ...prev, userMessage: e.target.value }))}
              rows={3}
              className="resize-none"
              placeholder="请输入用户消息..."
            />
          </div>
          
          <div className="flex justify-end gap-4">
            <Button
              variant="outline"
              onClick={testLocalModel}
              disabled={!ollamaStatus.isRunning}
            >
              <Zap className="h-4 w-4 mr-2" />
              测试模型
            </Button>
            
            <Button
              onClick={saveConfig}
              disabled={isSaving}
            >
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? '保存中...' : '保存配置'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 提示词编辑对话框 */}
      {showPromptDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl max-h-[80vh] overflow-hidden">
            <CardHeader>
              <CardTitle>编辑业务补充提示词</CardTitle>
              <CardDescription>
                固定握手提示词会自动注入；这里只编辑可追加的业务补充提示词
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={config.systemPrompt}
                onChange={(e) => setConfig(prev => ({ ...prev, systemPrompt: e.target.value }))}
                rows={12}
                className="resize-none"
                placeholder="请输入业务补充提示词..."
              />
            </CardContent>
            <div className="flex justify-end gap-2 p-6 pt-0">
              <Button
                variant="outline"
                onClick={() => setShowPromptDialog(false)}
              >
                取消
              </Button>
              <Button
                onClick={() => {
                  setShowPromptDialog(false);
                  toast.success('提示词已更新');
                }}
              >
                保存
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* 用户消息编辑对话框 */}
      {showUserMessageDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl max-h-[80vh] overflow-hidden">
            <CardHeader>
              <CardTitle>编辑随图片发送的用户消息</CardTitle>
              <CardDescription>
                这部分会在每次发送图片时一起注入，适合写本次检测指令和 JSON 返回要求
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={config.userMessage}
                onChange={(e) => setConfig(prev => ({ ...prev, userMessage: e.target.value }))}
                rows={12}
                className="resize-none"
                placeholder="请输入用户消息..."
              />
            </CardContent>
            <div className="flex justify-end gap-2 p-6 pt-0">
              <Button
                variant="outline"
                onClick={() => setShowUserMessageDialog(false)}
              >
                取消
              </Button>
              <Button
                onClick={() => {
                  setShowUserMessageDialog(false);
                  toast.success('用户消息已更新');
                }}
              >
                保存
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default LocalModelScreen;
