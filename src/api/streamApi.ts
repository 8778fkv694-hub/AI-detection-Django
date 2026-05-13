/**
 * 流媒体管理 API
 */
import { apiRequest, apiFetch, API_BASE_URL } from '@/lib/config';
import type {
  StreamSource,
  StreamSourceCreate,
  StreamSourceUpdate,
  StreamStatusResponse,
  StreamFrameResponse,
  StreamManagerStatus,
} from '@/types/stream';

/**
 * 获取所有流媒体源
 */
export const getStreamSources = async (): Promise<StreamSource[]> => {
  return await apiRequest<StreamSource[]>('/streams/');
};

const streamApiRequest = async <T>(endpoint: string, options: RequestInit = {}): Promise<T> => {
  const response = await apiFetch(endpoint, options);

  if (!response.ok) {
    const errorText = await response.text();
    try {
      const errorJson = JSON.parse(errorText);
      const message =
        errorJson.message ||
        errorJson.error ||
        errorJson.detail ||
        `请求失败，状态码: ${response.status}`;
      throw new Error(message);
    } catch (error) {
      if (error instanceof Error && error.message) {
        throw error;
      }
      throw new Error(errorText || `请求失败，状态码: ${response.status}`);
    }
  }

  try {
    return await response.json();
  } catch {
    throw new Error('收到成功响应，但响应体不是有效的JSON格式');
  }
};

/**
 * 获取单个流媒体源
 */
export const getStreamSource = async (id: string): Promise<StreamSource> => {
  return await apiRequest<StreamSource>(`/streams/${id}/`);
};

/**
 * 创建流媒体源
 */
export const createStreamSource = async (data: StreamSourceCreate): Promise<StreamSource> => {
  return await apiRequest<StreamSource>('/streams/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const uploadStreamVideo = async (file: File): Promise<{
  message: string;
  file_name: string;
  file_path: string;
  file_size: number;
}> => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await apiFetch('/streams/upload-video/', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || '视频文件上传失败');
  }

  return await response.json();
};

/**
 * 更新流媒体源
 */
export const updateStreamSource = async (
  id: string,
  data: StreamSourceUpdate
): Promise<StreamSource> => {
  return await apiRequest<StreamSource>(`/streams/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
};

/**
 * 删除流媒体源
 */
export const deleteStreamSource = async (id: string): Promise<void> => {
  await apiFetch(`/streams/${id}/`, {
    method: 'DELETE',
  });
};

/**
 * 启动流媒体
 */
export const startStream = async (id: string): Promise<{ message: string; stream: StreamSource }> => {
  return await apiRequest<{ message: string; stream: StreamSource }>(`/streams/${id}/start/`, {
    method: 'POST',
  });
};

/**
 * 停止流媒体
 */
export const stopStream = async (id: string): Promise<{ message: string; stream: StreamSource }> => {
  return await apiRequest<{ message: string; stream: StreamSource }>(`/streams/${id}/stop/`, {
    method: 'POST',
  });
};

/**
 * 获取流媒体状态
 */
export const getStreamStatus = async (id: string): Promise<StreamStatusResponse> => {
  return await streamApiRequest<StreamStatusResponse>(`/streams/${id}/status/`);
};

/**
 * 获取流媒体当前帧
 */
export const getStreamFrame = async (
  id: string,
  quality: number = 95,
  width?: number
): Promise<StreamFrameResponse> => {
  const params = new URLSearchParams();
  params.set('quality', quality.toString());
  if (typeof width === 'number') {
    params.set('width', width.toString());
  }

  // 直接使用ViewSet action端点
  return await streamApiRequest<StreamFrameResponse>(`/streams/${id}/frame/?${params.toString()}`);
};

/**
 * 获取所有激活的流媒体
 */
export const getActiveStreams = async (): Promise<StreamSource[]> => {
  return await streamApiRequest<StreamSource[]>('/streams/active_streams/');
};

/**
 * 获取流管理器状态
 */
export const getStreamManagerStatus = async (): Promise<StreamManagerStatus> => {
  return await streamApiRequest<StreamManagerStatus>('/streams/manager/status/');
};

/**
 * 停止所有流媒体
 */
export const stopAllStreams = async (): Promise<{ message: string }> => {
  return await apiRequest<{ message: string }>('/streams/manager/stop-all/', {
    method: 'POST',
  });
};

/**
 * 重启所有流媒体
 */
export const restartAllStreams = async (): Promise<{
  message: string;
  success_count: number;
  failed_count: number;
  total: number;
}> => {
  return await apiRequest<{
    message: string;
    success_count: number;
    failed_count: number;
    total: number;
  }>('/streams/manager/restart-all/', {
    method: 'POST',
  });
};

/**
 * 启动HLS流（高画质方案，支持CPU优化参数）
 */
export const startHLSStream = async (
  id: string,
  options?: {
    fps?: number;
    width?: number;
    height?: number;
    crf?: number;
    preset?: 'ultrafast' | 'veryfast' | 'faster' | 'fast' | 'medium';
    threads?: number;
  }
): Promise<{
  message: string;
  stream: StreamSource;
  hls_url: string;
}> => {
  return await apiRequest<{
    message: string;
    stream: StreamSource;
    hls_url: string;
  }>(`/streams/${id}/start_hls/`, {
    method: 'POST',
    body: JSON.stringify(options || {}),
  });
};

/**
 * 停止HLS流
 */
export const stopHLSStream = async (id: string): Promise<{
  message: string;
  stream: StreamSource;
}> => {
  return await apiRequest<{
    message: string;
    stream: StreamSource;
  }>(`/streams/${id}/stop_hls/`, {
    method: 'POST',
  });
};

/**
 * 获取HLS播放列表URL
 */
export const getHLSPlaylistUrl = (id: string): string => {
  const baseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  return `${baseUrl}/streams/${id}/hls/playlist.m3u8/`;
};
