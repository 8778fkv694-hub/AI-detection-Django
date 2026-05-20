/**
 * ONNX YOLO Detector — 前端端侧 YOLO 推理（Web Worker 线程版）
 *
 * 将重算力推理移至 Worker 线程，彻底释放 UI 线程，让摄像头预览和 React 渲染 100% 流畅。
 */

import type { BackendYoloDetection } from '@/types';
import YoloWorker from './yolo.worker?worker';
import { resolveModelUrl } from '@/lib/config';

export interface OnnxYoloConfig {
  modelPath: string;
  inputSize: number;
  confidenceThreshold: number;
  nmsThreshold: number;
  maxDetections: number;
  classNames: string[];
}

// PPE 模型 10 个类别
export const PPE_CLASS_NAMES = [
  'Hardhat', 'Mask', 'NO-Hardhat', 'NO-Mask', 'NO-Safety Vest',
  'Person', 'Safety Cone', 'Safety Vest', 'machinery', 'vehicle'
];

// COCO 80 个类别 (用于 YOLOv8n)
export const COCO_CLASSES = [
  'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat', 'traffic light',
  'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat', 'dog', 'horse', 'sheep', 'cow',
  'elephant', 'bear', 'zebra', 'giraffe', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee',
  'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard',
  'tennis racket', 'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
  'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair', 'couch',
  'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse', 'remote', 'keyboard', 'cell phone',
  'microwave', 'oven', 'toaster', 'sink', 'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear',
  'hair drier', 'toothbrush'
];

class OnnxYoloDetector {
  private worker: Worker | null = null;
  private isLoaded = false;
  private isLoading = false;
  private config: OnnxYoloConfig;

  // 挂起的 Promise 解析器
  private initResolver: ((value: boolean) => void) | null = null;
  private detectResolver: ((value: BackendYoloDetection[]) => void) | null = null;

  constructor(config: Partial<OnnxYoloConfig> = {}) {
    this.config = {
      modelPath: '/models/ppe.onnx',
      inputSize: 640,
      confidenceThreshold: 0.5,
      nmsThreshold: 0.45,
      maxDetections: 100,
      classNames: PPE_CLASS_NAMES,
      ...config
    };
  }

  // 根据模型ID获取对应的路径和类别
  getModelConfigById(modelId: string): { modelPath: string; classNames: string[] } {
    if (modelId === 'yolov8n') {
      return {
        modelPath: '/models/yolov8n.onnx',
        classNames: COCO_CLASSES
      };
    } else {
      // 默认使用 ppe.onnx (167MB Custom Model)
      return {
        modelPath: '/models/ppe.onnx',
        classNames: PPE_CLASS_NAMES
      };
    }
  }

  // 加载模型 (初始化 Worker)
  async loadModel(): Promise<boolean> {
    if (this.isLoaded) return true;
    if (this.isLoading) {
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (!this.isLoading) {
            clearInterval(checkInterval);
            resolve(this.isLoaded);
          }
        }, 200);
      });
    }

    this.isLoading = true;
    console.log('[OnnxYolo] 正在主线程中创建 YoloWorker...');

    try {
      // 实例化 Vite 编译的 Web Worker
      this.worker = new YoloWorker();

      // 设置 Worker 消息监听
      this.worker.onmessage = (e: MessageEvent) => {
        const { type, payload } = e.data;

        if (type === 'init_done') {
          this.isLoading = false;
          if (payload.success) {
            console.log('[OnnxYolo] Worker 初始化模型完毕');
            if (payload.inputSize) {
              this.config.inputSize = payload.inputSize;
              console.log(`[OnnxYolo] 自动从模型同步输入尺寸到主线程: ${this.config.inputSize}`);
            }
            this.isLoaded = true;
            this.initResolver?.(true);
          } else {
            console.error('[OnnxYolo] Worker 初始化模型失败:', payload.error);
            this.isLoaded = false;
            this.initResolver?.(false);
          }
        } 
        
        else if (type === 'result') {
          const { detections, inferenceMs } = payload;
          console.log(`[OnnxYolo] Worker 推理完成，耗时: ${inferenceMs}ms，检出 ${detections.length} 个目标`);
          
          // 裁剪并限制最大检出数量
          const limited = detections.slice(0, this.config.maxDetections);
          this.detectResolver?.(limited);
          this.detectResolver = null;
        } 
        
        else if (type === 'error') {
          console.error('[OnnxYolo] Worker 抛出异常:', payload);
          this.detectResolver?.([]);
          this.detectResolver = null;
        }
      };

      // 发送初始化配置消息
      const initPromise = new Promise<boolean>((resolve) => {
        this.initResolver = resolve;
      });

      this.worker.postMessage({
        type: 'init',
        payload: {
          modelPath: resolveModelUrl(this.config.modelPath),
          inputSize: this.config.inputSize,
          confidenceThreshold: this.config.confidenceThreshold,
          nmsThreshold: this.config.nmsThreshold,
          classNames: this.config.classNames
        }
      });

      return initPromise;
    } catch (error) {
      console.error('[OnnxYolo] 创建 Web Worker 失败:', error);
      this.isLoading = false;
      this.isLoaded = false;
      return false;
    }
  }

  /**
   * 执行检测 (Base64 图片)
   */
  async detect(imageBase64: string): Promise<BackendYoloDetection[]> {
    if (!this.isLoaded) {
      const loaded = await this.loadModel();
      if (!loaded) return [];
    }

    if (!this.worker) return [];

    try {
      // 1. 加载图像并转换成 ImageData 以提取像素
      const img = new Image();
      img.src = `data:image/jpeg;base64,${imageBase64}`;

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = (e) => reject(e);
      });

      const imgWidth = img.naturalWidth;
      const imgHeight = img.naturalHeight;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      canvas.width = this.config.inputSize;
      canvas.height = this.config.inputSize;
      ctx.drawImage(img, 0, 0, this.config.inputSize, this.config.inputSize);

      const imageDataObj = ctx.getImageData(0, 0, this.config.inputSize, this.config.inputSize);
      
      // 2. 获取像素数据 Buffer
      const pixelData = new Uint8ClampedArray(imageDataObj.data.buffer);

      // 3. 挂起 Promise 并发送到 Worker
      const detectPromise = new Promise<BackendYoloDetection[]>((resolve) => {
        this.detectResolver = resolve;
      });

      this.worker.postMessage(
        {
          type: 'detect',
          payload: { pixelData, width: imgWidth, height: imgHeight }
        },
        [pixelData.buffer] // 转移 Buffer 所有权，零拷贝
      );

      return detectPromise;
    } catch (error) {
      console.error('[OnnxYolo] Base64 检测失败:', error);
      return [];
    }
  }

  /**
   * 从 video 元素直接检测（不卡 UI 主线程）
   */
  async detectFromVideo(video: HTMLVideoElement): Promise<BackendYoloDetection[]> {
    if (!this.isLoaded) {
      const loaded = await this.loadModel();
      if (!loaded) return [];
    }

    if (!this.worker) return [];

    // 避免在上一个推理尚未返回时再次发送，防止 Worker 队列溢出
    if (this.detectResolver !== null) {
      console.warn('[OnnxYolo] 上一帧推理尚未返回，跳过当前帧');
      return [];
    }

    try {
      const imgWidth = video.videoWidth;
      const imgHeight = video.videoHeight;
      if (imgWidth === 0 || imgHeight === 0) return [];

      // 1. 高速截图并生成 inputSize 尺寸的像素数据
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      canvas.width = this.config.inputSize;
      canvas.height = this.config.inputSize;
      ctx.drawImage(video, 0, 0, this.config.inputSize, this.config.inputSize);

      const imageDataObj = ctx.getImageData(0, 0, this.config.inputSize, this.config.inputSize);
      const pixelData = new Uint8ClampedArray(imageDataObj.data.buffer);

      // 2. 挂起 Promise 并发送至 Worker 推理
      const detectPromise = new Promise<BackendYoloDetection[]>((resolve) => {
        this.detectResolver = resolve;
      });

      this.worker.postMessage(
        {
          type: 'detect',
          payload: { pixelData, width: imgWidth, height: imgHeight }
        },
        [pixelData.buffer] // 转移 Buffer 所有权，零拷贝
      );

      return detectPromise;
    } catch (error) {
      console.error('[OnnxYolo] 视频帧检测失败:', error);
      return [];
    }
  }

  // 模型状态
  getModelStatus(): { isLoaded: boolean; isLoading: boolean } {
    return { isLoaded: this.isLoaded, isLoading: this.isLoading };
  }

  // 获取配置
  getConfig(): OnnxYoloConfig {
    return { ...this.config };
  }

  // 更新配置（需要重新发送给 Worker）
  updateConfig(newConfig: Partial<OnnxYoloConfig>): void {
    this.config = { ...this.config, ...newConfig };
    if (this.worker && this.isLoaded) {
      this.worker.postMessage({
        type: 'init',
        payload: {
          modelPath: this.config.modelPath,
          inputSize: this.config.inputSize,
          confidenceThreshold: this.config.confidenceThreshold,
          nmsThreshold: this.config.nmsThreshold,
          classNames: this.config.classNames
        }
      });
    }
  }

  // 切换模型
  async switchModel(modelPath: string, classNames: string[]): Promise<boolean> {
    this.unloadModel();
    this.config.modelPath = modelPath;
    this.config.classNames = classNames;
    return this.loadModel();
  }

  // 卸载模型
  unloadModel(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.isLoaded = false;
    this.isLoading = false;
    this.detectResolver = null;
    this.initResolver = null;
  }
}

export const onnxYoloDetector = new OnnxYoloDetector();