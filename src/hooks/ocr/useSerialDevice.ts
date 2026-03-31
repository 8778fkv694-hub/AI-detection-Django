/**
 * Web Serial API Hook
 *
 * 用途：封装浏览器 Web Serial API，支持扫码枪和 NFC 读取器等串口设备
 * 功能：端口选择、连接/断开、数据读取（换行符分隔）、连接状态管理
 * 使用位置：TemplatesScreen（设备测试）、OCRDetectionScreen（实时监听）
 */

import { useState, useRef, useCallback, useEffect } from 'react';

export interface SerialDeviceOptions {
  /** 波特率，默认 9600 */
  baudRate?: number;
  /** 数据接收回调 */
  onData?: (data: string) => void;
  /** 连接状态变化回调 */
  onConnectionChange?: (connected: boolean) => void;
}

export interface SerialDeviceState {
  /** 是否已连接 */
  isConnected: boolean;
  /** 端口信息描述 */
  portInfo: string;
  /** 最后接收到的数据 */
  lastData: string;
  /** 错误信息 */
  error: string | null;
}

export interface UseSerialDeviceResult extends SerialDeviceState {
  /** 请求用户选择串口并连接 */
  requestAndConnect: (baudRate?: number) => Promise<boolean>;
  /** 断开连接 */
  disconnect: () => Promise<void>;
  /** 向串口发送数据（如报警灯指令） */
  sendData: (data: string | Uint8Array) => Promise<boolean>;
  /** 浏览器是否支持 Web Serial API */
  isSupported: boolean;
}

/** 从 SerialPortInfo 生成可读描述 */
function getPortDescription(info: SerialPortInfo): string {
  const parts: string[] = [];
  if (info.usbVendorId) parts.push(`VID:${info.usbVendorId.toString(16).toUpperCase()}`);
  if (info.usbProductId) parts.push(`PID:${info.usbProductId.toString(16).toUpperCase()}`);
  return parts.length > 0 ? parts.join(' ') : '串口设备';
}

export const useSerialDevice = (options: SerialDeviceOptions = {}): UseSerialDeviceResult => {
  const { onData, onConnectionChange } = options;

  const [state, setState] = useState<SerialDeviceState>({
    isConnected: false,
    portInfo: '',
    lastData: '',
    error: null,
  });

  const portRef = useRef<SerialPort | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null);
  const isReadingRef = useRef(false);
  const onDataRef = useRef(onData);
  const onConnectionChangeRef = useRef(onConnectionChange);

  // 保持回调引用最新
  useEffect(() => { onDataRef.current = onData; }, [onData]);
  useEffect(() => { onConnectionChangeRef.current = onConnectionChange; }, [onConnectionChange]);

  const isSupported = typeof navigator !== 'undefined' && 'serial' in navigator;

  // 持续读取串口数据
  const startReading = useCallback(async (port: SerialPort) => {
    if (isReadingRef.current) return;
    isReadingRef.current = true;

    let buffer = '';

    try {
      while (port.readable && isReadingRef.current) {
        const textDecoder = new TextDecoderStream();
        const readableStreamClosed = port.readable.pipeTo(textDecoder.writable as any);
        const reader = textDecoder.readable.getReader();
        readerRef.current = reader;

        try {
          while (isReadingRef.current) {
            const { value, done } = await reader.read();
            if (done) break;
            if (!value) continue;

            buffer += value;

            // 按换行符分割消息
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() || ''; // 最后一段可能不完整，留在缓冲区

            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.length > 0) {
                setState(prev => ({ ...prev, lastData: trimmed }));
                onDataRef.current?.(trimmed);
              }
            }
          }
        } catch (e: any) {
          if (e.name !== 'TypeError' && isReadingRef.current) {
            console.error('串口读取错误:', e);
          }
        } finally {
          reader.releaseLock();
          readerRef.current = null;
          await readableStreamClosed.catch(() => {});
        }
      }
    } finally {
      isReadingRef.current = false;
    }
  }, []);

  const disconnect = useCallback(async () => {
    isReadingRef.current = false;

    if (readerRef.current) {
      try { await readerRef.current.cancel(); } catch {}
      readerRef.current = null;
    }

    if (portRef.current) {
      try { await portRef.current.close(); } catch {}
      portRef.current = null;
    }

    setState({ isConnected: false, portInfo: '', lastData: '', error: null });
    onConnectionChangeRef.current?.(false);
  }, []);

  const requestAndConnect = useCallback(async (baudRate = 9600): Promise<boolean> => {
    if (!isSupported) {
      setState(prev => ({ ...prev, error: '浏览器不支持 Web Serial API，请使用 Chrome/Edge' }));
      return false;
    }

    // 先断开旧连接
    await disconnect();

    try {
      // 弹出系统端口选择对话框
      const port = await (navigator as any).serial.requestPort();
      const info = port.getInfo();
      const desc = getPortDescription(info);

      await port.open({ baudRate });

      portRef.current = port;
      setState({
        isConnected: true,
        portInfo: `${desc} @ ${baudRate}bps`,
        lastData: '',
        error: null,
      });
      onConnectionChangeRef.current?.(true);

      // 开始后台读取
      startReading(port);

      return true;
    } catch (e: any) {
      if (e.name === 'NotFoundError') {
        // 用户取消了端口选择
        return false;
      }
      const msg = e.message || '连接失败';
      setState(prev => ({ ...prev, error: msg }));
      return false;
    }
  }, [isSupported, disconnect, startReading]);

  // 向串口发送数据
  const sendData = useCallback(async (data: string | Uint8Array): Promise<boolean> => {
    const port = portRef.current;
    if (!port?.writable) return false;

    try {
      const writer = port.writable.getWriter();
      const payload = typeof data === 'string'
        ? new TextEncoder().encode(data)
        : data;
      await writer.write(payload);
      writer.releaseLock();
      return true;
    } catch (e: any) {
      console.error('串口写入失败:', e);
      setState(prev => ({ ...prev, error: `写入失败: ${e.message}` }));
      return false;
    }
  }, []);

  // 组件卸载时断开
  useEffect(() => {
    return () => { disconnect(); };
  }, [disconnect]);

  return {
    ...state,
    requestAndConnect,
    disconnect,
    sendData,
    isSupported,
  };
};
