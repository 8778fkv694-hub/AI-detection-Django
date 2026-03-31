
    import imageCompression from 'browser-image-compression';
    import type { AIConfig } from '@/types';
    import { toBase64 } from '@/lib/utils';

    /**
     * Processes a File object by optionally compressing it and converting it to base64.
     * @param file The image file to process.
     * @param config The AI configuration, containing compression settings.
     * @returns A promise that resolves to the base64 encoded string (without data URL prefix).
     */
    export async function processAndEncodeImage(file: File, config: AIConfig): Promise<string> {
      let imageFile = file;

      if (config.compressionEnabled) {
        const options = {
          maxSizeMB: 1, // Max size in MB
          maxWidthOrHeight: Math.max(config.imageWidth, config.imageHeight), // Use configured dimensions
          useWebWorker: true,
          initialQuality: config.compressionQuality, // Use quality from settings
        };
        try {
          console.log(`🔧 批量检测图片压缩配置:`, {
            imageWidth: config.imageWidth,
            imageHeight: config.imageHeight,
            compressionQuality: config.compressionQuality,
            maxWidthOrHeight: options.maxWidthOrHeight
          });
          console.log(`Compressing image with quality ${config.compressionQuality}... Original size: ${(file.size / 1024).toFixed(2)} KB`);
          const compressedFile = await imageCompression(file, options);
          console.log(`Compressed size: ${(compressedFile.size / 1024).toFixed(2)} KB`);
          imageFile = compressedFile;
        } catch (error) {
          console.error("Image compression failed, using original file.", error);
        }
      }

      const base64 = await toBase64(imageFile) as string;
      return base64;
    }
  