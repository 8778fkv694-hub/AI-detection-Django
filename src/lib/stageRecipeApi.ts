import type { KeywordConfig, BarcodeConfig } from '@/types/ocr';
import { apiRequest, apiFetch } from './config';

const ENDPOINT = '/stage-recipes/';

export interface StageRecipe {
  id: string;
  name: string;
  description: string;
  processStageCode: string;
  processStageName: string;
  fixtureEnabled: boolean;
  fixtureQrPrefixes: string;
  fixtureQrPattern: string;
  fixtureTemplateId: string | null;
  cameraId: string;
  currentModelId: string | null;
  selectedTargets: string[];
  nonGridTargets: string[];  // mini模式目标列表（不占格子，智能填充）
  targetConfidences: Record<string, number>;  // 每个目标独立置信度覆盖
  enableKeywordAnalysis: boolean;
  keywords: string;
  keywordConfigs: KeywordConfig[];
  keywordMatchMode: 'contains' | 'exact';
  minConfidence: number;
  enableBarcodeDetection: boolean;
  barcodeConfigs: BarcodeConfig[];
  ocrEngineModel: 'auto' | 'rapidocr' | 'paddleocr';
  detectionConfidence: number;
  fusionModeEnabled: boolean;
  selectedStandardId: string | null;
  // 检测流程参数
  autoCapture: boolean;
  captureDelaySeconds: number;
  detectionInterval: number;
  yoloTimeoutSeconds: number;
  yoloDetectionMode: 'or' | 'and';
  qrDetectIntervalSeconds: number;
  // 图像处理参数
  imageSaveMode: 'full' | 'roi';
  batchProcessingMode: 'stitching' | 'batch' | 'traditional';
  batchApplyRules: boolean;
  compressionEnabled: boolean;
  compressionConfig: { maxWidth: number; maxHeight: number; quality: number; maxSizeMB: number };
  roiWeightRatio: { area: number; clarity: number };
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  // 设备动作配置
  deviceActionMap: Record<string, Record<string, string>>;
  requiredDeviceTypes: string[];
  // 移动视角 / 就位信号（可选）— 控制采集工作流是否启用移动视角联控
  turntableEnabled: boolean;
  turntableStartCommand: string;
  turntableStopSignal: string;
  turntableTimeoutSeconds: number;
}

type RecipePayload = Omit<StageRecipe, 'id' | 'createdAt' | 'updatedAt'>;

function mapFromApi(data: any): StageRecipe {
  return {
    id: data.id,
    name: data.name ?? '',
    description: data.description ?? '',
    processStageCode: data.process_stage_code ?? '',
    processStageName: data.process_stage_name ?? '',
    fixtureEnabled: data.fixture_enabled ?? true,
    fixtureQrPrefixes: data.fixture_qr_prefixes ?? '',
    fixtureQrPattern: data.fixture_qr_pattern ?? '',
    fixtureTemplateId: data.fixture_template ?? null,
    cameraId: data.camera_id ?? '',
    currentModelId: data.current_model_id ?? '',
    selectedTargets: data.selected_targets ?? [],
    nonGridTargets: data.non_grid_targets ?? [],
    targetConfidences: data.target_confidences ?? {},
    enableKeywordAnalysis: data.enable_keyword_analysis ?? false,
    keywords: data.keywords ?? '',
    keywordConfigs: data.keyword_configs ?? [],
    keywordMatchMode: data.keyword_match_mode ?? 'contains',
    minConfidence: data.min_confidence ?? 0.5,
    enableBarcodeDetection: data.enable_barcode_detection ?? false,
    barcodeConfigs: data.barcode_configs ?? [],
    ocrEngineModel: data.ocr_engine_model ?? 'auto',
    detectionConfidence: data.detection_confidence ?? 0.7,
    fusionModeEnabled: data.fusion_mode_enabled ?? false,
    selectedStandardId: data.selected_standard_id ?? null,
    autoCapture: data.auto_capture ?? true,
    captureDelaySeconds: data.capture_delay_seconds ?? 0,
    detectionInterval: data.detection_interval ?? 0.1,
    yoloTimeoutSeconds: data.yolo_timeout_seconds ?? -1,
    yoloDetectionMode: data.yolo_detection_mode ?? 'or',
    qrDetectIntervalSeconds: data.qr_detect_interval_seconds ?? 3,
    imageSaveMode: data.image_save_mode ?? 'full',
    batchProcessingMode: data.batch_processing_mode ?? 'batch',
    batchApplyRules: data.batch_apply_rules ?? true,
    compressionEnabled: data.compression_enabled ?? false,
    compressionConfig: data.compression_config ?? { maxWidth: 1920, maxHeight: 1080, quality: 0.9, maxSizeMB: 1 },
    roiWeightRatio: data.roi_weight_ratio ?? { area: 60, clarity: 40 },
    isDefault: data.is_default ?? false,
    isActive: data.is_active ?? true,
    createdAt: data.created_at ?? '',
    updatedAt: data.updated_at ?? '',
    createdBy: data.created_by ?? '',
    deviceActionMap: data.device_action_map ?? { alarm: { qualified: 'GREEN\n', unqualified: 'RED\n', idle: 'OFF\n' } },
    requiredDeviceTypes: data.required_device_types ?? [],
    turntableEnabled: data.turntable_enabled ?? false,
    turntableStartCommand: data.turntable_start_command ?? 'START_ROTATE\n',
    turntableStopSignal: data.turntable_stop_signal ?? 'STOP_CAPTURE',
    turntableTimeoutSeconds: data.turntable_timeout_seconds ?? 30,
  };
}

function mapToApi(payload: Partial<RecipePayload>): Record<string, any> {
  const result: Record<string, any> = {};
  if (payload.name !== undefined) result.name = payload.name;
  if (payload.description !== undefined) result.description = payload.description;
  if (payload.processStageCode !== undefined) result.process_stage_code = payload.processStageCode;
  if (payload.processStageName !== undefined) result.process_stage_name = payload.processStageName;
  if (payload.fixtureEnabled !== undefined) result.fixture_enabled = payload.fixtureEnabled;
  if (payload.fixtureQrPrefixes !== undefined) result.fixture_qr_prefixes = payload.fixtureQrPrefixes;
  if (payload.fixtureQrPattern !== undefined) result.fixture_qr_pattern = payload.fixtureQrPattern;
  if (payload.fixtureTemplateId !== undefined) result.fixture_template = payload.fixtureTemplateId;
  if (payload.cameraId !== undefined) result.camera_id = payload.cameraId;
  if (payload.currentModelId !== undefined) result.current_model_id = payload.currentModelId;
  if (payload.selectedTargets !== undefined) result.selected_targets = payload.selectedTargets;
  if (payload.nonGridTargets !== undefined) result.non_grid_targets = payload.nonGridTargets;
  if (payload.targetConfidences !== undefined) result.target_confidences = payload.targetConfidences;
  if (payload.enableKeywordAnalysis !== undefined) result.enable_keyword_analysis = payload.enableKeywordAnalysis;
  if (payload.keywords !== undefined) result.keywords = payload.keywords;
  if (payload.keywordConfigs !== undefined) result.keyword_configs = payload.keywordConfigs;
  if (payload.keywordMatchMode !== undefined) result.keyword_match_mode = payload.keywordMatchMode;
  if (payload.minConfidence !== undefined) result.min_confidence = payload.minConfidence;
  if (payload.enableBarcodeDetection !== undefined) result.enable_barcode_detection = payload.enableBarcodeDetection;
  if (payload.barcodeConfigs !== undefined) result.barcode_configs = payload.barcodeConfigs;
  if (payload.ocrEngineModel !== undefined) result.ocr_engine_model = payload.ocrEngineModel;
  if (payload.detectionConfidence !== undefined) result.detection_confidence = payload.detectionConfidence;
  if (payload.fusionModeEnabled !== undefined) result.fusion_mode_enabled = payload.fusionModeEnabled;
  if (payload.selectedStandardId !== undefined) result.selected_standard_id = payload.selectedStandardId;
  if (payload.autoCapture !== undefined) result.auto_capture = payload.autoCapture;
  if (payload.captureDelaySeconds !== undefined) result.capture_delay_seconds = payload.captureDelaySeconds;
  if (payload.detectionInterval !== undefined) result.detection_interval = payload.detectionInterval;
  if (payload.yoloTimeoutSeconds !== undefined) result.yolo_timeout_seconds = payload.yoloTimeoutSeconds;
  if (payload.yoloDetectionMode !== undefined) result.yolo_detection_mode = payload.yoloDetectionMode;
  if (payload.qrDetectIntervalSeconds !== undefined) result.qr_detect_interval_seconds = payload.qrDetectIntervalSeconds;
  if (payload.imageSaveMode !== undefined) result.image_save_mode = payload.imageSaveMode;
  if (payload.batchProcessingMode !== undefined) result.batch_processing_mode = payload.batchProcessingMode;
  if (payload.batchApplyRules !== undefined) result.batch_apply_rules = payload.batchApplyRules;
  if (payload.compressionEnabled !== undefined) result.compression_enabled = payload.compressionEnabled;
  if (payload.compressionConfig !== undefined) result.compression_config = payload.compressionConfig;
  if (payload.roiWeightRatio !== undefined) result.roi_weight_ratio = payload.roiWeightRatio;
  if (payload.isDefault !== undefined) result.is_default = payload.isDefault;
  if (payload.isActive !== undefined) result.is_active = payload.isActive;
  if (payload.createdBy !== undefined) result.created_by = payload.createdBy;
  if (payload.deviceActionMap !== undefined) result.device_action_map = payload.deviceActionMap;
  if (payload.requiredDeviceTypes !== undefined) result.required_device_types = payload.requiredDeviceTypes;
  if (payload.turntableEnabled !== undefined) result.turntable_enabled = payload.turntableEnabled;
  if (payload.turntableStartCommand !== undefined) result.turntable_start_command = payload.turntableStartCommand;
  if (payload.turntableStopSignal !== undefined) result.turntable_stop_signal = payload.turntableStopSignal;
  if (payload.turntableTimeoutSeconds !== undefined) result.turntable_timeout_seconds = payload.turntableTimeoutSeconds;
  return result;
}

export async function fetchRecipes(): Promise<StageRecipe[]> {
  const data = await apiRequest<any[]>(ENDPOINT);
  return Array.isArray(data) ? data.map(mapFromApi) : [];
}

export async function createRecipe(payload: RecipePayload): Promise<StageRecipe> {
  const data = await apiRequest<any>(ENDPOINT, {
    method: 'POST',
    body: JSON.stringify(mapToApi(payload)),
  });
  return mapFromApi(data);
}

export async function updateRecipe(id: string, payload: Partial<RecipePayload>): Promise<StageRecipe> {
  const data = await apiRequest<any>(`${ENDPOINT}${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(mapToApi(payload)),
  });
  return mapFromApi(data);
}

export async function deleteRecipe(id: string): Promise<void> {
  const response = await apiFetch(`${ENDPOINT}${id}/`, { method: 'DELETE' });
  if (!response.ok && response.status !== 204) {
    const errorText = await response.text();
    throw new Error(errorText || '删除配方失败');
  }
}
