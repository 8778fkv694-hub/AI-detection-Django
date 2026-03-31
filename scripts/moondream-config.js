// Moondream 模型配置
// 针对 Mac M2/24GB 环境优化

const MOONDREAM_CONFIG = {
  // 模型配置
  model: {
    name: 'moondream-fast',
    displayName: 'Moondream (优化版)',
    description: '轻量级多模态模型，专为图像理解优化',
    version: 'latest',
    size: '~3GB',
    capabilities: ['vision', 'text', 'multimodal']
  },

  // 性能优化参数
  performance: {
    // M2 芯片优化
    num_gpu_layers: 999,        // 最大 GPU 层数
    num_thread: 4,              // M2 性能核数量
    num_ctx: 2048,             // 上下文长度
    num_predict: 96,            // 输出长度限制
    temperature: 0.2,           // 低温度，稳定输出
    top_p: 0.9,                // 核采样
    top_k: 40,                 // Top-K 采样
    repeat_penalty: 1.1,       // 重复惩罚
    keep_alive: '2h'           // 保持活跃时间
  },

  // 图片处理优化
  image: {
    maxSize: 768,              // 最大图片尺寸
    quality: 0.7,              // JPEG 质量
    format: 'jpeg',            // 推荐格式
    compression: true          // 启用压缩
  },

  // 超时设置
  timeout: {
    connection: 10000,         // 连接超时 10秒
    response: 60000,           // 响应超时 60秒
    total: 120000              // 总超时 2分钟
  },

  // 重试配置
  retry: {
    attempts: 3,               // 重试次数
    delay: 2000,               // 重试延迟
    backoff: true              // 指数退避
  },

  // 内存优化
  memory: {
    optimization: true,        // 启用内存优化
    cleanup: true,             // 自动清理
    monitoring: true           // 内存监控
  },

  // API 端点
  endpoints: {
    ollama: 'http://localhost:11434',
    proxy: 'http://localhost:11437'
  },

  // 提示词模板
  prompts: {
    system: '你是一个专业的图像分析AI助手，擅长快速准确地分析图像内容。请用简洁明了的中文回答。',
    user: '请按照标准严格分析这张图，用最简短的中文回答，50字以内。',
    quality: '请按照标准严格分析这张图的质量，返回JSON格式：{"overallQuality": "合格/不合格", "score": 85, "reason": "检测结果", "defects": []}'
  }
};

// 导出配置
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MOONDREAM_CONFIG;
} else if (typeof window !== 'undefined') {
  window.MOONDREAM_CONFIG = MOONDREAM_CONFIG;
}

// 使用示例
const USAGE_EXAMPLES = {
  // CLI 使用
  cli: {
    basic: 'ollama run moondream-fast -i test.jpg "描述图片"',
    optimized: `ollama run moondream-fast -i test.jpg "分析图片" --options '{
      "num_gpu_layers": 999,
      "num_thread": 4,
      "num_ctx": 2048,
      "num_predict": 96,
      "temperature": 0.2
    }'`
  },

  // API 使用
  api: {
    chat: {
      url: 'http://localhost:11434/api/chat',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        model: 'moondream-fast',
        messages: [
          { role: 'user', content: '分析图片', images: ['base64_image_data'] }
        ],
        stream: false,
        options: MOONDREAM_CONFIG.performance
      }
    },
    generate: {
      url: 'http://localhost:11434/api/generate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        model: 'moondream-fast',
        prompt: '分析图片',
        images: ['base64_image_data'],
        stream: false,
        options: MOONDREAM_CONFIG.performance
      }
    }
  }
};

// 性能监控
class MoondreamMonitor {
  constructor() {
    this.startTime = 0;
    this.memoryStart = 0;
  }

  start() {
    this.startTime = performance.now();
    if (performance.memory) {
      this.memoryStart = performance.memory.usedJSHeapSize;
    }
  }

  end() {
    const endTime = performance.now();
    const totalTime = Math.round(endTime - this.startTime);
    
    let memoryUsed = 0;
    if (performance.memory) {
      const endMemory = performance.memory.usedJSHeapSize;
      memoryUsed = Math.round((endMemory - this.memoryStart) / 1024 / 1024);
    }

    console.log('📊 Moondream 性能报告:');
    console.log(`⏱️  处理时间: ${totalTime}ms`);
    console.log(`🧠 内存使用: ${memoryUsed}MB`);
    console.log(`⚡ 处理速度: ${Math.round(60000 / totalTime)} 张/分钟`);

    return { totalTime, memoryUsed };
  }
}

// 图片压缩工具
class ImageCompressor {
  static async compressImage(file, maxSize = 768, quality = 0.7) {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        // 计算新尺寸
        const ratio = Math.min(maxSize / img.width, maxSize / img.height);
        const newWidth = img.width * ratio;
        const newHeight = img.height * ratio;
        
        canvas.width = newWidth;
        canvas.height = newHeight;
        
        // 绘制压缩后的图片
        ctx.drawImage(img, 0, 0, newWidth, newHeight);
        
        // 转换为 base64
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedDataUrl);
      };
      
      img.src = URL.createObjectURL(file);
    });
  }
}

// 导出工具类
if (typeof module !== 'undefined' && module.exports) {
  module.exports.MoondreamMonitor = MoondreamMonitor;
  module.exports.ImageCompressor = ImageCompressor;
  module.exports.USAGE_EXAMPLES = USAGE_EXAMPLES;
} else if (typeof window !== 'undefined') {
  window.MoondreamMonitor = MoondreamMonitor;
  window.ImageCompressor = ImageCompressor;
  window.USAGE_EXAMPLES = USAGE_EXAMPLES;
}
