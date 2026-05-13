/**
 * 全局视频流显示设置
 * 仅影响前端视频渲染（MJPEG URL 参数 / getUserMedia constraints），不影响后端 YOLO 检测
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface StreamDisplaySettings {
  /** 显示帧率 (5-30) */
  fps: number;
  /** JPEG 质量 (30-100) */
  quality: number;
  /** 显示宽度 (320-1920)，0 表示不缩放 */
  targetWidth: number;
}

interface StreamSettingsState extends StreamDisplaySettings {
  setFps: (fps: number) => void;
  setQuality: (quality: number) => void;
  setTargetWidth: (width: number) => void;
  resetDefaults: () => void;
}

const DEFAULTS: StreamDisplaySettings = {
  fps: 12,
  quality: 75,
  targetWidth: 0,  // 0=不缩图，让 Jetson 后端跳过 cv2.resize
};

export const useStreamSettingsStore = create<StreamSettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setFps: (fps) => set({ fps: Math.max(5, Math.min(30, fps)) }),
      setQuality: (quality) => set({ quality: Math.max(30, Math.min(100, quality)) }),
      setTargetWidth: (width) => set({ targetWidth: Math.max(320, Math.min(1920, width)) }),
      resetDefaults: () => set(DEFAULTS),
    }),
    {
      name: 'global-stream-display-settings',
      version: 2,
      migrate: (persistedState: any, version: number) => {
        if (version < 2) {
          // v2: targetWidth 改为 0，跳过 cv2.resize 省 CPU
          return { ...persistedState, targetWidth: 0 };
        }
        return persistedState as StreamDisplaySettings;
      },
    }
  )
);
