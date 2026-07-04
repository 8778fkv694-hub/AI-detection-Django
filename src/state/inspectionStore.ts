
    import { create } from 'zustand'; import { persist, createJSONStorage } from 'zustand/middleware'; import { InspectionResult } from '@/types';
    interface InspectionState { results: InspectionResult[]; addResult: (result: InspectionResult) => void; clearResults: () => void; }
    export const useInspectionStore = create(persist<InspectionState>(set => ({
        results: [],
        addResult: (result) => set(state => ({ results: [result, ...state.results] })),
        clearResults: () => set({ results: [] }),
    }), {
        name: 'inspection-results-storage',
        // 结果图片体积大，不做持久化，避免占满 localStorage
        partialize: (state) => ({ ...state, results: [] }),
        storage: createJSONStorage(() => localStorage),
    }));
  
