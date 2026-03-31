/**
 * 预处理结果对比展示组件
 */

import React, { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { 
  Eye, 
  EyeOff, 
  Download, 
  RotateCcw, 
  BarChart3,
  CheckCircle,
  XCircle,
  TrendingUp,
  Clock,
  Zap
} from 'lucide-react';

interface ComparisonResult {
  original: {
    imageData: string;
    detectionResult: any;
    processingTime: number;
    successRate: number;
  };
  processed: {
    imageData: string;
    detectionResult: any;
    processingTime: number;
    successRate: number;
  };
  improvement: {
    timeReduction: number;
    successIncrease: number;
    overallImprovement: number;
  };
}

interface ResultComparisonProps {
  comparisonResult: ComparisonResult | null;
  onSaveParameters: (params: any) => void;
  onRetry: () => void;
}

const ResultComparison: React.FC<ResultComparisonProps> = ({
  comparisonResult,
  onSaveParameters,
  onRetry
}) => {
  const [showOriginal, setShowOriginal] = useState(true);
  const [activeTab, setActiveTab] = useState<'visual' | 'metrics' | 'details'>('visual');

  if (!comparisonResult) {
    return (
      <Card className="p-6 bg-slate-800/70 backdrop-blur-sm border border-slate-700 shadow-lg">
        <div className="text-center py-8">
          <div className="p-4 bg-gradient-to-r from-slate-700 to-slate-600 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <BarChart3 className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-200 mb-2">结果对比</h3>
          <p className="text-sm text-slate-400">
            完成预处理和检测后，将显示详细的对比结果
          </p>
        </div>
      </Card>
    );
  }

  const { original, processed, improvement } = comparisonResult;

  const MetricCard: React.FC<{
    title: string;
    originalValue: number | string;
    processedValue: number | string;
    unit?: string;
    isImprovement?: boolean;
    icon: React.ReactNode;
    color: string;
  }> = ({ title, originalValue, processedValue, unit = '', isImprovement = false, icon, color }) => {
    const improvementValue = typeof originalValue === 'number' && typeof processedValue === 'number' 
      ? processedValue - originalValue 
      : 0;
    
    return (
      <div className={`p-4 rounded-xl border transition-colors ${
        isImprovement && improvementValue > 0 
          ? 'bg-green-900/20 border-green-500/30' 
          : 'bg-slate-700/50 border-slate-600'
      }`}>
        <div className="flex items-center space-x-3 mb-3">
          <div className={`p-2 rounded-lg ${
            isImprovement && improvementValue > 0 
              ? 'bg-green-600/20 text-green-400' 
              : 'bg-slate-600/20 text-slate-400'
          }`}>
            {icon}
          </div>
          <h4 className="text-sm font-semibold text-slate-200">{title}</h4>
        </div>
        
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">处理前</span>
            <span className="text-sm font-medium text-slate-300">
              {originalValue}{unit}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">处理后</span>
            <span className={`text-sm font-bold ${
              isImprovement && improvementValue > 0 ? 'text-green-400' : 'text-slate-200'
            }`}>
              {processedValue}{unit}
            </span>
          </div>
          
          {isImprovement && typeof improvementValue === 'number' && (
            <div className="flex items-center justify-between pt-2 border-t border-slate-600">
              <span className="text-xs text-slate-400">改善</span>
              <span className={`text-xs font-medium ${
                improvementValue > 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {improvementValue > 0 ? '+' : ''}{improvementValue.toFixed(1)}{unit}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <Card className="p-6 bg-slate-800/70 backdrop-blur-sm border border-slate-700 shadow-lg">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg">
            <BarChart3 className="h-5 w-5 text-white" />
          </div>
          <h2 className="text-lg font-semibold text-slate-100">结果对比</h2>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowOriginal(!showOriginal)}
            className="bg-slate-700 hover:bg-slate-600 border-slate-600 text-slate-200"
          >
            {showOriginal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="bg-slate-700 hover:bg-slate-600 border-slate-600 text-slate-200"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 标签页 */}
      <div className="flex items-center space-x-1 mb-6 bg-slate-700/50 rounded-lg p-1">
        {[
          { id: 'visual', label: '视觉对比', icon: <Eye className="h-4 w-4" /> },
          { id: 'metrics', label: '性能指标', icon: <TrendingUp className="h-4 w-4" /> },
          { id: 'details', label: '详细信息', icon: <BarChart3 className="h-4 w-4" /> }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* 内容区域 */}
      {activeTab === 'visual' && (
        <div className="space-y-6">
          {/* 图片对比 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center space-x-2 mb-3">
                <div className="w-3 h-3 bg-orange-400 rounded-full"></div>
                <h3 className="text-sm font-semibold text-slate-200">原始图片</h3>
              </div>
              <div className="relative group">
                <img
                  src={original.imageData}
                  alt="原始图片"
                  className="w-full h-auto rounded-xl shadow-lg border border-slate-600"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-slate-800/90 backdrop-blur-sm border-slate-600 text-slate-200"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    下载
                  </Button>
                </div>
              </div>
            </div>
            
            <div>
              <div className="flex items-center space-x-2 mb-3">
                <div className="w-3 h-3 bg-green-400 rounded-full"></div>
                <h3 className="text-sm font-semibold text-slate-200">预处理后</h3>
              </div>
              <div className="relative group">
                <img
                  src={processed.imageData}
                  alt="预处理后图片"
                  className="w-full h-auto rounded-xl shadow-lg border border-slate-600"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-slate-800/90 backdrop-blur-sm border-slate-600 text-slate-200"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    下载
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* 检测结果对比 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-4 bg-orange-900/20 border border-orange-500/30 rounded-xl">
              <h4 className="text-sm font-semibold text-orange-300 mb-3">原始检测结果</h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">检测状态</span>
                  <div className="flex items-center space-x-2">
                    {original.detectionResult.success ? (
                      <CheckCircle className="h-4 w-4 text-green-400" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-400" />
                    )}
                    <span className={`text-sm font-medium ${
                      original.detectionResult.success ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {original.detectionResult.success ? '成功' : '失败'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">检测数量</span>
                  <span className="text-sm text-slate-200">
                    {original.detectionResult.codes?.length || 0} 个
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">成功率</span>
                  <span className="text-sm text-slate-200">
                    {original.successRate.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-green-900/20 border border-green-500/30 rounded-xl">
              <h4 className="text-sm font-semibold text-green-300 mb-3">预处理后检测结果</h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">检测状态</span>
                  <div className="flex items-center space-x-2">
                    {processed.detectionResult.success ? (
                      <CheckCircle className="h-4 w-4 text-green-400" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-400" />
                    )}
                    <span className={`text-sm font-medium ${
                      processed.detectionResult.success ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {processed.detectionResult.success ? '成功' : '失败'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">检测数量</span>
                  <span className="text-sm text-slate-200">
                    {processed.detectionResult.codes?.length || 0} 个
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">成功率</span>
                  <span className="text-sm text-green-400 font-bold">
                    {processed.successRate.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'metrics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <MetricCard
              title="处理时间"
              originalValue={original.processingTime}
              processedValue={processed.processingTime}
              unit="ms"
              isImprovement={true}
              icon={<Clock className="h-4 w-4" />}
              color="blue"
            />
            <MetricCard
              title="检测成功率"
              originalValue={original.successRate}
              processedValue={processed.successRate}
              unit="%"
              isImprovement={true}
              icon={<CheckCircle className="h-4 w-4" />}
              color="green"
            />
            <MetricCard
              title="检测数量"
              originalValue={original.detectionResult.codes?.length || 0}
              processedValue={processed.detectionResult.codes?.length || 0}
              unit="个"
              isImprovement={true}
              icon={<Zap className="h-4 w-4" />}
              color="purple"
            />
            <MetricCard
              title="整体改善"
              originalValue={0}
              processedValue={improvement.overallImprovement}
              unit="%"
              isImprovement={true}
              icon={<TrendingUp className="h-4 w-4" />}
              color="orange"
            />
          </div>

          {/* 改善总结 */}
          <div className="p-4 bg-gradient-to-r from-green-900/20 to-emerald-900/20 border border-green-500/30 rounded-xl">
            <h4 className="text-sm font-semibold text-green-300 mb-3">改善总结</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">时间减少</span>
                <span className="text-sm text-green-400 font-medium">
                  {improvement.timeReduction > 0 ? '-' : '+'}{Math.abs(improvement.timeReduction).toFixed(1)}ms
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">成功率提升</span>
                <span className="text-sm text-green-400 font-medium">
                  +{improvement.successIncrease.toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">整体改善</span>
                <span className="text-sm text-green-400 font-bold">
                  +{improvement.overallImprovement.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'details' && (
        <div className="space-y-6">
          {/* 详细检测结果 */}
          <div>
            <h4 className="text-sm font-semibold text-slate-200 mb-3">检测到的二维码详情</h4>
            <div className="space-y-3">
              {processed.detectionResult.codes?.map((code: any, index: number) => (
                <div key={index} className="p-4 bg-slate-700/50 border border-slate-600 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-slate-200">二维码 #{index + 1}</span>
                    <span className="text-xs text-slate-400">
                      置信度: {(code.confidence * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-slate-300 font-mono bg-slate-800 px-2 py-1 rounded">
                      {code.data}
                    </div>
                    {code.location && (
                      <div className="text-xs text-slate-400">
                        位置: ({code.location.x}, {code.location.y}) 
                        大小: {code.location.width}×{code.location.height}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 参数记录 */}
          <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded-xl">
            <h4 className="text-sm font-semibold text-blue-300 mb-3">使用的预处理参数</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">亮度调整</span>
                <span className="text-sm text-slate-200">+20</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">对比度增强</span>
                <span className="text-sm text-slate-200">+30</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">锐化强度</span>
                <span className="text-sm text-slate-200">60</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">旋转角度</span>
                <span className="text-sm text-slate-200">-5°</span>
              </div>
            </div>
            
            <div className="mt-4 pt-4 border-t border-slate-600">
              <Button
                onClick={() => onSaveParameters({})}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Download className="h-4 w-4 mr-2" />
                保存此参数配置
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

export default ResultComparison;
