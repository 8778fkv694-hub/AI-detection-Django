
import React, { useState, useEffect, useMemo, useRef } from 'react'; // **STEP 1: Import useRef**
import { useAppStore } from '@/state/appStore';
import { useAIConfigStore } from '@/state/aiConfigStore';
import type { Standard, InspectionArea } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Label } from '@/components/ui/Label';
import { Card } from '@/components/ui/Card';
import { ImagePlus, Trash2, Search, PlusCircle, Pencil, Info, Settings } from 'lucide-react';
import toast from 'react-hot-toast';
import { Switch } from '@/components/ui/Switch';
import ROISelector from '@/components/ROISelector';
import { TemplateDefectTypeManager } from '@/components/TemplateDefectTypeManager';

const StandardSetupScreen: React.FC = () => {
  const { standards, addStandard, updateStandard, deleteStandard } = useAppStore();
  const { config: aiConfig } = useAIConfigStore();
  const [selectedStandard, setSelectedStandard] = useState<Standard | null>(null);
  const [formState, setFormState] = useState<Partial<Standard>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [isOverrideActive, setIsOverrideActive] = useState(false);
  const [sendStandardImage, setSendStandardImage] = useState(false);
  const [showDefectTypeManager, setShowDefectTypeManager] = useState(false);

  // **STEP 2: Create a ref for the hidden file input**
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectedStandard) {
      setFormState(selectedStandard);
      setIsOverrideActive(!!selectedStandard.overrideSystemPrompt);
      setSendStandardImage(!!selectedStandard.sendStandardImage);
    } else {
      setFormState({});
      setIsOverrideActive(false);
      setSendStandardImage(false);
    }
  }, [selectedStandard]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (event) => setFormState(prev => ({ ...prev, standardImage: (event.target?.result as string).split(',')[1] }));
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const handleAreasChange = (areas: InspectionArea[]) => {
    setFormState(prev => ({ ...prev, inspectionAreas: areas }));
  };

  const handleSave = async () => {
    if (!formState.name) {
      toast.error('模板名称不能为空');
      return;
    }

    let finalFormState = { ...formState };
    if (!isOverrideActive) {
      delete finalFormState.overrideSystemPrompt;
    }

    // 添加是否发送标准图片的配置
    finalFormState.sendStandardImage = sendStandardImage;

    if (selectedStandard) {
      await updateStandard(finalFormState as Standard);
      toast.success('模板更新成功');
    } else {
      await addStandard(finalFormState as Omit<Standard, 'id'>);
      toast.success('模板创建成功');
      setFormState({});
    }
  };

  const handleNew = () => {
    setSelectedStandard(null);
    setFormState({});
  };

  const handleDeleteStandard = async (id: string) => {
    if (window.confirm('确定要删除这个模板吗？')) {
      await deleteStandard(id);
      toast.success('模板已删除');
      if (selectedStandard?.id === id) {
        handleNew();
      }
    }
  };

  const filteredStandards = standards.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));

  // 辅助函数：根据坐标生成位置描述
  const getPositionDescription = (area: InspectionArea) => {
    const { x, y, width, height } = area;

    // 确定水平位置
    let horizontalPos = '';
    if (x < 0.33) horizontalPos = '左侧';
    else if (x < 0.67) horizontalPos = '中央';
    else horizontalPos = '右侧';

    // 确定垂直位置
    let verticalPos = '';
    if (y < 0.33) verticalPos = '上方';
    else if (y < 0.67) verticalPos = '中部';
    else verticalPos = '下方';

    // 确定区域大小
    let sizeDesc = '';
    const areaSize = width * height;
    if (areaSize < 0.05) sizeDesc = '小区域';
    else if (areaSize < 0.15) sizeDesc = '中等区域';
    else sizeDesc = '大区域';

    return `${horizontalPos}${verticalPos}的${sizeDesc}`;
  };

  const finalPromptPreview = useMemo(() => {
    if (isOverrideActive && formState.overrideSystemPrompt) {
      return formState.overrideSystemPrompt;
    }

    let standardDetails = `- 标准名称: ${formState.name || '未命名'}\n- 附加标准: ${formState.criteria || '无'}`;

    // 添加模板特定的缺陷类型信息
    if (formState.defectTypes) {
      try {
        const defectTypesConfig = JSON.parse(formState.defectTypes);
        if (defectTypesConfig.defectTypes && defectTypesConfig.defectTypes.length > 0) {
          standardDetails += `\n- 模板缺陷类型定义:\n`;
          defectTypesConfig.defectTypes.forEach((type: any, index: number) => {
            standardDetails += `  ${index + 1}. ${type.name} (${type.category}): ${type.description}\n`;
          });

          if (defectTypesConfig.severities && defectTypesConfig.severities.length > 0) {
            standardDetails += `\n- 严重程度定义:\n`;
            defectTypesConfig.severities.forEach((severity: any, index: number) => {
              standardDetails += `  ${index + 1}. ${severity.name} (级别${severity.level}): ${severity.description}\n`;
            });
          }
        }
      } catch (error) {
        console.error('解析缺陷类型配置失败:', error);
      }
    }

    // 添加ROI区域信息到提示词
    if (formState.inspectionAreas && formState.inspectionAreas.length > 0) {
      standardDetails += `\n- 重点关注区域:\n`;
      formState.inspectionAreas.forEach((area, index) => {
        const position = getPositionDescription(area);
        standardDetails += `  ${index + 1}. ${area.name}: ${area.description || '无描述'} (位于${position})\n`;

        // 添加缺陷类型配置信息
        if (area.defectTypes && area.defectTypes.length > 0) {
          standardDetails += `     关注缺陷类型: ${area.defectTypes.join(', ')}\n`;
          standardDetails += `     严重程度阈值: ${area.severityThreshold || '轻微'}\n`;
          standardDetails += `     区域重要性: ${area.importance || '中'}\n`;
        }
      });
      standardDetails += `\n请特别关注上述标注的区域，这些是检测的重点。`;

      // 添加区域位置描述
      standardDetails += `\n\n区域位置参考：`;
      formState.inspectionAreas.forEach((area, index) => {
        const position = getPositionDescription(area);
        standardDetails += `\n  ${index + 1}. ${area.name}: 位于${position}`;
      });

      // 根据是否发送标准图片，添加不同的检测说明
      if (sendStandardImage) {
        standardDetails += `\n\n检测说明：我将提供标准图片和检测图片，请对比两张图片，重点关注上述ROI区域，检查是否存在缺陷或不符合标准的情况。`;
      } else {
        standardDetails += `\n\n检测说明：请根据上述ROI区域的位置和描述信息，仔细检查检测图片中对应区域，判断是否符合标准要求。`;
      }
    }

    return aiConfig.systemPrompt + `\n\n请严格按照以下标准检测：\n${standardDetails}`;
  }, [formState.name, formState.criteria, formState.defectTypes, formState.inspectionAreas, sendStandardImage, aiConfig.systemPrompt, isOverrideActive, formState.overrideSystemPrompt]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[calc(100vh-100px)]">
      {/* 左侧面板 */}
      <div className="bg-background-secondary rounded-lg p-4 flex flex-col gap-4">
        <Button onClick={handleNew}><PlusCircle size={16} className="mr-2" /> 新建模板</Button>
        <Button
          variant="outline"
          onClick={() => setShowDefectTypeManager(true)}
        >
          <Settings size={16} className="mr-2" /> 模板缺陷类型
        </Button>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="搜索模板..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
        </div>
        <div className="flex-grow overflow-y-auto pr-2 space-y-2 border-t border-slate-700/50 pt-4">
          {filteredStandards.map(s => (
            <div key={s.id} onClick={() => setSelectedStandard(s)} className={`flex justify-between items-center p-3 rounded-md cursor-pointer transition-colors ${selectedStandard?.id === s.id ? 'bg-accent/20 text-accent border border-accent/30' : 'hover:bg-accent/10 hover:text-accent'}`}>
              <div className="flex-1 min-w-0">
                <span className="font-medium truncate block">{s.name}</span>
                <div className="text-xs opacity-70 space-y-1">
                  {s.inspectionAreas && s.inspectionAreas.length > 0 && (
                    <div>包含 {s.inspectionAreas.length} 个ROI区域</div>
                  )}
                  {s.defectTypes && (
                    <div>包含自定义缺陷类型配置</div>
                  )}
                </div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); handleDeleteStandard(s.id); }} className={`text-muted-foreground hover:text-red-500 transition-colors ${selectedStandard?.id === s.id ? 'text-accent hover:text-red-400' : ''}`}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      </div>

      {/* 右侧面板 */}
      <div className="md:col-span-2 bg-background-secondary rounded-lg p-6 overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">{selectedStandard ? '编辑模板' : '新建模板'}</h2>
        <div className="space-y-6">
          <div><Label htmlFor="standard-name">模板名称</Label><Input id="standard-name" value={formState.name || ''} onChange={e => setFormState(prev => ({ ...prev, name: e.target.value }))} /></div>
          <div><Label htmlFor="standard-criteria">检测要求/附加标准</Label><Textarea id="standard-criteria" value={formState.criteria || ''} onChange={e => setFormState(prev => ({ ...prev, criteria: e.target.value }))} rows={3} /></div>

          {/* **STEP 3: The refactored and robust image upload block** */}
          <div>
            <Label>标准图 (可选)</Label>
            <Card className="mt-2 p-4 flex items-center gap-4 bg-background">
              {formState.standardImage ? <img src={`data:image/jpeg;base64,${formState.standardImage}`} alt="Standard" className="w-20 h-20 object-cover rounded-md" /> : <div className="w-20 h-20 bg-black/20 rounded-md flex items-center justify-center"><ImagePlus className="text-slate-400" /></div>}
              <div className="flex-grow">
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  上传图片
                </Button>
                <input
                  ref={fileInputRef}
                  id="image-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                />
                <p className="text-xs text-slate-400 mt-2">上传一张标准图片作为参考。</p>
              </div>
              {formState.standardImage && <Button variant="ghost" size="icon" onClick={() => setFormState(prev => ({ ...prev, standardImage: undefined }))}><Trash2 className="h-4 w-4" /></Button>}
            </Card>
          </div>

          {/* 检测配置选项 */}
          {formState.standardImage && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="send-standard-image" className="flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  检测时发送标准图片
                </Label>
                <Switch
                  id="send-standard-image"
                  checked={sendStandardImage}
                  onCheckedChange={setSendStandardImage}
                />
              </div>
              <p className="text-xs text-slate-400">
                {sendStandardImage
                  ? "开启：每次检测时会发送标准图片给AI，提高检测精度但增加传输成本"
                  : "关闭：仅使用ROI区域信息，减少传输成本但可能影响检测精度"
                }
              </p>
            </div>
          )}

          {/* ROI区域标注 */}
          {formState.standardImage && (
            <ROISelector
              imageUrl={`data:image/jpeg;base64,${formState.standardImage}`}
              areas={formState.inspectionAreas || []}
              onAreasChange={handleAreasChange}
              templateDefectTypes={formState.defectTypes ? JSON.parse(formState.defectTypes).defectTypes || [] : []}
              templateSeverities={formState.defectTypes ? JSON.parse(formState.defectTypes).severities || [] : []}
            />
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="override-prompt-switch" className="flex items-center gap-2"><Pencil className="h-4 w-4" />最终提示词</Label>
              <div className="flex items-center gap-2"><Label htmlFor="override-prompt-switch" className="text-sm text-slate-400">自定义</Label><Switch id="override-prompt-switch" checked={isOverrideActive} onCheckedChange={setIsOverrideActive} /></div>
            </div>
            <Textarea
              value={isOverrideActive ? formState.overrideSystemPrompt || finalPromptPreview : finalPromptPreview}
              onChange={e => { if (isOverrideActive) setFormState(prev => ({ ...prev, overrideSystemPrompt: e.target.value })) }}
              readOnly={!isOverrideActive}
              rows={8}
              className={`transition-all ${!isOverrideActive ? 'bg-black/20 focus:ring-0 focus:ring-offset-0 cursor-not-allowed' : ''}`}
              placeholder={isOverrideActive ? "请在此处输入完整的最终提示词..." : "最终提示词将在此预览..."}
            />
          </div>

          <div className="flex justify-end"><Button onClick={handleSave} className="w-full md:w-auto">保存模板</Button></div>
        </div>
      </div>

      {/* 模板缺陷类型管理器 */}
      {showDefectTypeManager && (
        <TemplateDefectTypeManager
          onClose={() => setShowDefectTypeManager(false)}
          onSave={(defectTypes, severities) => {
            // 将缺陷类型和严重程度保存到模板中
            const defectTypesConfig = {
              defectTypes,
              severities
            };
            setFormState(prev => ({
              ...prev,
              defectTypes: JSON.stringify(defectTypesConfig)
            }));
            setShowDefectTypeManager(false);
          }}
          initialDefectTypes={formState.defectTypes ? JSON.parse(formState.defectTypes).defectTypes || [] : []}
          initialSeverities={formState.defectTypes ? JSON.parse(formState.defectTypes).severities || [] : []}
        />
      )}
    </div>
  );
};

export default StandardSetupScreen;
