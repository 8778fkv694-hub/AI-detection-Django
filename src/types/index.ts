
// AI配置接口
export interface AIConfig {
  modelName: string;
  apiKey: string;
  apiBaseUrl: string;
  systemPrompt: string;
  userMessage: string;
  compressionEnabled: boolean;
  compressionQuality: number;
  imageWidth: number;
  imageHeight: number;
  // 新增：超时设置
  timeout?: number;
  // 新增：重试次数
  retryCount?: number;
}

// 缺陷类型接口
export interface DefectType {
  id: number;
  name: string;
  category: string;
  description: string;
  severityLevels: string[];
  color: string;
  createdAt?: string;
}

// 缺陷严重程度接口
export interface DefectSeverity {
  id: number;
  name: string;
  level: number;
  description: string;
  color: string;
  createdAt?: string;
}

// 检测区域接口
export interface InspectionArea {
  id: string;
  name: string;
  x: number; // 相对坐标 (0-1)
  y: number; // 相对坐标 (0-1)
  width: number; // 相对宽度 (0-1)
  height: number; // 相对高度 (0-1)
  description: string;
  color: string;
  // 新增：缺陷类型配置
  defectTypes: string[]; // 关注的缺陷类型列表
  severityThreshold: string; // 严重程度阈值
  importance: '低' | '中' | '高'; // 区域重要性
}

export interface Defect {
  type: string; // 缺陷类型名称
  area?: string; // 缺陷区域（兼容旧代码）
  description: string;
  severity?: string; // '轻微' | '一般' | '严重' | '致命'
  confidence?: number; // 检测置信度 (0-1)
  location?: {
    x: number;
    y: number;
  };
  // 兼容 InspectionArea 相关的坐标
  x?: number; // 相对坐标 (0-1)
  y?: number; // 相对坐标 (0-1)
  width?: number; // 相对宽度 (0-1)
  height?: number; // 相对高度 (0-1)
  areaId?: string; // 关联的ROI区域ID
}

// **NEW**: Added optional roi property to the Standard interface
export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Standard {
  id: string;
  name: string;
  type: 'rule_based' | 'image_based';
  criteria: string;
  standardImage?: string;
  overrideSystemPrompt?: string;
  roi?: CropArea; // Region of Interest
  keywords?: string; // OCR关键词配置
  defectTypes?: any; // 可能是字符串数组 或 JSON字符串 (需要在代码中处理兼容性)
  qualityCriteria?: string;
  requirements?: string;

  // 兼容 src/types.ts 中的定义
  inspectionAreas?: InspectionArea[]; // ROI区域列表
  sendStandardImage?: boolean; // 是否在检测时发送标准图片
  // defectTypes 在 src/types.ts 中定义为 string (JSON)，这里保持 string[] | string 兼容性可能较难，建议代码中统一处理
  // 暂时保持 string[]，如果代码中用到 string，需要修改代码或这里改为 any/union
}

// Result Analysis Types
export interface AnalysisResult {
  id: string;
  timestamp: string; // ISO 8601 format
  imageUrl: string;
  thumbnailUrl?: string; // Optional thumbnail
  status: 'pending' | 'processing' | 'completed' | 'failed';
  success: boolean; // Shortcut for status === 'completed'
  errorMessage?: string; // If failed

  // Detection Results
  detections: {
    objects: BackendYoloDetection[];
    ocr?: {
      text: string;
      confidence: number;
      box: number[];
    }[];
    // ... other specific tool results
  };

  // Final Assessment (Flat structure for compatibility with components)
  overallQuality: '合格' | '存疑' | '需复检' | '存疑';
  score: number;
  reason: string;
  defects?: Defect[];

  // Metadata
  metadata?: Record<string, any>;
  duration?: number; // Processing time in ms
}

export interface InspectionResult {
  id: string;
  timestamp: string;
  image: string; // base64 string
  standardId: string | null;
  overallQuality: '合格' | '存疑' | '需复检' | '存疑'; // 匹配前端使用的字段名（存疑用于齐套化检测）
  score: number;
  reason: string;
  reasonKeywords?: string;
  defects?: Defect[];
  isEnhancedInspection?: boolean;
  originalResultId?: string; // ID of the original result if this is an enhancement
  // 新增：检测类型字段，用于分类不同类型的检测结果
  detectionType?: 'cleanroom_ppe' | 'standard_inspection' | 'general_quality' | 'ocr_inspection' | 'ocr_fusion_inspection' | 'ocr_error_prevention' | 'kit_matching' | 'unknown';
  // 新增：PPE检测相关字段
  ppeDetections?: {
    cleanroom_cap: number;
    mask: number;
    cleanroom_suit: number;
    person: number;
  };
  ppeCompliance?: {
    hasCleanroomCap: boolean;
    hasMask: boolean;
    hasCleanroomSuit: boolean;
    hasPerson: boolean;
  };
  // 新增：OCR检测详细结果
  ocrResult?: {
    success: boolean;
    full_text: string;
    detailed_results: Array<{
      text: string;
      confidence: number;
      bbox?: number[][];
    }>;
    text_count: number;
    matchStatus: 'qualified' | 'unqualified' | 'none';
    model_used?: string;
    error?: string;
    barcode_analysis?: {
      enabled: boolean;
      results: Array<{
        detectedText: string;
        expectedText: string;
        matchMode: 'contains' | 'exact';
        matched: boolean;
        confidence: number;
        type?: 'qr' | 'barcode';
        qrCodeData?: string;
        data?: string;
        location?: {
          x: number;
          y: number;
          width: number;
          height: number;
        };
        retryCount?: number;
        isRetryEnabled?: boolean;
      }>;
      overall_match: boolean;
      total_qr_codes_detected?: number;
      qr_codes_data?: string[];
      detection_summary?: string;
      retry_summary?: {
        totalRetries: number;
        successfulDetections: number;
        failedDetections: number;
      };
      isRetryEnabled?: boolean;
    };
  };
  barcodeResult?: {
    enabled: boolean;
    results: Array<{
      detectedText?: string;
      expectedText?: string;
      matchMode?: 'contains' | 'exact';
      matched: boolean;
      confidence: number;
      type?: 'qr' | 'barcode';
      qrCodeData?: string;
      data?: string;
      location?: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
      retryCount?: number;
      isRetryEnabled?: boolean;
    }>;
    overall_match: boolean;
    total_qr_codes_detected?: number;
    qr_codes_data?: string[];
    detection_summary?: string;
    retry_summary?: {
      totalRetries: number;
      successfulDetections: number;
      failedDetections: number;
    };
    isRetryEnabled?: boolean;
  };
  // 新增：LLM分析详细结果
  llmResult?: {
    overallQuality: '合格' | '存疑' | '需复检' | '存疑';
    score: number;
    reason: string;
    reasonKeywords?: string | string[];
    defects?: Defect[];
    // 新增：完整返回文本（可选，若前端直接传入）
    fullText?: string;
  };
  // 新增：为了兼容后端单独字段保存全文
  llm_full_text?: string;
  // 新增：页面“详细结果”结构化JSON
  llm_full_detail?: any;
  // 新增：多页面多工序追踪字段
  processStageCode?: string;
  processStageName?: string;
  pageInstanceId?: string;
  cameraId?: string;
  fixtureQr?: string;
  fixtureQrDetected?: boolean;
  fixtureQrSource?: 'vision' | 'scanner' | 'nfc' | 'manual';
  fixtureQrInputStatus?: 'success' | 'failed' | 'pending';
  fixtureQrConfidence?: number;
  businessCode?: string;
  businessCodeType?: string;
  traceConclusion?: '合格' | '存疑' | '需复检';
  traceConclusionReason?: string;
  fixtureRulePassed?: boolean | null;
  fixtureRuleReason?: string;
  traceRuleSummary?: string;
  traceRuleDetails?: any[];
  relatedStages?: any[];
  traceContext?: Record<string, any>;
  traceInfo?: {
    fixtureQr: string;
    fixtureQrDetected: boolean;
    fixtureQrSource?: 'vision' | 'scanner' | 'nfc' | 'manual';
    fixtureQrInputStatus?: 'success' | 'failed' | 'pending';
    fixtureQrConfidence?: number;
    processStageCode: string;
    processStageName?: string;
    pageInstanceId?: string;
    cameraId?: string;
    businessCode?: string;
    businessCodeType?: string;
    relatedStages?: Array<{
      stageCode: string;
      stageName?: string;
      businessCode?: string;
      status?: 'completed' | 'pending' | 'failed';
    }>;
    traceConclusion?: '合格' | '存疑' | '需复检';
    traceConclusionReason?: string;
    fixtureRulePassed?: boolean | null;
    fixtureRuleReason?: string;
    traceRuleSummary?: string;
    traceRuleDetails?: Array<{
      ruleId: string;
      ruleName: string;
      sourceStage: string;
      targetStage: string;
      passed: boolean | null;
      result: 'passed' | 'failed' | 'pending' | 'recheck';
      reason: string;
    }>;
  };
}

// 生产批次接口
export interface ProductionBatch {
  id: string;
  name?: string; // 批次名称 (兼容性)
  description?: string; // 批次描述 (兼容性)
  createdAt?: string; // 创建时间 (兼容性)
  batchNumber?: string;
  productName?: string;
  standardId?: string;
  totalQuantity?: number;
  currentQuantity?: number;
  startTime?: string;
  endTime?: string;
  status?: 'pending' | 'running' | 'paused' | 'completed';
  stats?: {
    qualified: number;
    unqualified: number;
    recheck: number;
    passRate: number;
  };
}

// 新增：洁净用品检测统计数据
export interface PPEDetectionStats {
  date: string;
  totalInspections: number;
  qualifiedCount: number;
  unqualifiedCount: number;
  recheckCount: number;
  qualifiedRate: number;
  captureCount: number;
  ppeDetections: {
    cleanroom_cap: number;
    mask: number;
    cleanroom_suit: number;
    person: number;
  };
}

// 新增：趋势数据
export interface PPETrendData {
  date: string;
  qualifiedRate: number;
  captureCount: number;
  qualifiedCount: number;
}


// YOLO检测结果接口
export interface BackendYoloDetection {
  label: string;
  confidence: number;
  bbox: { x1: number; y1: number; x2: number; y2: number };
}
