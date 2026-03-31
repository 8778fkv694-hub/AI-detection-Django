
import React from 'react'; import { AnalysisResult, Defect } from '@/types'; import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'; import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
const ResultDisplay: React.FC<{ result: AnalysisResult }> = ({ result }) => {
  const getStatusStyle = (status: AnalysisResult['overallQuality']) => {
    switch (status) {
      case '合格': return { icon: <CheckCircle2 className="h-6 w-6 text-success" />, color: 'text-success' };
      case '存疑': return { icon: <XCircle className="h-6 w-6 text-destructive" />, color: 'text-destructive' };
      case '需复检': return { icon: <AlertTriangle className="h-6 w-6 text-yellow-500" />, color: 'text-yellow-500' };
      case '存疑': return { icon: <AlertTriangle className="h-6 w-6 text-orange-500" />, color: 'text-orange-500' };
      default: return { icon: null, color: '' };
    }
  };
  const { icon, color } = getStatusStyle(result.overallQuality);
  return (
    <div className="space-y-4 animate-fade-in">
      <Card><CardHeader><div className="flex items-center justify-between"><CardTitle>综合评估</CardTitle><div className={`flex items-center gap-2 text-xl font-bold ${color}`}>{icon}{result.overallQuality}</div></div></CardHeader><CardContent className="space-y-2"><p><strong>分数:</strong> <span className={`font-semibold ${color}`}>{result.score} / 100</span></p><p><strong>理由:</strong> {result.reason}</p></CardContent></Card>
      <Card><CardHeader><CardTitle>缺陷列表 ({(result.defects?.length ?? 0)})</CardTitle></CardHeader><CardContent>{(result.defects?.length ?? 0) > 0 ? <ul className="space-y-3">{result.defects!.map((defect: Defect, index: number) => <li key={index} className="p-3 bg-secondary/50 rounded-md border"><p><strong>类型:</strong> {defect.type}</p><p><strong>描述:</strong> {defect.description}</p><p><strong>严重性:</strong> {defect.severity}</p></li>)}</ul> : <p className="text-muted-foreground">未发现明显缺陷。</p>}</CardContent></Card>
    </div>
  );
};
export default ResultDisplay;
