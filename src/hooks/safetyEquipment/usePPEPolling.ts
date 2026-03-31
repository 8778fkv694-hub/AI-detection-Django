import { useEffect } from 'react';

export interface UsePPEPollingOptions {
  enabled: boolean;
  intervalMs?: number;
  onTick: () => Promise<void> | void;
}

export const usePPEPolling = ({
  enabled,
  intervalMs = 2000,
  onTick,
}: UsePPEPollingOptions): void => {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void onTick();
    }, intervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [enabled, intervalMs, onTick]);
};
