
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AIConfig } from '@/types';
import { DEFAULT_LLM_TASK_PROMPT, DEFAULT_LLM_USER_MESSAGE } from '@/lib/llmPrompt';

    interface AIConfigState {
      config: AIConfig;
      setConfig: (newConfig: Partial<AIConfig>) => void;
    }

    const initialConfig: AIConfig = {
      apiKey: '',
      apiBaseUrl: 'https://wcode.net/api/gpt/v1/chat/completions',
      modelName: 'qwen2.5-vl-32b-instruct',
      systemPrompt: DEFAULT_LLM_TASK_PROMPT,
      userMessage: DEFAULT_LLM_USER_MESSAGE,
      compressionEnabled: true,
      compressionQuality: 0.5, // 50% 压缩质量是最完美的黄金点，兼顾网络延迟与细节
      imageWidth: 400, // 调整分辨率为 400x400 适合边缘推理耗时
      imageHeight: 400,
    };

    export const useAIConfigStore = create<AIConfigState>()(
      persist(
        (set) => ({
          config: initialConfig,
          setConfig: (newConfig) =>
            set((state) => ({ config: { ...state.config, ...newConfig } })),
        }),
        {
          name: 'wyl-ai-config-storage',
          storage: createJSONStorage(() => localStorage),
        }
      )
    );
  
