
import React, { useState, useEffect } from 'react'; import { useParams, useNavigate } from 'react-router-dom'; import { useAppStore } from '@/state/appStore'; import { useStandardStore } from '@/state/standardStore'; import { useAIConfigStore } from '@/state/aiConfigStore'; import { InspectionResult, Standard, AnalysisResult } from '@/types'; import toast from 'react-hot-toast'; import { Button } from '@/components/ui/Button'; import { Textarea } from '@/components/ui/Textarea'; import { ArrowLeft, Sparkles, Loader2 } from 'lucide-react'; import { v4 as uuidv4 } from 'uuid'; import { enhanceAnalyzeResult } from '@/lib/api';
const ResultDisplay: React.FC<{ result: AnalysisResult }> = ({ result }) => (<div className="bg-slate-50 p-4 rounded-lg space-y-2 text-sm"><p><strong>质量:</strong> <span className={result.overallQuality === '合格' ? 'text-green-600' : 'text-red-600'}>{result.overallQuality}</span></p><p><strong>分数:</strong> {result.score}</p><p><strong>理由:</strong> {result.reason}</p><p><strong>缺陷:</strong> {result.defects?.length || 0}个</p></div>);
const EnhancedInspectionScreen: React.FC = () => {
    const { resultId } = useParams<{ resultId: string }>(); const navigate = useNavigate();
    const { addResult, results } = useAppStore();
    const { standards } = useStandardStore();
    const { config } = useAIConfigStore();
    const [originalResult, setOriginalResult] = useState<InspectionResult | null>(null); const [standard, setStandard] = useState<Standard | null>(null); const [enhancedResult, setEnhancedResult] = useState<AnalysisResult | null>(null); const [supplementaryPrompt, setSupplementaryPrompt] = useState(''); const [isLoading, setIsLoading] = useState(false);
    useEffect(() => {
        if (resultId) {
            const result = results.find(r => r.id === resultId);
            if (result) {
                setOriginalResult(result);
                if (result.standardId) {
                    const foundStandard = standards.find(s => s.id === result.standardId) || null;
                    setStandard(foundStandard);
                    // **NEW**: Pre-fill the prompt with the standard's criteria
                    if (foundStandard?.criteria) {
                        setSupplementaryPrompt(foundStandard.criteria);
                    }
                }
            }
        }
    }, [resultId, results, standards]);
    const handleEnhance = async () => {
        if (!originalResult || !supplementaryPrompt) { toast.error('请输入补充指令！'); return; }
        setIsLoading(true); const toastId = toast.loading('正在进行增强分析...');
        try {
            const res = await enhanceAnalyzeResult({ originalResult, standard, supplementaryPrompt, config });
            if (!res.ok) throw new Error('增强分析失败');
            const analysisResult = await res.json();
            const pureBase64 = originalResult.image && originalResult.image.startsWith('data:') ? originalResult.image.split(',')[1] : originalResult.image || '';
            const newResult: InspectionResult = {
                ...originalResult,
                id: uuidv4(),
                timestamp: new Date().toISOString(),
                image: pureBase64,
                isEnhancedInspection: true,
                originalResultId: originalResult.id,
                overallQuality: analysisResult.overallQuality,
                score: analysisResult.score,
                reason: analysisResult.reason,
                defects: analysisResult.defects
            };
            await addResult(newResult); setEnhancedResult(analysisResult); toast.success('增强分析完成！', { id: toastId }); navigate('/results');
        } catch (e) { toast.error(e instanceof Error ? e.message : '未知错误', { id: toastId }); } finally { setIsLoading(false); }
    };
    if (!originalResult) return <div className="flex justify-center items-center h-full"><Loader2 className="animate-spin h-8 w-8" /></div>;
    const originalImageSrc = originalResult.image && originalResult.image.startsWith('data:') ? originalResult.image : originalResult.image ? `data:image/jpeg;base64,${originalResult.image}` : '';
    return <div className="animate-fade-in"><Button onClick={() => navigate(-1)} variant="ghost" className="mb-4"><ArrowLeft size={16} className="mr-2" /> 返回</Button><h1 className="text-2xl font-bold mb-4">二次增强检验</h1><div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><div><h2 className="font-semibold mb-2">原始结果</h2><img src={originalImageSrc} className="rounded-lg shadow-md w-full mb-4" /><ResultDisplay result={originalResult as any} /></div><div><h2 className="font-semibold mb-2">增强分析</h2><div className="bg-muted/20 border border-border p-4 rounded-lg space-y-4"><div><label htmlFor="prompt" className="font-medium text-sm">补充提示词 / 修正指令</label><Textarea id="prompt" value={supplementaryPrompt} onChange={(e) => setSupplementaryPrompt(e.target.value)} placeholder="例如：请重点检查左上角的划痕，并重新评估严重性。" rows={4} className="mt-1" /></div><Button onClick={handleEnhance} isLoading={isLoading} className="w-full"><Sparkles size={16} className="mr-2" />开始增强分析</Button>{enhancedResult && <div className="mt-4 pt-4 border-t"><h3 className="font-semibold mb-2">增强分析结果</h3><ResultDisplay result={enhancedResult} /></div>}</div></div></div></div>;
};
export default EnhancedInspectionScreen;
