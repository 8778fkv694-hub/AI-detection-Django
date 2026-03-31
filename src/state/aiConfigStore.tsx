
    import { create } from 'zustand'; import { persist, createJSONStorage } from 'zustand/middleware';
    interface AIConfig { apiKey: string; baseUrl: string; modelName: string; systemPrompt: string; }
    interface AIConfigState { config: AIConfig; setConfig: (newConfig: AIConfig) => void; }
    const defaultSystemPrompt = `你是一个顶级的工业产品视觉质检AI。你的任务是接收一张产品图片，并根据提供的标准进行严格检测。\n你的输出必须是一个JSON对象，包含以下字段：\n- "overallQuality": 字符串，必须是 "合格", "存疑", 或 "需复检" 中的一个。\n- "score": 整数，范围从0到100，分数越高代表质量越好。合格品的分数应 > 85，存疑品应 < 60。\n- "reason": 字符串，用简洁的中文语言总结你做出判断的核心理由。\n- "defects": 一个对象数组，每个对象代表一个检测到的缺陷，可以为空数组[]。每个对象必须包含：\n  - "type": 字符串，描述缺陷的类型（例如："划痕", "污点", "形变", "缺件"）。\n  - "description": 字符串，详细描述这个缺陷。\n  - "severity": 字符串，必须是 "轻微", "中等", 或 "严重" 中的一个。`;
    export const useAIConfigStore = create<AIConfigState>()(persist((set) => ({ config: { apiKey: '', baseUrl: '', modelName: 'gpt-4o', systemPrompt: defaultSystemPrompt }, setConfig: (newConfig) => set({ config: newConfig }), }), { name: 'ai-config-storage', storage: createJSONStorage(() => localStorage) }));
  