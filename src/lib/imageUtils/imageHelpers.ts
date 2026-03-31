/**
 * 图像处理工具函数
 * 提供常用的图像加载、压缩、Canvas操作等功能
 */

/**
 * 图片压缩配置选项
 */
export interface CompressionConfig {
  maxWidth: number;    // 最大宽度
  maxHeight: number;   // 最大高度
  quality: number;     // 压缩质量 (0-1)
  maxSizeMB?: number;  // 最大文件大小（MB）
}

/**
 * 默认压缩配置
 */
export const DEFAULT_COMPRESSION_CONFIG: CompressionConfig = {
  maxWidth: 800,
  maxHeight: 800,
  quality: 0.8,
  maxSizeMB: 1
};

/**
 * 加载图片 - Promise包装
 *
 * @param dataUrl - 图片的Data URL或路径
 * @returns Promise<HTMLImageElement>
 */
export function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (error) => reject(new Error(`图片加载失败: ${error}`));
    img.src = dataUrl;
  });
}

/**
 * 创建Canvas及其上下文
 *
 * @param width - Canvas宽度
 * @param height - Canvas高度
 * @returns { canvas, ctx } - Canvas元素和2D上下文
 * @throws 如果无法创建Canvas上下文
 */
export function createCanvas(width: number, height: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D
} {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('无法创建Canvas 2D上下文');
  }
  return { canvas, ctx };
}

/**
 * 压缩图片
 *
 * @param base64Image - Base64编码的图片
 * @param config - 压缩配置（可选）
 * @param onWarning - 警告回调函数（可选）
 * @returns Promise<压缩后的Base64图片>
 */
export function compressImage(
  base64Image: string,
  config: Partial<CompressionConfig> = {},
  onWarning?: (message: string) => void
): Promise<string> {
  return new Promise((resolve) => {
    const finalConfig = { ...DEFAULT_COMPRESSION_CONFIG, ...config };

    const img = new Image();
    img.onload = () => {
      try {
        const { canvas, ctx } = createCanvas(img.width, img.height);

        const { maxWidth, maxHeight, quality } = finalConfig;
        let { width, height } = img;

        // 计算压缩后的尺寸（保持宽高比）
        if (width > height) {
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
          }
        }

        // 调整Canvas尺寸
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        // 压缩为JPEG
        const compressedBase64 = canvas.toDataURL('image/jpeg', quality);

        // 计算压缩率
        const originalSize = base64Image.length;
        const compressedSize = compressedBase64.length;
        const compressionRatio = Math.round((1 - compressedSize / originalSize) * 100);

        console.log(
          `图片压缩完成: ${img.width}x${img.height} -> ${width}x${height}, ` +
          `压缩率: ${compressionRatio}%, 质量: ${quality}`
        );

        resolve(compressedBase64);
      } catch (error) {
        console.error('图片压缩失败:', error);
        onWarning?.('图片压缩失败，使用原图');
        resolve(base64Image);
      }
    };

    img.onerror = () => {
      console.error('图片加载失败');
      onWarning?.('图片加载失败，无法压缩');
      resolve(base64Image);
    };

    img.src = base64Image;
  });
}

/**
 * 将File对象转换为Base64字符串
 *
 * @param file - 文件对象
 * @returns Promise<Base64字符串>
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('FileReader结果不是字符串'));
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

/**
 * 将Base64字符串转换为Blob对象
 *
 * @param base64 - Base64字符串
 * @param mimeType - MIME类型（默认'image/jpeg'）
 * @returns Blob对象
 */
export function base64ToBlob(base64: string, mimeType: string = 'image/jpeg'): Blob {
  const byteString = atob(base64.split(',')[1]);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);

  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }

  return new Blob([ab], { type: mimeType });
}

/**
 * 获取图片尺寸信息
 *
 * @param dataUrl - 图片的Data URL
 * @returns Promise<{ width, height }>
 */
export async function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  const img = await loadImage(dataUrl);
  return {
    width: img.width,
    height: img.height
  };
}
