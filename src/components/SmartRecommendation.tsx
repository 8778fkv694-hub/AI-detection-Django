/**
 * 智能预处理推荐组件
 */

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { 
  Lightbulb, 
  Zap, 
  TrendingUp, 
  CheckCircle, 
  AlertTriangle,
  Settings,
  RotateCw,
  Contrast,
  Sun,
  Eye
} from 'lucide-react';
import { ImageQualityAnalyzer, ImageQualityMetrics, PreprocessingRecommendation } from '@/lib/imageQualityAnalyzer';
import { analyzeImageQuality } from '@/lib/imagePreprocessingApi';

interface SmartRecommendationProps {
  imageData: ImageData | null;
  onApplyRecommendation: (recommendation: PreprocessingRecommendation) => void;
  onShowDetails: () => void;
}

interface QualityIndicatorProps {
  label: string;
  value: number;
  threshold: number;
  icon: React.ReactNode;
  color: string;
}

const QualityIndicator: React.FC<QualityIndicatorProps> = ({ 
  label, 
  value, 
  threshold, 
  icon, 
}) => {
  const isGood = value >= threshold;
  
  return (
    <div className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors ${
      isGood 
        ? 'bg-green-900/20 border-green-500/30' 
        : 'bg-orange-900/20 border-orange-500/30'
    }`}>
      <div className={`p-2 rounded-lg ${
        isGood ? 'bg-green-600/20 text-green-400' : 'bg-orange-600/20 text-orange-400'
      }`}>
        {icon}
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-200">{label}</span>
          <span className={`text-sm font-bold ${
            isGood ? 'text-green-400' : 'text-orange-400'
          }`}>
            {value.toFixed(1)}
          </span>
        </div>
        <div className="mt-1">
          <div className="w-full bg-slate-700 rounded-full h-2">
            <div 
              className={`h-2 rounded-full transition-all duration-300 ${
                isGood ? 'bg-green-400' : 'bg-orange-400'
              }`}
              style={{ width: `${Math.min(100, value)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

const SmartRecommendation: React.FC<SmartRecommendationProps> = ({
  imageData,
  onApplyRecommendation,
  onShowDetails
}) => {
  const [metrics, setMetrics] = useState<ImageQualityMetrics | null>(null);
  const [recommendation, setRecommendation] = useState<PreprocessingRecommendation | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisComplete, setAnalysisComplete] = useState(false);

  // 分析图片质量
  useEffect(() => {
    if (imageData && !analysisComplete) {
      analyzeImage();
    }
  }, [imageData]);

  const analyzeImage = async () => {
    if (!imageData) return;

    setIsAnalyzing(true);
    
    try {
      // 将ImageData转换为base64
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = imageData.width;
      canvas.height = imageData.height;
      ctx.putImageData(imageData, 0, 0);
      const base64Data = canvas.toDataURL('image/jpeg', 0.8);

      // 使用后端API分析图片质量
      const qualityResult = await analyzeImageQuality(base64Data);
      
      if (qualityResult.success && qualityResult.metrics) {
        // 转换后端指标格式为前端格式
        const qualityMetrics: ImageQualityMetrics = {
          brightness: qualityResult.metrics.brightness,
          contrast: qualityResult.metrics.contrast,
          sharpness: qualityResult.metrics.sharpness,
          noise: qualityResult.metrics.noise,
          rotation: 0, // 后端暂不支持
          skew: 0,
          perspective: 0,
          colorVariance: 0,
          saturation: 0,
          qrDetectability: Math.min(100, (qualityResult.metrics.sharpness / 100) * 80 + (qualityResult.metrics.contrast / 50) * 20),
          edgeClarity: qualityResult.metrics.sharpness,
          backgroundComplexity: qualityResult.metrics.noise
        };

        // 生成推荐
        const recommendation = ImageQualityAnalyzer.generateRecommendation(qualityMetrics);
        
        // 如果有后端推荐，优先使用
        if (qualityResult.recommendations && qualityResult.recommendations.length > 0) {
          const backendRec = qualityResult.recommendations[0];
          recommendation.parameters = {
            ...recommendation.parameters,
            [backendRec.type]: backendRec.value
          };
          recommendation.confidence = Math.max(recommendation.confidence, backendRec.confidence * 100);
        }

        setMetrics(qualityMetrics);
        setRecommendation(recommendation);
        setAnalysisComplete(true);
      } else {
        throw new Error(qualityResult.error || '分析失败');
      }
    } catch (error) {
      console.error('图片质量分析失败:', error);
      // 回退到前端分析
      try {
        const qualityMetrics = await ImageQualityAnalyzer.analyzeImageQuality(imageData);
        const recommendation = ImageQualityAnalyzer.generateRecommendation(qualityMetrics);
        
        setMetrics(qualityMetrics);
        setRecommendation(recommendation);
        setAnalysisComplete(true);
      } catch (fallbackError) {
        console.error('前端分析也失败:', fallbackError);
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getPresetIcon = (preset: string) => {
    switch (preset) {
      case 'brightness': return <Sun className="h-4 w-4" />;
      case 'contrast': return <Contrast className="h-4 w-4" />;
      case 'sharpness': return <Eye className="h-4 w-4" />;
      case 'rotation': return <RotateCw className="h-4 w-4" />;
      case 'denoise': return <Settings className="h-4 w-4" />;
      case 'binary': return <CheckCircle className="h-4 w-4" />;
      default: return <Zap className="h-4 w-4" />;
    }
  };

  const getPresetName = (preset: string) => {
    switch (preset) {
      case 'brightness': return '亮度优化';
      case 'contrast': return '对比度增强';
      case 'sharpness': return '清晰度提升';
      case 'rotation': return '旋转校正';
      case 'denoise': return '噪点去除';
      case 'binary': return '二值化处理';
      case 'auto': return '智能优化';
      default: return '自定义处理';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-green-400';
    if (confidence >= 60) return 'text-yellow-400';
    return 'text-orange-400';
  };

  const getConfidenceBg = (confidence: number) => {
    if (confidence >= 80) return 'bg-green-600/20 border-green-500/30';
    if (confidence >= 60) return 'bg-yellow-600/20 border-yellow-500/30';
    return 'bg-orange-600/20 border-orange-500/30';
  };

  if (!imageData) {
    return (
      <Card className="p-6 bg-slate-800/70 backdrop-blur-sm border border-slate-700 shadow-lg">
        <div className="text-center py-8">
          <div className="p-4 bg-gradient-to-r from-slate-700 to-slate-600 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <Lightbulb className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-200 mb-2">智能推荐</h3>
          <p className="text-sm text-slate-400">
            上传图片后，AI将自动分析质量并推荐最佳预处理方案
          </p>
        </div>
      </Card>
    );
  }

  if (isAnalyzing) {
    return (
      <Card className="p-6 bg-slate-800/70 backdrop-blur-sm border border-slate-700 shadow-lg">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-400 border-t-transparent mx-auto mb-4"></div>
          <h3 className="text-lg font-semibold text-slate-200 mb-2">AI分析中...</h3>
          <p className="text-sm text-slate-400">
            正在分析图片质量，生成智能推荐方案
          </p>
        </div>
      </Card>
    );
  }

  if (!metrics || !recommendation) {
    return (
      <Card className="p-6 bg-slate-800/70 backdrop-blur-sm border border-slate-700 shadow-lg">
        <div className="text-center py-8">
          <AlertTriangle className="h-12 w-12 text-orange-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-200 mb-2">分析失败</h3>
          <p className="text-sm text-slate-400 mb-4">
            无法分析图片质量，请重新上传图片
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={analyzeImage}
            className="bg-slate-700 hover:bg-slate-600 border-slate-600 text-slate-200"
          >
            重新分析
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 bg-slate-800/70 backdrop-blur-sm border border-slate-700 shadow-lg">
      <div className="flex items-center space-x-3 mb-6">
        <div className="p-2 bg-gradient-to-r from-yellow-500 to-orange-600 rounded-lg">
          <Lightbulb className="h-5 w-5 text-white" />
        </div>
        <h2 className="text-lg font-semibold text-slate-100">AI智能推荐</h2>
      </div>

      <div className="space-y-6">
        {/* 推荐方案 */}
        <div className={`p-4 rounded-xl border-2 transition-all duration-200 ${getConfidenceBg(recommendation.confidence)}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-3">
              <div className={`p-2 rounded-lg ${
                recommendation.confidence >= 80 ? 'bg-green-600/20 text-green-400' :
                recommendation.confidence >= 60 ? 'bg-yellow-600/20 text-yellow-400' :
                'bg-orange-600/20 text-orange-400'
              }`}>
                {getPresetIcon(recommendation.recommendedPreset)}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-200">
                  {getPresetName(recommendation.recommendedPreset)}
                </h3>
                <p className="text-xs text-slate-400">
                  置信度: <span className={getConfidenceColor(recommendation.confidence)}>
                    {recommendation.confidence.toFixed(1)}%
                  </span>
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center space-x-2 text-xs text-slate-400">
                <TrendingUp className="h-3 w-3" />
                <span>预期提升 {recommendation.expectedImprovement}%</span>
              </div>
              <div className="text-xs text-slate-400">
                成功率 {recommendation.successProbability}%
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <Button
              onClick={() => onApplyRecommendation(recommendation)}
              className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold"
            >
              <Zap className="h-4 w-4 mr-2" />
              一键优化
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onShowDetails}
              className="bg-slate-700 hover:bg-slate-600 border-slate-600 text-slate-200"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* 质量指标 */}
        <div>
          <h3 className="text-sm font-semibold text-slate-200 mb-3">质量分析</h3>
          <div className="grid grid-cols-1 gap-3">
            <QualityIndicator
              label="亮度"
              value={metrics.brightness}
              threshold={80}
              icon={<Sun className="h-4 w-4" />}
              color="yellow"
            />
            <QualityIndicator
              label="对比度"
              value={metrics.contrast}
              threshold={40}
              icon={<Contrast className="h-4 w-4" />}
              color="blue"
            />
            <QualityIndicator
              label="清晰度"
              value={metrics.sharpness}
              threshold={50}
              icon={<Eye className="h-4 w-4" />}
              color="green"
            />
            <QualityIndicator
              label="二维码可检测性"
              value={metrics.qrDetectability}
              threshold={60}
              icon={<CheckCircle className="h-4 w-4" />}
              color="purple"
            />
          </div>
        </div>

        {/* 问题提示 */}
        {metrics.qrDetectability < 60 && (
          <div className="p-4 bg-orange-900/20 border border-orange-500/30 rounded-xl">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="h-5 w-5 text-orange-400 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-orange-300 mb-1">检测难度较高</h4>
                <p className="text-xs text-orange-200">
                  当前图片的二维码可检测性较低，建议使用推荐的预处理方案来提高检测成功率。
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

export default SmartRecommendation;
