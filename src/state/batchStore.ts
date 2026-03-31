
    import { create } from 'zustand'; import { persist, createJSONStorage } from 'zustand/middleware'; import { InspectionResult } from '@/types';
    interface BatchStoreState { batchResults: InspectionResult[]; addBatchResult: (results: InspectionResult[]) => void; }
    export const useBatchStore = create(persist<BatchStoreState>(set => ({
        batchResults: [],
        addBatchResult: (results) => set(state => ({ batchResults: [...results, ...state.batchResults] })),
    }), {
        name: 'batch-inspection-storage',
        // 批处理结果包含大图，避免持久化到 localStorage
        partialize: ({ batchResults, ...rest }) => rest,
        storage: createJSONStorage(() => localStorage),
    }));
  
