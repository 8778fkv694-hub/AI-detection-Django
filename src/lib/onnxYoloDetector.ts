import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';

export interface YoloDetection {
  class: string;
  confidence: number;
  bbox: [number, number, number, number]; // [x, y, width, height]
}

export interface OnnxYoloConfig {
  modelPath: string;
  inputSize: number;
  confidenceThreshold: number;
  nmsThreshold: number;
  maxDetections: number;
}

class OnnxYoloDetector {
  private ort: any = null;
  private session: any = null;
  private isLoaded = false;
  private isLoading = false;
  private config: OnnxYoloConfig;

  // COCO数据集80个类别
  private readonly classNames = [
    'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat',
    'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat',
    'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack',
    'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball',
    'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket',
    'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
    'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake',
    'chair', 'couch', 'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop',
    'mouse', 'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink',
    'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier',
    'toothbrush'
  ];

  constructor(config: Partial<OnnxYoloConfig> = {}) {
    this.config = {
      modelPath: '/models/yolov8n.onnx',
      inputSize: 640,
      confidenceThreshold: 0.5,
      nmsThreshold: 0.45,
      maxDetections: 100,
      ...config
    };
  }

  // 初始化ONNX Runtime
  private async initOnnxRuntime(): Promise<boolean> {
    try {
      // 检查全局ONNX Runtime
      if (typeof window !== 'undefined' && (window as any).ort) {
        this.ort = (window as any).ort;
        console.log('ONNX Runtime已加载，版本:', this.ort.version);
        return true;
      }

      // 尝试动态导入
      console.log('尝试动态导入ONNX Runtime...');
      const onnxModule = await import('onnxruntime-web');
      this.ort = onnxModule;
      console.log('ONNX Runtime动态导入成功');
      return true;
    } catch (error) {
      console.error('ONNX Runtime初始化失败:', error);
      return false;
    }
  }

  // 检查WebGL支持
  private checkWebGLSupport(): boolean {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) {
        console.error('WebGL不可用');
        return false;
      }
      console.log('WebGL可用，版本:', gl.getParameter(gl.VERSION));
      return true;
    } catch (error) {
      console.error('WebGL检查失败:', error);
      return false;
    }
  }

  // 加载模型
  async loadModel(): Promise<boolean> {
    if (this.isLoaded || this.isLoading) {
      return this.isLoaded;
    }

    this.isLoading = true;
    console.log('开始加载ONNX YOLO模型...');

    try {
      // 1. 初始化ONNX Runtime
      const onnxReady = await this.initOnnxRuntime();
      if (!onnxReady) {
        throw new Error('ONNX Runtime初始化失败');
      }

      // 2. 检查WebGL支持
      if (!this.checkWebGLSupport()) {
        throw new Error('WebGL不支持');
      }

      // 3. 加载模型
      console.log('加载模型文件:', this.config.modelPath);
      this.session = await this.ort.InferenceSession.create(this.config.modelPath, {
        executionProviders: ['webgl'],
        graphOptimizationLevel: 'all'
      });

      console.log('模型加载成功');
      console.log('输入名称:', this.session.inputNames);
      console.log('输出名称:', this.session.outputNames);

      this.isLoaded = true;
      return true;
    } catch (error) {
      console.error('模型加载失败:', error);
      this.isLoaded = false;
      return false;
    } finally {
      this.isLoading = false;
    }
  }

  // 图像预处理
  private preprocessImage(imageData: ImageData): Float32Array {
    const { inputSize } = this.config;
    const input = new Float32Array(inputSize * inputSize * 3);
    let pixelIndex = 0;

    // 重新排列数据为CHW格式 (Channel, Height, Width)
    for (let c = 0; c < 3; c++) {
      for (let h = 0; h < inputSize; h++) {
        for (let w = 0; w < inputSize; w++) {
          const srcIndex = (h * inputSize + w) * 4 + c;
          input[pixelIndex++] = imageData.data[srcIndex] / 255.0; // 归一化到0-1
        }
      }
    }

    return input;
  }

  // 非极大值抑制 (NMS)
  private nonMaxSuppression(detections: any[], threshold: number): any[] {
    if (detections.length === 0) return [];

    // 按置信度排序
    detections.sort((a, b) => b.confidence - a.confidence);

    const filtered: any[] = [];
    const used = new Set<number>();

    for (let i = 0; i < detections.length; i++) {
      if (used.has(i)) continue;

      filtered.push(detections[i]);
      used.add(i);

      // 计算IoU并过滤重叠检测
      for (let j = i + 1; j < detections.length; j++) {
        if (used.has(j)) continue;

        const iou = this.calculateIoU(detections[i].bbox, detections[j].bbox);
        if (iou > threshold) {
          used.add(j);
        }
      }
    }

    return filtered;
  }

  // 计算IoU (Intersection over Union)
  private calculateIoU(box1: number[], box2: number[]): number {
    const [x1, y1, w1, h1] = box1;
    const [x2, y2, w2, h2] = box2;

    const xLeft = Math.max(x1, x2);
    const yTop = Math.max(y1, y2);
    const xRight = Math.min(x1 + w1, x2 + w2);
    const yBottom = Math.min(y1 + h1, y2 + h2);

    if (xRight < xLeft || yBottom < yTop) return 0;

    const intersectionArea = (xRight - xLeft) * (yBottom - yTop);
    const box1Area = w1 * h1;
    const box2Area = w2 * h2;
    const unionArea = box1Area + box2Area - intersectionArea;

    return intersectionArea / unionArea;
  }

  // 解析YOLO输出
  private parseYoloOutput(output: any): YoloDetection[] {
    const outputData = output.data as Float32Array;
    const outputShape = output.dims;
    
    console.log('YOLO输出形状:', outputShape);
    console.log('输出数据长度:', outputData.length);

    const detections: any[] = [];
    const numClasses = this.classNames.length;
    const numBoxes = outputShape[2]; // 8400个候选框

    for (let i = 0; i < numBoxes; i++) {
      const boxIndex = i * (4 + numClasses);
      
      // 获取边界框坐标
      const x = outputData[boxIndex];
      const y = outputData[boxIndex + 1];
      const w = outputData[boxIndex + 2];
      const h = outputData[boxIndex + 3];
      
      // 获取类别概率
      let maxClassIndex = 0;
      let maxConfidence = 0;
      
      for (let j = 0; j < numClasses; j++) {
        const confidence = outputData[boxIndex + 4 + j];
        if (confidence > maxConfidence) {
          maxConfidence = confidence;
          maxClassIndex = j;
        }
      }
      
      // 过滤低置信度检测
      if (maxConfidence > this.config.confidenceThreshold) {
        detections.push({
          class: this.classNames[maxClassIndex] || `class_${maxClassIndex}`,
          confidence: maxConfidence,
          bbox: [x, y, w, h]
        });
      }
    }

    // 应用NMS
    const filteredDetections = this.nonMaxSuppression(detections, this.config.nmsThreshold);
    
    // 限制检测数量
    return filteredDetections.slice(0, this.config.maxDetections);
  }

  // 执行检测
  async detect(imageData: string): Promise<YoloDetection[]> {
    if (!this.isLoaded) {
      console.warn('模型未加载');
      return [];
    }

    try {
      console.log('开始ONNX YOLO检测...');

      // 1. 加载图像
      const img = new Image();
      img.src = `data:image/jpeg;base64,${imageData}`;
      
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      // 2. 预处理图像
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = this.config.inputSize;
      canvas.height = this.config.inputSize;
      ctx?.drawImage(img, 0, 0, this.config.inputSize, this.config.inputSize);

      const imageDataObj = ctx?.getImageData(0, 0, this.config.inputSize, this.config.inputSize);
      if (!imageDataObj) {
        throw new Error('无法获取图像数据');
      }

      // 3. 预处理
      const input = this.preprocessImage(imageDataObj);

      // 4. 创建输入tensor
      const inputTensor = new this.ort.Tensor('float32', input, [1, 3, this.config.inputSize, this.config.inputSize]);

      // 5. 执行推理
      const feeds = { [this.session.inputNames[0]]: inputTensor };
      const results = await this.session.run(feeds);

      // 6. 解析输出
      const output = results[this.session.outputNames[0]];
      const detections = this.parseYoloOutput(output);

      console.log('检测完成，找到', detections.length, '个目标');
      return detections;

    } catch (error) {
      console.error('ONNX YOLO检测失败:', error);
      return [];
    }
  }

  // 获取模型状态
  getModelStatus(): { isLoaded: boolean; isLoading: boolean } {
    return {
      isLoaded: this.isLoaded,
      isLoading: this.isLoading
    };
  }

  // 获取配置
  getConfig(): OnnxYoloConfig {
    return { ...this.config };
  }

  // 更新配置
  updateConfig(newConfig: Partial<OnnxYoloConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  // 卸载模型
  unloadModel(): void {
    if (this.session) {
      this.session.release();
      this.session = null;
    }
    this.isLoaded = false;
    this.isLoading = false;
  }
}

// 导出实例
export const onnxYoloDetector = new OnnxYoloDetector(); 