import type { Standard } from '@/types';

export const LLM_HANDSHAKE_SYSTEM_PROMPT = `你是工业质检AI。请检查输入图片是否符合标准要求，并严格只返回 JSON 格式结果。
返回字段限制：
- overallQuality: "合格" | "存疑" | "需复检"
- score: 0-100 整数
- reason: 判定理由（1-2句）
- reasonKeywords: 关键词数组
- defects: 缺陷数组，无缺陷返回 []

返回示例：
{"overallQuality":"合格","score":95,"reason":"未见明显异常，符合检测要求。","reasonKeywords":["正常"],"defects":[]}`;

export const DEFAULT_LLM_TASK_PROMPT = `作为工业质检模型，根据检测要求分析输入图片，并严格只返回 JSON 格式的检验结论。`;

export const DEFAULT_LLM_USER_MESSAGE = `请分析图片是否符合检测标准，并严格只返回符合格式要求的 JSON 结果。`;

function normalizePrompt(prompt?: string | null): string {
  return (prompt || '').trim();
}

export function buildStandardDetailsPrompt(standard?: Standard): string {
  if (!standard) return '';

  const lines = [
    '当前业务检测标准：',
    `- 标准名称: ${standard.name || '未命名标准'}`,
    `- 标准类型: ${standard.type === 'image_based' ? '图像对比' : '规则描述'}`,
    `- 检测要求: ${standard.criteria || standard.requirements || '无'}`,
  ];

  if (standard.qualityCriteria) {
    lines.push(`- 质量标准: ${standard.qualityCriteria}`);
  }

  if (standard.keywords) {
    lines.push(`- OCR关键词: ${standard.keywords}`);
  }

  const defectTypes = Array.isArray(standard.defectTypes)
    ? standard.defectTypes.join(', ')
    : typeof standard.defectTypes === 'string'
      ? standard.defectTypes
      : '';
  if (defectTypes) {
    lines.push(`- 重点缺陷类型: ${defectTypes}`);
  }

  if (standard.inspectionAreas && standard.inspectionAreas.length > 0) {
    lines.push('- 重点检测区域:');
    standard.inspectionAreas.forEach((area) => {
      lines.push(
        `  - ${area.name}: ${area.description || '无描述'} (x:${area.x}, y:${area.y}, w:${area.width}, h:${area.height})`
      );
    });
  }

  if ((standard as any).rois && Array.isArray((standard as any).rois) && (standard as any).rois.length > 0) {
    lines.push('- ROI区域:');
    (standard as any).rois.forEach((roi: any) => {
      lines.push(
        `  - ${roi.label || roi.name || '未命名ROI'} (x:${Math.round(roi.x)}, y:${Math.round(roi.y)}, w:${Math.round(roi.width)}, h:${Math.round(roi.height)})`
      );
    });
  }

  return `\n\n${lines.join('\n')}`;
}

export function composeInspectionSystemPrompt(options: {
  customPrompt?: string;
  standard?: Standard;
}): string {
  const standard = options.standard;
  const isOcrTask = !!(
    standard?.keywords ||
    (standard as any)?.keywordConfigs ||
    (standard as any)?.barcodeConfigs ||
    (standard as any)?.barcode_configs ||
    (standard as any)?.keyword_configs
  );

  const focusClause = isOcrTask
    ? "核对图片中的印刷与OCR文字是否符合标准要求。"
    : "分析图片中的物理外观、特征或装备佩戴状态。不要寻找或虚构照片中不存在的 OCR 文本。";

  const dynamicHandshake = `你是工业质检AI。任务目标：${focusClause}
请严格只返回以下格式的 JSON，不要有任何额外解释或 Markdown 包装：
{
  "overallQuality": "合格" | "存疑" | "需复检",
  "score": 0-100,
  "reason": "判定依据（1-2句）",
  "reasonKeywords": ["关键词"],
  "defects": []
}`;

  const sections = [dynamicHandshake];
  const customPrompt = normalizePrompt(options.customPrompt) || DEFAULT_LLM_TASK_PROMPT;

  sections.push(`当前业务补充要求：\n${customPrompt}`);

  const standardDetails = buildStandardDetailsPrompt(standard);
  if (standardDetails) {
    sections.push(standardDetails.trim());
  }

  return sections.join('\n\n');
}
