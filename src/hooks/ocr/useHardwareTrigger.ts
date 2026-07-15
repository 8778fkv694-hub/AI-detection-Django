/**
 * Hardware Trigger Hook
 * 
 * 用途：监听硬件输入设备（如 RS485 光电传感器、工控板继电器输入、Arduino）
 * 功能：
 *   - 自动连接配置中的 `sensor`（光电传感器）或 `controller`（工控板）串口设备
 *   - 监听接收到的数据行并触发对应回调 (如 TRIGGER, CLEAR, RESET, MANUAL_PASS)
 *   - 提供完备的配置开关与容错，保证在没有硬件/不支持 Web Serial 的环境下依旧稳定运行（鲁棒性）
 */

import { useEffect, useRef } from 'react';
import { useDeviceStore } from '@/state/deviceStore';
import { useSerialDevice } from './useSerialDevice';
import toast from 'react-hot-toast';

export interface HardwareTriggerCallbacks {
  /** 触发检测：当工件到位时 (默认串口收到 'TRIGGER') */
  onTrigger?: () => void;
  /** 工件离开：清除复位 (默认串口收到 'CLEAR') */
  onClear?: () => void;
  /** 故障复位：清除报警 (默认串口收到 'RESET') */
  onResetWorkflow?: () => void;
  /** 手动放行：确认存疑继续 (默认串口收到 'MANUAL_PASS') */
  onConfirmUnqualified?: () => void;
  /** 结束采集：当旋转完成或定时到位时 (串口收到 'CAPTURE_END' 或 'STOP_CAPTURE') */
  onStopCapture?: () => void;
}

export interface HardwareTriggerOptions {
  /** 触发动作回调 */
  callbacks: HardwareTriggerCallbacks;
  /** 是否启用硬件触发 (默认 true) */
  enabled?: boolean;
  /** 配方定义的设备动作配置，用于自定义信号映射 */
  actionMap?: Record<string, Record<string, string>>;
  /** 移动视角就位信号字符串 (默认 'STOP_CAPTURE')，收到该字符串触发 onStopCapture */
  stopSignal?: string;
}

export const useHardwareTrigger = ({
  callbacks,
  enabled = true,
  actionMap,
  stopSignal = 'STOP_CAPTURE',
}: HardwareTriggerOptions) => {
  const devices = useDeviceStore((s) => s.devices);
  const simulationMode = useDeviceStore((s) => s.simulationMode);

  // 找到第一个 'sensor'（光电开关）设备，或如果没有，则使用 'controller'（工控板）
  const sensorDevice = devices.find((d) => d.type === 'sensor');
  const controllerDevice = devices.find((d) => d.type === 'controller');
  const activeDevice = sensorDevice || controllerDevice;

  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  // 从配方配置中动态提取触发指令，如果未配置则回退到缺省默认指令
  const deviceType = activeDevice?.type || 'sensor';
  const recipeActions = actionMap?.[deviceType];

  // 1. 触发检测指令（合格/存疑/空闲三个字段映射）
  // 网页配方编辑页中，我们将：
  // - "存疑指令 (unqualified)" 对应工件到位触发检测 (TRIGGER)
  // - "空闲指令 (idle)" 对应工件离开复位 (CLEAR / RESET)
  // - "合格指令 (qualified)" 对应手动放行通过 (MANUAL_PASS)
  const triggerCmd = (recipeActions?.unqualified || 'TRIGGER').trim().toUpperCase();
  const clearCmd = (recipeActions?.idle || 'CLEAR').trim().toUpperCase();
  const resetCmd = (recipeActions?.idle || 'RESET').trim().toUpperCase();
  const passCmd = (recipeActions?.qualified || 'MANUAL_PASS').trim().toUpperCase();

  // 初始化串口连接，如果是传感器类型，自动尝试后台连接已授权的端口
  const serial = useSerialDevice({
    baudRate: activeDevice?.baudRate ?? 9600,
    usbVendorId: activeDevice?.usbVendorId,
    usbProductId: activeDevice?.usbProductId,
    autoConnect: enabled && !simulationMode && !!activeDevice,
    onData: (data) => {
      if (!enabled) return;
      
      const cleanData = data.trim().toUpperCase();
      console.log(`[硬件触发] 收到指令: "${cleanData}" (配置映射: Trigger="${triggerCmd}", Clear="${clearCmd}", Reset="${resetCmd}", Pass="${passCmd}")`);

      // 1. 触发检测 (工件到来)
      if (cleanData === triggerCmd || cleanData === 'TRIGGER' || cleanData === 'START') {
        if (callbacksRef.current.onTrigger) {
          toast.success('检测触发：光电开关信号到位', { id: 'hardware-trigger' });
          callbacksRef.current.onTrigger();
        } else {
          console.warn('硬件收到触发信号, 但当前界面未绑定 onTrigger 回调');
        }
      }
      
      // 2. 工件离开，自动复位页面
      else if (cleanData === clearCmd || cleanData === 'CLEAR') {
        if (callbacksRef.current.onClear) {
          toast('工件离开：状态自动复位', { id: 'hardware-clear', icon: '🔄' });
          callbacksRef.current.onClear();
        }
      }
      
      // 3. 故障复位 / 复位流程
      else if (cleanData === resetCmd || cleanData === 'RESET') {
        if (callbacksRef.current.onResetWorkflow) {
          toast.success('硬件复位信号已执行', { id: 'hardware-reset' });
          callbacksRef.current.onResetWorkflow();
        }
      }
      
      // 4. 手动放行 / 确认通过
      else if (cleanData === passCmd || cleanData === 'MANUAL_PASS' || cleanData === 'PASS' || cleanData === 'CONFIRM') {
        if (callbacksRef.current.onConfirmUnqualified) {
          toast.success('硬件放行：确认合格/忽略存疑', { id: 'hardware-pass' });
          callbacksRef.current.onConfirmUnqualified();
        }
      }

      // 5. 结束采集 / 旋转完毕 (优先匹配配方配置的就位信号，回退到通用白名单)
      else if (cleanData === stopSignal.trim().toUpperCase() || cleanData === 'STOP_CAPTURE' || cleanData === 'CAPTURE_END' || cleanData === 'COMPLETE') {
        if (callbacksRef.current.onStopCapture) {
          toast.success('采集结束：移动视角就位', { id: 'hardware-stop-capture' });
          callbacksRef.current.onStopCapture();
        }
      }
    },
  });

  // 监听模拟模式的变化，在控制台打印模拟提示
  useEffect(() => {
    if (enabled && simulationMode && activeDevice) {
      console.log(`[模拟模式] 硬件触发就绪。模拟设备: "${activeDevice.name}"`);
    }
  }, [enabled, simulationMode, activeDevice]);

  return {
    isConnected: simulationMode ? !!activeDevice : serial.isConnected,
    portInfo: serial.portInfo,
    error: serial.error,
    isSupported: serial.isSupported,
    deviceConfigured: !!activeDevice,
    deviceName: activeDevice?.name || '',
    requestAndConnect: () => serial.requestAndConnect(activeDevice?.baudRate),
    disconnect: serial.disconnect,
    sendData: serial.sendData,
  };
};
