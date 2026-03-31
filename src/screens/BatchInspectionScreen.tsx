
import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { useAppStore } from '@/state/appStore';
import { useAIConfigStore } from '@/state/aiConfigStore';
import { Button } from '@/components/ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/Card';
import { Label } from '@/components/ui/Label';
import { Progress } from '@/components/ui/Progress';
import toast from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';
import { Upload, Layers, CheckCircle2, XCircle, Sparkles, FileImage, Trash2, Loader2, Clock, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { analyzeImage } from '@/lib/api';
import { processAndEncodeImage } from '@/lib/imageProcessor';
import { analyzeImageLocalOptimized } from '@/lib/optimizedLocalAI';
import type { InspectionResult } from '@/types';
import { useModelMode } from '@/hooks/useModelMode';
import ModelModeSwitch from '@/components/ModelModeSwitch';

    type FileWithResult = { id: string; file: File & { preview: string }; result: InspectionResult | null; status: 'pending' | 'processing' | 'done' | 'error'; error?: string; };

    const BatchInspectionScreen: React.FC = () => {
        const navigate = useNavigate();
        const [files, setFiles] = useState<FileWithResult[]>([]);
        const [isInspecting, setIsInspecting] = useState(false);
        const [progress, setProgress] = useState(0);
        const [selectedStandardId, setSelectedStandardId] = useState('');
        const [queuePosition, setQueuePosition] = useState(0);
        const [currentProcessing, setCurrentProcessing] = useState<string | null>(null);
        
        const { standards, addResult } = useAppStore();
        const { config } = useAIConfigStore();
        const { localModelConfig, isLocalMode } = useModelMode();
        
        // 监听模型模式变化事件
        useEffect(() => {
            const handleModelModeChange = () => {
                console.log('🔄 批量检测页面 - 模型模式已切换，当前模式:', isLocalMode ? '本地' : '在线');
            };
            
            window.addEventListener('modelModeChanged', handleModelModeChange);
            return () => {
                window.removeEventListener('modelModeChanged', handleModelModeChange);
            };
        }, [isLocalMode]);
        
        // 显示当前图片处理配置
        useEffect(() => {
            console.log('📸 批量检测页面图片配置:', {
                imageWidth: config.imageWidth,
                imageHeight: config.imageHeight,
                compressionQuality: config.compressionQuality,
                compressionEnabled: config.compressionEnabled
            });
        }, [config.imageWidth, config.imageHeight, config.compressionQuality, config.compressionEnabled]);

        const onDrop = useCallback(async (acceptedFiles: File[]) => {
            const newFiles = acceptedFiles.map(file => ({ id: uuidv4(), file: Object.assign(file, { preview: URL.createObjectURL(file) }), result: null, status: 'pending' as 'pending' }));
            setFiles(f => [...f, ...newFiles]);
        }, []);

        const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'image/*': [] } });

        // 图片压缩函数 - 使用配置中的图片尺寸
        const compressImage = useCallback((base64Image: string, maxWidth: number = config.imageWidth, maxHeight: number = config.imageHeight, quality: number = config.compressionQuality): Promise<string> => {
            console.log('🔧 批量检测图片压缩配置:', {
                imageWidth: config.imageWidth,
                imageHeight: config.imageHeight,
                compressionQuality: config.compressionQuality,
                compressionEnabled: config.compressionEnabled,
                maxWidth,
                maxHeight,
                quality
            });
            
            // 如果压缩被禁用，直接返回原图
            if (!config.compressionEnabled) {
                console.log('📷 压缩已禁用，返回原图');
                return Promise.resolve(base64Image);
            }
            
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let { width, height } = img;
                    
                    // 计算压缩后的尺寸
                    if (width > maxWidth || height > maxHeight) {
                        const ratio = Math.min(maxWidth / width, maxHeight / height);
                        width = Math.floor(width * ratio);
                        height = Math.floor(height * ratio);
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.drawImage(img, 0, 0, width, height);
                        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
                        console.log(`📷 图片压缩完成: ${base64Image.length} -> ${compressedDataUrl.length} 字符`);
                        resolve(compressedDataUrl);
                    } else {
                        resolve(base64Image);
                    }
                };
                img.src = base64Image;
            });
        }, [config.imageWidth, config.imageHeight, config.compressionQuality, config.compressionEnabled]);

        // 排队检测逻辑
        const handleInspect = async () => {
            const filesToProcess = files.filter(f => f.status === 'pending');
            if (filesToProcess.length === 0) { toast.error('没有待处理的图片'); return; }
            
            setIsInspecting(true);
            setProgress(0);
            setQueuePosition(0);
            const selectedStandard = standards.find(s => s.id === selectedStandardId);

            // 排队处理每个文件
            for (let i = 0; i < filesToProcess.length; i++) {
                const fileWithResult = filesToProcess[i];
                setCurrentProcessing(fileWithResult.file.name);
                setQueuePosition(i + 1);
                
                setFiles(currentFiles => currentFiles.map(f => f.id === fileWithResult.id ? { ...f, status: 'processing' } : f));
                
                try {
                    // 使用图片压缩
                    const base64Image = await processAndEncodeImage(fileWithResult.file, config);
                    const compressedImage = await compressImage(base64Image);
                    
                    // 根据模式选择分析函数
                    let analysisResult: InspectionResult;
                    if (isLocalMode) {
                        console.log('🔧 使用本地模型进行批量检测');
                        
                        // 确保配置包含所有性能优化参数
                        const optimizedConfig = {
                            ...localModelConfig,
                            contextLength: localModelConfig.contextLength || 32768,
                            timeout: localModelConfig.timeout || 900000,
                            retryAttempts: localModelConfig.retryAttempts || 3,
                            memoryOptimization: localModelConfig.memoryOptimization || false,
                            batchSize: localModelConfig.batchSize || 1
                        };
                        
                        analysisResult = await analyzeImageLocalOptimized(compressedImage, optimizedConfig, selectedStandard);
                    } else {
                        console.log('🌐 使用在线模型进行批量检测');
                        analysisResult = await analyzeImage(compressedImage, config, selectedStandard);
                    }
                    
                    await addResult(analysisResult);
                    setFiles(currentFiles => currentFiles.map(f => f.id === fileWithResult.id ? { ...f, status: 'done', result: analysisResult } : f));
                } catch (e) {
                    const errorMessage = e instanceof Error ? e.message : '未知错误';
                    setFiles(currentFiles => currentFiles.map(f => f.id === fileWithResult.id ? { ...f, status: 'error', error: errorMessage } : f));
                }
                setProgress(((i + 1) / filesToProcess.length) * 100);
            }
            
            setCurrentProcessing(null);
            setIsInspecting(false);
            toast.success('批量检测完成！');
        };
        
        // ... (rest of the component is unchanged, ommitted for brevity)
        // Omitted getStatusContent and the return JSX
        const getStatusContent = (item: FileWithResult) => {
            switch(item.status) {
                case 'processing': return <Loader2 className="h-5 w-5 text-accent animate-spin" />;
                case 'done': return <span className={cn("font-semibold", item.result?.overallQuality === '合格' ? 'text-green-400' : 'text-red-400')}>{item.result?.overallQuality} ({item.result?.score})</span>;
                case 'error': return <XCircle className="h-5 w-5 text-red-500" title={item.error} />;
                default: return <FileImage className="h-5 w-5 text-slate-500" />;
            }
        };

        // 限制显示最近10条结果
        const displayFiles = files.slice(-10);

        return (
            <div className="space-y-6">
                {/* 模型选择区域 */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Sparkles className="h-5 w-5" />
                            批量检测设置
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                            <ModelModeSwitch showLabel={true} showStatus={true} />
                        </div>
                        
                        <div>
                            <Label>检测标准 (可选)</Label>
                            <Select value={selectedStandardId} onValueChange={setSelectedStandardId}>
                                <SelectTrigger className="mt-1">
                                    <SelectValue placeholder="不使用标准模板"/>
                                </SelectTrigger>
                                <SelectContent>
                                    {standards.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
                    {/* 上传区域 */}
                    <Card className="flex flex-col">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Upload className="h-5 w-5" />
                                图片上传
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="flex-grow flex flex-col space-y-4">
                            <div {...getRootProps()} className={`flex-grow flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${isDragActive ? 'border-accent bg-accent/10' : 'border-white/20 hover:border-accent/50'}`}>
                                <input {...getInputProps()} />
                                <Upload className="mx-auto h-12 w-12 text-slate-400"/>
                                <p className="mt-2 text-sm text-slate-400">拖拽或点击上传图片</p>
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Button 
                                onClick={handleInspect} 
                                isLoading={isInspecting} 
                                disabled={files.filter(f => f.status === 'pending').length === 0} 
                                className="w-full !py-3 !text-base"
                            >
                                <Sparkles className="mr-2 h-4 w-4"/>
                                开始检测 ({files.filter(f => f.status === 'pending').length})
                            </Button>
                        </CardFooter>
                    </Card>

                    {/* 检测队列和结果 */}
                    <Card className="flex flex-col">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="flex items-center gap-2">
                                <Clock className="h-5 w-5" />
                                检测队列 ({files.length})
                            </CardTitle>
                            <div className="flex items-center gap-2">
                                {files.filter(f => f.status === 'done').length > 0 && (
                                    <Button 
                                        variant="outline" 
                                        size="sm" 
                                        onClick={() => navigate('/batch-results')}
                                        className="text-xs"
                                    >
                                        查看所有结果
                                    </Button>
                                )}
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={() => setFiles([])} 
                                    disabled={files.length === 0}
                                >
                                    <Trash2 className="mr-2 h-4 w-4"/>
                                    清空队列
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-grow overflow-y-auto pr-2">
                            {/* 进度显示 */}
                            {isInspecting && (
                                <div className="mb-4 space-y-2">
                                    <Progress value={progress} className="w-full" />
                                    <div className="flex items-center justify-between text-sm text-slate-400">
                                        <span>进度: {Math.round(progress)}%</span>
                                        <span>队列位置: {queuePosition}/{files.filter(f => f.status === 'pending').length}</span>
                                    </div>
                                    {currentProcessing && (
                                        <div className="flex items-center gap-2 text-sm text-accent">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            <span>正在处理: {currentProcessing}</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* 文件列表 */}
                            {files.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-slate-500">
                                    <Layers className="h-16 w-16" />
                                    <p className="mt-4">等待上传图片...</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {displayFiles.map(item => (
                                        <div key={item.id} className="flex items-center gap-4 p-3 rounded-lg bg-white/5">
                                            <img 
                                                src={item.file.preview} 
                                                alt={item.file.name} 
                                                className="h-12 w-12 object-cover rounded-md bg-black" 
                                            />
                                            <div className="flex-grow overflow-hidden">
                                                <p className="truncate text-sm font-medium">{item.file.name}</p>
                                                <p className={cn("text-xs", item.status === 'error' ? 'text-red-400' : 'text-slate-400')}>
                                                    {item.status === 'error' ? item.error : item.status}
                                                </p>
                                            </div>
                                            <div className="flex-shrink-0 w-28 text-right">
                                                {getStatusContent(item)}
                                            </div>
                                        </div>
                                    ))}
                                    
                                    {/* 显示更多提示 */}
                                    {files.length > 10 && (
                                        <div className="flex items-center justify-center gap-2 text-sm text-slate-500 py-2">
                                            <AlertCircle className="h-4 w-4" />
                                            <span>仅显示最近10条结果，共{files.length}条</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        );
    };
    export default BatchInspectionScreen;
  