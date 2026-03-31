/**
 * OCR关键词分析工具
 * 提供关键词匹配、方向检测、次数统计等功能
 */

import { buildKeywordAnalysis } from './keywordRuleEvaluator';

/**
 * 关键词配置
 */
export interface KeywordConfig {
  text: string;                             // 关键词文本
  confidence: number;                       // 最小置信度 (0-1)
  expectedOrientation?: 0 | 90 | 180 | 270; // 期望的文字方向
  type?: 'positive' | 'negative';           // 关键词类型：positive=必须出现，negative=排除清单
  requiredCount?: number;                   // 需要出现的次数（默认1，negative类型无效）
  orientationTolerance?: number;            // 方向容差（度）
  targetRoi?: string;
}

/**
 * OCR结果接口
 */
export interface OCRResult {
  text: string;
  confidence: number;
  bbox: number[][];
  orientation_bucket?: number;
  orientation_degrees?: number;
}

/**
 * OCR测试结果接口
 */
export interface TestResult {
  success: boolean;
  full_text: string;
  detailed_results: OCRResult[];
  text_count: number;
  model_used?: string;
  error?: string;
  orientation_match?: boolean;
}

/**
 * 关键词匹配详情
 */
export interface KeywordMatchDetail {
  keyword: string;
  textMatched: boolean;
  orientationMatched: boolean;
  confidenceMatched: boolean;
  overallMatched: boolean;
  detectedOrientation?: number;
  expectedOrientation?: number;
  actualCount?: number;
  requiredCount?: number;
  keywordType?: 'positive' | 'negative';
  targetRoi?: string;
}

/**
 * 关键词分析结果
 */
export interface KeywordAnalysisResult {
  filtered_text: string;
  keywords_found: string[];
  confidence_score: number;
  isQualified: boolean;
  matchStatus: 'qualified' | 'unqualified' | 'none';
  keyword_match_details: KeywordMatchDetail[];
}

/**
 * 归一化角度到0-360范围
 */
function normalizeDeg(v: any): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') {
    const m = v.match(/-?\d+(?:\.\d+)?/);
    if (!m) return null;
    const n = parseFloat(m[0]);
    if (Number.isNaN(n)) return null;
    return ((n % 360) + 360) % 360;
  }
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null;
    return ((v % 360) + 360) % 360;
  }
  return null;
}

/**
 * 将角度映射到最近的0/90/180/270
 */
function toBucket(deg: number): number {
  const candidates = [0, 90, 180, 270];
  let best = 0;
  let bestDiff = 1e9;
  for (const c of candidates) {
    const d = Math.min(Math.abs(deg - c), 360 - Math.abs(deg - c));
    if (d < bestDiff) {
      bestDiff = d;
      best = c;
    }
  }
  return best;
}

/**
 * 计算两个角度的最小差值
 */
function angularDiff(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/**
 * 执行关键词分析
 *
 * @param result - OCR检测结果
 * @param keywordConfigs - 关键词配置数组
 * @param keywordMatchMode - 匹配模式 ('contains' | 'exact')
 * @returns 关键词分析结果
 */
export function performKeywordAnalysis(
  result: TestResult,
  keywordConfigs: KeywordConfig[],
  keywordMatchMode: 'contains' | 'exact' = 'contains'
): KeywordAnalysisResult {
  // 如果没有关键词配置或OCR失败，返回空结果
  if (!result.success || !keywordConfigs || keywordConfigs.length === 0) {
    return {
      filtered_text: result.full_text || '',
      keywords_found: [],
      confidence_score: 0,
      isQualified: false,
      matchStatus: 'none',
      keyword_match_details: []
    };
  }

  // 无方向约束时，直接复用统一规则评估器，避免与批处理路径继续漂移
  const hasOrientationConstraints = keywordConfigs.some(
    config => config.expectedOrientation !== undefined && config.expectedOrientation !== null
  );
  if (!hasOrientationConstraints) {
    return buildKeywordAnalysis({
      details: result.detailed_results.map(item => ({
        text: item.text,
        confidence: item.confidence,
      })),
      fullText: result.full_text || '',
      keywordConfigs,
      keywordMatchMode,
    });
  }

  // 分离正面关键词和排除清单关键词
  const positiveKeywords = keywordConfigs.filter(config => !config.type || config.type === 'positive');
  const negativeKeywords = keywordConfigs.filter(config => config.type === 'negative');

  // 关键词匹配详情
  const keywordMatchDetails: KeywordMatchDetail[] = [];

  // 统计每个关键词的匹配次数
  const keywordMatchCounts: Map<string, number> = new Map();
  const filteredResults: OCRResult[] = [];

  // 第一步：检查排除清单关键词（negative类型）- 如果出现任何排除关键词，直接存疑
  let hasNegativeMatch = false;
  const negativeMatchKeywords: string[] = [];

  result.detailed_results.forEach(item => {
    for (const config of negativeKeywords) {
      const keyword = config.text;
      let textMatches = false;

      if (keywordMatchMode === 'contains') {
        textMatches = item.text.includes(keyword);
      } else if (keywordMatchMode === 'exact') {
        textMatches = item.text === keyword;
      }

      if (textMatches) {
        // 排除清单关键词只要文本匹配就算存疑（不检查置信度和方向）
        if (!negativeMatchKeywords.includes(keyword)) {
          negativeMatchKeywords.push(keyword);
        }
        hasNegativeMatch = true;
      }
    }
  });

  // 第二步：统计正面关键词的出现次数（即使检测到负面关键词，也要继续统计正面关键词）
  result.detailed_results.forEach(item => {
    for (const config of positiveKeywords) {
      const keyword = config.text;
      let textMatches = false;

      if (keywordMatchMode === 'contains') {
        textMatches = item.text.includes(keyword);
      } else if (keywordMatchMode === 'exact') {
        textMatches = item.text === keyword;
      }

      if (textMatches) {
        // 检查是否满足该关键词的置信度要求
        const confidenceMatched = item.confidence >= config.confidence;
        let orientationMatched = true;

        // 方向匹配检查
        if (config.expectedOrientation !== undefined && config.expectedOrientation !== null) {
          const expectedDeg = normalizeDeg(config.expectedOrientation);
          const itemBucket = item.orientation_bucket;
          const itemDegRaw = item.orientation_degrees;
          const itemDeg = normalizeDeg(itemDegRaw);
          const tolerance = config.orientationTolerance ?? 30;

          if (expectedDeg === null) {
            orientationMatched = true;
          } else if (itemBucket === undefined || itemBucket === null) {
            if (itemDeg === null) {
              orientationMatched = true;
            } else {
              orientationMatched = angularDiff(itemDeg, expectedDeg) <= tolerance;
            }
          } else {
            const expectedBucket = toBucket(expectedDeg);
            orientationMatched = itemBucket === expectedBucket;
          }
        }

        // 如果置信度和方向都匹配，则计入次数
        if (confidenceMatched && orientationMatched) {
          const currentCount = keywordMatchCounts.get(keyword) || 0;
          keywordMatchCounts.set(keyword, currentCount + 1);
          filteredResults.push(item);
        }
      }
    }
  });

  // 记录排除清单关键词的匹配详情
  negativeKeywords.forEach(config => {
    const isMatched = negativeMatchKeywords.includes(config.text);
    keywordMatchDetails.push({
      keyword: config.text,
      textMatched: isMatched,
      orientationMatched: true,
      confidenceMatched: true,
      overallMatched: isMatched,
      keywordType: 'negative',
      actualCount: isMatched ? 1 : 0,
      requiredCount: 0,
      targetRoi: config.targetRoi || 'all',
    });
  });

  // 第三步：检查每个正面关键词是否满足次数要求
  const satisfiedKeywords: string[] = [];
  const unsatisfiedKeywords: string[] = [];

  positiveKeywords.forEach(config => {
    const keyword = config.text;
    const requiredCount = config.requiredCount ?? 1; // 默认需要出现1次
    const actualCount = keywordMatchCounts.get(keyword) || 0;
    const isSatisfied = actualCount >= requiredCount;

    keywordMatchDetails.push({
      keyword,
      textMatched: actualCount > 0,
      orientationMatched: true,
      confidenceMatched: actualCount > 0,
      overallMatched: isSatisfied,
      keywordType: 'positive',
      actualCount,
      requiredCount,
      targetRoi: config.targetRoi || 'all',
    });

    if (isSatisfied) {
      satisfiedKeywords.push(keyword);
    } else {
      unsatisfiedKeywords.push(keyword);
    }
  });

  // 计算平均置信度
  const avgConfidence = filteredResults.length > 0
    ? filteredResults.reduce((sum, item) => sum + item.confidence, 0) / filteredResults.length
    : 0;

  // 生成过滤后的文本（显示所有匹配的正面关键词内容）
  const filteredText = filteredResults.map(item => item.text).join(' ');

  // 判断匹配状态：
  // 1. 如果检测到负面关键词，无论正面关键词如何，都判定为存疑
  // 2. 否则，所有正面关键词都满足次数要求则为合格
  const allPositiveSatisfied = positiveKeywords.length > 0 && satisfiedKeywords.length === positiveKeywords.length;
  let matchStatusResult: 'qualified' | 'unqualified' | 'none';

  if (hasNegativeMatch) {
    // 检测到负面关键词，直接判定为存疑
    matchStatusResult = 'unqualified';
    console.log('🚫 检测到排除清单关键词，判定为存疑:', negativeMatchKeywords);
  } else {
    // 没有检测到负面关键词，按正面关键词的匹配情况判定
    matchStatusResult = allPositiveSatisfied ? 'qualified' : (positiveKeywords.length > 0 ? 'unqualified' : 'none');

    if (!allPositiveSatisfied && positiveKeywords.length > 0) {
      console.log('⚠️ 正面关键词未完全满足，判定为存疑');
      console.log('  - 需要满足的关键词:', positiveKeywords.map(k => `${k.text}(≥${k.requiredCount ?? 1}次)`));
      console.log('  - 已满足的关键词:', satisfiedKeywords);
      console.log('  - 未满足的关键词:', unsatisfiedKeywords);
      console.log('  - 实际匹配次数:', Array.from(keywordMatchCounts.entries()));
    }
  }

  return {
    filtered_text: filteredText,
    keywords_found: satisfiedKeywords,
    confidence_score: avgConfidence,
    isQualified: allPositiveSatisfied && !hasNegativeMatch,
    matchStatus: matchStatusResult,
    keyword_match_details: keywordMatchDetails
  };
}
