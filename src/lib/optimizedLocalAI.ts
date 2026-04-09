// 优化的本地AI调用方案
import type { InspectionResult, Standard } from '@/types';
import { DEFAULT_ACCURACY_CONFIG, applyAccuracyOptimization, determineQualityLevel, generateAnalysisReport } from './accuracyOptimization';
import { buildDirectBackendApiUrl, directBackendFetch } from './config';
import { composeInspectionSystemPrompt, DEFAULT_LLM_TASK_PROMPT, DEFAULT_LLM_USER_MESSAGE } from './llmPrompt';

// 服务健康检查接口
interface ServiceHealth {
  isHealthy: boolean;
  status: 'ready' | 'loading' | 'error' | 'unknown';
  message: string;
  lastCheck: number;
}

interface OptimizedLocalConfig {
  modelName: string;
  systemPrompt: string;
  userMessage: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  topK: number;
  repeatPenalty: number;
  // 新增优化参数
  batchSize: number;
  timeout: number;
  retryAttempts: number;
  memoryOptimization: boolean;
  contextLength: number; // 上下文长度 (tokens)
}

const DEFAULT_OPTIMIZED_CONFIG: OptimizedLocalConfig = {
  modelName: 'gemma4:e4b', // 默认使用 Gemma 4 模型
  systemPrompt: DEFAULT_LLM_TASK_PROMPT,
  userMessage: DEFAULT_LLM_USER_MESSAGE,
  temperature: 0.2, // 低温度，稳定输出
  maxTokens: 512, // 充足输出
  topP: 0.9,
  topK: 40,
  repeatPenalty: 1.1,
  batchSize: 1, // 单张处理
  timeout: 120000, // 2分钟超时（模型较大）
  retryAttempts: 3, // 增加重试次数
  memoryOptimization: false, // 关闭内存优化，充分利用内存
  contextLength: 8192 // 8K上下文长度
};

// 图片压缩函数已移除，使用实时检测页面的压缩函数

// 解析Moondream模型输出的原始数据
function parseMoondreamOutput(content: string, image: string, standard?: Standard): InspectionResult {
  console.log('🔍 解析Moondream输出:', content);

  // 清理内容，移除换行符和多余空格
  const cleanContent = content.trim().replace(/\n/g, ' ').replace(/\s+/g, ' ');
  console.log('🧹 清理后的内容:', cleanContent);

  // 尝试解析数字数组格式 [0.32, 0.71, 0.47, 0.82]
  const arrayMatch = cleanContent.match(/\[([0-9.,\s]+)\]/);
  if (arrayMatch) {
    try {
      const numbers = arrayMatch[1].split(',').map(n => parseFloat(n.trim()));
      console.log('📊 解析到数字数组:', numbers);

      // 计算平均分数
      const avgScore = numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
      const score = Math.round(avgScore * 100);

      // 根据分数判断质量
      let overallQuality: '合格' | '存疑' | '需复检' | '存疑' = '需复检';
      if (score >= 80) overallQuality = '合格';
      else if (score <= 50) overallQuality = '存疑';

      return {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        image: image,
        standardId: standard?.id || null,
        overallQuality,
        score: score,
        reason: `Moondream分析结果: 平均分数 ${score}分 (${numbers.length}个指标)`,
        reasonKeywords: 'Moondream分析',
        defects: []
      };
    } catch (e) {
      console.log('数字数组解析失败:', e);
    }
  }

  // 尝试解析单个数字 0.4
  const singleNumberMatch = cleanContent.match(/([0-9.]+)/);
  if (singleNumberMatch) {
    try {
      const num = parseFloat(singleNumberMatch[1]);
      console.log('📊 解析到单个数字:', num);

      // 检查是否为有效数字
      if (!isNaN(num) && num >= 0 && num <= 1) {
        const score = Math.round(num * 100);
        let overallQuality = '需复检';
        if (score >= 80) overallQuality = '合格';
        else if (score <= 50) overallQuality = '存疑';

        return {
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          image: image,
          standardId: standard?.id || null,
          overallQuality: overallQuality as any,
          score: score,
          reason: `Moondream分析结果: 分数 ${score}分`,
          reasonKeywords: 'Moondream分析',
          defects: []
        };
      }
    } catch (e) {
      console.log('单个数字解析失败:', e);
    }
  }

  // 尝试解析文本内容，提取质量信息
  const textContent = cleanContent.toLowerCase();
  console.log('📝 尝试解析文本内容:', textContent);

  // 改进的质量分析逻辑 - 更精确的评分机制
  let score = 50; // 默认分数
  let overallQuality: '合格' | '存疑' | '需复检' | '存疑' = '需复检';
  let reason = 'Moondream文本分析';

  // 通用质量检测关键词（不限于PPE）
  const qualityKeywords = {
    // 质量评估
    excellent: ['excellent', 'perfect', 'outstanding', 'excellent', '完美', '优秀', '杰出', '很好', '非常好'],
    good: ['good', 'well', 'proper', 'correct', '良好', '正确', '合适', '不错', '可以'],
    acceptable: ['ok', 'acceptable', 'adequate', 'passable', '可接受', '合格', '通过', '还行'],
    poor: ['poor', 'bad', 'incorrect', 'wrong', 'inadequate', '差', '存疑', '错误', '不好'],
    defective: ['defect', 'problem', 'issue', 'fault', '缺陷', '问题', '故障', '损坏', '破损'],

    // 检测结果相关
    detected: ['detected', 'found', 'identified', '检测到', '发现', '识别到'],
    notDetected: ['not detected', 'not found', 'missing', '未检测到', '未发现', '缺失'],
    present: ['present', 'visible', '存在', '可见', '有'],
    absent: ['absent', 'not visible', '不存在', '不可见', '没有']
  };

  // 根据用户提示词进行产品检测分析
  let detectedIssues = [];
  let detectedFeatures = [];

  // 分析检测结果
  if (qualityKeywords.excellent.some(keyword => textContent.includes(keyword))) {
    score = 90;
    overallQuality = '合格';
    reason = 'Moondream分析: 检测到优秀质量';
  } else if (qualityKeywords.good.some(keyword => textContent.includes(keyword))) {
    score = 80;
    overallQuality = '合格';
    reason = 'Moondream分析: 检测到良好质量';
  } else if (qualityKeywords.acceptable.some(keyword => textContent.includes(keyword))) {
    score = 70;
    overallQuality = '合格';
    reason = 'Moondream分析: 质量可接受';
  } else if (qualityKeywords.poor.some(keyword => textContent.includes(keyword))) {
    score = 40;
    overallQuality = '存疑';
    reason = 'Moondream分析: 检测到质量问题';
  } else if (qualityKeywords.defective.some(keyword => textContent.includes(keyword))) {
    score = 20;
    overallQuality = '存疑';
    reason = 'Moondream分析: 检测到缺陷';
  }

  // 检查是否检测到目标特征
  if (qualityKeywords.detected.some(keyword => textContent.includes(keyword))) {
    detectedFeatures.push('检测到目标特征');
  }

  if (qualityKeywords.notDetected.some(keyword => textContent.includes(keyword))) {
    detectedIssues.push('未检测到目标特征');
  }

  if (qualityKeywords.present.some(keyword => textContent.includes(keyword))) {
    detectedFeatures.push('目标存在');
  }

  if (qualityKeywords.absent.some(keyword => textContent.includes(keyword))) {
    detectedIssues.push('目标缺失');
  }

  // 根据检测标准调整分数
  if (standard?.name) {
    const standardName = standard.name.toLowerCase();
    console.log('🎯 检测标准:', standardName);

    // 如果检测标准包含特定要求，调整评分逻辑
    if (standardName.includes('眼镜') || standardName.includes('glasses')) {
      if (textContent.includes('检测到眼镜') || textContent.includes('眼镜') || textContent.includes('glasses')) {
        score = Math.max(score, 85);
        detectedFeatures.push('检测到眼镜');
        console.log('✅ 检测到眼镜');
      } else if (textContent.includes('未检测到眼镜') || textContent.includes('没有眼镜')) {
        score = Math.min(score, 30);
        detectedIssues.push('未检测到眼镜');
        console.log('❌ 未检测到眼镜');
      }
    }

    if (standardName.includes('缺陷') || standardName.includes('defect')) {
      if (textContent.includes('检测到缺陷') || textContent.includes('缺陷') || textContent.includes('defect') || textContent.includes('问题')) {
        score = Math.min(score, 25);
        detectedIssues.push('检测到缺陷');
        console.log('❌ 检测到缺陷');
      } else {
        score = Math.max(score, 80);
        detectedFeatures.push('无缺陷');
        console.log('✅ 无缺陷');
      }
    }

    // 通用检测逻辑 - 根据用户提示词中的关键词
    if ((standard as any)?.description) {
      const description = (standard as any).description.toLowerCase();
      console.log('📝 检测描述:', description);

      // 提取检测目标关键词
      const targetKeywords = description.match(/检测|检查|查看|寻找|识别|发现|分析/g);
      if (targetKeywords) {
        console.log('🔍 检测目标关键词:', targetKeywords);

        // 检查是否检测到目标
        const hasDetected = textContent.includes('检测到') || textContent.includes('发现') || textContent.includes('识别到');
        const hasNotDetected = textContent.includes('未检测到') || textContent.includes('未发现') || textContent.includes('没有');

        if (hasDetected) {
          score = Math.max(score, 80);
          detectedFeatures.push('检测到目标特征');
          console.log('✅ 检测到目标特征');
        } else if (hasNotDetected) {
          score = Math.min(score, 40);
          detectedIssues.push('未检测到目标特征');
          console.log('❌ 未检测到目标特征');
        }
      }
    }
  }

  // 应用准确性优化配置
  const optimizedScore = applyAccuracyOptimization(score, DEFAULT_ACCURACY_CONFIG);
  const finalOverallQuality = determineQualityLevel(optimizedScore, DEFAULT_ACCURACY_CONFIG);
  const baseReason = generateAnalysisReport(optimizedScore, detectedIssues, DEFAULT_ACCURACY_CONFIG);

  console.log(`🎯 准确性优化: ${score}分 -> ${optimizedScore}分 (${finalOverallQuality})`);

  // 生成详细的原因说明
  let detailedReason = baseReason;

  // 添加检测到的特征
  if (detectedFeatures.length > 0) {
    detailedReason += `\n\n检测到的特征：\n${detectedFeatures.map((feature, index) => `${index + 1}. ${feature}`).join('\n')}`;
  }

  // 添加检测到的问题
  if (detectedIssues.length > 0) {
    detailedReason += `\n\n检测到的问题：\n${detectedIssues.map((issue, index) => `${index + 1}. ${issue}`).join('\n')}`;
  }

  // 添加原始分析内容
  if (cleanContent && cleanContent.length > 0) {
    detailedReason += `\n\n原始分析：${cleanContent}`;
  }

  // 添加检测建议
  let suggestions = [];
  if (optimizedScore < 60) {
    suggestions.push('建议重新检查产品');
    suggestions.push('确认检测标准是否满足');
  } else if (optimizedScore < 80) {
    suggestions.push('产品基本合格，建议进一步检查');
  } else {
    suggestions.push('产品检测合格，符合要求');
  }

  if (suggestions.length > 0) {
    detailedReason += `\n\n改进建议：\n${suggestions.map((suggestion, index) => `${index + 1}. ${suggestion}`).join('\n')}`;
  }

  return {
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    image: image,
    standardId: standard?.id || null,
    overallQuality: finalOverallQuality,
    score: optimizedScore,
    reason: detailedReason,
    reasonKeywords: detectedIssues.length > 0 ? detectedIssues.join(', ') : (detectedFeatures.length > 0 ? detectedFeatures.join(', ') : '产品检测'),
    defects: detectedIssues.map(issue => ({
      type: 'product_issue',
      description: issue,
      severity: optimizedScore < 40 ? 'high' : optimizedScore < 60 ? 'medium' : 'low'
    }))
  };

  // 如果都无法解析，使用原始内容
  console.log('⚠️ 无法解析Moondream输出，使用原始内容');
  return {
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    image: image,
    standardId: standard?.id || null,
    overallQuality: '需复检',
    score: 50,
    reason: `Moondream原始输出: ${cleanContent}`,
    reasonKeywords: 'Moondream分析',
    defects: []
  };
}

// 高内存配置预设（适合24GB+内存）
export const HIGH_MEMORY_CONFIG: Partial<OptimizedLocalConfig> = {
  contextLength: 32768, // 32K上下文
  maxTokens: 2048, // 增加输出token数
  memoryOptimization: false, // 关闭内存优化，充分利用内存
  timeout: 900000, // 15分钟超时
  retryAttempts: 3 // 增加重试次数
};

// 超高内存配置预设（适合32GB+内存）
export const ULTRA_HIGH_MEMORY_CONFIG: Partial<OptimizedLocalConfig> = {
  contextLength: 65536, // 64K上下文
  maxTokens: 4096, // 更多输出token
  memoryOptimization: false,
  timeout: 1200000, // 20分钟超时
  retryAttempts: 3
};

// 快速模式配置（优先速度）
export const FAST_MODE_CONFIG: Partial<OptimizedLocalConfig> = {
  contextLength: 8192,  // 8K上下文，平衡速度和能力
  maxTokens: 512,       // 减少输出，提高速度
  memoryOptimization: true, // 启用内存优化
  timeout: 300000,      // 5分钟超时
  retryAttempts: 2,     // 减少重试
  temperature: 0.5,     // 降低随机性，提高速度
  topP: 0.8,           // 减少采样范围
  topK: 20             // 减少候选词
};

// 高分辨率模式配置（适合大图片）
export const HIGH_RESOLUTION_CONFIG: Partial<OptimizedLocalConfig> = {
  contextLength: 32768, // 32K上下文，支持大图片
  maxTokens: 2048,      // 更多输出
  memoryOptimization: false, // 关闭内存优化，充分利用内存
  timeout: 1200000,     // 20分钟超时
  retryAttempts: 3      // 增加重试
};

// MiniCPM-V 专用配置预设
export const MINICPM_V_CONFIG: Partial<OptimizedLocalConfig> = {
  modelName: 'minicpm-v:latest',
  systemPrompt: '你是一个专业的工业质检AI助手，擅长精确分析产品图像，识别缺陷和特征。请用专业、准确的中文回答。注意：defects数组中的severity字段只能是"轻微", "一般", "严重", "致命"四个值之一。',
  userMessage: '请按照标准严格分析这张图，返回JSON格式：{"overallQuality": "合格/存疑/需复检", "score": 85, "reason": "检测原因", "reasonKeywords": "关键词1,关键词2,关键词3", "defects": [{"type": "缺陷类型", "description": "缺陷描述", "severity": "轻微/一般/严重/致命"}]}',
  temperature: 0.2,     // 低温度，稳定输出
  maxTokens: 96,        // 短输出，提高速度
  topP: 0.9,
  topK: 40,
  repeatPenalty: 1.1,
  contextLength: 2048,  // 2K上下文，适合轻量级模型
  timeout: 60000,       // 1分钟超时
  retryAttempts: 3,
  memoryOptimization: true
};

// Moondream 快速模式（优先速度）
export const MOONDREAM_FAST_CONFIG: Partial<OptimizedLocalConfig> = {
  modelName: 'moondream-fast',
  temperature: 0.1,     // 更低温度
  maxTokens: 64,        // 更短输出
  contextLength: 1024,  // 更小上下文
  timeout: 30000,       // 30秒超时
  retryAttempts: 2      // 减少重试
};

// Moondream 高质量模式（平衡质量和速度）
export const MOONDREAM_QUALITY_CONFIG: Partial<OptimizedLocalConfig> = {
  modelName: 'moondream-fast',
  temperature: 0.3,     // 稍高温度，增加创造性
  maxTokens: 128,       // 更多输出
  contextLength: 2048,  // 标准上下文
  timeout: 90000,       // 1.5分钟超时
  retryAttempts: 3
};

// Moondream3 专用配置预设
export const MOONDREAM3_CONFIG: Partial<OptimizedLocalConfig> = {
  modelName: 'moondream3-preview',
  systemPrompt: '你是一个专业的图像分析AI助手，擅长快速准确地分析图像内容。请用简洁明了的中文回答。',
  userMessage: '请分析图片质量，返回JSON格式结果',
  temperature: 0.2,     // 低温度，稳定输出
  maxTokens: 96,        // 短输出，提高速度
  topP: 0.9,
  topK: 40,
  repeatPenalty: 1.1,
  contextLength: 2048,  // 2K上下文，适合轻量级模型
  timeout: 60000,       // 1分钟超时
  retryAttempts: 3,
  memoryOptimization: true
};

// Moondream3 快速模式（优先速度）
export const MOONDREAM3_FAST_CONFIG: Partial<OptimizedLocalConfig> = {
  modelName: 'moondream3-preview',
  temperature: 0.1,     // 更低温度
  maxTokens: 64,        // 更短输出
  contextLength: 1024,  // 更小上下文
  timeout: 30000,       // 30秒超时
  retryAttempts: 2      // 减少重试
};

// Moondream3 高质量模式（平衡质量和速度）
export const MOONDREAM3_QUALITY_CONFIG: Partial<OptimizedLocalConfig> = {
  modelName: 'moondream3-preview',
  temperature: 0.3,     // 稍高温度，增加创造性
  maxTokens: 128,       // 更多输出
  contextLength: 2048,  // 标准上下文
  timeout: 90000,       // 1.5分钟超时
  retryAttempts: 3
};

// Gemma 4 专用配置预设（Google最新多模态模型，支持图像理解）
export const GEMMA4_CONFIG: Partial<OptimizedLocalConfig> = {
  modelName: 'gemma4:e4b',
  systemPrompt: '你是一个专业的工业质检AI助手，擅长精确分析产品图像，识别缺陷和特征。请用专业、准确的中文回答。注意：defects数组中的severity字段只能是"轻微", "一般", "严重", "致命"四个值之一。',
  userMessage: '请按照标准严格分析这张图，返回JSON格式：{"overallQuality": "合格/存疑/需复检", "score": 85, "reason": "检测原因", "reasonKeywords": "关键词1,关键词2,关键词3", "defects": [{"type": "缺陷类型", "description": "缺陷描述", "severity": "轻微/一般/严重/致命"}]}',
  temperature: 0.2,     // 低温度，稳定输出
  maxTokens: 512,       // 充足输出
  topP: 0.9,
  topK: 40,
  repeatPenalty: 1.1,
  contextLength: 8192,  // 8K上下文
  timeout: 120000,      // 2分钟超时（模型较大）
  retryAttempts: 3,
  memoryOptimization: false
};

// 服务健康检查函数
let healthCache: ServiceHealth | null = null;
const HEALTH_CACHE_DURATION = 5000; // 5秒缓存

export async function checkOllamaHealth(): Promise<ServiceHealth> {
  const now = Date.now();

  // 如果缓存有效，直接返回缓存结果
  if (healthCache && (now - healthCache.lastCheck) < HEALTH_CACHE_DURATION) {
    return healthCache;
  }

  try {
    console.log('检查Ollama服务健康状态...');

    // 直接检查 Django 8000 的 Ollama 状态接口，绕过静态服务器代理
    const ollamaController = new AbortController();
    const ollamaTimeoutId = setTimeout(() => ollamaController.abort(), 5000);

    const ollamaResponse = await directBackendFetch('/ollama/status/', {
      method: 'GET',
      signal: ollamaController.signal
    });

    clearTimeout(ollamaTimeoutId);

    if (!ollamaResponse.ok) {
      healthCache = {
        isHealthy: false,
        status: 'error',
        message: `状态检查失败，请检查 Django/Ollama 服务是否正在运行`,
        lastCheck: now
      };
      return healthCache;
    }

    const statusData = await ollamaResponse.json();
    const models = Array.isArray(statusData.models) ? statusData.models : [];

    if (!statusData.success || statusData.status !== 'running') {
      healthCache = {
        isHealthy: false,
        status: 'error',
        message: statusData.message || 'Ollama 服务未就绪',
        lastCheck: now
      };
      return healthCache;
    }

    if (models.length === 0) {
      healthCache = {
        isHealthy: false,
        status: 'error',
        message: 'Ollama 服务已运行，但没有可用模型',
        lastCheck: now
      };
      return healthCache;
    }

    healthCache = {
      isHealthy: true,
      status: 'ready',
      message: statusData.message || `Ollama服务运行正常，已发现 ${models.length} 个模型`,
      lastCheck: now
    };

    console.log('Ollama服务健康检查通过:', healthCache.message);
    return healthCache;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('Ollama服务健康检查失败:', errorMessage);

    healthCache = {
      isHealthy: false,
      status: 'error',
      message: `服务检查失败: ${errorMessage}`,
      lastCheck: now
    };
    return healthCache;
  }
}

// 简化的 Ollama 状态检查
export async function checkProxyService(): Promise<boolean> {
  try {
    const response = await directBackendFetch('/ollama/status/', {
      method: 'GET',
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return data.success === true && data.status === 'running';
  } catch {
    return false;
  }
}

// 等待服务就绪函数
export async function waitForServiceReady(maxWaitTime: number = 30000): Promise<boolean> {
  const startTime = Date.now();
  const checkInterval = 2000; // 每2秒检查一次

  console.log('等待Ollama服务就绪...');

  while (Date.now() - startTime < maxWaitTime) {
    // 首先尝试轻量状态检查
    const proxyOk = await checkProxyService();
    if (proxyOk) {
      console.log('Ollama状态接口已就绪');
      return true;
    }

    // 如果轻量检查失败，再进行完整的健康检查
    const health = await checkOllamaHealth();

    if (health.isHealthy) {
      console.log('Ollama服务已就绪');
      return true;
    }

    console.log(`服务状态: ${health.status} - ${health.message}`);
    console.log(`等待 ${checkInterval / 1000} 秒后重试...`);

    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }

  console.error('等待服务就绪超时');
  return false;
}

// 优化的本地模型分析
export async function analyzeImageLocalOptimized(
  image: string,
  localConfig: Partial<OptimizedLocalConfig> = {},
  standard?: Standard,
  finalPrompt?: string,
  onPromptGenerated?: (prompt: string) => void
): Promise<InspectionResult> {
  // 优先使用传入的配置，确保使用用户选择的模型和提示词
  const config = { ...DEFAULT_OPTIMIZED_CONFIG, ...localConfig };
  console.log('🔧 使用配置:', {
    modelName: config.modelName,
    systemPrompt: config.systemPrompt?.substring(0, 50) + '...',
    userMessage: config.userMessage?.substring(0, 50) + '...'
  });

  try {
    // 1. 服务健康检查和初始延迟
    console.log('开始AI分析，首先检查服务状态...');

    // 添加初始延迟，确保服务完全启动
    console.log('等待服务完全启动...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 检查服务健康状态
    const health = await checkOllamaHealth();
    if (!health.isHealthy) {
      console.warn('服务健康检查失败，尝试等待服务就绪...');
      const isReady = await waitForServiceReady(5000); // 减少等待时间到5秒
      if (!isReady) {
        console.warn('服务健康检查失败，但继续尝试API调用...');
        // 不直接抛出错误，而是继续尝试API调用
        // 让重试机制来处理实际的连接问题
      }
    }

    console.log('服务状态检查通过，开始分析图片...');

    // 性能监控开始
    const startTime = performance.now();
    const startMemory = (performance as any).memory ? (performance as any).memory.usedJSHeapSize : 0;
    console.log('🚀 开始AI分析性能监控...');

    // 1. 直接使用已压缩的360p图片，不再进一步压缩
    const compressedImage = image;

    // 2. 构建优化的提示词 - 优先使用选中的标准模板
    const customPrompt = finalPrompt || standard?.overrideSystemPrompt || config.systemPrompt;
    const systemPrompt = composeInspectionSystemPrompt({
      customPrompt,
      standard
    });

    if (finalPrompt) {
      console.log('使用传入的最终提示词并自动注入握手提示');
    } else if (standard?.overrideSystemPrompt) {
      console.log('使用标准模板的自定义提示词并自动注入握手提示:', standard.name);
    } else if (standard) {
      console.log('使用默认提示词并自动附加标准详情:', standard.name);
    } else {
      console.log('使用默认提示词并自动注入握手提示（无标准模板）');
    }

    console.log('最终系统提示词:', systemPrompt.substring(0, 200) + '...');

    // 3. 构建消息 - 使用 Ollama images 字段传递图片（不嵌入base64到文本）
    const userMessage = config.userMessage;

    console.log('使用的用户消息配置:', userMessage);

    // 提取纯 base64 数据（去掉 data:image/... 前缀）
    const pureBase64Image = compressedImage.startsWith('data:')
      ? compressedImage.split(',')[1]
      : compressedImage;

    // 4. 构建图片列表（通过 Ollama images 字段传递，不占用 token 上下文）
    const imageList: string[] = [];

    if (standard?.standardImage) {
      const standardImagePureBase64 = standard.standardImage.startsWith('data:')
        ? standard.standardImage.split(',')[1]
        : standard.standardImage;
      imageList.push(standardImagePureBase64); // 标准图
      imageList.push(pureBase64Image);          // 检测图
    } else {
      imageList.push(pureBase64Image);           // 仅检测图
    }

    const userContent = standard?.standardImage
      ? `${userMessage}\n\n第一张是标准参考图，第二张是待检测图，请对比分析。`
      : userMessage;

    const messages: Array<{ role: string; content: string; images?: string[] }> = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: userContent,
        images: imageList
      }
    ];

    // 构建完整的提示词用于显示
    const fullPrompt = `系统提示词:\n${systemPrompt}\n\n用户消息:\n${userContent}\n\n[图片通过images字段传递，共${imageList.length}张]`;

    // 如果有回调函数，返回完整提示词
    if (onPromptGenerated) {
      onPromptGenerated(fullPrompt);
    }

    // 5. 优化的API调用 - 使用与本地模型页面相同的调用方式
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout);

    // 移除临时测试代码，直接进行正常的图片分析

    console.log('调用Ollama API，模型:', config.modelName);
    console.log('消息数量:', messages.length);
    console.log('系统提示词长度:', systemPrompt.length, '字符');
    console.log('用户消息文本长度:', userContent.length, '字符');
    console.log('图片数量:', imageList.length, '张 (通过images字段传递)');
    console.log('图片数据大小估算:', Math.round(pureBase64Image.length * 0.75 / 1024), 'KB');
    console.log('系统提示词内容:', systemPrompt);
    console.log('用户消息内容:', userContent);

    // 检查请求体大小
    // Gemma4 等支持 thinking 的模型：关闭 think 以提速（质检场景不需要推理链）
    const isThinkingModel = config.modelName.includes('gemma4') || config.modelName.includes('qwq');
    const requestBody: Record<string, any> = {
      model: config.modelName,
      messages,
      stream: false,
      ...(isThinkingModel ? { think: false } : {}),
      options: {
        temperature: config.temperature,
        top_p: config.topP,
        top_k: config.topK,
        repeat_penalty: config.repeatPenalty,
        num_predict: config.maxTokens,
        num_ctx: config.contextLength,
        num_gpu_layers: 999,
        num_thread: 4,
        f16_kv: true,
        low_vram: false,
        num_keep: 4,
        use_mmap: true,
        use_mlock: true,
        keep_alive: '2h'
      }
    };

    const requestBodyString = JSON.stringify(requestBody);
    console.log('请求体大小:', Math.round(requestBodyString.length / 1024), 'KB');

    if (requestBodyString.length > 10 * 1024 * 1024) { // 10MB
      console.warn('请求体过大，可能导致连接问题');
    }

    // 添加重试机制
    let response;
    let lastError;

    for (let attempt = 1; attempt <= config.retryAttempts; attempt++) {
      try {
        console.log(`发送请求到 Django Ollama 接口... (尝试 ${attempt}/${config.retryAttempts})`);
        response = await fetch(buildDirectBackendApiUrl('/ollama/chat/'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
          body: requestBodyString
        });
        console.log('收到 Django Ollama 接口响应，状态码:', response.status);
        break; // 成功则跳出重试循环
      } catch (error) {
        lastError = error;
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        console.warn(`请求失败 (尝试 ${attempt}/${config.retryAttempts}):`, errorMessage);

        if (attempt < config.retryAttempts) {
          console.log(`等待 ${attempt * 2} 秒后重试...`);
          await new Promise(resolve => setTimeout(resolve, attempt * 2000));
        }
      }
    }

    if (!response) {
      throw lastError || new Error('所有重试尝试都失败了');
    }

    clearTimeout(timeoutId);

    console.log('Ollama API响应状态:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Ollama API错误响应:', errorText);
      throw new Error(`Ollama API错误: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    console.log('Ollama API响应数据:', data);

    const content = data.message?.content;
    console.log('AI模型返回的内容:', content);

    if (!content) {
      console.error('Ollama API返回空内容，完整响应:', data);
      throw new Error('Ollama API返回空内容');
    }

    // 6. 解析JSON响应
    let result: InspectionResult;
    try {
      console.log('尝试直接解析JSON:', content);
      result = JSON.parse(content);
      console.log('JSON解析成功:', result);
    } catch (parseError) {
      console.log('直接JSON解析失败，尝试提取JSON部分:', parseError);
      // 如果不是JSON格式，尝试提取JSON部分
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        console.log('找到JSON匹配:', jsonMatch[0]);
        try {
          result = JSON.parse(jsonMatch[0]);
          console.log('提取的JSON解析成功:', result);
        } catch (jsonParseError) {
          console.log('提取的JSON也无法解析，尝试解析Moondream原始数据');
          // 尝试解析Moondream返回的原始数据
          result = parseMoondreamOutput(content, image, standard);
        }
      } else {
        console.log('无法找到JSON格式，尝试解析Moondream原始数据');
        // 尝试解析Moondream返回的原始数据
        result = parseMoondreamOutput(content, image, standard);
      }
    }

    // 性能监控结束
    const endTime = performance.now();
    const endMemory = (performance as any).memory ? (performance as any).memory.usedJSHeapSize : 0;
    const totalTime = Math.round(endTime - startTime);
    const memoryUsed = Math.round((endMemory - startMemory) / 1024 / 1024);

    console.log('📊 AI分析性能报告:');
    console.log(`⏱️  总耗时: ${totalTime}ms`);
    console.log(`🧠 内存使用: ${memoryUsed}MB`);
    console.log(`📝 上下文长度: ${config.contextLength} tokens`);
    console.log(`🔤 输出token: ${config.maxTokens}`);
    console.log(`⚡ 处理速度: ${Math.round(1000 / totalTime * 60)} 张/分钟`);

    // 性能建议
    if (totalTime > 30000) { // 超过30秒
      console.warn('⚠️ 分析时间较长，建议检查图片大小或简化提示词');
    } else if (totalTime < 5000) { // 少于5秒
      console.log('✅ 分析速度很快！');
    }

    return result;

  } catch (error) {
    console.error('优化本地模型分析失败:', error);

    // 详细的错误分类和处理
    if (error instanceof Error) {
      const errorMessage = error.message;

      // 超时错误
      if (error.name === 'AbortError') {
        console.error('请求超时，可能原因：模型处理时间过长或网络不稳定');
        throw new Error('AI分析超时，请检查模型状态或尝试减少图片大小');
      }

      // 网络连接错误
      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('Load failed')) {
        console.error('网络连接问题，检查服务状态');
        const health = await checkOllamaHealth().catch(() => null);
        if (health && !health.isHealthy) {
          throw new Error(`服务不可用: ${health.message}。请检查Ollama服务是否正在运行`);
        } else {
          throw new Error('网络连接失败，请检查网络连接和Ollama服务状态');
        }
      }

      // 模型加载错误
      if (errorMessage.includes('Load failed')) {
        console.error('模型加载失败，可能原因：模型文件损坏或内存不足');
        throw new Error('模型加载失败，请重启Ollama服务或检查模型文件');
      }

      // 上下文取消错误
      if (errorMessage.includes('context canceled')) {
        console.error('请求被取消，可能原因：提示词过长或模型处理超时');
        throw new Error('AI处理超时，提示词可能过长，请尝试减少图片大小或简化提示词');
      }

      // 服务不可用错误
      if (errorMessage.includes('服务不可用')) {
        console.error('服务健康检查失败');
        throw error; // 直接抛出，因为已经包含了详细信息
      }

      // 其他错误
      console.error('未知错误类型:', errorMessage);
      throw new Error(`AI分析失败: ${errorMessage}。请检查服务状态或联系技术支持`);
    } else {
      console.error('非Error类型的异常:', error);
      throw new Error('AI分析失败: 未知错误类型，请检查服务状态');
    }
  }
}

// 内存监控和清理
export function monitorMemoryUsage() {
  if ('memory' in performance) {
    const memory = (performance as any).memory;
    const usedMB = Math.round(memory.usedJSHeapSize / 1024 / 1024);
    const totalMB = Math.round(memory.totalJSHeapSize / 1024 / 1024);
    const limitMB = Math.round(memory.jsHeapSizeLimit / 1024 / 1024);
    const usagePercent = Math.round((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100);

    console.log('内存使用情况:', {
      used: usedMB + 'MB',
      total: totalMB + 'MB',
      limit: limitMB + 'MB',
      usage: usagePercent + '%'
    });

    // 针对24GB内存，调整警告阈值到90%
    if (usagePercent > 90) {
      console.warn(`内存使用率过高 (${usagePercent}%)，建议清理缓存`);
      return true;
    } else if (usagePercent > 70) {
      console.log(`内存使用率: ${usagePercent}% (正常范围)`);
    }
  }
  return false;
}

// 高内存环境检测
export function detectHighMemoryEnvironment(): boolean {
  if ('memory' in performance) {
    const memory = (performance as any).memory;
    const limitGB = memory.jsHeapSizeLimit / 1024 / 1024 / 1024;
    return limitGB >= 8; // 8GB以上认为是高内存环境
  }
  return false;
}

// 批量处理优化
export async function batchAnalyzeImages(
  images: string[],
  config: Partial<OptimizedLocalConfig> = {},
  standard?: Standard
): Promise<InspectionResult[]> {
  const results: InspectionResult[] = [];
  const batchSize = config.batchSize || 1;

  for (let i = 0; i < images.length; i += batchSize) {
    const batch = images.slice(i, i + batchSize);
    const batchPromises = batch.map(image =>
      analyzeImageLocalOptimized(image, config, standard)
    );

    try {
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // 每处理一批后检查内存
      if (monitorMemoryUsage()) {
        // 强制垃圾回收
        if (window.gc) {
          window.gc();
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      console.error(`批量处理第${i + 1}批失败:`, errorMessage);
      // 添加错误结果
      results.push({
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        image: '',
        standardId: null,
        overallQuality: '需复检',
        score: 0,
        reason: `批量处理失败: ${errorMessage}`,
        defects: []
      });
    }
  }

  return results;
}
