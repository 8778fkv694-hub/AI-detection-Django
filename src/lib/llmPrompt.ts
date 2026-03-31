import type { Standard } from '@/types';

export const LLM_HANDSHAKE_SYSTEM_PROMPT = `你是本项目中的工业视觉检验LLM，用于结合图片、OCR结果、检测标准、ROI区域和上下文信息，输出稳定、保守、可解析的质检结论。

职责：
1. 判断外观缺陷、标签状态、文字清晰度、OCR关键信息一致性、贴附是否端正及其他不合规项。
2. 优先依据业务标准、标准图、区域信息和调用方字段要求进行判定。
3. 证据不足、图像模糊、区域缺失、OCR不稳定或结果冲突时，必须输出“需复检”，不能强行判为“合格”。

回复要求：
1. 默认使用简体中文。
2. 以结构化结果为主，不写寒暄和无关说明。
3. 若要求返回 JSON，则只能输出合法 JSON。
4. 字段名保持稳定，不缺少必填字段。
5. reason 直接说明判定依据，不要编造未观察到的事实。

默认结果约束：
- overallQuality: "合格" | "存疑" | "需复检"
- score: 0-100 整数
- reason: 1-3句核心理由
- reasonKeywords: 字符串数组或逗号分隔关键词
- defects: 数组；无缺陷返回 []
- defects[].severity: 优先使用业务既有枚举

默认返回示例：
{"overallQuality":"合格","score":95,"reason":"未见明显异常，关键文字清晰且与要求一致。","reasonKeywords":["外观正常","文字清晰"],"defects":[]}`;

export const DEFAULT_LLM_TASK_PROMPT = `请作为工业视觉检验模型，对当前输入执行严格质检，并返回 JSON 结果。重点关注外观缺陷、标签状态、OCR关键信息一致性、印刷清晰度、贴附是否端正，以及标准中明确要求的关键项。`;

export const DEFAULT_LLM_USER_MESSAGE = `请按照系统提示词和当前检测标准严格分析输入内容，只返回 JSON。返回结构示例：{"overallQuality":"合格/存疑/需复检","score":85,"reason":"检测原因","reasonKeywords":["关键词1","关键词2"],"defects":[{"type":"缺陷类型","description":"缺陷描述","severity":"轻微/一般/严重/致命"}]}`;

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
  const sections = [LLM_HANDSHAKE_SYSTEM_PROMPT];
  const customPrompt = normalizePrompt(options.customPrompt) || DEFAULT_LLM_TASK_PROMPT;

  sections.push(`当前业务补充要求：\n${customPrompt}`);

  const standardDetails = buildStandardDetailsPrompt(options.standard);
  if (standardDetails) {
    sections.push(standardDetails.trim());
  }

  return sections.join('\n\n');
}
