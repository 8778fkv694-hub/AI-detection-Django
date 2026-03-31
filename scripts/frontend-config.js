// 前端配置文件 - 用于在其他设备上运行前端
// 请根据实际部署设备的IP地址修改以下配置

const config = {
  // 后端API地址 - 请修改为部署设备的实际IP地址
  API_BASE_URL: 'https://192.168.1.100:8443/api',
  
  // 开发模式下的API地址
  DEV_API_BASE_URL: 'https://192.168.1.100:8443/api',
  
  // 生产模式下的API地址
  PROD_API_BASE_URL: 'https://192.168.1.100:8443/api',
  
  // 是否启用HTTPS
  ENABLE_HTTPS: true,
  
  // 摄像头配置
  CAMERA: {
    // 允许访问摄像头
    ENABLE_CAMERA: true,
    // 摄像头分辨率
    WIDTH: 1280,
    HEIGHT: 720,
    // 摄像头帧率
    FRAME_RATE: 30,
  },
  
  // 网络配置
  NETWORK: {
    // 超时时间（毫秒）
    TIMEOUT: 30000,
    // 重试次数
    RETRY_COUNT: 3,
    // 重试间隔（毫秒）
    RETRY_DELAY: 1000,
  },
  
  // 安全配置
  SECURITY: {
    // 是否验证SSL证书
    VERIFY_SSL: false, // 自签名证书设为false
    // 允许的域名
    ALLOWED_ORIGINS: [
      'https://192.168.1.100:8443',
      'https://localhost:8443',
      'https://127.0.0.1:8443'
    ]
  }
};

// 根据环境选择API地址
const getApiBaseUrl = () => {
  if (process.env.NODE_ENV === 'development') {
    return config.DEV_API_BASE_URL;
  } else if (process.env.NODE_ENV === 'production') {
    return config.PROD_API_BASE_URL;
  }
  return config.API_BASE_URL;
};

// 导出配置
if (typeof module !== 'undefined' && module.exports) {
  // Node.js环境
  module.exports = { config, getApiBaseUrl };
} else {
  // 浏览器环境
  window.FRONTEND_CONFIG = { config, getApiBaseUrl };
}

console.log('🔧 前端配置已加载');
console.log('🌐 API地址:', getApiBaseUrl());
console.log('🔒 HTTPS:', config.ENABLE_HTTPS ? '已启用' : '未启用');
console.log('📷 摄像头:', config.CAMERA.ENABLE_CAMERA ? '已启用' : '未启用');
