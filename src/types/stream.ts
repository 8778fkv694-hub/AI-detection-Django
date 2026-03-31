/**
 * 流媒体相关类型定义
 */

export type StreamType = 'rtsp' | 'rtmp' | 'http' | 'file' | 'hls';

export type StreamStatus = 'inactive' | 'active' | 'error' | 'connecting';

export type PlayMode = 'jpg' | 'ffmpeg';

export interface StreamSource {
  id: string;
  name: string;
  url: string;
  stream_type: StreamType;
  status: StreamStatus;
  play_mode: PlayMode;
  enabled: boolean;
  auto_reconnect: boolean;
  reconnect_interval: number;
  username?: string;
  password?: string;
  last_connected_at?: string;
  last_error?: string;
  error_count: number;
  created_at: string;
  updated_at: string;
  display_url: string;
  is_active: boolean;
}

export interface StreamSourceCreate {
  name: string;
  url: string;
  stream_type: StreamType;
  play_mode?: PlayMode;
  enabled: boolean;
  auto_reconnect?: boolean;
  reconnect_interval?: number;
  username?: string;
  password?: string;
}

export interface StreamSourceUpdate {
  name?: string;
  url?: string;
  stream_type?: StreamType;
  play_mode?: PlayMode;
  enabled?: boolean;
  auto_reconnect?: boolean;
  reconnect_interval?: number;
  username?: string;
  password?: string;
}

export interface StreamRuntimeStatus {
  stream_id: string;
  is_connected: boolean;
  is_running: boolean;
  last_frame_time?: string;
  error_message: string;
  error_count: number;
}

export interface StreamStatusResponse {
  stream: StreamSource;
  runtime_status: StreamRuntimeStatus | null;
}

export interface StreamFrameResponse {
  stream_id: string;
  frame: string; // Base64 encoded image
  timestamp: string;
}

export interface StreamManagerStatus {
  total_streams: number;
  streams: Record<string, StreamRuntimeStatus>;
}

// 扩展的设备信息，包含虚拟摄像头（流媒体）
export interface VirtualCameraDevice extends MediaDeviceInfo {
  isVirtual: boolean;
  streamId?: string;
  streamSource?: StreamSource;
}

