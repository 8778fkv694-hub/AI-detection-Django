
    import React, { useState, useCallback } from 'react';
    import { useDropzone } from 'react-dropzone';
    import { useAppStore } from '@/state/appStore';
    import { useAIConfigStore } from '@/state/aiConfigStore';
    import { Button } from '@/components/ui/Button';
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
    import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
    import { Label } from '@/components/ui/Label';
    import toast from 'react-hot-toast';
    import { v4 as uuidv4 } from 'uuid';
    import { Sparkles, Upload, Layers } from 'lucide-react';
    import { useNavigate } from 'react-router-dom';
    import { toBase64 } from '@/lib/utils';
import { processAndEncodeImage } from '@/lib/imageProcessor';
    
    const InspectionScreen: React.FC = () => {
        const [file, setFile] = useState<File | null>(null);
        const [preview, setPreview] = useState<string | null>(null);
        const [isLoading, setIsLoading] = useState(false);
        const [selectedStandardId, setSelectedStandardId] = useState('');
        const { standards, addResult } = useAppStore();
        const { config } = useAIConfigStore();
        const navigate = useNavigate();
    
        const onDrop = useCallback((acceptedFiles: File[]) => {
            if (acceptedFiles[0]) {
                const f = acceptedFiles[0];
                setFile(f);
                setPreview(URL.createObjectURL(f));
            }
        }, []);
    
        const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'image/*': [] }, multiple: false });
        const selectedStandardName = standards.find(s => s.id === selectedStandardId)?.name;
    
        const handleInspect = async () => {
            if (!file || !preview) { toast.error('请先上传图片'); return; }
            setIsLoading(true);
            const toastId = toast.loading('正在分析...');
            try {
                const pureBase64 = await processAndEncodeImage(file, config);
                const res = await fetch('/api/ai/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: pureBase64, config, standard: standards.find(s => s.id === selectedStandardId) }) });
                if (!res.ok) throw new Error((await res.json()).message || 'AI分析失败');
                const analysisResult = await res.json();
                
                // 转换AI返回的质量等级从英文到中文
                const convertQualityToChinese = (quality: string): '合格' | '存疑' | '需复检' => {
                    const qualityMap: { [key: string]: '合格' | '存疑' | '需复检' } = {
                        'Qualified': '合格',
                        'qualified': '合格',
                        'Pass': '合格',
                        'pass': '合格',
                        'Good': '合格',
                        'good': '合格',
                        'Unqualified': '存疑',
                        'unqualified': '存疑',
                        'Fail': '存疑',
                        'fail': '存疑',
                        'Bad': '存疑',
                        'bad': '存疑',
                        'Recheck': '需复检',
                        'recheck': '需复检',
                        'Review': '需复检',
                        'review': '需复检',
                        'Manual': '需复检',
                        'manual': '需复检',
                        '需人工复核': '需复检',
                        '需复检': '需复检',
                        '合格': '合格',
                        '存疑': '存疑'
                    };
                    return qualityMap[quality] || '需复检';
                };
                
                // 处理AI分析结果，确保质量等级是中文
                const processedResult = {
                    ...analysisResult,
                    overallQuality: analysisResult.overallQuality ? convertQualityToChinese(analysisResult.overallQuality) : 
                                  analysisResult.overall_quality ? convertQualityToChinese(analysisResult.overall_quality) : '需复检'
                };
                
                const result = { 
                    id: uuidv4(), 
                    timestamp: new Date().toISOString(), 
                    image: pureBase64, 
                    standardId: selectedStandardId, 
                    detectionType: selectedStandardId ? 'standard_inspection' : 'general_quality', // 根据是否有标准ID判断检测类型
                    ...processedResult 
                };
                await addResult(result);
                toast.success('分析完成!', { id: toastId });
                navigate('/results');
            } catch (e) {
                toast.error(e instanceof Error ? e.message : '未知错误', { id: toastId });
            } finally {
                setIsLoading(false);
            }
        };
    
        return (
            <div className="max-w-xl mx-auto font-sans">
              <Card>
                <CardHeader>
                  <CardTitle>单件检测</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                      <div {...getRootProps()} className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${isDragActive ? 'border-accent bg-accent/10' : 'border-white/20 hover:border-accent/50'}`}>
                          <input {...getInputProps()} />
                          <Upload className="mx-auto h-12 w-12 text-slate-400"/>
                          <p className="mt-2 text-sm text-slate-400">拖拽或点击上传图片</p>
                      </div>
                      {preview && <div className="bg-black/20 p-2 rounded-md"><img src={preview} alt="预览" className="mx-auto max-h-48 object-contain rounded-sm"/></div>}
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
                          {selectedStandardName && <div className="mt-2 flex items-center gap-2 rounded-md bg-white/10 p-2 text-sm"><Layers className="h-4 w-4 text-slate-400" /><p className="text-slate-300">当前标准: <span className="font-semibold text-foreground">{selectedStandardName}</span></p></div>}
                      </div>
                      <Button onClick={handleInspect} isLoading={isLoading} disabled={!file} className="w-full !py-3 !text-base"><Sparkles className="mr-2 h-4 w-4"/>开始检测</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
        );
    };
    
    export default InspectionScreen;
  