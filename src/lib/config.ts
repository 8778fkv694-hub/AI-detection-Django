const isDevelopment = import.meta.env.DEV;

// 检测当前协议
const isHTTPS = window.location.protocol === 'https:';

// v2: 基于端口的动态环境检测
// 支持 Jetson Nano 生产部署
export const API_BASE_URL = (() => {
  const port = window.location.port;

  // 开发模式检测:
  // 1. Vite 开发服务器 (port 3303)
  // 2. import.meta.env.DEV 为 true
  if (port === '3303' || isDevelopment) {
    // 开发环境：使用相对路径，通过Vite代理转发
    console.log('🔧 [Config] 开发模式: 使用相对路径 /api');
    return '/api';
  }

  // 生产模式检测:
  // 1. 静态服务器 (port 3001 或 3005) - Jetson / macOS 部署
  // 2. 其他生产环境端口
  if (port === '3001' || port === '3005') {
    // 生产部署：通过 serve_spa.py 的代理访问，使用相对路径更优
    console.log(`🚀 [Config] 生产模式 (端口 ${port}): 使用代理模式 (/api)`);
    return '/api';
  }

  // 其他生产环境：根据协议选择 API 地址
  if (isHTTPS) {
    return 'https://localhost:8012/api';
  } else {
    return 'http://localhost:8012/api';
  }
})();

// 导出API配置
export const API_CONFIG = {
  BASE_URL: API_BASE_URL,
  TIMEOUT: 30000, // 30秒超时
  RETRY_ATTEMPTS: 3, // 重试次数
} as const;

// CSRF token缓存
let csrfTokenCache: string | null = null;

// 获取CSRF token的工具函数
async function getCsrfToken(): Promise<string | null> {
  // 首先尝试从cookie中获取CSRF token
  const name = 'csrftoken';
  const cookies = document.cookie.split(';');
  for (let cookie of cookies) {
    const [key, value] = cookie.trim().split('=');
    if (key === name && value) {
      csrfTokenCache = decodeURIComponent(value);
      // console.log('✅ 从cookie获取CSRF token成功');
      return csrfTokenCache;
    }
  }

  // 如果cookie中没有，尝试使用缓存的token
  if (csrfTokenCache) {
    console.log('✅ 使用缓存的CSRF token');
    return csrfTokenCache;
  }

  // 如果都没有，尝试从后端获取
  console.log('🔄 从后端获取CSRF token...');
  try {
    const response = await fetch(`${API_BASE_URL}/results/csrf-token/`, {
      method: 'GET',
      credentials: 'include',
    });
    console.log('CSRF token响应状态:', response.status, response.statusText);
    if (response.ok) {
      const data = await response.json();
      console.log('CSRF token响应数据:', data);
      if (data.csrf_token) {
        csrfTokenCache = data.csrf_token;
        // 将token设置到cookie中（如果后端没有自动设置）
        document.cookie = `${name}=${data.csrf_token}; path=/; SameSite=Lax`;
        console.log('✅ 从后端获取CSRF token成功，已设置到cookie');
        return csrfTokenCache;
      } else {
        console.warn('⚠️ 后端返回的CSRF token为空');
      }
    } else {
      const errorText = await response.text();
      console.error('❌ 获取CSRF token失败:', response.status, errorText);
    }
  } catch (error) {
    console.error('❌ 获取CSRF token异常:', error);
  }

  console.warn('⚠️ 无法获取CSRF token');
  return null;
}

// 同步版本的getCsrfToken（用于不需要等待的场景）
function getCsrfTokenSync(): string | null {
  // 从cookie中获取CSRF token
  const name = 'csrftoken';
  const cookies = document.cookie.split(';');
  for (let cookie of cookies) {
    const [key, value] = cookie.trim().split('=');
    if (key === name && value) {
      csrfTokenCache = decodeURIComponent(value);
      return csrfTokenCache;
    }
  }
  return csrfTokenCache;
}

// 创建带基础URL的fetch函数
export async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;

  // 判断是否需要CSRF保护的方法
  const needsCsrf = options.method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method.toUpperCase());

  // 如果需要CSRF保护，获取token
  let csrfToken: string | null = null;
  if (needsCsrf) {
    csrfToken = await getCsrfToken();
    // 如果还是没有token，尝试同步获取（可能已经在cookie中）
    if (!csrfToken) {
      csrfToken = getCsrfTokenSync();
    }

    if (csrfToken) {
      // console.log(`✅ 准备发送${options.method}请求到 ${endpoint}，已包含CSRF token`);
    } else {
      console.warn(`⚠️ 准备发送${options.method}请求到 ${endpoint}，但没有CSRF token！`);
    }
  }

  const buildOptions = (signal?: AbortSignal): RequestInit => ({
    credentials: 'include', // 包含cookies
    headers: {
      'Content-Type': 'application/json',
      // 如果需要CSRF保护且有token，则添加CSRF token
      ...(needsCsrf && csrfToken ? { 'X-CSRFToken': csrfToken } : {}),
      ...options.headers,
    },
    ...options,
    ...(signal ? { signal } : {}),
  });

  const doFetch = async (): Promise<Response> => {
    if (options.signal) {
      return fetch(url, buildOptions(options.signal));
    }
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT);
    try {
      return await fetch(url, buildOptions(controller.signal));
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  const response = await doFetch();

  // 如果CSRF失败，尝试重新获取token并重试一次
  if (needsCsrf && response.status === 403) {
    const responseText = await response.clone().text();
    if (responseText.includes('CSRF') || responseText.includes('csrf')) {
      console.warn('🔄 CSRF验证失败，尝试重新获取token并重试...');
      // 清除缓存，重新获取
      csrfTokenCache = null;
      csrfToken = await getCsrfToken();
      if (csrfToken) {
        // 重试请求
        const retryOptions: RequestInit = {
          ...options,
          headers: {
            ...(options.headers || {}),
            'X-CSRFToken': csrfToken,
          },
        };
        console.log('🔄 重试请求，使用新的CSRF token');
        // 重试时也应用超时控制
        return apiFetch(endpoint, retryOptions);
      }
    }
  }

  return response;
}

// 初始化CSRF token（在应用启动时调用）
export async function initCsrfToken(): Promise<void> {
  try {
    console.log('🔄 初始化CSRF token...');
    const token = await getCsrfToken();
    if (token) {
      console.log('✅ CSRF token初始化成功');
    } else {
      console.warn('⚠️ CSRF token初始化失败，将在首次请求时重试');
    }
  } catch (error) {
    console.error('❌ 初始化CSRF token异常:', error);
  }
}

// 创建API请求的辅助函数
export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
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
    } catch (e) {
      if (e instanceof Error && e.message) {
        throw e;
      }
      throw new Error(errorText || `请求失败，状态码: ${response.status}`);
    }
  }

  try {
    return await response.json();
  } catch (e) {
    throw new Error('收到成功响应，但响应体不是有效的JSON格式');
  }
}
