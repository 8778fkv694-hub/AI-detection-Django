/**
 * BarcodeSettingsPanel Component
 *
 * 用途：二维码检测设置面板
 * 功能：启用/禁用二维码检测、配置期望二维码、模板管理
 * 使用位置：OCRDetectionScreen
 */

import React from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Switch } from '@/components/ui/Switch';
import { Label } from '@/components/ui/Label';
import { Button } from '@/components/ui/Button';
import type { BarcodeConfig, BarcodeTemplate } from '@/types/ocr';

export interface BarcodeSettingsPanelProps {
  /** 是否启用二维码检测 */
  enableBarcodeDetection: boolean;
  /** 设置面板是否展开 */
  isBarcodeSettingsExpanded: boolean;
  /** 二维码配置列表 */
  barcodeConfigs: BarcodeConfig[];
  /** 二维码模板列表 */
  barcodeTemplates: BarcodeTemplate[];
  /** 模板名称输入值 */
  barcodeTemplateName: string;
  /** 是否显示保存模板输入框 */
  showBarcodeSaveTemplate: boolean;
  /** 是否显示模板列表 */
  showBarcodeTemplateList: boolean;
  /** 设置二维码检测启用状态 */
  setEnableBarcodeDetection: (enabled: boolean) => void;
  /** 设置面板展开状态 */
  setIsBarcodeSettingsExpanded: (expanded: boolean) => void;
  /** 添加二维码配置 */
  addBarcodeConfig: (config: BarcodeConfig) => void;
  /** 更新二维码配置 */
  updateBarcodeConfig: (id: string, updates: Partial<BarcodeConfig>) => void;
  /** 删除二维码配置 */
  removeBarcodeConfig: (id: string) => void;
  /** 设置模板名称 */
  setBarcodeTemplateName: (name: string) => void;
  /** 设置显示保存模板输入框 */
  setShowBarcodeSaveTemplate: (show: boolean) => void;
  /** 设置显示模板列表 */
  setShowBarcodeTemplateList: (show: boolean) => void;
  /** 保存二维码模板 */
  onSaveBarcodeTemplate: () => Promise<void>;
  /** 加载二维码模板 */
  onLoadBarcodeTemplate: (templateId: string) => void;
  /** 删除二维码模板 */
  onDeleteBarcodeTemplate: (templateId: string) => Promise<void>;
  /** 子组件（如SmartPreprocessingPanel） */
  children?: React.ReactNode;

  /** 可用的 检测目标列表 */
  availableTargets: string[];
  /** 获取目标中文名称 */
  getTargetChineseName: (target: string) => string;
}

export const BarcodeSettingsPanel: React.FC<BarcodeSettingsPanelProps> = ({
  enableBarcodeDetection,
  isBarcodeSettingsExpanded,
  barcodeConfigs,
  barcodeTemplates,
  barcodeTemplateName,
  showBarcodeSaveTemplate,
  showBarcodeTemplateList,
  setEnableBarcodeDetection,
  setIsBarcodeSettingsExpanded,
  addBarcodeConfig,
  updateBarcodeConfig,
  removeBarcodeConfig,
  setBarcodeTemplateName,
  setShowBarcodeSaveTemplate,
  setShowBarcodeTemplateList,
  onSaveBarcodeTemplate,
  onLoadBarcodeTemplate,
  onDeleteBarcodeTemplate,
  children,
  availableTargets = [],
  getTargetChineseName = (t) => t,
}) => {
  const handleAddBarcodeConfig = (codeType: 'qr' | 'linear') => {
    const newConfig: BarcodeConfig = {
      id: Date.now().toString(),
      expectedText: '',
      matchMode: 'contains',
      enabled: true,
      targetRoi: undefined,
      codeType,
      ...(codeType === 'linear' ? {
        barcodeFormat: 'auto' as const,
        allowOcrFallback: true,
      } : {}),
    };
    addBarcodeConfig(newConfig);
  };

  return (
    <div className="border-t border-slate-600/50 pt-3 mt-3">
      {/* ... header ... */}
      <div
        className="flex items-center justify-between cursor-pointer hover:bg-slate-700/30 active:bg-slate-700/50 rounded-md p-2 -m-2 transition-colors select-none"
        onClick={() => setIsBarcodeSettingsExpanded(!isBarcodeSettingsExpanded)}
      >
        <div className="flex items-center gap-2">
          <div className="text-xs text-slate-400">二维码/条码检测设置</div>
          <div onClick={(e) => e.stopPropagation()}>
            <Switch
              checked={enableBarcodeDetection}
              onCheckedChange={setEnableBarcodeDetection}
              className="data-[state=checked]:bg-green-600"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            {isBarcodeSettingsExpanded ? '收起' : '展开'}
          </span>
          {isBarcodeSettingsExpanded ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </div>
      </div>

      {/* 可折叠的条码检测设置内容 */}
      <div className={`space-y-3 transition-all duration-300 ease-in-out ${isBarcodeSettingsExpanded ? "max-h-[1000px] overflow-y-auto opacity-100 mt-3" : "max-h-0 overflow-hidden opacity-0 mt-0"
        }`}>
        {/* 条码配置列表 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
          <Label className="text-sm">检验规则</Label>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => handleAddBarcodeConfig('qr')} className="text-xs">
                添加二维码规则
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleAddBarcodeConfig('linear')} className="text-xs">
                添加一维条码规则
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <span>模板管理</span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBarcodeSaveTemplate(!showBarcodeSaveTemplate)}
                className="text-xs px-2 py-1"
              >
                保存模板
              </Button>
              {barcodeTemplates.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowBarcodeTemplateList(!showBarcodeTemplateList)}
                  className="text-xs px-2 py-1"
                >
                  {showBarcodeTemplateList ? '隐藏模板' : '展开模板'}
                </Button>
              )}
            </div>
          </div>

          {showBarcodeSaveTemplate && (
            <div className="p-3 bg-slate-800/40 rounded border border-slate-600/40 space-y-2">
              {/* ... save template UI ... */}
              <Label className="text-xs text-slate-300">保存当前二维码/一维条码规则为模板</Label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={barcodeTemplateName}
                  onChange={(e) => setBarcodeTemplateName(e.target.value)}
                  placeholder="输入模板名称..."
                  className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <Button
                  onClick={() => { void onSaveBarcodeTemplate(); }}
                  size="sm"
                  className="text-xs px-3"
                >
                  保存
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowBarcodeSaveTemplate(false);
                    setBarcodeTemplateName('');
                  }}
                  className="text-xs px-3"
                >
                  取消
                </Button>
              </div>
            </div>
          )}

          {showBarcodeTemplateList && barcodeTemplates.length > 0 && (
            <div className="space-y-2">
              {/* ... template list UI ... */}
              <Label className="text-xs text-slate-400">已保存的条码检验模板</Label>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {barcodeTemplates.map((template) => (
                  <div key={template.id} className="flex items-center justify-between p-2 bg-slate-800/30 rounded border border-slate-600/30">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-200">{template.name}</div>
                      <div className="text-xs text-slate-400">
                        二维码 {template.configs.filter(config => (config.codeType || 'qr') === 'qr').length} 条，
                        一维条码 {template.configs.filter(config => config.codeType === 'linear').length} 条
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onLoadBarcodeTemplate(template.id)}
                        className="text-xs px-2 py-1 h-6"
                      >
                        加载
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { void onDeleteBarcodeTemplate(template.id); }}
                        className="text-xs px-2 py-1 h-6 text-red-400 hover:text-red-300"
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {barcodeConfigs.length === 0 ? (
            <div className="text-xs text-slate-500 text-center py-4">
              暂无规则，请分别添加二维码规则或一维条码规则
            </div>
          ) : (
            <div className="space-y-4">
              {(['qr', 'linear'] as const).map(codeType => {
                const configs = barcodeConfigs.filter(config => (config.codeType || 'qr') === codeType);
                return (
                  <div key={codeType} className="space-y-2">
                    <div className={`text-xs font-medium ${codeType === 'qr' ? 'text-emerald-300' : 'text-cyan-300'}`}>
                      {codeType === 'qr' ? '二维码规则（WeChatQR）' : '一维条码规则（OpenCV + ZBar）'}
                    </div>
                    {configs.length === 0 && (
                      <div className="rounded border border-dashed border-slate-600/50 p-2 text-xs text-slate-500">
                        暂无{codeType === 'qr' ? '二维码' : '一维条码'}规则
                      </div>
                    )}
                    {configs.map(config => (
                      <div key={config.id} className="flex flex-col gap-2 p-2 bg-slate-800/50 rounded border border-slate-600/30">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={config.enabled}
                            onChange={(e) => updateBarcodeConfig(config.id, { enabled: e.target.checked })}
                            className="rounded"
                          />
                          <input
                            type="text"
                            value={config.expectedText}
                            onChange={(e) => updateBarcodeConfig(config.id, { expectedText: e.target.value })}
                            placeholder={codeType === 'qr' ? '期望二维码内容（空=任意）' : '期望条码数字/内容（空=任意）'}
                            className="flex-1 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-slate-100 text-sm"
                          />
                          <select
                            value={config.matchMode}
                            onChange={(e) => updateBarcodeConfig(config.id, { matchMode: e.target.value as 'contains' | 'exact' })}
                            className="px-2 py-1 bg-slate-700 border border-slate-600 rounded text-slate-100 text-sm w-20"
                          >
                            <option value="contains">包含</option>
                            <option value="exact">相同</option>
                          </select>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => removeBarcodeConfig(config.id)}
                            className="text-red-300 border-red-600 hover:bg-red-800 text-xs px-2"
                          >
                            删除
                          </Button>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 pl-6">
                          {codeType === 'linear' && (
                            <>
                              <Label className="text-xs text-slate-400">码制:</Label>
                              <select
                                value={config.barcodeFormat || 'auto'}
                                onChange={(e) => updateBarcodeConfig(config.id, { barcodeFormat: e.target.value as BarcodeConfig['barcodeFormat'] })}
                                className="px-2 py-1 bg-slate-700 border border-slate-600 rounded text-slate-100 text-xs"
                              >
                                <option value="auto">自动识别</option>
                                <option value="code128">Code 128</option>
                                <option value="code39">Code 39</option>
                                <option value="ean13">EAN-13</option>
                                <option value="ean8">EAN-8</option>
                                <option value="upca">UPC-A</option>
                                <option value="upce">UPC-E</option>
                                <option value="itf">ITF</option>
                                <option value="codabar">Codabar</option>
                              </select>
                              <label className="flex items-center gap-1 text-xs text-amber-300">
                                <input
                                  type="checkbox"
                                  checked={config.allowOcrFallback ?? true}
                                  onChange={(e) => updateBarcodeConfig(config.id, { allowOcrFallback: e.target.checked })}
                                />
                                解码失败时允许 OCR 数字兜底
                              </label>
                            </>
                          )}
                          <Label className="text-xs text-slate-400">关联目标:</Label>
                          <select
                            value={config.targetRoi || 'all'}
                            onChange={(e) => updateBarcodeConfig(config.id, { targetRoi: e.target.value === 'all' ? undefined : e.target.value })}
                            className="px-2 py-1 bg-slate-700 border border-slate-600 rounded text-slate-100 text-xs w-40"
                          >
                            <option value="all">所有目标 (默认)</option>
                            {availableTargets.map(target => (
                              <option key={target} value={target}>{getTargetChineseName(target)}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 子组件（如SmartPreprocessingPanel） */}
        {children}
      </div>
    </div>
  );
};

export default BarcodeSettingsPanel;
