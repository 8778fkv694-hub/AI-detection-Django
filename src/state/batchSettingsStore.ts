
    import { create } from 'zustand'; import { persist } from 'zustand/middleware';
    interface BatchSettings { concurrentRequests: number; }
    interface BatchSettingsState { settings: BatchSettings; setSettings: (settings: BatchSettings) => void; }
    export const useBatchSettingsStore = create(persist<BatchSettingsState>(set => ({
        settings: { concurrentRequests: 3 },
        setSettings: (settings) => set({ settings }),
    }), { name: 'batch-settings-storage' }));
  