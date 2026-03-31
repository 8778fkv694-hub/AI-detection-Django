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
}

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
    // 检查是否支持mediaDevices API
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return {
        isAvailable: false,
        error: '浏览器不支持摄像头API，请使用现代浏览器'
      };
    }

    // 检查是否使用HTTPS或localhost
    const isLocalhost = window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1' ||
                       window.location.hostname.startsWith('192.168.') ||
                       window.location.hostname.startsWith('10.') ||
                       window.location.hostname.startsWith('172.');
    
    const isHttpAccess = !isLocalhost && window.location.protocol !== 'https:';
    
    if (isHttpAccess) {
      return {
        isAvailable: false,
        error: '摄像头访问需要HTTPS协议或localhost访问。当前使用HTTP访问，摄像头功能受限。',
        isHttpAccess: true
      };
    }

    // 尝试获取摄像头权限
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480 } 
      });
      
      // 立即停止流
      stream.getTracks().forEach(track => track.stop());
      
      // 获取设备列表
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices
        .filter(device => device.kind === 'videoinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `摄像头 ${device.deviceId.slice(0, 8)}...`,
          kind: device.kind
        }));

      return {
        isAvailable: true,
        devices: videoDevices,
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
    const { width = 1280, height = 720, facingMode = 'environment' } = options;
    
    const constraints: MediaStreamConstraints = {
      video: deviceId 
        ? { deviceId: { exact: deviceId } }
        : { 
            width: { ideal: width },
            height: { ideal: height },
            facingMode: { ideal: facingMode }
          }
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
 * 注意：为了获取完整的设备标签（包括OBS虚拟摄像头等），需要先请求摄像头权限
 */
export const getCameraDevices = async (): Promise<CameraDevice[]> => {
  try {
    const allDevices: CameraDevice[] = [];

    // 1. 获取物理摄像头设备（包括系统级虚拟摄像头如OBS虚拟摄像头）
    if (navigator.mediaDevices?.enumerateDevices) {
      try {
        // 重要：先请求摄像头权限，这样浏览器才会返回完整的设备标签
        // 如果没有权限，enumerateDevices() 返回的设备 label 字段会是空字符串
        let hasPermission = false;
        try {
          // 尝试获取任意一个摄像头设备的权限（不指定具体设备）
          const tempStream = await navigator.mediaDevices.getUserMedia({ 
            video: true 
          });
          // 立即停止流，不占用摄像头资源
          tempStream.getTracks().forEach(track => track.stop());
          hasPermission = true;
        } catch (permissionError) {
          // 权限被拒绝或没有设备，继续尝试枚举（可能只能获取部分信息）
          console.warn('无法获取摄像头权限，设备标签可能不完整:', permissionError);
        }

        // 获取设备列表（如果已获得权限，标签会是完整的）
        const devices = await navigator.mediaDevices.enumerateDevices();
        const physicalCameras = devices
          .filter(device => device.kind === 'videoinput')
          .map(device => ({
            deviceId: device.deviceId,
            // 如果label为空，尝试使用设备ID的一部分作为标识
            label: device.label || `摄像头 ${device.deviceId.slice(0, 8)}...`,
            kind: device.kind,
            isVirtual: false
          }));
        allDevices.push(...physicalCameras);
        
        // 如果已获得权限，输出调试信息
        if (hasPermission) {
          console.log('已获取摄像头权限，设备列表包含完整标签:', physicalCameras.map(d => d.label));
        }
      } catch (error) {
        console.warn('获取物理摄像头失败:', error);
      }
    }

    // 2. 获取虚拟流媒体摄像头
    try {
      const activeStreams = await getActiveStreams();
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
  const isLocalhost = window.location.hostname === 'localhost' || 
                     window.location.hostname === '127.0.0.1' ||
                     window.location.hostname.startsWith('192.168.') ||
                     window.location.hostname.startsWith('10.') ||
                     window.location.hostname.startsWith('172.');
  
  return !isLocalhost && window.location.protocol !== 'https:';
};
