/**
 * 图片预处理操作流程组件
 */

import React, { useState, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { 
  Upload, 
  Search, 
  Settings, 
  Play, 
  CheckCircle, 
  ArrowRight,
  RotateCw,
  Eye,
  Download,
  BarChart3
} from 'lucide-react';
import { ImageQualityAnalyzer, ImageQualityMetrics, PreprocessingRecommendation } from '@/lib/imageQualityAnalyzer';
import { preprocessImage, smartPreprocess, PreprocessingOptions } from '@/lib/imagePreprocessingApi';

interface WorkflowStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  status: 'pending' | 'active' | 'completed' | 'error';
  data?: any;
}

interface PreprocessingWorkflowProps {
  imageFile: File | null;
  imagePreview: string | null;
  onProcessedImage: (processedImageData: string) => void;
  onDetectionResult: (result: any) => void;
}

const PreprocessingWorkflow: React.FC<PreprocessingWorkflowProps> = ({
  imageFile,
  imagePreview,
  onProcessedImage,
  onDetectionResult
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [steps, setSteps] = useState<WorkflowStep[]>([
    {
      id: 'upload',
      title: '上传图片',
      description: '选择或拖拽图片文件',
      icon: <Upload className="h-5 w-5" />,
      status: 'pending'
    },
    {
      id: 'analyze',
      title: '预览分析',
      description: 'AI分析图片质量',
      icon: <Search className="h-5 w-5" />,
      status: 'pending'
    },
    {
      id: 'preprocess',
      title: '选择预处理方案',
      description: '选择或自定义预处理参数',
      icon: <Settings className="h-5 w-5" />,
      status: 'pending'
    },
    {
      id: 'adjust',
      title: '参数微调',
      description: '精细调整预处理参数',
      icon: <RotateCw className="h-5 w-5" />,
      status: 'pending'
    },
    {
      id: 'apply',
      title: '应用处理',
      description: '执行预处理操作',
      icon: <Play className="h-5 w-5" />,
      status: 'pending'
    },
    {
      id: 'detect',
      title: '执行检测',
      description: '进行二维码检测',
      icon: <CheckCircle className="h-5 w-5" />,
      status: 'pending'
    }
  ]);

  const [qualityMetrics, setQualityMetrics] = useState<ImageQualityMetrics | null>(null);
  const [recommendation, setRecommendation] = useState<PreprocessingRecommendation | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // 更新步骤状态
  const updateStepStatus = useCallback((stepId: string, status: WorkflowStep['status'], data?: any) => {
    setSteps(prev => prev.map(step => 
      step.id === stepId ? { ...step, status, data } : step
    ));
  }, []);

  // 自动进入下一步
  const nextStep = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  }, [currentStep, steps.length]);

  // 处理图片上传
  const handleImageUpload = useCallback(() => {
    updateStepStatus('upload', 'completed');
    updateStepStatus('analyze', 'active');
    nextStep();
  }, [updateStepStatus, nextStep]);

  // 分析图片质量
  const handleAnalyzeImage = useCallback(async () => {
    if (!imageFile) return;

    try {
      // 创建ImageData
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const img = new Image();
      img.onload = async () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // 分析质量
        const metrics = await ImageQualityAnalyzer.analyzeImageQuality(imageData);
        const rec = ImageQualityAnalyzer.generateRecommendation(metrics);

        setQualityMetrics(metrics);
        setRecommendation(rec);
        updateStepStatus('analyze', 'completed', { metrics, recommendation: rec });
        updateStepStatus('preprocess', 'active');
        nextStep();
      };
      img.src = imagePreview || '';
    } catch (error) {
      console.error('图片分析失败:', error);
      updateStepStatus('analyze', 'error');
    }
  }, [imageFile, imagePreview, updateStepStatus, nextStep]);

  // 应用预处理
  const handleApplyPreprocessing = useCallback(async (params: PreprocessingOptions) => {
    if (!imagePreview) return;

    setIsProcessing(true);
    updateStepStatus('apply', 'active');

    try {
      // 调用后端预处理API
      const result = await preprocessImage(imagePreview, params);
      
      if (result.success && result.processed_image) {
        setProcessedImage(result.processed_image);
        onProcessedImage(result.processed_image);
        
        updateStepStatus('apply', 'completed');
        updateStepStatus('detect', 'active');
        nextStep();
      } else {
        throw new Error(result.error || '预处理失败');
      }
    } catch (error) {
      console.error('预处理失败:', error);
      updateStepStatus('apply', 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [imagePreview, updateStepStatus, nextStep, onProcessedImage]);

  // 执行检测
  const handleDetection = useCallback(async () => {
    updateStepStatus('detect', 'active');

    try {
      // 模拟检测过程
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // 这里应该调用实际的检测函数
      const result = { success: true, codes: [] }; // 占位实现
      onDetectionResult(result);
      
      updateStepStatus('detect', 'completed');
    } catch (error) {
      console.error('检测失败:', error);
      updateStepStatus('detect', 'error');
    }
  }, [updateStepStatus, onDetectionResult]);

  // 重置流程
  const resetWorkflow = useCallback(() => {
    setCurrentStep(0);
    setSteps(prev => prev.map(step => ({ ...step, status: 'pending' })));
    setQualityMetrics(null);
    setRecommendation(null);
    setProcessedImage(null);
  }, []);

  const getStepIcon = (step: WorkflowStep) => {
    const baseClasses = "h-5 w-5";
    
    switch (step.status) {
      case 'completed':
        return <CheckCircle className={`${baseClasses} text-green-400`} />;
      case 'active':
        return <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-400 border-t-transparent" />;
      case 'error':
        return <div className={`${baseClasses} text-red-400`}>!</div>;
      default:
        return React.cloneElement(step.icon as React.ReactElement, { 
          className: `${baseClasses} text-slate-400` 
        });
    }
  };

  const getStepClasses = (step: WorkflowStep, index: number) => {
    const baseClasses = "flex items-center space-x-4 p-4 rounded-xl border transition-all duration-200";
    
    if (step.status === 'completed') {
      return `${baseClasses} bg-green-900/20 border-green-500/30`;
    }
    if (step.status === 'active') {
      return `${baseClasses} bg-blue-900/20 border-blue-500/30 shadow-lg`;
    }
    if (step.status === 'error') {
      return `${baseClasses} bg-red-900/20 border-red-500/30`;
    }
    if (index <= currentStep) {
      return `${baseClasses} bg-slate-700/50 border-slate-600`;
    }
    return `${baseClasses} bg-slate-800/30 border-slate-700`;
  };

  return (
    <Card className="p-6 bg-slate-800/70 backdrop-blur-sm border border-slate-700 shadow-lg">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg">
            <BarChart3 className="h-5 w-5 text-white" />
          </div>
          <h2 className="text-lg font-semibold text-slate-100">预处理流程</h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={resetWorkflow}
          className="bg-slate-700 hover:bg-slate-600 border-slate-600 text-slate-200"
        >
          <RotateCw className="h-4 w-4 mr-2" />
          重置
        </Button>
      </div>

      <div className="space-y-4">
        {steps.map((step, index) => (
          <div key={step.id} className={getStepClasses(step, index)}>
            <div className="flex items-center justify-center w-8 h-8">
              {getStepIcon(step)}
            </div>
            
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200">
                  {step.title}
                </h3>
                {step.status === 'active' && (
                  <div className="text-xs text-blue-400 font-medium">
                    进行中...
                  </div>
                )}
                {step.status === 'completed' && (
                  <div className="text-xs text-green-400 font-medium">
                    已完成
                  </div>
                )}
                {step.status === 'error' && (
                  <div className="text-xs text-red-400 font-medium">
                    失败
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {step.description}
              </p>
            </div>

            {index < steps.length - 1 && (
              <ArrowRight className="h-4 w-4 text-slate-500" />
            )}
          </div>
        ))}
      </div>

      {/* 操作按钮 */}
      <div className="mt-6 pt-6 border-t border-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {currentStep === 0 && imageFile && (
              <Button
                onClick={handleImageUpload}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
              >
                <Upload className="h-4 w-4 mr-2" />
                确认上传
              </Button>
            )}
            
            {currentStep === 1 && qualityMetrics && (
              <Button
                onClick={handleAnalyzeImage}
                className="bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 text-white"
              >
                <Search className="h-4 w-4 mr-2" />
                开始分析
              </Button>
            )}
            
            {currentStep === 2 && recommendation && (
              <Button
                onClick={() => handleApplyPreprocessing(recommendation.parameters)}
                disabled={isProcessing}
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                    处理中...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    应用处理
                  </>
                )}
              </Button>
            )}
            
            {currentStep === 5 && (
              <Button
                onClick={handleDetection}
                className="bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                执行检测
              </Button>
            )}
          </div>

          <div className="text-xs text-slate-400">
            步骤 {currentStep + 1} / {steps.length}
          </div>
        </div>
      </div>
    </Card>
  );
};

export default PreprocessingWorkflow;
