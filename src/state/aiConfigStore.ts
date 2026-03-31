
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
      compressionQuality: 0.8, // 提高质量到80%
      imageWidth: 600, // 提高分辨率到600x600
      imageHeight: 600, // 适合24GB内存的高质量模式
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
  
