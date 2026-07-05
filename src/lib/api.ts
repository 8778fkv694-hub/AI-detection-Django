
import type { AIConfig, Standard, InspectionResult } from '@/types';
import { apiRequest, apiFetch, directBackendFetch, isLocalOfflineMode } from './config';
import { composeInspectionSystemPrompt } from './llmPrompt';
import { onnxYoloDetector } from './onnxYoloDetector';

// 本地模型分析接口
export async function analyzeImageLocal(
    image: string,
    localConfig: {
        modelName: string;
        systemPrompt: string;
        temperature: number;
        maxTokens: number;
        topP: number;
        topK: number;
        repeatPenalty: number;
    },
    standard?: Standard,
    finalPrompt?: string
): Promise<InspectionResult> {
    try {
        // 构建最终提示词
        const customPrompt = finalPrompt || standard?.overrideSystemPrompt || localConfig.systemPrompt;
        const systemPrompt = composeInspectionSystemPrompt({
            customPrompt,
            standard
        });

        // 构建消息 - 使用Ollama格式（content必须是字符串）
        const messages = [
            { role: 'system', content: systemPrompt },
            {
                role: 'user',
                content: `请检测这张待检图片。\n\n图片数据: data:image/jpeg;base64,${image}`
            }
        ];

        // 如果有标准图片，添加到消息中
        if (standard?.type === 'image_based' && standard.standardImage) {
            const standardImagePureBase64 = standard.standardImage.startsWith('data:')
                ? standard.standardImage.split(',')[1]
                : standard.standardImage;
            messages[1].content = `这是需要对比的"标准图"：\n\n标准图数据: data:image/jpeg;base64,${standardImagePureBase64}\n\n请检测这张待检图片。\n\n图片数据: data:image/jpeg;base64,${image}`;
        }

        // 调用 Django 8000 的 Ollama API，绕过静态服务器代理
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 180000); // 3分钟超时（180秒）

        const response = await directBackendFetch('/ollama/chat/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            signal: controller.signal,
            body: JSON.stringify({
                model: localConfig.modelName,
                messages,
                stream: false,
                options: {
                    temperature: localConfig.temperature,
                    top_p: localConfig.topP,
                    top_k: localConfig.topK,
                    repeat_penalty: localConfig.repeatPenalty,
                    num_predict: localConfig.maxTokens
                }
            })
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Ollama API错误: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const content = data.message?.content;

        if (!content) {
            throw new Error('Ollama API返回空内容');
        }

        // 解析JSON响应
        let result: InspectionResult;
        try {
            result = JSON.parse(content);
        } catch (parseError) {
            // 如果不是JSON格式，尝试提取JSON部分
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                result = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('无法解析AI返回的JSON格式');
            }
        }

        return result;

    } catch (error) {
        console.error('本地模型分析失败:', error);

        if (error instanceof Error) {
            if (error.name === 'AbortError') {
                throw new Error('本地模型分析超时，请检查模型是否正常运行');
            } else if (error.message.includes('Failed to fetch')) {
                throw new Error('无法连接到本地模型服务，请确保Ollama正在运行');
            } else if (error.message.includes('Load failed')) {
                throw new Error('模型加载失败，请检查模型是否正确安装');
            } else {
                throw new Error(`本地模型分析失败: ${error.message}`);
            }
        } else {
            throw new Error('本地模型分析失败: 未知错误');
        }
    }
}

// analyzeImage function remains unchanged...
export async function analyzeImage(image: string, config: AIConfig, standard?: Standard, finalPrompt?: string): Promise<InspectionResult> {
    return await apiRequest('/ai/analyze', {
        method: 'POST',
        body: JSON.stringify({ image, config, standard, finalPrompt }),
    });
}

// **这是正确的函数定义**
export async function testAIConnection(config: AIConfig): Promise<void> {
    const response = await apiRequest('/ai-configs/test-connection/', {
        method: 'POST',
        body: JSON.stringify({ config }),
    });

    if (!response.success) {
        throw new Error(response.message || 'AI模型连接测试失败');
    }
}

// API KEY余额查询接口
export interface BalanceData {
    total_available: number;
    currency: string;
    currency_symbol: string;
    formatted_balance: string;
}

export async function checkAPIBalance(config: AIConfig): Promise<BalanceData> {
    const response = await apiRequest('/ai-configs/check-balance', {
        method: 'POST',
        body: JSON.stringify({ config }),
    });

    if (!response.success) {
        throw new Error(response.message || 'API余额查询失败');
    }

    return response.data;
}

// 后端YOLO检测：调用 Django /api/results/yolo-detect/
export interface BackendYoloDetection {
    label: string;
    confidence: number;
    bbox: { x1: number; y1: number; x2: number; y2: number };
}

// 全局请求锁，防止并发请求
let isRequestInProgress = false;
let requestStartTime = 0;

export async function yoloDetectBackend(
    imageBase64: string,
    conf: number = 0.5,
    options?: {
        model_id?: string;
        detection_type?: 'cleanroom_ppe' | 'kit_matching' | 'ocr_inspection' | 'ocr_fusion_inspection' | 'general_quality';
    }
): Promise<BackendYoloDetection[]> {
    // 检查请求锁，如果超过10秒则强制释放
    const now = Date.now();
    if (isRequestInProgress && (now - requestStartTime) < 10000) {
        // console.log(`API请求进行中，跳过本次请求`);
        throw new Error(`请求进行中，请稍后重试`);
    } else if (isRequestInProgress && (now - requestStartTime) >= 10000) {
        // console.log(`🔓 请求锁超时，强制释放`);
        isRequestInProgress = false;
    }

    // 设置请求锁
    isRequestInProgress = true;
    requestStartTime = now;

    try {
        if (isLocalOfflineMode()) {
            console.log('[yoloDetectBackend] 📱💻 客户端离线模式下拦截 YOLO 检测请求，使用本地 ONNX 进行推理');
            try {
                // 根据 options 中的 model_id 或 detection_type 自动确定目标模型 ID
                let targetModelId = 'ppe_detection';
                if (options?.model_id) {
                    targetModelId = options.model_id;
                } else if (options?.detection_type === 'cleanroom_ppe') {
                    targetModelId = 'ppe_detection';
                } else if (options?.detection_type === 'general_quality') {
                    targetModelId = 'yolov8n';
                }

                const targetConfig = onnxYoloDetector.getModelConfigById(targetModelId);
                const activeConfig = onnxYoloDetector.getConfig();

                // 如果当前加载的不是目标模型，或者模型还没加载，就执行切换
                const isLoaded = onnxYoloDetector.getModelStatus().isLoaded;
                if (!isLoaded || activeConfig.modelPath !== targetConfig.modelPath) {
                    console.log(`[yoloDetectBackend] 🔄 正在切换本地 ONNX 模型为: ${targetModelId} (${targetConfig.modelPath})`);
                    const success = await onnxYoloDetector.switchModel(targetConfig.modelPath, targetConfig.classNames);
                    if (!success) {
                        throw new Error(`本地模型切换失败: ${targetModelId}`);
                    }
                }

                // 使用 ONNX Runtime WASM 进行检测
                const detections = await onnxYoloDetector.detect(imageBase64);
                
                // 根据传入置信度过滤
                const filtered = detections.filter(d => d.confidence >= conf);
                console.log(`[yoloDetectBackend] 📱💻 本地 ONNX 推理成功，模型: ${targetModelId}，检出 ${filtered.length} 个目标`);
                
                isRequestInProgress = false;
                return filtered;
            } catch (onnxError) {
                console.error('[yoloDetectBackend] 📱💻 本地 ONNX 推理失败，降级网络请求:', onnxError);
            }
        }

        const payload: any = {
            image: imageBase64,
            conf: conf
        };

        // 添加model_id或detection_type参数
        if (options?.model_id) {
            payload.model_id = options.model_id;
        }
        if (options?.detection_type) {
            payload.detection_type = options.detection_type;
        }

        let lastError: Error | null = null;
        const maxRetries = 2;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // console.log(`尝试调用后端检测 (第${attempt}次)...`);

                const response = await apiFetch('/results/yolo-detect/', {
                    method: 'POST',
                    body: JSON.stringify(payload),
                });

                const text = await response.text();

                if (!response.ok) {
                    try {
                        const err = JSON.parse(text);
                        const errorMsg = err.error || err.message || `请求失败，状态码: ${response.status}`;

                        // 检查是否是模型不可用的错误
                        if (err.error_type === 'model_unavailable' || err.error_type === 'specific_model_unavailable') {
                            const modelError = new Error(errorMsg);
                            (modelError as any).errorType = err.error_type;
                            (modelError as any).requiresUserConfirmation = err.requires_user_confirmation;
                            (modelError as any).suggestedAction = err.suggested_action;
                            throw modelError;
                        }

                        throw new Error(errorMsg);
                    } catch (parseError) {
                        if (parseError instanceof Error && (parseError as any).errorType) {
                            throw parseError;
                        }
                        throw new Error(text || `请求失败，状态码: ${response.status}`);
                    }
                }

                try {
                    const json = JSON.parse(text);
                    // console.log(`✅ 后端检测成功 (第${attempt}次尝试)`);
                    return json.detections as BackendYoloDetection[];
                } catch (e) {
                    throw new Error('后端返回格式异常，无法解析检测结果');
                }

            } catch (error) {
                lastError = error as Error;
                console.error(`第${attempt}次尝试失败:`, error);

                // 如果是模型不可用的错误，直接抛出，不重试
                if ((error as any).errorType === 'model_unavailable' || (error as any).errorType === 'specific_model_unavailable') {
                    throw error;
                }

                if (attempt < maxRetries) {
                    // 根据错误类型调整重试延迟
                    // 检查错误信息中是否包含429相关信息
                    const is429Error = lastError?.message?.includes('429') || lastError?.message?.includes('系统繁忙');
                    const delay = is429Error ? 3000 : 2000; // 429错误等待3秒，其他错误等待2秒
                    console.log(`等待${delay / 1000}秒后重试...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        // 所有重试都失败了
        throw new Error(`后端检测失败，已重试${maxRetries}次。最后错误: ${lastError?.message}`);
    } finally {
        // 释放请求锁
        isRequestInProgress = false;
        // console.log(`🔓 API请求锁已释放`);
    }
}

// 查询后端YOLO模型状态
export async function getYoloStatus(): Promise<{ loaded: boolean }> {
    const data = await apiRequest('/results/ppe-model-status/');
    return { loaded: data.status === 'loaded' };
}

// 模型配置接口类型
export interface ModelConfig {
    id: string;
    name: string;
    file: string;
    description: string;
    classes: string[];
    detection_type: 'cleanroom_ppe' | 'standard_inspection' | 'general_quality' | 'ocr_inspection' | 'ocr_fusion_inspection' | 'kit_matching' | 'unknown';
    confidence_threshold: number;
    iou_threshold: number;
    is_default: boolean;
    category: string;
    file_size: number;
    exists: boolean;
    class_names?: Record<string, string>; // 类别中文名称映射（可选，从后端获取）
    class_categories?: { // 类别分类分组（可选，从后端获取）
        names: string[]; // 名称类
        labels: string[]; // 标签类
        logos: string[]; // Logo类
        ppe: string[]; // 劳保类
        materials: string[]; // 材质类
        components: string[]; // 组件类
        features: string[]; // 特征类
        others: string[]; // 其他类
    };
}

// 获取可用的PPE检测模型列表（向后兼容，现在包含 detection_type）
export async function getAvailableModels(): Promise<{
    models: Array<ModelConfig>;
    current_model: string;
    message: string;
}> {
    return await apiRequest('/results/available-models/');
}

// 获取指定模型的完整配置信息
export async function getModelConfig(modelId?: string): Promise<{
    model?: ModelConfig;
    models?: Array<ModelConfig>;
    message: string;
}> {
    const url = modelId
        ? `/results/model-config/?model_id=${encodeURIComponent(modelId)}`
        : '/results/model-config/';
    return await apiRequest(url);
}

// 切换到指定的PPE检测模型
export async function switchPPEModel(modelId: string): Promise<{
    message: string;
    current_model: string;
    model_id: string;
}> {
    return await apiRequest('/results/switch-model/', {
        method: 'POST',
        body: JSON.stringify({ model_id: modelId })
    });
}

// 从模型池中移除指定模型
export async function removeModelFromPool(modelId: string): Promise<{
    success: boolean;
    message: string;
    removed_model?: string;
    loaded_models: string[];
    pool_size: number;
    current_model?: string;
}> {
    return await apiRequest('/results/remove-model/', {
        method: 'POST',
        body: JSON.stringify({ model_id: modelId })
    });
}

// 获取模型池状态信息
export async function getModelPoolStatus(): Promise<{
    loaded_models: string[];
    pool_size: number;
    max_pool_size: number;
    current_model: string | null;
    model_last_used: Record<string, string>;
}> {
    return await apiRequest('/results/model-pool-status/');
}

// 预加载后端YOLO模型
export async function preloadYolo(): Promise<{ loaded: boolean }> {
    // 由于模型已经在Django启动时加载，这里直接返回成功
    return { loaded: true };
}

// 模型管理相关接口
export interface ModelVersion {
    id: string;
    name: string;
    version: string;
    model_type: string;
    status: string;
    description: string;
    file_size: number;
    accuracy?: number;
    precision?: number;
    recall?: number;
    f1_score?: number;
    created_at: string;
    deployed_at?: string;
    author?: string;
}

export interface ModelUpload {
    id: string;
    status: string;
    progress: number;
    created_at: string;
    completed_at?: string;
    error_message?: string;
}

// 获取所有模型版本
export async function getModelVersions(): Promise<ModelVersion[]> {
    return await apiRequest('/model-versions/');
}

// 激活模型版本
export async function activateModel(modelId: string): Promise<{ message: string; model: ModelVersion }> {
    return await apiRequest(`/model-versions/${modelId}/activate/`, { method: 'POST' });
}

// 停用模型版本
export async function deactivateModel(modelId: string): Promise<{ message: string; model: ModelVersion }> {
    return await apiRequest(`/model-versions/${modelId}/deactivate/`, { method: 'POST' });
}

// 删除模型版本
export async function deleteModel(modelId: string): Promise<void> {
    await apiRequest(`/model-versions/${modelId}/`, { method: 'DELETE' });
}

// 上传模型文件
export async function uploadModel(
    file: File,
    name: string,
    version: string,
    modelType: string,
    description: string = ''
): Promise<{ message: string; upload: ModelUpload; model_version: ModelVersion }> {
    const formData = new FormData();
    formData.append('model_file', file);
    formData.append('name', name);
    formData.append('version', version);
    formData.append('model_type', modelType);
    formData.append('description', description);

    const response = await apiFetch('/model-uploads/upload_model/', {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) throw new Error(`上传模型失败: ${response.status}`);
    return await response.json();
}

// 获取上传进度
export async function getUploadProgress(uploadId: string): Promise<ModelUpload> {
    return await apiRequest(`/model-uploads/${uploadId}/`);
}

// 下载模型文件
export async function downloadModel(modelId: string): Promise<Blob> {
    const response = await apiFetch(`/model-versions/${modelId}/download/`, { method: 'GET' });
    if (!response.ok) throw new Error(`下载模型失败: ${response.status}`);
    return await response.blob();
}

// 导出模型配置
export async function exportModelConfig(): Promise<Blob> {
    const response = await apiFetch('/model-versions/export-config/', { method: 'GET' });
    if (!response.ok) throw new Error(`导出配置失败: ${response.status}`);
    return await response.blob();
}

// 导入模型配置
export async function importModelConfig(file: File): Promise<{ message: string }> {
    const formData = new FormData();
    formData.append('config_file', file);

    const response = await apiFetch('/model-versions/import-config/', {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) throw new Error(`导入配置失败: ${response.status}`);
    return await response.json();
}

// 数据统计接口类型
export interface DataStats {
    kit_matching: {
        count: number;
        size_bytes: number;
        size_mb: number;
        size_display: string;
    };
    ocr_results: {
        count: number;
        size_bytes: number;
        size_mb: number;
        size_display: string;
    };
    total: {
        count: number;
        size_bytes: number;
        size_mb: number;
        size_display: string;
    };
    timestamp: string;
}

// 获取数据统计信息
export async function getDataStats(): Promise<DataStats> {
    return await apiRequest('/results/data-stats/');
}

// ---- 洁净用品检测结果 / 健康系统对接（行动文档 W5，从 CleanroomInspectionResultsScreen 收口） ----
// 均为薄封装：返回原始 Response，调用方 .ok/.json() 处理逻辑保持不变。

export async function clearCleanroomResults(
    count: number,
    reason: string = '用户手动清除洁净用品检测结果'
): Promise<Response> {
    return apiFetch('/results/clear-cleanroom/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, count }),
    });
}

export async function fetchHealthSystemConfig(): Promise<Response> {
    return apiFetch('/reports/health-system-config/');
}

export async function saveHealthSystemConfig(configData: Record<string, any>): Promise<Response> {
    return apiFetch('/reports/health-system-config/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configData),
    });
}

export async function scanHealthSystemNetwork(): Promise<Response> {
    return apiFetch('/reports/scan-health-system/', { method: 'POST' });
}

// ---- ROI 缓存（useBatchProcessingManager 收口） ----
// 注：原调用为裸相对路径 '/api/yolo/cache-roi/'（未走 buildApiUrl），
// 改走 apiFetch 后可正确响应用户自定义的 API_SERVER_URL 配置。

export async function cacheRoiToBackend(payload: {
    label: string;
    roi_image: string;
    bbox: any;
    detection?: any;
}): Promise<Response> {
    return apiFetch('/yolo/cache-roi/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

// ---- 增强分析（EnhancedInspectionScreen 收口） ----

export async function enhanceAnalyzeResult(payload: {
    originalResult: any;
    standard: any;
    supplementaryPrompt: string;
    config: any;
}): Promise<Response> {
    return apiFetch('/ai/enhance-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

export async function sendReportToHealthSystem(reportData: Record<string, any>): Promise<Response> {
    return apiFetch('/reports/send-to-health-system/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reportData),
    });
}

/**
 * 探测用户手动填写的第三方健康系统地址是否可达。
 * 注意：这是探测任意局域网 IP，不走 Django API base url，故不能用 apiFetch（会被错误加上 baseURL 前缀）。
 */
export async function probeHealthSystemStatus(ipAddress: string, port: string): Promise<Response> {
    return fetch(`http://${ipAddress}:${port}/api/status`, { method: 'GET' });
}
