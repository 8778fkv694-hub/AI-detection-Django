/**
 * KeywordSettingsPanel Component
 *
 * 用途：关键词分析设置面板
 * 功能：启用/禁用关键词分析、关键词配置、匹配模式、置信度设置、模板管理
 * 使用位置：OCRDetectionScreen
 */

import React from 'react';
import { Label } from '@/components/ui/Label';
import { Button } from '@/components/ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { TemplateSaveInput } from '@/components/ocr/TemplateSaveInput';
import { TemplateList } from '@/components/ocr/TemplateList';
import type { KeywordConfig, OCRTemplate } from '@/types/ocr';

export interface KeywordSettingsPanelProps {
  /** 是否启用关键词分析 */
  enableKeywordAnalysis: boolean;
  /** 是否显示保存模板输入框 */
  showSaveTemplate: boolean;
  /** 是否显示关键词设置详情 */
  showKeywordSettings: boolean;
  /** 模板名称 */
  templateName: string;
  /** 模板列表 */
  templates: OCRTemplate[];
  /** 关键词文本 */
  keywords: string;
  /** 匹配模式 */
  keywordMatchMode: 'contains' | 'exact';
  /** 关键词配置列表 */
  keywordConfigs: KeywordConfig[];
  /** 全局最小置信度 */
  minConfidence: number;

  /** 设置启用关键词分析 */
  setEnableKeywordAnalysis: (enabled: boolean) => void;
  /** 设置显示保存模板输入框 */
  setShowSaveTemplate: (show: boolean) => void;
  /** 设置显示关键词设置详情 */
  setShowKeywordSettings: (show: boolean) => void;
  /** 设置模板名称 */
  setTemplateName: (name: string) => void;
  /** 设置关键词文本 */
  setKeywords: (keywords: string) => void;
  /** 设置匹配模式 */
  setKeywordMatchMode: (mode: 'contains' | 'exact') => void;
  /** 设置全局最小置信度 */
  setMinConfidence: (confidence: number) => void;

  /** 更新关键词配置 */
  updateKeywordConfigs: (keywordText: string) => void;
  /** 更新单个关键词的类型 */
  updateKeywordType: (keywordId: string, type: 'positive' | 'negative') => void;
  /** 更新单个关键词的需要次数 */
  updateKeywordRequiredCount: (keywordId: string, requiredCount: number) => void;
  /** 更新单个关键词的置信度 */
  updateKeywordConfidence: (keywordId: string, confidence: number) => void;
  /** 更新单个关键词的期望方向 */
  updateKeywordExpectedOrientation: (keywordId: string, orientation: 0 | 90 | 180 | 270 | undefined) => void;
  /** 更新单个关键词的ROI目标 */
  updateKeywordTargetRoi: (keywordId: string, targetRoi: string | undefined) => void;

  /** 可用的 检测目标列表 */
  availableTargets: string[];
  /** 获取目标中文名称 */
  getTargetChineseName: (target: string) => string;

  /** 保存模板 */
  saveTemplate: () => Promise<void>;
  /** 加载模板 */
  loadTemplate: (template: OCRTemplate) => void;
  /** 删除模板 */
  deleteTemplate: (templateId: string) => Promise<void>;
}

export const KeywordSettingsPanel: React.FC<KeywordSettingsPanelProps> = ({
  enableKeywordAnalysis,
  showSaveTemplate,
  showKeywordSettings,
  templateName,
  templates,
  keywords,
  keywordMatchMode,
  keywordConfigs,
  minConfidence,
  setEnableKeywordAnalysis,
  setShowSaveTemplate,
  setShowKeywordSettings,
  setTemplateName,
  setKeywords,
  setKeywordMatchMode,
  setMinConfidence,
  updateKeywordConfigs,
  updateKeywordType,
  updateKeywordRequiredCount,
  updateKeywordConfidence,
  updateKeywordExpectedOrientation,
  updateKeywordTargetRoi,
  availableTargets = [],
  getTargetChineseName = (t) => t,
  saveTemplate,
  loadTemplate,
  deleteTemplate,
}) => {
  return (
    <div className="space-y-4 p-4 bg-slate-800/50 rounded-lg border border-slate-600">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">关键词分析设置</Label>
        <div className="flex items-center gap-3">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={enableKeywordAnalysis}
              onChange={(e) => setEnableKeywordAnalysis(e.target.checked)}
              className="w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-slate-300">启用关键词分析</span>
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSaveTemplate(!showSaveTemplate)}
            className="text-xs px-2 py-1"
          >
            保存模板
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowKeywordSettings(!showKeywordSettings)}
            className="text-xs px-3 py-1"
          >
            {showKeywordSettings ? '收起' : '展开'}设置
          </Button>
        </div>
      </div>

      {/* 保存模板输入框 */}
      <TemplateSaveInput
        isVisible={showSaveTemplate}
        templateName={templateName}
        onTemplateNameChange={setTemplateName}
        onSave={() => { void saveTemplate(); }}
        onCancel={() => setShowSaveTemplate(false)}
      />

      {/* 模板列表 */}
      {showKeywordSettings && (
        <TemplateList
          templates={templates}
          onLoadTemplate={loadTemplate}
          onDeleteTemplate={(templateId) => { void deleteTemplate(templateId); }}
        />
      )}

      {showKeywordSettings && enableKeywordAnalysis && (
        <div className="space-y-3">
          {/* 关键词设置 */}
          <div className="space-y-2">
            <Label htmlFor="keywords">关键词设置 (用逗号分隔)</Label>
            <textarea
              id="keywords"
              value={keywords}
              onChange={(e) => {
                setKeywords(e.target.value);
                updateKeywordConfigs(e.target.value);
              }}
              placeholder="例如: 产品名称,型号,规格 (用逗号分隔多个关键词)"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              rows={2}
            />
          </div>

          {/* 匹配模式 */}
          <div className="space-y-2">
            <Label>匹配模式</Label>
            <div className="flex space-x-4">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="matchMode"
                  value="contains"
                  checked={keywordMatchMode === 'contains'}
                  onChange={(e) => setKeywordMatchMode(e.target.value as 'contains' | 'exact')}
                  className="w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-300">包含匹配</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="matchMode"
                  value="exact"
                  checked={keywordMatchMode === 'exact'}
                  onChange={(e) => setKeywordMatchMode(e.target.value as 'contains' | 'exact')}
                  className="w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-300">完全匹配</span>
              </label>
            </div>
          </div>

          {/* 每个关键词的置信度设置 */}
          {keywordConfigs.length > 0 && (
            <div className="space-y-2">
              <Label>关键词高级设置</Label>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {keywordConfigs.map((config) => {
                  const keywordType = config.type ?? 'positive';
                  const requiredCount = config.requiredCount ?? 1;
                  return (
                    <div key={config.id} className="p-3 bg-slate-700/50 rounded-lg border border-slate-600/50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-slate-200">
                          {config.text}
                        </span>
                        <div className="flex items-center gap-2">
                          {keywordType === 'negative' && (
                            <span className="text-xs px-2 py-0.5 bg-red-500/20 text-red-300 rounded">
                              排除清单
                            </span>
                          )}
                          {keywordType === 'positive' && requiredCount > 1 && (
                            <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded">
                              需{requiredCount}次
                            </span>
                          )}
                          <span className="text-xs text-slate-400">
                            置信度: {config.confidence.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {/* 关键词类型选择 */}
                      <div className="mb-2 flex items-center gap-2">
                        <Label className="text-xs w-20">类型</Label>
                        <Select
                          value={keywordType}
                          onValueChange={(v) => updateKeywordType(config.id, v as 'positive' | 'negative')}
                        >
                          <SelectTrigger className="flex-1 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="positive">正面（必须出现）</SelectItem>
                            <SelectItem value="negative">排除清单（出现即存疑）</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* 次数要求（仅正面关键词显示） */}
                      {keywordType === 'positive' && (
                        <div className="mb-2 flex items-center gap-2">
                          <Label className="text-xs w-20">需要次数</Label>
                          <input
                            type="number"
                            min="1"
                            max="10"
                            value={requiredCount}
                            onChange={(e) => updateKeywordRequiredCount(config.id, parseInt(e.target.value) || 1)}
                            className="flex-1 h-8 px-2 bg-slate-800 border border-slate-600 rounded text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      )}

                      {/* 置信度滑块 */}
                      <div className="mb-2">
                        <Label className="text-xs mb-1 block">置信度阈值</Label>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.1"
                          value={config.confidence}
                          onChange={(e) => updateKeywordConfidence(config.id, parseFloat(e.target.value))}
                          className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer slider"
                        />
                        <div className="flex justify-between text-xs text-slate-400 mt-1">
                          <span>0.0</span>
                          <span>0.5</span>
                          <span>1.0</span>
                        </div>
                      </div>

                      {/* 期望方向 */}
                      <div className="flex items-center gap-2">
                        <Label className="text-xs w-20">期望方向</Label>
                        <Select
                          value={config.expectedOrientation === undefined ? 'none' : String(config.expectedOrientation)}
                          onValueChange={(v) => {
                            if (v === 'none') {
                              updateKeywordExpectedOrientation(config.id, undefined);
                            } else {
                              updateKeywordExpectedOrientation(config.id, Number(v) as 0 | 90 | 180 | 270);
                            }
                          }}
                        >
                          <SelectTrigger className="flex-1 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">关闭（不检查方向）</SelectItem>
                            <SelectItem value="0">→ 右</SelectItem>
                            <SelectItem value="90">↓ 下</SelectItem>
                            <SelectItem value="180">← 左</SelectItem>
                            <SelectItem value="270">↑ 上</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* ROI目标关联 */}
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-600/30">
                        <Label className="text-xs w-20">关联目标</Label>
                        <Select
                          value={config.targetRoi || 'all'}
                          onValueChange={(v) => updateKeywordTargetRoi(config.id, v === 'all' ? undefined : v)}
                        >
                          <SelectTrigger className="flex-1 h-8 text-xs">
                            <SelectValue placeholder="所有目标" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">所有目标 (默认)</SelectItem>
                            {availableTargets.map(target => (
                              <SelectItem key={target} value={target}>
                                {getTargetChineseName(target)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 全局最小置信度 */}
          <div className="space-y-2">
            <Label htmlFor="minConfidence">
              全局最小置信度: {minConfidence.toFixed(2)}
            </Label>
            <input
              id="minConfidence"
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={minConfidence}
              onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer slider"
            />
            <div className="flex justify-between text-xs text-slate-400">
              <span>0.0</span>
              <span>0.5</span>
              <span>1.0</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KeywordSettingsPanel;
