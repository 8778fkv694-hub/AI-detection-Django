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

  // 整图、ROI批处理共用同一评估器，方向或置信度证据缺失时统一 fail-closed。
  return buildKeywordAnalysis({
    details: result.detailed_results.map(item => ({
      text: item.text,
      confidence: item.confidence,
      orientation_bucket: item.orientation_bucket,
      orientation_degrees: item.orientation_degrees,
    })),
    fullText: result.full_text || '',
    keywordConfigs,
    keywordMatchMode,
  }) as KeywordAnalysisResult;
}
