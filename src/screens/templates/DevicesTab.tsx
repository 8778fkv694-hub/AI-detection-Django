import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Cpu,
  Usb,
  Radio,
  Lightbulb,
  Cog,
  Power,
  Plus,
  Send,
  X,
} from 'lucide-react';
import { useSerialDevice } from '@/hooks/ocr/useSerialDevice';
import { useDeviceStore } from '@/state/deviceStore';
import { DEVICE_TYPE_META, BAUD_RATE_OPTIONS } from '@/types/device';
import type { DeviceConfig, DeviceType } from '@/types/device';

const DEVICE_ICONS: Record<DeviceType, React.ReactNode> = {
  scanner: <Usb className="h-4 w-4" />,
  nfc: <Radio className="h-4 w-4" />,
  sensor: <Power className="h-4 w-4" />,
  alarm: <Lightbulb className="h-4 w-4" />,
  controller: <Cog className="h-4 w-4" />,
};

function DeviceCard({
  device,
  onRemove,
  onUpdate,
}: {
  device: DeviceConfig;
  onRemove: () => void;
  onUpdate: (updates: Partial<DeviceConfig>) => void;
}) {
  const meta = DEVICE_TYPE_META[device.type];
  const simulationMode = useDeviceStore((state) => state.simulationMode);
  const serial = useSerialDevice({
    baudRate: device.baudRate,
    onData: (data) => {
      console.log(`[${device.name}] 收到:`, data);
      if (simulationMode) {
        toast.success(`[${device.name}] ${data}`, { duration: 2000 });
      }
    },
  });
  const [cmdInput, setCmdInput] = useState('');
  const [simInterval, setSimInterval] = useState<NodeJS.Timeout | null>(null);
  const [simConnected, setSimConnected] = useState(false);

  const isConnected = simulationMode ? simConnected : serial.isConnected;

  const handleSimConnect = () => {
    setSimConnected(true);
    if (meta.direction === 'input' || meta.direction === 'both') {
      const interval = setInterval(() => {
        const mockData =
          device.type === 'scanner'
            ? `BARCODE-${Date.now().toString(36).toUpperCase()}`
            : device.type === 'nfc'
              ? `NFC-TAG-${Math.random().toString(16).slice(2, 8).toUpperCase()}`
              : device.type === 'sensor'
                ? 'TRIGGER'
                : `DATA-${Date.now()}`;
        console.log(`[SIM][${device.name}] 收到:`, mockData);
        toast.success(`[${device.name}] ${mockData}`, { duration: 2000 });
      }, device.type === 'sensor' ? 3000 : 2000);
      setSimInterval(interval);
    }
  };

  const handleSimDisconnect = () => {
    setSimConnected(false);
    if (simInterval) {
      clearInterval(simInterval);
      setSimInterval(null);
    }
  };

  const handleSimSend = (command: string) => {
    const icon = command.includes('GREEN')
      ? '\uD83D\uDFE2'
      : command.includes('RED')
        ? '\uD83D\uDD34'
        : command.includes('YELLOW')
          ? '\uD83D\uDFE1'
          : command.includes('STOP')
            ? '\u26D4'
            : command.includes('START')
              ? '\u25B6\uFE0F'
              : '\uD83D\uDCE4';
    console.log(`[SIM][${device.name}] 发送: ${command.trim()}`);
    toast(`${icon} ${device.name}: ${command.trim()}`, { duration: 2000 });
  };

  useEffect(() => {
    return () => {
      if (simInterval) {
        clearInterval(simInterval);
      }
    };
  }, [simInterval]);

  const sendCommand = (command: string) => {
    if (simulationMode) {
      handleSimSend(command);
    } else {
      void serial.sendData(command);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={isConnected ? 'text-green-400' : 'text-muted-foreground'}>
            {DEVICE_ICONS[device.type]}
          </span>
          <input
            className="w-32 rounded bg-transparent px-1 text-sm font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
            value={device.name}
            onChange={(event) => onUpdate({ name: event.target.value })}
          />
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {meta.label}
          </span>
        </div>
        <button onClick={onRemove} className="text-muted-foreground transition-colors hover:text-red-400">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <label className="text-muted-foreground">类型</label>
        <select
          className="rounded border border-border/50 bg-muted/50 px-2 py-1 text-xs text-foreground"
          value={device.type}
          onChange={(event) => {
            const nextType = event.target.value as DeviceType;
            onUpdate({ type: nextType, baudRate: DEVICE_TYPE_META[nextType].defaultBaud });
          }}
        >
          {Object.entries(DEVICE_TYPE_META).map(([key, value]) => (
            <option key={key} value={key}>
              {value.label}
            </option>
          ))}
        </select>

        <label className="ml-2 text-muted-foreground">波特率</label>
        <select
          className="rounded border border-border/50 bg-muted/50 px-2 py-1 text-xs text-foreground"
          value={device.baudRate}
          onChange={(event) => onUpdate({ baudRate: Number(event.target.value) })}
        >
          {BAUD_RATE_OPTIONS.map((baudRate) => (
            <option key={baudRate} value={baudRate}>
              {baudRate}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        {isConnected ? (
          <>
            <span className="inline-flex items-center gap-1 text-xs text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
              {simulationMode ? '模拟已连接' : `已连接 ${serial.portInfo}`}
            </span>
            <button
              onClick={simulationMode ? handleSimDisconnect : () => void serial.disconnect()}
              className="rounded bg-red-500/20 px-2 py-1 text-xs text-red-400 hover:bg-red-500/30"
            >
              断开
            </button>
          </>
        ) : (
          <button
            onClick={
              simulationMode
                ? handleSimConnect
                : () => void serial.requestAndConnect(device.baudRate)
            }
            disabled={!simulationMode && !serial.isSupported}
            className="flex items-center gap-1 rounded bg-accent/20 px-3 py-1.5 text-xs text-accent hover:bg-accent/30 disabled:opacity-50"
          >
            <Usb className="h-3 w-3" />
            {simulationMode ? '模拟连接' : '选择端口并连接'}
          </button>
        )}
      </div>

      {serial.error && !simulationMode && <p className="text-xs text-red-400">{serial.error}</p>}

      {(meta.direction === 'input' || meta.direction === 'both') &&
        isConnected &&
        !simulationMode && (
          <div className="text-xs">
            <span className="text-muted-foreground">最近数据：</span>
            <span className="font-mono text-foreground">{serial.lastData || '等待中...'}</span>
          </div>
        )}

      {(meta.direction === 'output' || meta.direction === 'both') && isConnected && (
        <div className="space-y-2">
          <div className="flex items-center gap-1">
            <input
              className="flex-1 rounded border border-border/50 bg-muted/50 px-2 py-1 text-xs font-mono text-foreground"
              placeholder="输入指令..."
              value={cmdInput}
              onChange={(event) => setCmdInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && cmdInput) {
                  sendCommand(`${cmdInput}\n`);
                  setCmdInput('');
                }
              }}
            />
            <button
              onClick={() => {
                if (cmdInput) {
                  sendCommand(`${cmdInput}\n`);
                  setCmdInput('');
                }
              }}
              className="rounded bg-accent/20 px-2 py-1 text-xs text-accent hover:bg-accent/30"
            >
              <Send className="h-3 w-3" />
            </button>
          </div>

          {device.type === 'alarm' && (
            <div className="flex gap-1">
              {[
                { cmd: 'GREEN', color: 'bg-green-600', label: '绿灯' },
                { cmd: 'YELLOW', color: 'bg-yellow-500', label: '黄灯' },
                { cmd: 'RED', color: 'bg-red-600', label: '红灯' },
                { cmd: 'OFF', color: 'bg-gray-600', label: '关闭' },
              ].map((button) => (
                <button
                  key={button.cmd}
                  onClick={() => sendCommand(`${button.cmd}\n`)}
                  className={`${button.color} rounded px-2 py-1 text-[10px] text-white hover:opacity-80`}
                >
                  {button.label}
                </button>
              ))}
            </div>
          )}

          {device.type === 'controller' && (
            <div className="flex gap-1">
              {[
                { cmd: 'START', label: '启动流水线', className: 'bg-green-600' },
                { cmd: 'STOP', label: '停止流水线', className: 'bg-red-600' },
              ].map((button) => (
                <button
                  key={button.cmd}
                  onClick={() => sendCommand(`${button.cmd}\n`)}
                  className={`${button.className} rounded px-2 py-1 text-[10px] text-white hover:opacity-80`}
                >
                  {button.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DevicesTab() {
  const {
    devices,
    addDevice,
    removeDevice,
    updateDevice,
    simulationMode,
    setSimulationMode,
  } = useDeviceStore();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">硬件设备管理</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            管理串口设备（扫码枪、NFC、传感器、报警灯、工控板），配置刷新后保留
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={simulationMode}
              onChange={(event) => setSimulationMode(event.target.checked)}
              className="rounded border-border"
            />
            模拟模式
          </label>
          <div className="flex gap-1">
            {(Object.keys(DEVICE_TYPE_META) as DeviceType[]).map((type) => (
              <button
                key={type}
                onClick={() => addDevice(type)}
                className="flex items-center gap-1 rounded bg-accent/10 px-2 py-1.5 text-xs text-accent transition-colors hover:bg-accent/20"
              >
                <Plus className="h-3 w-3" />
                {DEVICE_TYPE_META[type].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {devices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Cpu className="mb-3 h-12 w-12 opacity-30" />
          <p className="text-sm">暂无设备</p>
          <p className="mt-1 text-xs">点击上方按钮添加硬件设备</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {devices.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              onRemove={() => removeDevice(device.id)}
              onUpdate={(updates) => updateDevice(device.id, updates)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
