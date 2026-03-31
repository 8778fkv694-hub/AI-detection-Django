/**
 * 设备配置持久化 Store
 *
 * 全局 store（非 scoped），因为硬件设备是物理共享的。
 * 使用 localStorage 持久化，key: device-config-v1
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DeviceConfig, DeviceType } from '@/types/device';
import { DEVICE_TYPE_META } from '@/types/device';

interface DeviceStore {
  /** 所有已配置的设备 */
  devices: DeviceConfig[];
  /** 模拟模式开关 */
  simulationMode: boolean;

  /** 添加设备 */
  addDevice: (type: DeviceType) => DeviceConfig;
  /** 移除设备 */
  removeDevice: (id: string) => void;
  /** 更新设备配置 */
  updateDevice: (id: string, updates: Partial<DeviceConfig>) => void;
  /** 获取指定类型的所有设备 */
  getDevicesByType: (type: DeviceType) => DeviceConfig[];
  /** 切换模拟模式 */
  setSimulationMode: (enabled: boolean) => void;
}

export const useDeviceStore = create<DeviceStore>()(
  persist(
    (set, get) => ({
      devices: [],
      simulationMode: false,

      addDevice: (type: DeviceType) => {
        const meta = DEVICE_TYPE_META[type];
        const existing = get().devices.filter(d => d.type === type);
        const newDevice: DeviceConfig = {
          id: `${type}-${Date.now()}`,
          type,
          name: `${meta.label} ${existing.length + 1}`,
          baudRate: meta.defaultBaud,
        };
        set(state => ({ devices: [...state.devices, newDevice] }));
        return newDevice;
      },

      removeDevice: (id: string) => {
        set(state => ({ devices: state.devices.filter(d => d.id !== id) }));
      },

      updateDevice: (id: string, updates: Partial<DeviceConfig>) => {
        set(state => ({
          devices: state.devices.map(d =>
            d.id === id ? { ...d, ...updates } : d
          ),
        }));
      },

      getDevicesByType: (type: DeviceType) => {
        return get().devices.filter(d => d.type === type);
      },

      setSimulationMode: (enabled: boolean) => {
        set({ simulationMode: enabled });
      },
    }),
    {
      name: 'device-config-v1',
      partialize: (state) => ({
        devices: state.devices,
        simulationMode: state.simulationMode,
      }),
    }
  )
);
