/**
 * useOCRProcessing Hook
 *
 * 用途：管理 OCR 处理逻辑
 * 功能：
 * - OCR 文字识别
 * - 关键词分析
 * - 二维码检测集成
 * - 融合模式处理
 * - 结果保存
 * 使用位置：OCRDetectionScreen, OCRErrorPreventionScreen 等
 */

import { useCallback } from 'react';
import { performKeywordAnalysis as analyzeKeywords } from '@/lib/ocr/keywordAnalyzer';
import { buildBarcodeAnalysis } from '@/lib/ocr/barcodeRuleEvaluator';
import type { TestResult, KeywordConfig, BarcodeConfig } from '@/types/ocr';
import type { InspectionResult } from '@/types';
import type { BarcodeDetectionResult } from '@/lib/barcode/barcodeAnalyzer';
import { extractText } from '@/services/ocr';

export interface OCRProcessingOptions {
  // 基础配置
  selectedModel: string;
  compressionEnabled: boolean;

  // 关键词分析
  enableKeywordAnalysis: boolean;
  keywordConfigs: KeywordConfig[];
  keywordMatchMode: 'contains' | 'exact';

  // 二维码检测
  enableBarcodeDetection: boolean;
  barcodeConfigs: BarcodeConfig[];

  // 融合模式
  fusionModeEnabled: boolean;

  // 智能预处理（可选，用于手动上传测试）
  enableSmartPreprocessing?: boolean;
  applySmartPreprocessing?: (base64: string) => Promise<string>;
  setShowImageComparison?: (show: boolean) => void;

  // 依赖函数
  compressImage: (base64: string) => Promise<string>;
  performBarcodeDetection: (imageSource: string | File | null) => Promise<{
    allDetectedData: BarcodeDetectionResult[];
    matchResults: any[];
    retrySummary?: any;
  }>;
  performFusionAIAnalysis: (imageBase64: string) => Promise<InspectionResult | null>;
  saveDetectionResult: (result: TestResult, aiResult: InspectionResult | null, matchStatus: string, imageBase64: string) => Promise<void>;

  // 状态更新函数
  setOcrResult: (result: TestResult | null) => void;
  setWorkflowResult: (result: TestResult | null) => void;
  setAiAnalysisResult: (result: InspectionResult | null) => void;
  setMatchStatus: (status: 'qualified' | 'unqualified' | 'none') => void;
  setFinalResult: (result: 'qualified' | 'unqualified' | 'none') => void;
  setTestHistory?: (updater: (prev: TestResult[]) => TestResult[]) => void;
  setIsProcessing?: (processing: boolean) => void;
}

export interface UseOCRProcessingReturn {
  performKeywordAnalysis: (result: TestResult) => any;
  processCapturedImage: (
    base64Data: string,
    imageFile: File,
    source?: 'manual' | 'realtime'
  ) => Promise<{
    finalResult: TestResult;
    aiResult: InspectionResult | null;
    finalMatchStatus: string;
  }>;
  performOCRTest: (selectedImage: File | null) => Promise<void>;
}

export const useOCRProcessing = (options: OCRProcessingOptions): UseOCRProcessingReturn => {
  const {
    selectedModel,
    compressionEnabled,
    enableKeywordAnalysis,
    keywordConfigs,
    keywordMatchMode,
    enableBarcodeDetection,
    barcodeConfigs,
    fusionModeEnabled,
    // 智能预处理（可选）
    enableSmartPreprocessing,
    applySmartPreprocessing,
    setShowImageComparison,
    // 依赖函数
    compressImage,
    performBarcodeDetection,
    performFusionAIAnalysis,
    saveDetectionResult,
    setOcrResult,
    setWorkflowResult,
    setAiAnalysisResult,
    setMatchStatus,
    setFinalResult,
    setTestHistory,
    setIsProcessing,
  } = options;

  const getModeValidationWarnings = useCallback(() => {
    const warnings: string[] = [];
    const hasTargetScopedKeywords = enableKeywordAnalysis && keywordConfigs.some(
      config => config.targetRoi !== undefined && config.targetRoi !== null && config.targetRoi !== 'all'
    );
    const hasTargetScopedBarcodes = enableBarcodeDetection && barcodeConfigs.some(
      config => !!config.enabled && config.targetRoi !== undefined && config.targetRoi !== null && config.targetRoi !== 'all'
    );

    if (hasTargetScopedKeywords) {
      warnings.push('当前为整图OCR模式，关键词已绑定指定目标，缺少ROI上下文，结果已按存疑处理。');
    }
    if (hasTargetScopedBarcodes) {
      warnings.push('当前为整图OCR模式，二维码已绑定指定目标，缺少ROI上下文，结果已按存疑处理。');
    }

    return warnings;
  }, [enableBarcodeDetection, enableKeywordAnalysis, barcodeConfigs, keywordConfigs]);

  // 关键词分析函数（使用共享模块）
  const performKeywordAnalysis = useCallback((result: TestResult) => {
    // 使用共享的关键词分析模块
    const analysisResult = analyzeKeywords(result, keywordConfigs, keywordMatchMode);

    // 设置匹配状态
    setMatchStatus(analysisResult.matchStatus);

    // 添加调试信息
    const positiveKeywords = keywordConfigs.filter(config => !config.type || config.type === 'positive');
    const negativeKeywords = keywordConfigs.filter(config => config.type === 'negative');
    const satisfiedKeywords = analysisResult.keywords_found;
    const unsatisfiedKeywords = positiveKeywords
      .filter(config => !satisfiedKeywords.includes(config.text))
      .map(config => config.text);

    console.log('🔍 OCR关键词分析调试信息:');
    console.log('  - 识别的完整文字:', result.full_text);
    console.log('  - 详细识别结果:', result.detailed_results);
    console.log('  - 配置的关键词数量:', keywordConfigs.length);
    console.log('  - 正面关键词:', positiveKeywords.map(c => `${c.text}(需要${c.requiredCount ?? 1}次)`));
    console.log('  - 排除清单关键词:', negativeKeywords.map(c => c.text));
    console.log('  - 满足次数要求的关键词:', satisfiedKeywords);
    console.log('  - 未满足次数要求的关键词:', unsatisfiedKeywords);
    console.log('  - 是否合格:', analysisResult.isQualified);
    console.log('  - 最终匹配状态:', analysisResult.matchStatus);

    return analysisResult;
  }, [keywordConfigs, keywordMatchMode, setMatchStatus]);

  // 公共的图像处理函数 - 处理OCR、二维码检测、融合模式AI分析等
  const processCapturedImage = useCallback(async (
    base64Data: string,
    _imageFile: File,
    source: 'manual' | 'realtime' = 'manual'
  ) => {
    console.log(`📸 开始处理${source === 'manual' ? '手动抓拍' : '实时检测'}的图像`);

    try {
      // 🔥 统一压缩逻辑 - 在所有处理路径开始处压缩
      if (compressionEnabled) {
        console.log('🗜️ 开始统一图片压缩...');
        const originalSize = Math.round(base64Data.length * 0.75 / 1024); // 估算原始大小（KB）
        const compressedBase64 = await compressImage(`data:image/jpeg;base64,${base64Data}`);
        base64Data = compressedBase64.split(',')[1]; // 移除data:image/...;base64,前缀
        const compressedSize = Math.round(base64Data.length * 0.75 / 1024); // 估算压缩后大小（KB）
        console.log(`✅ 统一压缩完成: ${originalSize}KB -> ${compressedSize}KB (压缩率: ${Math.round((1 - compressedSize / originalSize) * 100)}%)`);
      }

      // 根据关键词配置判断是否需要启用方向检测
      // 只要有任意一个关键词配置了expectedOrientation（不是undefined/null），就需要开启方向检测
      const needsAngleDetection = keywordConfigs.some(
        config => config.expectedOrientation !== undefined && config.expectedOrientation !== null
      );
      console.log(`🧭 方向检测: ${needsAngleDetection ? '开启' : '关闭'} (根据关键词配置自动决定)`);

      // 执行OCR检测（统一走 OCR 抽象层）
      const ocrData = await extractText({
        image: base64Data,
        model: selectedModel,
        use_angle_cls: needsAngleDetection,
      });
      let finalResult = ocrData;

      let currentMatchStatus = 'none';
      // 方向判定：若返回的 orientation_match 为 false，则直接标记为存疑
      if (ocrData && ocrData.orientation_match === false) {
        currentMatchStatus = 'unqualified';
      }

      if (ocrData.success && enableKeywordAnalysis) {
        const keywordAnalysis = performKeywordAnalysis(ocrData);
        ocrData.ai_analysis = keywordAnalysis;
        finalResult = ocrData;
        // 获取当前匹配状态 - 直接使用关键词分析的结果
        currentMatchStatus = keywordAnalysis.matchStatus;
        console.log('🔧 使用关键词分析结果:', keywordAnalysis.matchStatus);
      } else if (ocrData.success && !enableKeywordAnalysis) {
        // 非融合模式且未启用关键词分析时，如果有OCR结果但未匹配到关键词，标记为存疑
        // 修复：如果OCR没有识别到任何文字，直接判断为存疑
        if (!ocrData.full_text || ocrData.full_text.trim() === '' || !ocrData.detailed_results || ocrData.detailed_results.length === 0) {
          currentMatchStatus = 'unqualified';
          console.log('🔧 修复：OCR没有识别到任何文字，直接判断为存疑');
        } else {
          // 关闭关键词分析后，不再让关键词配置影响判定
          currentMatchStatus = currentMatchStatus === 'unqualified' ? 'unqualified' : 'qualified';
        }
      }

      // 执行二维码检测
      if (enableBarcodeDetection && finalResult.success) {
        // 使用 base64Data 而不是 imageFile，确保与 OCR 使用相同的（可能已压缩的）图像数据
        // 同时这也避免了 imageFile 可能为空或读取失败的问题
        console.log(`🔍 准备二维码检测，使用图像数据长度: ${base64Data.length}`);
        const { allDetectedData, matchResults, retrySummary } = await performBarcodeDetection(base64Data);

        const barcodeAnalysis = buildBarcodeAnalysis({
          enabled: true,
          barcodeConfigs,
          matchResults,
          allDetectedData,
          retrySummary,
        });
        const overallMatch = barcodeAnalysis.overall_match;
        console.log('🔧 二维码检测结果统计:');
        console.log('  - 配置的二维码数量:', matchResults.length);
        console.log('  - 匹配结果:', matchResults.map(r => ({ expectedText: r.expectedText, matched: r.matched })));
        console.log('  - overall_match:', overallMatch);

        // 修复：二维码检测和关键词匹配都要合格，OCR才算合格
        // 不能让二维码检测结果覆盖关键词匹配结果
        if (!overallMatch) {
          // 二维码检测失败（包括：配置了但没匹配、没检测到二维码等情况），强制标记为存疑
          currentMatchStatus = 'unqualified';
          console.log('❌ 二维码检测失败，OCR整体判定为存疑');
        } else if (overallMatch && currentMatchStatus !== 'qualified') {
          // 二维码检测成功，但关键词匹配存疑，保持存疑状态
          console.log('⚠️ 二维码检测成功，但关键词匹配存疑，OCR整体仍为存疑');
        } else if (overallMatch && currentMatchStatus === 'qualified') {
          // 二维码检测成功 + 关键词匹配成功 = OCR合格
          console.log('✅ 二维码检测和关键词匹配都成功，OCR整体判定为合格');
        }

        finalResult.barcode_analysis = barcodeAnalysis;
      }

      const validationWarnings = getModeValidationWarnings();
      if (validationWarnings.length > 0) {
        finalResult.validationWarnings = validationWarnings;
        currentMatchStatus = 'unqualified';
      }

      setOcrResult(finalResult);
      setWorkflowResult(finalResult);
      console.log(`${source === 'manual' ? '手动抓拍' : '实时检测'}OCR识别完成:`, finalResult);

      // 融合模式：处理OCR和LLM两个结果
      let finalMatchStatus = currentMatchStatus;
      let aiResult: InspectionResult | null = null;
      if (fusionModeEnabled) {
        // 融合模式下，先设置"等待LLM"状态，避免OCR结果提前显示为最终结果
        setMatchStatus('none');
        setFinalResult('none');
        console.log(`🔄 ${source === 'manual' ? '手动抓拍' : '实时检测'}：融合模式已启用，等待LLM分析...`);
        console.log('🔄 base64Data长度:', base64Data.length);
        aiResult = await performFusionAIAnalysis(base64Data);
        if (aiResult) {
          console.log(`✅ ${source === 'manual' ? '手动抓拍' : '实时检测'}：融合模式AI分析完成:`, aiResult);
          // 设置AI分析结果用于UI显示
          setAiAnalysisResult(aiResult);
          // 融合模式：需要同时考虑OCR和LLM结果
          const ocrQualified = currentMatchStatus === 'qualified';
          const llmQualified = aiResult.overallQuality === '合格';
          console.log('🔍 融合模式结果判断:');
          console.log('🔍 OCR结果:', currentMatchStatus, '(qualified:', ocrQualified, ')');
          console.log('🔍 LLM结果:', aiResult.overallQuality, '(qualified:', llmQualified, ')');

          // 只有两个结果都合格才算合格
          if (ocrQualified && llmQualified) {
            finalMatchStatus = 'qualified';
            console.log('✅ 融合模式：OCR和LLM都合格');
          } else {
            finalMatchStatus = 'unqualified';
            console.log('❌ 融合模式：OCR或LLM存疑');
          }

          // 更新融合模式下的匹配状态
          setMatchStatus(finalMatchStatus as 'qualified' | 'unqualified' | 'none');
        } else {
          console.log(`❌ ${source === 'manual' ? '手动抓拍' : '实时检测'}：融合模式AI分析失败，按需复检处理`);
          setAiAnalysisResult(null);
          finalMatchStatus = 'unqualified';
          // 更新匹配状态
          setMatchStatus(finalMatchStatus as 'qualified' | 'unqualified' | 'none');
        }
      } else {
        console.log(`⏭️ ${source === 'manual' ? '手动抓拍' : '实时检测'}：融合模式未启用，仅使用OCR结果`);
        // 融合模式未启用时，直接使用OCR结果
        setMatchStatus(finalMatchStatus as 'qualified' | 'unqualified' | 'none');
        console.log('🔧 设置OCR匹配状态:', finalMatchStatus);
        console.log('🔧 当前匹配状态(currentMatchStatus):', currentMatchStatus);
        console.log('🔧 最终匹配状态(finalMatchStatus):', finalMatchStatus);
      }

      // 异步保存检测结果到本地历史记录，不阻塞主流程
      saveDetectionResult(finalResult, aiResult, finalMatchStatus, base64Data)
        .catch(error => console.error('❌ 异步保存检测结果失败:', error));

      // 计算综合结果
      if (fusionModeEnabled && aiResult) {
        // 融合模式：基于综合结果（OCR和LLM都合格才算合格）
        const ocrQualified = finalMatchStatus === 'qualified';
        const llmQualified = aiResult.overallQuality === '合格';
        const combinedResult = ocrQualified && llmQualified ? 'qualified' : 'unqualified';
        setFinalResult(combinedResult);
      } else {
        // 单独OCR检测：基于单独的OCR结果
        setFinalResult(finalMatchStatus === 'qualified' ? 'qualified' :
          finalMatchStatus === 'unqualified' ? 'unqualified' : 'none');
      }

      return {
        finalResult,
        aiResult,
        finalMatchStatus
      };

    } catch (error) {
      console.error(`❌ ${source === 'manual' ? '手动抓拍' : '实时检测'}图像处理失败:`, error);
      throw error;
    }
  }, [
    compressionEnabled,
    compressImage,
    selectedModel,
    enableKeywordAnalysis,
    keywordConfigs,
    keywordMatchMode,
    enableBarcodeDetection,
    barcodeConfigs,
    fusionModeEnabled,
    getModeValidationWarnings,
    performKeywordAnalysis,
    performBarcodeDetection,
    performFusionAIAnalysis,
    saveDetectionResult,
    setOcrResult,
    setWorkflowResult,
    setAiAnalysisResult,
    setMatchStatus,
    setFinalResult
  ]);

  // 手动上传图片的OCR测试函数
  const performOCRTest = useCallback(async (selectedImage: File | null) => {
    if (!selectedImage) return;

    setIsProcessing?.(true);
    setMatchStatus('none'); // 重置匹配状态
    setAiAnalysisResult(null);
    setFinalResult('none');

    try {
      // 将图片转换为base64
      let base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]); // 移除data:image/...;base64,前缀
        };
        reader.readAsDataURL(selectedImage);
      });

      // 应用压缩（如果启用）
      if (compressionEnabled) {
        console.log('🗜️ 开始图片压缩...');
        const compressedBase64 = await compressImage(`data:image/jpeg;base64,${base64}`);
        base64 = compressedBase64.split(',')[1]; // 更新为压缩后的base64
        console.log('✅ 图片压缩完成');
      }

      // 智能预处理：如果启用了智能预处理，则应用预处理
      if (enableSmartPreprocessing && applySmartPreprocessing) {
        console.log('🔧 应用智能预处理...');
        const processedBase64 = await applySmartPreprocessing(`data:image/jpeg;base64,${base64}`);
        base64 = processedBase64.split(',')[1]; // 更新base64为预处理后的图片
        setShowImageComparison?.(true); // 显示对比
      }

      const needsAngleDetection = keywordConfigs.some(
        config => config.expectedOrientation !== undefined && config.expectedOrientation !== null
      );

      // 调用OCR API（统一走 OCR 抽象层）
      const result = await extractText<TestResult>({
        image: base64,
        model: selectedModel,
        use_angle_cls: needsAngleDetection,
      });
      let currentMatchStatus: 'none' | 'qualified' | 'unqualified' = 'none';

      if (result.orientation_match === false) {
        currentMatchStatus = 'unqualified';
      }

      // 如果启用了关键词分析，进行关键词过滤
      if (enableKeywordAnalysis && result.success) {
        const keywordAnalysis = performKeywordAnalysis(result);
        result.ai_analysis = keywordAnalysis;
        currentMatchStatus = keywordAnalysis.matchStatus;
      } else if (result.success && !enableKeywordAnalysis) {
        if (!result.full_text || result.full_text.trim() === '' || !result.detailed_results || result.detailed_results.length === 0) {
          currentMatchStatus = 'unqualified';
        } else {
          currentMatchStatus = currentMatchStatus === 'unqualified' ? 'unqualified' : 'qualified';
        }
      }

      // 执行二维码检测
      if (enableBarcodeDetection && result.success) {
        const { allDetectedData, matchResults, retrySummary } = await performBarcodeDetection(selectedImage);

        const barcodeAnalysis = buildBarcodeAnalysis({
          enabled: true,
          barcodeConfigs,
          matchResults,
          allDetectedData,
          retrySummary,
        });
        result.barcode_analysis = barcodeAnalysis;

        const overallMatch = barcodeAnalysis.overall_match;
        if (!overallMatch) {
          currentMatchStatus = 'unqualified';
        }
      }

      const validationWarnings = getModeValidationWarnings();
      if (validationWarnings.length > 0) {
        result.validationWarnings = validationWarnings;
        currentMatchStatus = 'unqualified';
      }

      const resultWithTimestamp: TestResult = {
        ...result,
        timestamp: new Date().toISOString(),
      };

      setOcrResult(resultWithTimestamp);
      setWorkflowResult(resultWithTimestamp);

      // 如果启用了融合模式，进行AI分析
      let aiResult: InspectionResult | null = null;
      let finalMatchStatus: 'qualified' | 'unqualified' | 'none' = currentMatchStatus;
      if (fusionModeEnabled) {
        console.log('🔄 OCR测试：融合模式已启用，开始AI分析');
        console.log('🔄 base64长度:', base64.length);
        aiResult = await performFusionAIAnalysis(base64);
        if (aiResult) {
          console.log('✅ OCR测试：融合模式AI分析完成:', aiResult);
          const ocrQualified = currentMatchStatus === 'qualified';
          const llmQualified = aiResult.overallQuality === '合格';
          finalMatchStatus = ocrQualified && llmQualified ? 'qualified' : 'unqualified';
        } else {
          console.log('❌ OCR测试：融合模式AI分析失败，按需复检处理');
          finalMatchStatus = 'unqualified';
        }
      } else {
        console.log('⏭️ OCR测试：融合模式未启用，跳过AI分析');
      }

      setAiAnalysisResult(aiResult);
      setMatchStatus(finalMatchStatus);
      if (fusionModeEnabled && aiResult) {
        setFinalResult(finalMatchStatus === 'qualified' ? 'qualified' : 'unqualified');
      } else {
        setFinalResult(finalMatchStatus === 'qualified' ? 'qualified' : finalMatchStatus === 'unqualified' ? 'unqualified' : 'none');
      }

      // 异步保存检测结果到本地历史记录，不阻塞主流程
      saveDetectionResult(resultWithTimestamp, aiResult, finalMatchStatus, base64)
        .catch(error => console.error('❌ 异步保存检测结果失败:', error));

      // 添加到测试历史
      setTestHistory?.(prev => [resultWithTimestamp, ...prev.slice(0, 9)]);

    } catch (error) {
      console.error('OCR测试失败:', error);
      setAiAnalysisResult(null);
      setMatchStatus('unqualified');
      setFinalResult('none');
      setOcrResult({
        success: false,
        full_text: '',
        detailed_results: [],
        text_count: 0,
        error: `OCR测试失败: ${error}`
      });
    } finally {
      setIsProcessing?.(false);
    }
  }, [
    compressionEnabled,
    compressImage,
    enableSmartPreprocessing,
    applySmartPreprocessing,
    setShowImageComparison,
    selectedModel,
    enableKeywordAnalysis,
    keywordConfigs,
    keywordMatchMode,
    enableBarcodeDetection,
    barcodeConfigs,
    fusionModeEnabled,
    getModeValidationWarnings,
    performKeywordAnalysis,
    performBarcodeDetection,
    performFusionAIAnalysis,
    saveDetectionResult,
    setOcrResult,
    setMatchStatus,
    setTestHistory,
    setIsProcessing,
  ]);

  return {
    performKeywordAnalysis,
    processCapturedImage,
    performOCRTest,
  };
};
