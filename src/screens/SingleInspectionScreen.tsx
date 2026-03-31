
import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { useAppStore } from '@/state/appStore';
import { useAIConfigStore } from '@/state/aiConfigStore';
import { Button } from '@/components/ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/Card';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import toast from 'react-hot-toast';
import { Upload, CheckCircle2, XCircle, AlertCircle, Microscope, Layers, Edit, KeyRound } from 'lucide-react'; // Import KeyRound icon
import { cn } from '@/lib/utils';
import { analyzeImage } from '@/lib/api';
import { processAndEncodeImage } from '@/lib/imageProcessor';
import type { InspectionResult } from '@/types';

const SingleInspectionScreen: React.FC = () => {
    const [imageData, setImageData] = useState<{ file: File; preview: string } | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<InspectionResult | null>(null);
    const [selectedStandardId, setSelectedStandardId] = useState<string | undefined>(undefined);
    const { standards, addResult } = useAppStore();
    const { config } = useAIConfigStore();
    const [finalPrompt, setFinalPrompt] = useState('');

    // This effect correctly pre-fills the editor when a standard is selected.
    // The user's edits after this point are preserved in the `finalPrompt` state.
    useEffect(() => {
        const selectedStandard = standards.find(s => s.id === selectedStandardId);
        let generatedPrompt = config.systemPrompt;

        if (selectedStandard) {
            if (selectedStandard.overrideSystemPrompt) {
                generatedPrompt = selectedStandard.overrideSystemPrompt;
            } else {
                let standardDetails = `\n\n请严格按照以下标准检测：\n- 标准名称: ${selectedStandard.name}\n- 检测要求: ${selectedStandard.criteria || '无'}`;
                generatedPrompt += standardDetails;
            }
        }
        setFinalPrompt(generatedPrompt);
    }, [selectedStandardId, standards, config.systemPrompt]);


    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        if (acceptedFiles[0]) {
            const file = acceptedFiles[0];
            const preview = URL.createObjectURL(file);
            setImageData({ file, preview });
            setResult(null);
        }
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'image/*': [] }, multiple: false });

    const handleInspect = async () => {
        if (!imageData) { toast.error('请先上传图片'); return; }
        if (!finalPrompt) { toast.error('最终提示词不能为空'); return; }
        setIsLoading(true);
        setResult(null);

        try {
            const base64Image = await processAndEncodeImage(imageData.file, config);
            const selectedStandard = standards.find(s => s.id === selectedStandardId);

            // **CRITICAL**: We send the 'finalPrompt' from the state.
            // This state is directly tied to the Textarea, ensuring that the user's edits
            // are what's actually sent to the backend, thus achieving "edit and replace".
            const analysisResult = await analyzeImage(base64Image, config, selectedStandard, finalPrompt);

            // 为检测结果添加检测类型和标准ID
            const resultWithType: InspectionResult = {
                ...analysisResult,
                standardId: selectedStandardId || null,
                detectionType: selectedStandardId ? 'standard_inspection' : 'general_quality'
            };

            setResult(resultWithType);
            await addResult(resultWithType);
            toast.success(`检测完成: ${analysisResult.overallQuality}`);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : '未知错误');
        } finally {
            setIsLoading(false);
        }
    };

    const getStatusInfo = (quality: string) => {
        switch (quality) {
            case '合格': return { icon: CheckCircle2, color: 'text-green-400', bgColor: 'bg-green-900/50' };
            case '存疑': return { icon: XCircle, color: 'text-red-400', bgColor: 'bg-red-900/50' };
            default: return { icon: AlertCircle, color: 'text-amber-400', bgColor: 'bg-amber-900/50' };
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
            <Card className="flex flex-col"><CardHeader><CardTitle>单张图片检测</CardTitle><CardDescription>上传图片，选择标准，并微调提示词以进行精确分析。</CardDescription></CardHeader><CardContent className="flex-grow flex flex-col space-y-4">
                <div {...getRootProps()} className={`h-64 flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${isDragActive ? 'border-accent bg-accent/10' : 'border-white/20 hover:border-accent/50'}`}>
                    <input {...getInputProps()} />
                    {imageData ? <img src={imageData.preview} alt="Preview" className="max-h-full max-w-full object-contain rounded-md" /> : <><Upload className="mx-auto h-12 w-12 text-slate-400" /><p className="mt-2 text-sm text-slate-400">拖拽或点击上传图片</p></>}
                </div>
                <div><Label>检测标准 (可选)</Label><Select value={selectedStandardId} onValueChange={setSelectedStandardId}><SelectTrigger className="mt-1"><SelectValue placeholder="不使用标准模板" /></SelectTrigger><SelectContent>{standards.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
                <div className="flex-grow flex flex-col"><Label htmlFor="final-prompt" className="flex items-center mb-1"><Edit className="h-4 w-4 mr-2" />最终提示词预览与编辑</Label><Textarea id="final-prompt" value={finalPrompt} onChange={(e) => setFinalPrompt(e.target.value)} className="flex-grow w-full h-full min-h-[150px] bg-black/20" /></div>
            </CardContent><CardFooter><Button onClick={handleInspect} isLoading={isLoading} disabled={!imageData} className="w-full !py-3 !text-base"><Microscope className="mr-2 h-4 w-4" />开始检测</Button></CardFooter></Card>
            <Card className="flex flex-col"><CardHeader><CardTitle>检测结果</CardTitle></CardHeader><CardContent className="flex-grow overflow-y-auto pr-2">
                {!result ? <div className="flex flex-col items-center justify-center h-full text-slate-500"><Layers className="h-16 w-16" /><p className="mt-4">等待检测结果...</p></div> : <div className="space-y-4">
                    <div className="flex justify-between items-center p-4 rounded-lg bg-white/5">
                        <div className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1 text-lg font-semibold", getStatusInfo(result.overallQuality).bgColor, getStatusInfo(result.overallQuality).color)}>
                            {React.createElement(getStatusInfo(result.overallQuality).icon, { className: "h-5 w-5" })}
                            {result.overallQuality}
                        </div>
                        <span className="font-mono text-xl font-bold">{result.score}分</span>
                    </div>
                    {/* **NEW**: Display Reason Keywords */}
                    {result.reasonKeywords && <div className="p-4 rounded-lg bg-white/5 space-y-2"><div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-accent" /><Label>原因关键词</Label></div><p className="text-sm text-slate-300 pl-6">{result.reasonKeywords}</p></div>}
                    <div className="p-4 rounded-lg bg-white/5 space-y-1"><Label>核心理由</Label><p className="text-sm text-slate-300">{result.reason}</p></div>
                    {result.defects && result.defects.length > 0 && <div className="p-4 rounded-lg bg-white/5 space-y-2"><Label>缺陷列表 ({result.defects.length})</Label>{result.defects.map((defect, i) => <div key={i} className="text-xs border-l-2 border-red-500/50 pl-2"><p><strong>类型:</strong> {defect.type} ({defect.severity})</p><p><strong>描述:</strong> {defect.description}</p></div>)}</div>}
                </div>}
            </CardContent></Card>
        </div>
    );
};
export default SingleInspectionScreen;
