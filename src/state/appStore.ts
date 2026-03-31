
import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Standard, InspectionResult } from '@/types';
import { apiFetch, apiRequest } from '@/lib/config';

// 安全的JSON解析函数
const safeJsonParse = (jsonString: string, defaultValue: any = null) => {
  try {
    if (typeof jsonString === 'string' && jsonString.trim()) {
      return JSON.parse(jsonString);
    }
    return defaultValue;
  } catch (error) {
    console.warn('JSON解析失败:', jsonString, error);
    return defaultValue;
  }
};

interface AppState {
  standards: Standard[];
  results: InspectionResult[];
  lastSyncTime: number;
  isSyncing: boolean;
  fetchStandards: () => Promise<void>;
  addStandard: (standard: Omit<Standard, 'id'>) => Promise<void>;
  updateStandard: (standard: Standard) => Promise<void>;
  deleteStandard: (id: string) => Promise<void>;
  fetchResults: () => Promise<void>;
  addResult: (result: InspectionResult) => Promise<any>;
  deleteResult: (id: string) => Promise<void>;
  clearAllResults: () => Promise<void>;
  clearResultsByType: (detectionType: string) => Promise<void>;
  syncData: () => Promise<void>;
  startAutoSync: () => () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  standards: [],
  results: [],
  lastSyncTime: 0,
  isSyncing: false,

  fetchStandards: async () => {
    try {
      const response = await apiFetch('/standards/', {
        headers: { 'Accept': 'application/json' }
      });
      if (!response.ok) throw new Error('获取标准失败');
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await response.text();
        throw new Error(`获取标准失败: 非JSON响应: ${text.slice(0, 200)}...`);
      }
      const data = await response.json();
      // 解析inspectionAreas字段、sendStandardImage字段和defectTypes字段
      const standardsWithAreas = data.map((standard: any) => ({
        ...standard,
        inspectionAreas: standard.inspectionAreas ? safeJsonParse(standard.inspectionAreas, []) : [],
        sendStandardImage: standard.sendStandardImage === 1 || standard.sendStandardImage === true,
        defectTypes: standard.defectTypes ? safeJsonParse(standard.defectTypes, undefined) : undefined
      }));
      set({ standards: standardsWithAreas });
    } catch (error) {
      console.error('获取标准失败:', error);
      throw error;
    }
  },

  addStandard: async (standard) => {
    try {
      const standardWithId = { ...standard, id: uuidv4() };
      const response = await apiFetch('/standards/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(standardWithId),
      });
      if (!response.ok) throw new Error('添加标准失败');
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await response.text();
        throw new Error(`添加标准失败: 非JSON响应: ${text.slice(0, 200)}...`);
      }
      const newStandard = await response.json();
      set(state => ({ standards: [...state.standards, newStandard] }));
    } catch (error) {
      console.error('添加标准失败:', error);
      throw error;
    }
  },

  updateStandard: async (standard) => {
    try {
      const response = await apiFetch(`/standards/${standard.id}/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(standard),
      });
      if (!response.ok) throw new Error('更新标准失败');
      set(state => ({ standards: state.standards.map(s => s.id === standard.id ? standard : s), }));
    } catch (error) {
      console.error('更新标准失败:', error);
      throw error;
    }
  },

  deleteStandard: async (id) => {
    try {
      const response = await apiFetch(`/standards/${id}/`, { method: 'DELETE', headers: { 'Accept': 'application/json' } });
      if (!response.ok) throw new Error('删除标准失败');
      set(state => ({ standards: state.standards.filter(s => s.id !== id) }));
    } catch (error) {
      console.error('删除标准失败:', error);
      throw error;
    }
  },

  fetchResults: async () => {
    try {
      set({ isSyncing: true });
      // 获取检测结果（仅在开发模式下输出日志）
      if (process.env.NODE_ENV === 'development') {
        console.log('🔄 开始获取检测结果...');
      }
      const response = await apiFetch('/results/?limit=20', { headers: { 'Accept': 'application/json' } });
      if (!response.ok) throw new Error('获取结果失败');
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await response.text();
        throw new Error(`获取结果失败: 非JSON响应: ${text.slice(0, 200)}...`);
      }
      const data = await response.json();
      // 获取结果统计（仅在开发模式下输出日志）
      if (process.env.NODE_ENV === 'development') {
        console.log('📊 获取到的检测结果:');
        console.log('  - 结果数量:', data.length);
      }
      // 转换字段名以匹配前端接口
      const transformedData = data.map((item: any) => ({
        ...item,
        standardId: item.standard_id, // 转换字段名
        overallQuality: item.overall_quality, // 转换字段名
        reasonKeywords: item.reason_keywords, // 转换字段名
        detectionType: item.detection_type, // 转换字段名
        llmResult: item.llm_result, // 转换LLM结果字段名
        ocrResult: item.ocr_result, // 转换OCR结果字段名
        barcodeResult: item.barcode_result, // 转换二维码结果字段名
        comment: item.comment, // 注释字段（字段名相同，但确保包含）
        llm_full_text: item.llm_full_text, // 新增：完整文本
        llm_full_detail: item.llm_full_detail, // 新增：结构化详细结果
        processStageCode: item.process_stage_code,
        processStageName: item.process_stage_name,
        pageInstanceId: item.page_instance_id,
        cameraId: item.camera_id,
        fixtureQr: item.fixture_qr,
        fixtureQrDetected: item.fixture_qr_detected,
        fixtureQrSource: item.fixture_qr_source,
        fixtureQrInputStatus: item.fixture_qr_input_status,
        fixtureQrConfidence: item.fixture_qr_confidence,
        businessCode: item.business_code,
        businessCodeType: item.business_code_type,
        traceConclusion: item.trace_conclusion,
        traceConclusionReason: item.trace_conclusion_reason,
        fixtureRulePassed: item.fixture_rule_passed,
        fixtureRuleReason: item.fixture_rule_reason,
        traceRuleSummary: item.trace_rule_summary,
        traceRuleDetails: item.trace_rule_details,
        relatedStages: item.related_stages,
        traceContext: item.trace_context,
        traceInfo: {
          fixtureQr: item.fixture_qr || '',
          fixtureQrDetected: !!item.fixture_qr_detected,
          fixtureQrSource: item.fixture_qr_source,
          fixtureQrInputStatus: item.fixture_qr_input_status,
          fixtureQrConfidence: item.fixture_qr_confidence,
          processStageCode: item.process_stage_code || '',
          processStageName: item.process_stage_name,
          pageInstanceId: item.page_instance_id,
          cameraId: item.camera_id,
          businessCode: item.business_code,
          businessCodeType: item.business_code_type,
          relatedStages: item.related_stages || [],
          traceConclusion: item.trace_conclusion,
          traceConclusionReason: item.trace_conclusion_reason,
          fixtureRulePassed: item.fixture_rule_passed,
          fixtureRuleReason: item.fixture_rule_reason,
          traceRuleSummary: item.trace_rule_summary,
          traceRuleDetails: item.trace_rule_details || [],
        },
      }));

      // 字段转换完成（仅在开发模式下输出日志）
      if (process.env.NODE_ENV === 'development') {
        console.log('🔄 字段转换完成');
      }

      set({
        results: transformedData,
        lastSyncTime: Date.now(),
        isSyncing: false
      });
    } catch (error) {
      console.error('获取结果失败:', error);
      set({ isSyncing: false });
      throw error;
    }
  },

  addResult: async (result) => {
    try {
      // 直接保存到Django后端，并捕获返回的 trace_context 等字段
      const savedData = await apiRequest('/results/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          image: result.image || 'data:image/jpeg;base64,', // 传递图片数据，如果没有则传递空base64
          overall_quality: result.overallQuality,
          score: result.score, // 保持0-100范围
          reason: result.reason,
          reason_keywords: result.reasonKeywords || '',
          standard_id: result.standardId || null,
          detection_type: result.detectionType || 'unknown', // 添加检测类型字段
          defects: result.defects || [],
          // 新增：传递OCR和LLM详细结果
          ocr_result: result.ocrResult || null,
          llm_result: result.llmResult || null,
          // 新增：单独传递二维码/条码检测结果
          barcode_result: (result as any).barcodeResult || null,
          // 新增：单独传递LLM完整文本与结构化详细结果（如有）
          llm_full_text: (result as any).llm_full_text || result.llmResult?.fullText || undefined,
          llm_full_detail: (result as any).llm_full_detail || undefined,
          process_stage_code: (result as any).processStageCode || '',
          process_stage_name: (result as any).processStageName || '',
          page_instance_id: (result as any).pageInstanceId || '',
          camera_id: (result as any).cameraId || '',
          fixture_qr: (result as any).fixtureQr || '',
          fixture_qr_detected: !!(result as any).fixtureQrDetected,
          fixture_qr_source: (result as any).fixtureQrSource || '',
          fixture_qr_input_status: (result as any).fixtureQrInputStatus || '',
          fixture_qr_confidence: (result as any).fixtureQrConfidence ?? null,
          business_code: (result as any).businessCode || '',
          business_code_type: (result as any).businessCodeType || '',
          trace_conclusion: (result as any).traceConclusion || '',
          trace_conclusion_reason: (result as any).traceConclusionReason || '',
          fixture_rule_passed: (result as any).fixtureRulePassed ?? null,
          fixture_rule_reason: (result as any).fixtureRuleReason || '',
          trace_rule_summary: (result as any).traceRuleSummary || '',
          trace_rule_details: (result as any).traceRuleDetails || [],
          related_stages: (result as any).relatedStages || [],
          trace_context: (result as any).traceContext || {},
        }),
      });

      // ★ 异步优化：先出结果，后台异步刷新数据（不阻塞主流程）
      get().fetchResults().catch(err => console.error("后台刷新结果失败:", err));

      return savedData;

      // ★ 异步优化：检查并清理超出限制的结果（后台异步执行，不阻塞主流程）
      setTimeout(async () => {
        const currentResults = get().results;
        const MAX_RESULTS = 1000; // 最大1000条结果

        if (currentResults.length > MAX_RESULTS) {
          console.log(`结果数量超过限制 (${currentResults.length}/${MAX_RESULTS})，开始清理旧数据...`);

          // 按时间戳排序，保留最新的1000条
          const sortedResults = currentResults.sort((a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );

          // 删除超出限制的结果
          const resultsToDelete = sortedResults.slice(MAX_RESULTS);
          for (const resultToDelete of resultsToDelete) {
            try {
              await apiFetch(`/results/${resultToDelete.id}`, {
                method: 'DELETE',
                headers: { 'Accept': 'application/json' }
              });
              console.log(`已删除旧结果: ${resultToDelete.id}`);
            } catch (error) {
              console.error(`删除结果失败: ${resultToDelete.id}`, error);
            }
          }

          // 后台异步刷新
          get().fetchResults().catch(err => console.error("后台刷新结果失败:", err));
          console.log(`清理完成，当前结果数量: ${get().results.length}`);
        }
      }, 0);
    } catch (error) {
      console.error('添加结果失败:', error);
      throw error;
    }
  },

  deleteResult: async (id: string) => {
    try {
      console.log(`开始删除结果: ${id}`);

      // 调用后端API删除
      const response = await apiFetch(`/results/${id}`, {
        method: 'DELETE',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`删除失败: ${response.status} ${response.statusText}`);
      }

      // 从本地状态中移除
      set(state => ({
        results: state.results.filter(result => result.id !== id)
      }));

      console.log(`结果 ${id} 删除成功`);
    } catch (error) {
      console.error('删除结果失败:', error);
      throw error;
    }
  },

  clearAllResults: async () => {
    try {
      const currentResults = get().results;
      console.log(`开始清空所有 ${currentResults.length} 条结果...`);

      // 逐个删除所有结果
      for (const result of currentResults) {
        try {
          await apiFetch(`/results/${result.id}`, {
            method: 'DELETE',
            headers: { 'Accept': 'application/json' }
          });
          console.log(`已删除结果: ${result.id}`);
        } catch (error) {
          console.error(`删除结果失败: ${result.id}`, error);
        }
      }

      // 清空本地状态
      set({ results: [] });

      console.log('所有结果已清空');
    } catch (error) {
      console.error('清空结果失败:', error);
      throw error;
    }
  },

  clearResultsByType: async (detectionType: string) => {
    try {
      const currentResults = get().results;
      const resultsToDelete = currentResults.filter(result => result.detectionType === detectionType);

      console.log(`开始清空 ${detectionType} 类型的 ${resultsToDelete.length} 条结果...`);

      // 逐个删除指定类型的结果
      for (const result of resultsToDelete) {
        try {
          await apiFetch(`/results/${result.id}`, {
            method: 'DELETE',
            headers: { 'Accept': 'application/json' }
          });
          console.log(`已删除结果: ${result.id}`);
        } catch (error) {
          console.error(`删除结果失败: ${result.id}`, error);
        }
      }

      // 从本地状态中移除指定类型的结果
      set(state => ({
        results: state.results.filter(result => result.detectionType !== detectionType)
      }));

      console.log(`${detectionType} 类型的结果已清空`);
    } catch (error) {
      console.error('清空指定类型结果失败:', error);
      throw error;
    }
  },

  syncData: async () => {
    try {
      set({ isSyncing: true });
      await Promise.all([
        get().fetchStandards(),
        get().fetchResults()
      ]);
      set({
        lastSyncTime: Date.now(),
        isSyncing: false
      });
    } catch (error) {
      console.error('同步数据失败:', error);
      set({ isSyncing: false });
      throw error;
    }
  },

  startAutoSync: () => {
    // 每30秒自动同步一次数据
    const interval = setInterval(async () => {
      try {
        await get().syncData();
      } catch (error) {
        console.error('自动同步失败:', error);
      }
    }, 30000);

    // 返回清理函数
    return () => clearInterval(interval);
  }
}));
