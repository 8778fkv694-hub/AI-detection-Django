/**
 * FusionModeSettingsPanel Component
 *
 * 用途：融合模式设置面板
 * 功能：启用/禁用融合模式、选择提示词模版、AI模型模式切换、测试按钮
 * 使用位置：OCRDetectionScreen
 */

import React from 'react';
import { Brain } from 'lucide-react';
import { Switch } from '@/components/ui/Switch';
import { Label } from '@/components/ui/Label';
import { Button } from '@/components/ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import ModelModeSwitch from '@/components/ModelModeSwitch';
import { apiFetch, directBackendFetch } from '@/lib/config';

interface Standard {
  id: string;
  name: string;
  keywords?: string;
}

type MatchStatus = 'none' | 'qualified' | 'unqualified';

export interface FusionModeSettingsPanelProps {
  /** 融合模式是否启用 */
  fusionModeEnabled: boolean;
  /** 选中的标准ID */
  selectedStandardId: string | null | undefined;
  /** 可用的标准列表 */
  standards: Standard[];
  /** 是否为本地模式 */
  isLocalMode: boolean;
  /** AI配置 */
  config: unknown;
  /** 本地模型配置 */
  localModelConfig: unknown;
  /** 设置融合模式启用状态 */
  setFusionModeEnabled: (enabled: boolean) => void;
  /** 设置选中的标准ID */
  setSelectedStandardId: (id: string) => void;
  /** 设置OCR结果（测试用）- 使用类型断言兼容调用方 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setOcrResult: (result: any) => void;
  /** 设置匹配状态（测试用） */
  setMatchStatus: (status: MatchStatus) => void;
  /** 执行融合模式AI分析 */
  performFusionAIAnalysis: (base64Data: string) => Promise<unknown>;
}

export const FusionModeSettingsPanel: React.FC<FusionModeSettingsPanelProps> = ({
  fusionModeEnabled,
  selectedStandardId,
  standards,
  isLocalMode,
  config,
  localModelConfig,
  setFusionModeEnabled,
  setSelectedStandardId,
  setOcrResult,
  setMatchStatus,
  performFusionAIAnalysis,
}) => {
  const handleTestStatus = () => {
    console.log('🧪 测试融合模式状态:');
    console.log('🧪 fusionModeEnabled:', fusionModeEnabled);
    console.log('🧪 selectedStandardId:', selectedStandardId);
    console.log('🧪 isLocalMode:', isLocalMode);
    console.log('🧪 config:', config);
    console.log('🧪 localModelConfig:', localModelConfig);
    console.log('🧪 standards:', standards);
  };

  const handleTestConnection = async () => {
    console.log('🔗 开始AI连接测试...');
    try {
      if (isLocalMode) {
        console.log('🔗 测试本地模型连接...');
        const response = await directBackendFetch('/ollama/status/');
        if (response.ok) {
          const health = await response.json();
          console.log('✅ 本地模型连接正常:', health);
        } else {
          console.error('❌ 本地模型连接失败:', response.status);
        }
      } else {
        console.log('🔗 测试在线模型连接...');
        const response = await apiFetch('/ai-configs/test-connection/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config })
        });
        if (response.ok) {
          const result = await response.json();
          console.log('✅ 在线模型连接正常:', result);
        } else {
          const error = await response.text();
          console.error('❌ 在线模型连接失败:', response.status, error);
        }
      }
    } catch (error) {
      console.error('❌ AI连接测试失败:', error);
    }
  };

  const handleTestAnalysis = async () => {
    console.log('🧪 开始简单AI分析测试...');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, 1, 1);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        const base64Data = dataUrl.split(',')[1];

        console.log('🧪 测试图片大小:', base64Data.length);

        const result = await performFusionAIAnalysis(base64Data);
        if (result) {
          console.log('✅ 简单AI分析测试成功:', result);
        } else {
          console.log('❌ 简单AI分析测试失败：返回null');
        }
      }
    } catch (error) {
      console.error('❌ 简单AI分析测试失败:', error);
    }
  };

  const handleAutoTest = async () => {
    console.log('🚀 开始自动融合模式测试...');

    // 步骤1：检查融合模式状态
    console.log('📋 步骤1：检查融合模式状态');
    if (!fusionModeEnabled) {
      console.log('❌ 融合模式未启用，请先开启融合模式');
      alert('请先开启融合模式再进行测试');
      return;
    }

    if (!selectedStandardId) {
      console.log('❌ 未选择提示词模版，请先选择模版');
      alert('请先选择提示词模版再进行测试');
      return;
    }

    console.log('✅ 融合模式状态检查通过');

    // 步骤2：创建测试图片
    console.log('📋 步骤2：创建测试图片');
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      console.error('❌ 无法创建canvas上下文');
      return;
    }

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 200, 200);
    ctx.fillStyle = 'black';
    ctx.font = '20px Arial';
    ctx.fillText('测试图片', 50, 100);
    ctx.fillText('Test Image', 50, 130);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    const base64Data = dataUrl.split(',')[1];
    console.log('✅ 测试图片创建完成，大小:', base64Data.length);

    // 步骤3：模拟OCR检测
    console.log('📋 步骤3：模拟OCR检测');
    const mockOcrResult = {
      success: true,
      full_text: '测试图片 Test Image',
      detailed_results: [
        { text: '测试图片', confidence: 0.95, bbox: [[10, 80], [120, 80], [120, 100], [10, 100]] },
        { text: 'Test Image', confidence: 0.92, bbox: [[10, 110], [130, 110], [130, 130], [10, 130]] }
      ],
      text_count: 2
    };

    setOcrResult(mockOcrResult);
    const mockMatchStatus: MatchStatus = 'qualified';
    setMatchStatus(mockMatchStatus);
    console.log('✅ OCR检测模拟完成');

    // 步骤4：执行融合模式AI分析
    console.log('📋 步骤4：执行融合模式AI分析');
    try {
      const aiResult = await performFusionAIAnalysis(base64Data) as { overallQuality: string } | null;
      if (aiResult) {
        console.log('✅ AI分析完成:', aiResult);

        // 步骤5：显示综合结果
        console.log('📋 步骤5：综合结果判断');
        const ocrQualified = mockMatchStatus === 'qualified';
        const llmQualified = aiResult.overallQuality === '合格';
        const finalResult = ocrQualified && llmQualified;

        console.log('🔍 最终测试结果:');
        console.log('  - OCR结果:', mockMatchStatus, '(合格:', ocrQualified, ')');
        console.log('  - LLM结果:', aiResult.overallQuality, '(合格:', llmQualified, ')');
        console.log('  - 综合结果:', finalResult ? '合格' : '存疑');

        alert(`融合模式测试完成！\n\nOCR结果: ${mockMatchStatus}\nLLM结果: ${aiResult.overallQuality}\n综合结果: ${finalResult ? '合格' : '存疑'}`);
      } else {
        console.log('❌ AI分析失败：返回null');
        alert('AI分析失败，请检查控制台日志');
      }
    } catch (error) {
      console.error('❌ AI分析过程中出错:', error);
      alert('AI分析过程中出错，请检查控制台日志');
    }

    console.log('🎉 自动融合模式测试完成');
  };

  return (
    <div className="space-y-3 border-t border-slate-600/30 pt-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-purple-400" />
          <Label className="text-sm">融合模式</Label>
        </div>
        <Switch
          checked={fusionModeEnabled}
          onCheckedChange={setFusionModeEnabled}
          className="data-[state=checked]:bg-purple-600"
        />
      </div>

      {fusionModeEnabled && (
        <div className="space-y-3 pl-6 border-l-2 border-purple-500/30">
          <div className="space-y-2">
            <Label className="text-sm text-purple-300">提示词模版</Label>
            <Select value={selectedStandardId || ''} onValueChange={setSelectedStandardId}>
              <SelectTrigger className="w-full h-8 bg-slate-800 border-slate-600">
                <SelectValue placeholder="选择检测标准" />
              </SelectTrigger>
              <SelectContent>
                {standards.map(standard => (
                  <SelectItem key={standard.id} value={standard.id}>
                    {standard.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 模型模式切换开关 */}
          <div className="space-y-2">
            <Label className="text-sm text-purple-300">AI模型模式</Label>
            <ModelModeSwitch
              className="w-full"
              showLabel={false}
              showStatus={true}
            />
          </div>

          <div className="text-xs text-slate-400">
            融合模式：OCR检测完成后，将图片压缩后传给LLM进行智能分析
          </div>

          {/* 测试按钮 */}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleTestStatus}
              className="text-xs"
            >
              测试状态
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => { void handleTestConnection(); }}
              className="text-xs"
            >
              测试连接
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => { void handleTestAnalysis(); }}
              className="text-xs"
            >
              测试分析
            </Button>

            <Button
              size="sm"
              variant="default"
              onClick={() => { void handleAutoTest(); }}
              className="text-xs bg-purple-600 hover:bg-purple-700"
            >
              自动测试
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FusionModeSettingsPanel;
