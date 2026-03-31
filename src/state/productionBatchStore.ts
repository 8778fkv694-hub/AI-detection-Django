
    import { create } from 'zustand'; import { persist } from 'zustand/middleware'; import { ProductionBatch } from '@/types';
    interface ProductionBatchState { batches: ProductionBatch[]; addBatch: (batch: ProductionBatch) => void; }
    export const useProductionBatchStore = create(persist<ProductionBatchState>(set => ({
        batches: [],
        addBatch: (batch) => set(state => ({ batches: [batch, ...state.batches] })),
    }), { name: 'production-batch-storage' }));
  