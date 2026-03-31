import { transitionAnomaly } from './anomalyApi';

const STORAGE_KEY = 'anomaly-offline-queue:v1';

export interface OfflineAnomalyTransition {
  type: 'transition';
  id: string;
  action: string;
  password: string;
  comment?: string;
  operator?: string;
  createdAt: string;
}

function readQueue(): OfflineAnomalyTransition[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('读取异常离线队列失败:', error);
    return [];
  }
}

function writeQueue(queue: OfflineAnomalyTransition[]) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch (error) {
    console.warn('写入异常离线队列失败:', error);
  }
}

export function getAnomalyOfflineQueue() {
  return readQueue();
}

export function enqueueAnomalyTransition(item: Omit<OfflineAnomalyTransition, 'createdAt' | 'type'>) {
  const queue = readQueue();
  queue.push({
    type: 'transition',
    createdAt: new Date().toISOString(),
    ...item,
  });
  writeQueue(queue);
}

export function clearAnomalyOfflineQueue() {
  writeQueue([]);
}

export async function flushAnomalyOfflineQueue() {
  const queue = readQueue();
  if (!queue.length || typeof navigator !== 'undefined' && !navigator.onLine) {
    return { processed: 0, failed: queue.length };
  }

  const remaining: OfflineAnomalyTransition[] = [];
  let processed = 0;

  for (const item of queue) {
    try {
      await transitionAnomaly(item.id, item.action, item.password, item.comment ?? '', item.operator ?? '');
      processed += 1;
    } catch (error) {
      console.warn('回放异常离线操作失败:', error);
      remaining.push(item);
    }
  }

  writeQueue(remaining);
  return { processed, failed: remaining.length };
}
