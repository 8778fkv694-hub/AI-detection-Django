/**
 * Alarm Control Hook
 *
 * 用途：根据检测结果自动控制报警灯（或工控板）
 * 集成点：OCRDetectionScreen 的 handleSaveComplete / handleConfirmUnqualified
 * 默认映射：合格→GREEN, 存疑→RED, 空闲→OFF
 * 支持配方自定义 actionMap 覆盖默认映射
 */

import { useCallback, useRef, useEffect } from 'react';
import { useDeviceStore } from '@/state/deviceStore';
import { useSerialDevice } from './useSerialDevice';
import type { DeviceActionMap, DetectionOutcome } from '@/types/device';
import { DEFAULT_ALARM_ACTIONS } from '@/types/device';
import toast from 'react-hot-toast';

export interface UseAlarmControlOptions {
  /** 配方自定义动作映射，覆盖默认值 */
  actionMap?: DeviceActionMap;
  /** 是否启用（默认 true） */
  enabled?: boolean;
}

export interface UseAlarmControlResult {
  /** 发送报警信号 */
  sendAlarmSignal: (outcome: DetectionOutcome) => void;
  /** 报警灯是否已连接 */
  isAlarmConnected: boolean;
  /** 工控板是否已连接 */
  isControllerConnected: boolean;
}

export const useAlarmControl = (options: UseAlarmControlOptions = {}): UseAlarmControlResult => {
  const { actionMap, enabled = true } = options;

  const devices = useDeviceStore(s => s.devices);
  const simulationMode = useDeviceStore(s => s.simulationMode);

  // 找到第一个 alarm 和 controller 设备
  const alarmDevice = devices.find(d => d.type === 'alarm');
  const controllerDevice = devices.find(d => d.type === 'controller');

  // 每个设备类型一个串口连接
  const alarmSerial = useSerialDevice({
    baudRate: alarmDevice?.baudRate ?? 9600,
  });
  const controllerSerial = useSerialDevice({
    baudRate: controllerDevice?.baudRate ?? 115200,
  });

  const actionMapRef = useRef(actionMap);
  useEffect(() => { actionMapRef.current = actionMap; }, [actionMap]);

  const sendAlarmSignal = useCallback((outcome: DetectionOutcome) => {
    if (!enabled) return;

    const map = actionMapRef.current;

    // 报警灯
    if (alarmDevice) {
      const alarmActions = map?.alarm ?? DEFAULT_ALARM_ACTIONS;
      const cmd = alarmActions[outcome];
      if (cmd) {
        if (simulationMode) {
          const icon = outcome === 'qualified' ? '\uD83D\uDFE2' : outcome === 'unqualified' ? '\uD83D\uDD34' : '\u26AB';
          console.log(`[报警灯] ${icon} ${cmd.trim()}`);
          toast(`${icon} 报警灯: ${cmd.trim()}`, { duration: 2000 });
        } else if (alarmSerial.isConnected) {
          alarmSerial.sendData(cmd);
        }
      }
    }

    // 工控板
    if (controllerDevice) {
      const controllerActions = map?.controller;
      const cmd = controllerActions?.[outcome];
      if (cmd) {
        if (simulationMode) {
          const icon = outcome === 'qualified' ? '\u2705' : outcome === 'unqualified' ? '\u26D4' : '\u2139\uFE0F';
          console.log(`[工控板] ${icon} ${cmd.trim()}`);
          toast(`${icon} 工控板: ${cmd.trim()}`, { duration: 2000 });
        } else if (controllerSerial.isConnected) {
          controllerSerial.sendData(cmd);
        }
      }
    }
  }, [enabled, alarmDevice, controllerDevice, simulationMode, alarmSerial, controllerSerial]);

  return {
    sendAlarmSignal,
    isAlarmConnected: simulationMode ? !!alarmDevice : alarmSerial.isConnected,
    isControllerConnected: simulationMode ? !!controllerDevice : controllerSerial.isConnected,
  };
};
