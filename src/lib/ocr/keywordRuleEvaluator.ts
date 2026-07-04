import type { KeywordConfig, TestResult } from '@/types/ocr';

type OCRDetailLike = {
  text?: string;
  confidence?: number;
  label?: string;
};

export const countKeywordMatches = (text: string, keyword: string, mode: 'contains' | 'exact') => {
  if (!text || !keyword) return 0;

  if (mode === 'exact') {
    const normalizedText = text.trim();
    if (normalizedText === keyword) return 1;

    return normalizedText
      .split(/[\s,;，；。|]+/)
      .filter(segment => segment === keyword).length;
  }

  let count = 0;
  let startIndex = 0;
  while (startIndex < text.length) {
    const matchIndex = text.indexOf(keyword, startIndex);
    if (matchIndex === -1) break;
    count += 1;
    startIndex = matchIndex + keyword.length;
  }
  return count;
};

interface BuildKeywordAnalysisParams {
  details: OCRDetailLike[];
  fullText: string;
  // id 未参与评估，放宽以兼容 keywordAnalyzer 的本地 KeywordConfig（无 id）
  keywordConfigs: Array<Omit<KeywordConfig, 'id'> & { id?: string }>;
  keywordMatchMode: 'contains' | 'exact';
}

export const buildKeywordAnalysis = ({
  details,
  fullText,
  keywordConfigs,
  keywordMatchMode,
}: BuildKeywordAnalysisParams): NonNullable<TestResult['ai_analysis']> => {
  const matchDetails = keywordConfigs.map((config) => {
    const targetRoi = config.targetRoi;
    const relevantDetails = targetRoi && targetRoi !== 'all'
      ? details.filter(detail => detail.label === targetRoi)
      : details;
    const isNegative = (config.type || 'positive') === 'negative';
    const requiredCount = isNegative ? 0 : (config.requiredCount ?? 1);
    const minConfidence = config.confidence ?? 0;

    const actualCount = relevantDetails.reduce((sum, detail) => {
      const roiText = detail.text || '';
      const roiConfidence = detail.confidence ?? 1;

      if (!isNegative && roiConfidence < minConfidence) {
        return sum;
      }

      return sum + countKeywordMatches(roiText, config.text, keywordMatchMode);
    }, 0);

    const textMatched = actualCount > 0;
    const overallMatched = isNegative ? actualCount === 0 : actualCount >= requiredCount;

    return {
      keyword: config.text,
      targetRoi: targetRoi || 'all',
      keywordType: config.type || 'positive',
      textMatched,
      orientationMatched: true,
      confidenceMatched: textMatched || isNegative,
      overallMatched,
      actualCount,
      requiredCount,
    };
  });

  const matchedTexts = details
    .filter(detail => (detail.text || '').trim().length > 0)
    .map(detail => detail.text!.trim());

  const matchedPositiveKeywords = matchDetails
    .filter(detail => detail.keywordType !== 'negative' && detail.overallMatched)
    .map(detail => detail.keyword);

  const confidenceValues = details
    .map(detail => detail.confidence)
    .filter((value): value is number => typeof value === 'number');
  const confidenceScore = confidenceValues.length > 0
    ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
    : 0;

  const hasPositiveKeywords = keywordConfigs.some(config => (config.type || 'positive') !== 'negative');
  const isQualified = matchDetails.every(detail => detail.overallMatched);
  const matchStatus = keywordConfigs.length === 0
    ? 'none'
    : isQualified
      ? 'qualified'
      : hasPositiveKeywords
        ? 'unqualified'
        : 'unqualified';

  return {
    filtered_text: matchedTexts.length > 0 ? matchedTexts.join(' ') : fullText || '',
    keywords_found: matchedPositiveKeywords,
    confidence_score: confidenceScore,
    isQualified,
    matchStatus,
    keyword_match_details: matchDetails,
  };
};

