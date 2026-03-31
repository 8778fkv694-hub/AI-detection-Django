import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import * as cocossd from '@tensorflow-models/coco-ssd';

// 动态导入ONNX Runtime

// 获取ONNX Runtime
async function getOnnxRuntime(): Promise<any> {
  // 首先尝试从CDN加载
  if (typeof window !== 'undefined' && (window as any).ort) {
    console.log('✅ 使用CDN加载的ONNX Runtime');
    return (window as any).ort;
  }

  // 如果CDN不可用，尝试动态导入
  try {
    console.log('📦 尝试动态导入ONNX Runtime...');
    const onnxModule = await import('onnxruntime-web');
    console.log('✅ ONNX Runtime动态导入成功');
    return onnxModule;
  } catch (error) {
    console.error('❌ ONNX Runtime加载失败:', error);
    return null;
  }
}

export interface YoloDetection {
  class: string;
  confidence: number;
  bbox: [number, number, number, number]; // [x, y, width, height]
}

class YoloDetector {
  private model: cocossd.ObjectDetection | null = null;
  private onnxModel: any = null;
  private isLoaded = false;
  private isLoading = false;
  private useOnnx = false;
  private preferredModel: 'cocossd' | 'onnx' = 'cocossd'; // 默认使用COCO-SSD

  // 设置首选模型
  setPreferredModel(model: 'cocossd' | 'onnx'): void {
    this.preferredModel = model;
    console.log(`设置首选模型为: ${model}`);
  }

  // 获取当前首选模型
  getPreferredModel(): 'cocossd' | 'onnx' {
    return this.preferredModel;
  }

  async loadModel(): Promise<boolean> {
    if (this.isLoaded || this.isLoading) {
      return this.isLoaded;
    }
    this.isLoading = true;
    try {
      // 根据首选模型选择加载策略
      if (this.preferredModel === 'onnx') {
        // 尝试加载ONNX模型
        const onnxSuccess = await this.loadOnnxModel();
        if (onnxSuccess) {
          this.useOnnx = true;
          this.isLoaded = true;
          console.log('前端ONNX YOLO模型加载成功');
          return true;
        } else {
          console.log('ONNX模型加载失败，保持ONNX选择但不加载');
          // 不自动回退到COCO-SSD，保持用户的选择
          this.isLoaded = false;
          return false;
        }
      }

      // 加载COCO-SSD模型
      await tf.setBackend('webgl');
      await tf.ready();
      console.log('正在加载COCO-SSD模型...');
      this.model = await cocossd.load();
      this.isLoaded = true;
      this.useOnnx = false;
      console.log('COCO-SSD模型加载成功');
      return true;
    } catch (error) {
      console.error('模型加载失败:', error);
      this.isLoaded = false;
      return false;
    } finally {
      this.isLoading = false;
    }
  }

  // 加载前端ONNX YOLO模型
  private async loadOnnxModel(): Promise<boolean> {
    try {
      console.log('尝试加载前端ONNX YOLO模型...');

      // 获取ONNX Runtime
      console.log('🔧 正在获取ONNX Runtime...');
      const onnxRuntime = await getOnnxRuntime();
      if (!onnxRuntime) {
        console.error('❌ ONNX Runtime不可用，请检查CDN加载');
        return false;
      }

      console.log('✅ ONNX Runtime可用');
      console.log('📋 版本信息:', onnxRuntime.version || '未知版本');
      console.log('🔧 可用执行提供者:', onnxRuntime.env?.wasm?.numThreads ? 'WebAssembly' : '未知');

      // 检查WebGL支持
      console.log('🎮 检查WebGL支持...');
      const canvas = document.createElement('canvas');
      const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
      if (!gl) {
        console.error('❌ WebGL不可用，无法加载ONNX模型');
        return false;
      }
      console.log('✅ WebGL可用');
      console.log('📋 WebGL版本:', gl.getParameter(gl.VERSION));
      console.log('🔧 渲染器:', gl.getParameter(gl.RENDERER));

      // 尝试多个模型源
      const modelUrls = [
        'https://huggingface.co/ultralytics/yolov8/resolve/main/yolov8n.onnx', // 在线模型
        '/models/yolov8n.onnx', // 本地模型作为备用
        'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/yolov8n.onnx' // 备用CDN
      ];

      console.log('🔍 开始尝试加载ONNX模型，将依次尝试以下源:');
      modelUrls.forEach((url, index) => {
        console.log(`  ${index + 1}. ${url}`);
      });

      for (const modelUrl of modelUrls) {
        try {
          console.log(`\n📥 正在尝试从 ${modelUrl} 加载ONNX模型...`);

          this.onnxModel = await onnxRuntime.InferenceSession.create(modelUrl, {
            executionProviders: ['wasm'],
            graphOptimizationLevel: 'all'
          });

          console.log('✅ ONNX模型加载成功!');
          console.log('📊 模型信息:');
          console.log('  - 输出名称:', this.onnxModel.outputNames);
          console.log('  - 输入名称:', this.onnxModel.inputNames);
          console.log('  - 模型大小:', this.onnxModel.inputNames.length, '个输入,', this.onnxModel.outputNames.length, '个输出');
          return true;
        } catch (error: any) {
          console.warn(`❌ 从 ${modelUrl} 加载失败:`);
          console.warn(`   错误类型: ${error.name}`);
          console.warn(`   错误信息: ${error.message}`);
          if (error.stack) {
            console.warn(`   错误堆栈: ${error.stack.split('\n')[0]}`);
          }
          continue;
        }
      }

      console.error('❌ 所有模型源都加载失败!');
      console.error('💡 可能的原因:');
      console.error('  1. 网络连接问题');
      console.error('  2. 模型文件不存在或损坏');
      console.error('  3. ONNX Runtime版本不兼容');
      console.error('  4. 浏览器不支持WebAssembly');
      return false;
    } catch (error) {
      console.error('ONNX模型加载初始化失败:', error);
      return false;
    }
  }

  async detect(imageData: string, confidenceThreshold: number = 0.5): Promise<YoloDetection[]> {
    if (!this.isLoaded) {
      console.warn('模型未加载');
      return [];
    }

    try {
      if (this.useOnnx) {
        // 使用前端ONNX YOLO检测
        return await this.detectWithOnnx(imageData, confidenceThreshold);
      } else {
        // 使用前端COCO-SSD检测
        return await this.detectWithFrontend(imageData, confidenceThreshold);
      }
    } catch (error) {
      console.error('检测失败:', error);
      return [];
    }
  }

  // 前端ONNX YOLO检测
  private async detectWithOnnx(imageData: string, confidenceThreshold: number): Promise<YoloDetection[]> {
    if (!this.onnxModel) {
      console.warn('ONNX模型未加载');
      return [];
    }

    try {
      console.log('使用前端ONNX YOLO进行检测...');
      console.log('输入参数:', {
        imageDataLength: imageData.length,
        confidenceThreshold,
        modelInputNames: this.onnxModel.inputNames,
        modelOutputNames: this.onnxModel.outputNames
      });

      // 将base64图片转换为tensor
      const img = new Image();
      img.src = `data:image/jpeg;base64,${imageData}`;

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      // 预处理图像
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 640; // YOLO标准输入尺寸
      canvas.height = 640;
      ctx?.drawImage(img, 0, 0, 640, 640);

      // 获取图像数据
      const imageData2 = ctx?.getImageData(0, 0, 640, 640);
      if (!imageData2) return [];

      // 转换为tensor - YOLO输入格式: [1, 3, 640, 640]
      const input = new Float32Array(640 * 640 * 3);
      let pixelIndex = 0;

      // 重新排列数据为CHW格式
      for (let c = 0; c < 3; c++) {
        for (let h = 0; h < 640; h++) {
          for (let w = 0; w < 640; w++) {
            const srcIndex = (h * 640 + w) * 4 + c;
            input[pixelIndex++] = imageData2.data[srcIndex] / 255.0; // 归一化到0-1
          }
        }
      }

      // 获取ONNX Runtime
      const onnxRuntime = await getOnnxRuntime();
      if (!onnxRuntime) {
        console.error('ONNX Runtime不可用，无法创建Tensor');
        return [];
      }

      // 创建输入tensor
      const inputTensor = new onnxRuntime.Tensor('float32', input, [1, 3, 640, 640]);

      // 执行推理
      const feeds = { [this.onnxModel.inputNames[0]]: inputTensor };
      console.log('执行ONNX推理，输入形状:', inputTensor.dims);

      const results = await this.onnxModel.run(feeds);
      console.log('ONNX推理完成，输出键:', Object.keys(results));

      // 解析YOLO输出结果
      const detections: YoloDetection[] = [];

      // YOLO输出格式: [1, 84, 8400] 其中84 = 4(bbox) + 80(classes)
      const output = results[this.onnxModel.outputNames[0]];
      if (!output) {
        console.error('ONNX输出为空');
        return [];
      }

      const outputData = output.data as Float32Array;
      const outputShape = output.dims;

      if (!outputData || !outputShape) {
        console.error('ONNX输出数据无效');
        return [];
      }

      console.log('ONNX输出形状:', outputShape);
      console.log('ONNX输出数据长度:', outputData.length);
      console.log('输出数据前10个值:', outputData.slice(0, 10));

      // 安全计算数组的最大最小值，避免栈溢出
      let minVal = Infinity;
      let maxVal = -Infinity;
      for (let i = 0; i < outputData.length; i++) {
        const val = outputData[i];
        if (val < minVal) minVal = val;
        if (val > maxVal) maxVal = val;
      }

      console.log('输出数据范围:', {
        min: minVal,
        max: maxVal
      });

      // 分析输出数据的分布
      let positiveCount = 0;
      let negativeCount = 0;
      let zeroCount = 0;
      let positiveMin = Infinity;
      let positiveMax = -Infinity;
      let negativeMin = Infinity;
      let negativeMax = -Infinity;

      for (let i = 0; i < outputData.length; i++) {
        const val = outputData[i];
        if (val > 0) {
          positiveCount++;
          if (val < positiveMin) positiveMin = val;
          if (val > positiveMax) positiveMax = val;
        } else if (val < 0) {
          negativeCount++;
          if (val < negativeMin) negativeMin = val;
          if (val > negativeMax) negativeMax = val;
        } else {
          zeroCount++;
        }
      }

      console.log('输出数据分析:', {
        totalValues: outputData.length,
        positiveValues: positiveCount,
        negativeValues: negativeCount,
        zeroValues: zeroCount,
        positiveRange: positiveCount > 0 ? {
          min: positiveMin,
          max: positiveMax
        } : '无正值',
        negativeRange: negativeCount > 0 ? {
          min: negativeMin,
          max: negativeMax
        } : '无负值'
      });

      // 解析检测结果
      // YOLO v8的输出格式: [1, 84, 8400] 其中84 = 4(bbox) + 80(classes)
      const numClasses = 80; // COCO数据集80个类别
      const numBoxes = outputShape[2]; // 8400个检测框
      const boxStride = 84; // 每个框84个值

      console.log('解析YOLO输出:', {
        outputShape,
        numBoxes,
        boxStride,
        numClasses,
        totalDataLength: outputData.length
      });

      // 添加安全检查
      if (numBoxes <= 0 || boxStride <= 0) {
        console.error('无效的解析参数:', { numBoxes, boxStride });
        return [];
      }

      // 遍历所有检测框
      let validBoxes = 0;
      let highConfidenceBoxes = 0;
      let maxConfidenceFound = 0;

      // 调试前几个检测框的置信度
      console.log('前5个检测框的置信度:');
      for (let debugI = 0; debugI < Math.min(5, numBoxes); debugI++) {
        const debugBoxIndex = debugI * boxStride;
        if (debugBoxIndex + 4 + numClasses <= outputData.length) {
          let maxDebugConfidence = 0;
          for (let j = 0; j < numClasses; j++) {
            const confidence = outputData[debugBoxIndex + 4 + j];
            if (!isNaN(confidence) && confidence > maxDebugConfidence) {
              maxDebugConfidence = confidence;
            }
          }
          console.log(`检测框 ${debugI}: 最大置信度 = ${maxDebugConfidence}`);
        }
      }

      for (let i = 0; i < numBoxes; i++) {
        // 计算当前框在输出数据中的起始索引
        const boxIndex = i * boxStride;

        // 添加边界检查
        if (boxIndex + 4 + numClasses > outputData.length) {
          console.warn(`跳过检测框 ${i}: 数据越界`);
          continue;
        }

        // 获取边界框坐标（YOLO输出是归一化的，需要转换到原始图像尺寸）
        const x = outputData[boxIndex];
        const y = outputData[boxIndex + 1];
        const w = outputData[boxIndex + 2];
        const h = outputData[boxIndex + 3];

        // 检查坐标的有效性
        if (isNaN(x) || isNaN(y) || isNaN(w) || isNaN(h)) {
          console.warn(`跳过检测框 ${i}: 无效坐标`);
          continue;
        }

        validBoxes++;

        // 转换到原始图像尺寸
        const originalWidth = img.width;
        const originalHeight = img.height;
        const scaleX = originalWidth / 640;
        const scaleY = originalHeight / 640;

        const scaledX = x * scaleX;
        const scaledY = y * scaleY;
        const scaledW = w * scaleX;
        const scaledH = h * scaleY;

        // 获取类别概率
        let maxClassIndex = 0;
        let maxConfidence = 0;

        for (let j = 0; j < numClasses; j++) {
          const confidence = outputData[boxIndex + 4 + j];
          if (!isNaN(confidence) && confidence > maxConfidence) {
            maxConfidence = confidence;
            maxClassIndex = j;
          }
        }

        // 记录最大置信度用于调试
        if (maxConfidence > maxConfidenceFound) {
          maxConfidenceFound = maxConfidence;
        }

        // 过滤低置信度检测
        if (maxConfidence > confidenceThreshold) {
          highConfidenceBoxes++;
          const classNames = [
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

          detections.push({
            class: classNames[maxClassIndex] || `class_${maxClassIndex}`,
            confidence: maxConfidence,
            bbox: [scaledX, scaledY, scaledW, scaledH]
          });

          // 添加调试信息
          if (i < 5) { // 只显示前5个检测框的详细信息
            console.log(`检测框 ${i}:`, {
              class: classNames[maxClassIndex] || `class_${maxClassIndex}`,
              confidence: maxConfidence,
              bbox: [x, y, w, h],
              scaledBbox: [scaledX, scaledY, scaledW, scaledH],
              threshold: confidenceThreshold
            });
          }
        }
      }

      console.log('检测统计:', {
        totalBoxes: numBoxes,
        validBoxes,
        highConfidenceBoxes,
        maxConfidenceFound,
        finalDetections: detections.length,
        threshold: confidenceThreshold
      });

      console.log('ONNX检测结果:', detections);
      // 安全计算检测结果的统计信息
      let personCount = 0;
      let confidenceMin = Infinity;
      let confidenceMax = -Infinity;

      for (const detection of detections) {
        if (detection.class === 'person') {
          personCount++;
        }
        if (detection.confidence < confidenceMin) confidenceMin = detection.confidence;
        if (detection.confidence > confidenceMax) confidenceMax = detection.confidence;
      }

      console.log('检测结果详情:', {
        totalDetections: detections.length,
        personDetections: personCount,
        confidenceRange: detections.length > 0 ? {
          min: confidenceMin,
          max: confidenceMax
        } : '无检测结果',
        bboxRange: detections.length > 0 ? {
          x: detections.map(d => d.bbox[0]),
          y: detections.map(d => d.bbox[1]),
          w: detections.map(d => d.bbox[2]),
          h: detections.map(d => d.bbox[3])
        } : '无检测结果'
      });

      // 如果没有检测到任何结果，尝试降低阈值重新检测
      if (detections.length === 0) {
        console.log('没有检测到结果，尝试降低阈值到0.1...');
        console.log('当前最大置信度:', maxConfidenceFound, '阈值:', confidenceThreshold);

        // 尝试降低阈值重新检测
        const lowThreshold = 0.1;
        const lowThresholdDetections: YoloDetection[] = [];

        for (let i = 0; i < numBoxes; i++) {
          // 计算当前框在输出数据中的起始索引
          const boxIndex = i * boxStride;

          // 添加边界检查
          if (boxIndex + 4 + numClasses > outputData.length) {
            console.warn(`低阈值检测跳过检测框 ${i}: 数据越界`);
            continue;
          }

          const x = outputData[boxIndex];
          const y = outputData[boxIndex + 1];
          const w = outputData[boxIndex + 2];
          const h = outputData[boxIndex + 3];

          // 检查坐标的有效性
          if (isNaN(x) || isNaN(y) || isNaN(w) || isNaN(h)) {
            console.warn(`低阈值检测跳过检测框 ${i}: 无效坐标`);
            continue;
          }

          const originalWidth = img.width;
          const originalHeight = img.height;
          const scaleX = originalWidth / 640;
          const scaleY = originalHeight / 640;

          const scaledX = x * scaleX;
          const scaledY = y * scaleY;
          const scaledW = w * scaleX;
          const scaledH = h * scaleY;

          let maxClassIndex = 0;
          let maxConfidence = 0;

          for (let j = 0; j < numClasses; j++) {
            const confidence = outputData[boxIndex + 4 + j];
            if (!isNaN(confidence) && confidence > maxConfidence) {
              maxConfidence = confidence;
              maxClassIndex = j;
            }
          }

          if (maxConfidence > lowThreshold) {
            const classNames = [
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

            lowThresholdDetections.push({
              class: classNames[maxClassIndex] || `class_${maxClassIndex}`,
              confidence: maxConfidence,
              bbox: [scaledX, scaledY, scaledW, scaledH]
            });
          }
        }

        console.log('低阈值检测结果:', lowThresholdDetections);
        if (lowThresholdDetections.length > 0) {
          console.log('发现低置信度检测，可能阈值设置过高');
          return lowThresholdDetections;
        }
      }

      return detections;
    } catch (error) {
      console.error('ONNX检测失败:', error);
      return [];
    }
  }

  // 前端COCO-SSD检测
  private async detectWithFrontend(imageData: string, confidenceThreshold: number): Promise<YoloDetection[]> {
    if (!this.model) {
      return [];
    }

    // 创建图像元素
    const img = new Image();
    img.src = `data:image/jpeg;base64,${imageData}`;

    // 等待图像加载
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    // 执行检测
    const predictions = await this.model.detect(img, 20, confidenceThreshold);

    // 转换为我们的格式
    const detections: YoloDetection[] = predictions.map(pred => ({
      class: pred.class,
      confidence: pred.score,
      bbox: [pred.bbox[0], pred.bbox[1], pred.bbox[2], pred.bbox[3]]
    }));

    return detections;
  }

  isModelLoaded(): boolean {
    return this.isLoaded;
  }

  isModelLoading(): boolean {
    return this.isLoading;
  }

  isUsingOnnx(): boolean {
    return this.useOnnx;
  }

  isUsingBackend(): boolean {
    // 前端检测器，始终返回false
    return false;
  }

  getModelType(): string {
    if (this.preferredModel === 'onnx') {
      if (this.useOnnx && this.isLoaded) {
        return '前端ONNX YOLO (已加载)';
      } else {
        return '前端ONNX YOLO (加载失败)';
      }
    } else {
      if (this.isLoaded && !this.useOnnx) {
        return '前端COCO-SSD (已加载)';
      } else {
        return '前端COCO-SSD (未加载)';
      }
    }
  }

  // 获取模型性能对比信息
  getModelComparison(): string {
    if (this.useOnnx) {
      return '前端ONNX YOLO: 高精度检测，支持80+类别，实时性能优秀';
    } else {
      return '前端COCO-SSD: 基础检测能力，支持80个COCO类别，性能有限';
    }
  }

  // 重新加载模型（切换模型类型）
  async reloadModel(): Promise<boolean> {
    console.log('重新加载模型...');
    this.isLoaded = false;
    this.isLoading = false;
    this.model = null;
    this.onnxModel = null;
    this.useOnnx = false;
    return await this.loadModel();
  }
}

// 全局实例
export const yoloDetector = new YoloDetector(); 