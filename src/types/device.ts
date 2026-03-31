/**
 * 硬件设备类型定义
 *
 * 5种设备类型：扫码枪(input)、NFC(input)、光电传感器(input)、报警灯(output)、工控板(both)
 */

export type DeviceType = 'scanner' | 'nfc' | 'sensor' | 'alarm' | 'controller';
export type DeviceDirection = 'input' | 'output' | 'both';

export interface DeviceConfig {
  id: string;
  type: DeviceType;
  name: string;
  baudRate: number;
  /** USB Vendor ID — 用于 getPorts() 自动匹配 */
  usbVendorId?: number;
  /** USB Product ID — 用于 getPorts() 自动匹配 */
  usbProductId?: number;
  /** 自定义指令预设，如 { GREEN: 'G\n', RED: 'R\n' } */
  commandPresets?: Record<string, string>;
}

export interface DeviceTypeMeta {
  label: string;
  direction: DeviceDirection;
  defaultBaud: number;
  description: string;
}

export const DEVICE_TYPE_META: Record<DeviceType, DeviceTypeMeta> = {
  scanner: {
    label: '扫码枪',
    direction: 'input',
    defaultBaud: 9600,
    description: 'USB/蓝牙扫码枪（串口模式）',
  },
  nfc: {
    label: 'NFC读取器',
    direction: 'input',
    defaultBaud: 9600,
    description: 'NFC/RFID 读卡器',
  },
  sensor: {
    label: '光电传感器',
    direction: 'input',
    defaultBaud: 9600,
    description: 'RS485 光电/接近传感器（检测工件到位）',
  },
  alarm: {
    label: '报警灯',
    direction: 'output',
    defaultBaud: 9600,
    description: '三色报警灯控制（合格/存疑/报警）',
  },
  controller: {
    label: '工控板/单片机',
    direction: 'both',
    defaultBaud: 115200,
    description: '继电器控制（流水线启停、报警灯）',
  },
};

export const BAUD_RATE_OPTIONS = [9600, 19200, 38400, 57600, 115200] as const;

/** 检测结果对应的设备动作 */
export type DetectionOutcome = 'qualified' | 'unqualified' | 'idle';

/** 设备动作映射：设备类型 → 检测结果 → 指令字符串 */
export type DeviceActionMap = Record<string, Record<DetectionOutcome, string>>;

/** 默认报警灯动作映射 */
export const DEFAULT_ALARM_ACTIONS: Record<DetectionOutcome, string> = {
  qualified: 'GREEN\n',
  unqualified: 'RED\n',
  idle: 'OFF\n',
};
