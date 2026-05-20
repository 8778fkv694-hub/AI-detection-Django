/**
 * 摄像头访问工具和安全检查
 */

import { getActiveStreams } from '@/api/streamApi';
import type { StreamSource } from '@/types/stream';

export interface CameraDevice {
  deviceId: string;
  label: string;
  kind: string;
  isVirtual?: boolean; // 标识是否为虚拟流媒体摄像头
  streamSource?: StreamSource; // 如果是虚拟摄像头，保存流媒体源信息
  facingMode?: 'user' | 'environment';
  alternateDeviceIds?: string[];
}

export interface GetCameraDevicesOptions {
  requestPermission?: boolean;
  includeStreams?: boolean;
  authorizedCamera?: CameraDevice | null;
}

export const buildCameraVideoConstraints = (
  deviceId?: string | null,
  options: {
    width?: number;
    height?: number;
    facingMode?: 'user' | 'environment';
  } = {}
): MediaTrackConstraints => {
  const { width = 1280, height = 720, facingMode } = options;
  const syntheticFacingMode =
    deviceId === 'mobile-facing-user'
      ? 'user'
      : deviceId === 'mobile-facing-environment'
        ? 'environment'
        : undefined;
  const constraints: MediaTrackConstraints = {
    width: { ideal: width },
    height: { ideal: height },
  };

  if (deviceId && !syntheticFacingMode) {
    constraints.deviceId = { exact: deviceId };
  }
  if (facingMode || syntheticFacingMode) {
    constraints.facingMode = { ideal: facingMode || syntheticFacingMode };
  }

  return constraints;
};

export const isCameraSecureContext = (): boolean => {
  const isLocalhost =
    /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
  return window.isSecureContext || window.location.protocol === 'https:' || isLocalhost;
};

const normalizePhysicalCamera = (device: MediaDeviceInfo): CameraDevice => {
  const nativeDeviceId = device.deviceId?.trim() || '';
  const facingMode = getFacingModeFromLabel(device.label);
  return {
    deviceId: nativeDeviceId,
    label: device.label || (nativeDeviceId ? `摄像头 ${nativeDeviceId.slice(0, 8)}...` : '未授权摄像头'),
    kind: device.kind,
    isVirtual: false,
    facingMode,
  };
};

export const cameraFromTrack = (track?: MediaStreamTrack): CameraDevice | null => {
  if (!track) return null;
  const settings = track.getSettings() as MediaTrackSettings & { deviceId?: string };
  const nativeDeviceId = settings.deviceId?.trim() || '';
  if (!nativeDeviceId) return null;

  return {
    deviceId: nativeDeviceId,
    label: track.label || `摄像头 ${nativeDeviceId.slice(0, 8)}...`,
    kind: 'videoinput',
    isVirtual: false,
    facingMode: getFacingModeFromLabel(track.label),
  };
};

const pushUniqueCamera = (devices: CameraDevice[], camera: CameraDevice) => {
  if (!devices.some((item) => item.deviceId === camera.deviceId)) {
    devices.push(camera);
  }
};

const getFacingModeFromLabel = (label?: string): CameraDevice['facingMode'] => {
  const normalized = (label || '').toLowerCase();
  if (/(facing\s+front|front|user|前置)/i.test(normalized)) return 'user';
  if (/(facing\s+back|back|rear|environment|后置)/i.test(normalized)) return 'environment';
  return undefined;
};

const shouldCollapseAndroidFacingCameras = (devices: CameraDevice[]): boolean => {
  if (typeof navigator === 'undefined') return false;
  const hasAndroidCameraLabels = devices.some((device) =>
    /camera\s*\d+,\s*facing\s+(front|back)/i.test(device.label)
  );
  return /android/i.test(navigator.userAgent) && hasAndroidCameraLabels;
};

const collapseAndroidFacingCameras = (devices: CameraDevice[]): CameraDevice[] => {
  if (!shouldCollapseAndroidFacingCameras(devices)) {
    return devices;
  }

  const grouped = devices.reduce(
    (result, device) => {
      if (device.facingMode === 'user') result.user.push(device);
      else if (device.facingMode === 'environment') result.environment.push(device);
      else result.unknown.push(device);
      return result;
    },
    {
      user: [] as CameraDevice[],
      environment: [] as CameraDevice[],
      unknown: [] as CameraDevice[],
    }
  );

  const collapsed: CameraDevice[] = [];
  if (grouped.user.length > 0) {
    collapsed.push({
      deviceId: 'mobile-facing-user',
      label: '前置摄像头',
      kind: 'videoinput',
      isVirtual: false,
      facingMode: 'user',
      alternateDeviceIds: grouped.user.map((device) => device.deviceId),
    });
  }
  if (grouped.environment.length > 0) {
    collapsed.push({
      deviceId: 'mobile-facing-environment',
      label: '后置摄像头',
      kind: 'videoinput',
      isVirtual: false,
      facingMode: 'environment',
      alternateDeviceIds: grouped.environment.map((device) => device.deviceId),
    });
  }

  return [...collapsed, ...grouped.unknown];
};

/**
 * 检查摄像头访问权限和可用性
 */
export const checkCameraAccess = async (): Promise<{
  isAvailable: boolean;
  error?: string;
  devices?: CameraDevice[];
  isHttpAccess?: boolean;
}> => {
  try {
    const isHttpAccess = !isCameraSecureContext();
    if (isHttpAccess) {
      return {
        isAvailable: false,
        error: '摄像头访问需要 HTTPS 协议或 localhost 访问。Safari 下请使用 http://localhost:3303/。',
        isHttpAccess: true
      };
    }

    // 检查是否支持mediaDevices API
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return {
        isAvailable: false,
        error: '浏览器不支持摄像头API，请使用现代浏览器'
      };
    }

    // 尝试获取摄像头权限
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480 } 
      });
      const authorizedCamera = cameraFromTrack(stream.getVideoTracks()[0]);
      
      // 立即停止流
      stream.getTracks().forEach(track => track.stop());
      
      // 获取设备列表
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices
        .filter(device => device.kind === 'videoinput')
        .filter(device => device.deviceId?.trim())
        .map(normalizePhysicalCamera);
      if (authorizedCamera && !videoDevices.some((device) => device.deviceId === authorizedCamera.deviceId)) {
        videoDevices.unshift(authorizedCamera);
      }

      return {
        isAvailable: true,
        devices: collapseAndroidFacingCameras(videoDevices),
        isHttpAccess: false
      };
    } catch (permissionError) {
      if (permissionError instanceof Error) {
        if (permissionError.name === 'NotAllowedError') {
          return {
            isAvailable: false,
            error: '摄像头权限被拒绝，请在浏览器中允许摄像头访问',
            isHttpAccess: false
          };
        } else if (permissionError.name === 'NotFoundError') {
          return {
            isAvailable: false,
            error: '未找到可用的摄像头设备',
            isHttpAccess: false
          };
        } else if (permissionError.name === 'NotReadableError') {
          return {
            isAvailable: false,
            error: '摄像头被其他应用占用，请关闭其他使用摄像头的应用',
            isHttpAccess: false
          };
        }
      }
      
      return {
        isAvailable: false,
        error: `摄像头访问失败: ${permissionError instanceof Error ? permissionError.message : '未知错误'}`,
        isHttpAccess: false
      };
    }
  } catch (error) {
    return {
      isAvailable: false,
      error: `检查摄像头失败: ${error instanceof Error ? error.message : '未知错误'}`,
      isHttpAccess: false
    };
  }
};

/**
 * 安全地启动摄像头
 */
export const startCamera = async (
  deviceId?: string,
  options: {
    width?: number;
    height?: number;
    facingMode?: 'user' | 'environment';
  } = {}
): Promise<{
  success: boolean;
  stream?: MediaStream;
  error?: string;
}> => {
  try {
    const { width = 1280, height = 720, facingMode } = options;
    
    const constraints: MediaStreamConstraints = {
      video: buildCameraVideoConstraints(deviceId, { width, height, facingMode }),
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    
    return {
      success: true,
      stream
    };
  } catch (error) {
    return {
      success: false,
      error: `启动摄像头失败: ${error instanceof Error ? error.message : '未知错误'}`
    };
  }
};

/**
 * 停止摄像头流
 */
export const stopCamera = (stream?: MediaStream): void => {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
};

/**
 * 获取摄像头设备列表（包含物理摄像头和虚拟流媒体摄像头）
 * 注意：默认只枚举设备，不主动 getUserMedia，避免刷新设备列表时抢占 OBS/系统摄像头。
 * 需要授权时应在用户点击“开启”后单独调用 getUserMedia，再把 track 信息传入 authorizedCamera。
 */
export const getCameraDevices = async (
  options: GetCameraDevicesOptions = {}
): Promise<CameraDevice[]> => {
  try {
    const {
      requestPermission = false,
      includeStreams = true,
      authorizedCamera: knownAuthorizedCamera = null,
    } = options;
    const allDevices: CameraDevice[] = [];

    // 1. 获取物理摄像头设备（包括系统级虚拟摄像头如 OBS 虚拟摄像头）
    if (isCameraSecureContext() && navigator.mediaDevices?.enumerateDevices) {
      try {
        let authorizedCamera = knownAuthorizedCamera;
        if (requestPermission) {
          try {
            const tempStream = await navigator.mediaDevices.getUserMedia({
              video: true,
            });
            authorizedCamera = cameraFromTrack(tempStream.getVideoTracks()[0]);
            tempStream.getTracks().forEach(track => track.stop());
          } catch (permissionError) {
            console.warn('无法获取摄像头权限，设备标签可能不完整:', permissionError);
          }
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        const physicalCameras = devices
          .filter(device => device.kind === 'videoinput')
          .filter(device => device.deviceId?.trim())
          .map(normalizePhysicalCamera);
        physicalCameras.forEach((camera) => pushUniqueCamera(allDevices, camera));
        if (authorizedCamera) {
          pushUniqueCamera(allDevices, authorizedCamera);
        }
        const collapsedPhysicalCameras = collapseAndroidFacingCameras(allDevices);
        allDevices.splice(0, allDevices.length, ...collapsedPhysicalCameras);
      } catch (error) {
        console.warn('获取物理摄像头失败:', error);
      }
    } else if (!isCameraSecureContext()) {
      console.warn('当前页面不是摄像头安全上下文。Safari 下请使用 http://localhost:3303/ 或 HTTPS。');
    }

    // 2. 获取虚拟流媒体摄像头
    if (includeStreams) {
      try {
        const activeStreams = (await getActiveStreams()).filter(
          (stream) => stream.enabled && (stream.is_active || stream.status === 'active')
        );
        const virtualCameras = activeStreams.map(stream => ({
          deviceId: `stream-${stream.id}`, // 使用 stream- 前缀标识虚拟摄像头
          label: `📹 ${stream.name} (流媒体)`,
          kind: 'videoinput',
          isVirtual: true,
          streamSource: stream
        }));
        allDevices.push(...virtualCameras);
      } catch (error) {
        console.warn('获取虚拟流媒体摄像头失败:', error);
      }
    }

    return allDevices;
  } catch (error) {
    console.error('获取摄像头设备列表失败:', error);
    return [];
  }
};

/**
 * 检查是否为HTTP访问（摄像头功能受限）
 */
export const isHttpAccess = (): boolean => {
  return !isCameraSecureContext();
};
