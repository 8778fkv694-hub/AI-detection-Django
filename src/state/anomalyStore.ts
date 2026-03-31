import { create } from 'zustand';
import { fetchActiveAlerts, type ActiveAlert } from '@/lib/anomalyApi';

interface AnomalyState {
  activeAlerts: ActiveAlert[];
  loading: boolean;
  fetchAlerts: (processStageCode: string) => Promise<void>;
  clearAlerts: () => void;
}

export const useAnomalyStore = create<AnomalyState>((set) => ({
  activeAlerts: [],
  loading: false,
  fetchAlerts: async (processStageCode: string) => {
    if (!processStageCode) {
      set({ activeAlerts: [], loading: false });
      return;
    }

    set({ loading: true });
    try {
      const alerts = await fetchActiveAlerts(processStageCode);
      set({ activeAlerts: alerts, loading: false });
    } catch (error) {
      console.warn('加载异常告警失败:', error);
      set({ loading: false });
    }
  },
  clearAlerts: () => set({ activeAlerts: [], loading: false }),
}));
