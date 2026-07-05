import * as ort from 'onnxruntime-web';

// 默认 PPE 类名
const DEFAULT_CLASS_NAMES = [
  'Hardhat', 'Mask', 'NO-Hardhat', 'NO-Mask', 'NO-Safety Vest',
  'Person', 'Safety Cone', 'Safety Vest', 'machinery', 'vehicle'
];

// COCO 80 类别名 (用于 YOLOv8n 等通用模型基准测试)
const COCO_CLASS_NAMES = [
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

interface WorkerConfig {
  modelPath: string;
  inputSize: number;
  confidenceThreshold: number;
  nmsThreshold: number;
  classNames: string[];
}

let session: ort.InferenceSession | null = null;
let config: WorkerConfig = {
  modelPath: '/models/best.onnx',
  inputSize: 320,
  confidenceThreshold: 0.5,
  nmsThreshold: 0.45,
  classNames: DEFAULT_CLASS_NAMES,
};

// 预处理图像：将 ImageData 的 flat RGBA Uint8ClampedArray 转为 NCHW Float32Array
function preprocessImage(pixelData: Uint8ClampedArray, inputSize: number): Float32Array {
  const input = new Float32Array(inputSize * inputSize * 3);

  // CHW 格式 (Channel, Height, Width)，归一化到 0-1
  for (let c = 0; c < 3; c++) {
    for (let h = 0; h < inputSize; h++) {
      for (let w = 0; w < inputSize; w++) {
        const srcIndex = (h * inputSize + w) * 4 + c;
        const dstIndex = c * inputSize * inputSize + h * inputSize + w;
        input[dstIndex] = pixelData[srcIndex] / 255.0;
      }
    }
  }

  return input;
}

// IoU 计算
function calculateIoU(
  box1: { x1: number; y1: number; x2: number; y2: number },
  box2: { x1: number; y1: number; x2: number; y2: number }
): number {
  const xLeft = Math.max(box1.x1, box2.x1);
  const yTop = Math.max(box1.y1, box2.y1);
  const xRight = Math.min(box1.x2, box2.x2);
  const yBottom = Math.min(box1.y2, box2.y2);

  if (xRight < xLeft || yBottom < yTop) return 0;

  const intersectionArea = (xRight - xLeft) * (yBottom - yTop);
  const box1Area = (box1.x2 - box1.x1) * (box1.y2 - box1.y1);
  const box2Area = (box2.x2 - box2.x1) * (box2.y2 - box2.y1);
  const unionArea = box1Area + box2Area - intersectionArea;

  return unionArea > 0 ? intersectionArea / unionArea : 0;
}

// 非极大值抑制 NMS
function nonMaxSuppression(
  detections: Array<{ label: string; confidence: number; bbox: { x1: number; y1: number; x2: number; y2: number } }>,
  threshold: number
) {
  if (detections.length === 0) return [];

  // 按置信度降序
  detections.sort((a, b) => b.confidence - a.confidence);

  const filtered: typeof detections = [];
  const used = new Set<number>();

  for (let i = 0; i < detections.length; i++) {
    if (used.has(i)) continue;
    filtered.push(detections[i]);
    used.add(i);

    for (let j = i + 1; j < detections.length; j++) {
      if (used.has(j)) continue;
      if (calculateIoU(detections[i].bbox, detections[j].bbox) > threshold) {
        used.add(j);
      }
    }
  }

  return filtered;
}

// 解析 YOLOv8 输出
// 输出形状: (1, 4+nclass, 8400) 列优先
function parseYoloOutput(
  outputData: Float32Array,
  outputShape: number[],
  imgWidth: number,
  imgHeight: number
) {
  const numClasses = outputShape[1] - 4; // 动态推断模型输出类别数
  const numBoxes = outputShape[2]; // 8400 或 2100 等目标框数量

  // 选用合适的类名列表
  const classNames = numClasses === 80 ? COCO_CLASS_NAMES : config.classNames;

  const detections: Array<{ label: string; confidence: number; bbox: { x1: number; y1: number; x2: number; y2: number } }> = [];

  const scaleX = imgWidth / config.inputSize;
  const scaleY = imgHeight / config.inputSize;

  for (let i = 0; i < numBoxes; i++) {
    const cx = outputData[0 * numBoxes + i]; // center x
    const cy = outputData[1 * numBoxes + i]; // center y
    const w = outputData[2 * numBoxes + i];  // width
    const h = outputData[3 * numBoxes + i];  // height

    let maxClassIndex = 0;
    let maxConfidence = 0;

    for (let j = 0; j < numClasses; j++) {
      const confidence = outputData[(4 + j) * numBoxes + i];
      if (confidence > maxConfidence) {
        maxConfidence = confidence;
        maxClassIndex = j;
      }
    }

    if (maxConfidence > config.confidenceThreshold) {
      const x1 = (cx - w / 2) * scaleX;
      const y1 = (cy - h / 2) * scaleY;
      const x2 = (cx + w / 2) * scaleX;
      const y2 = (cy + h / 2) * scaleY;

      detections.push({
        label: classNames[maxClassIndex] || `class_${maxClassIndex}`,
        confidence: maxConfidence,
        bbox: {
          x1: Math.max(0, Math.round(x1)),
          y1: Math.max(0, Math.round(y1)),
          x2: Math.min(imgWidth, Math.round(x2)),
          y2: Math.min(imgHeight, Math.round(y2))
        }
      });
    }
  }

  return nonMaxSuppression(detections, config.nmsThreshold);
}

// 监听主线程消息
self.onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data;

  if (type === 'init') {
    try {
      config = { ...config, ...payload };
      console.log('[YoloWorker] 初始化模型中...', config.modelPath);

      // fetch 模型二进制数据
      const response = await fetch(config.modelPath);
      if (!response.ok) {
        throw new Error(`Failed to fetch model from ${config.modelPath}: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();

      // 配置 ONNX Runtime 环境参数以支持多线程和 SIMD
      const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
      const numThreads = hasSharedArrayBuffer ? Math.min(4, navigator.hardwareConcurrency || 4) : 1;
      
      ort.env.wasm.numThreads = numThreads;
      ort.env.wasm.simd = true;

      // 设置 WASM 路径，确保 Capacitor 容器环境能正确从本地加载 WebAssembly 依赖
      const origin = self.location.origin;
      // ORT 当前版本的 WasmFilePaths 类型不含旧版文件名键，但运行时接受该映射（类型断言不改行为）
      ort.env.wasm.wasmPaths = {
        'ort-wasm.wasm': `${origin}/ort-wasm.wasm`,
        'ort-wasm-threaded.wasm': `${origin}/ort-wasm-threaded.wasm`,
        'ort-wasm-simd.wasm': `${origin}/ort-wasm-simd.wasm`,
        'ort-wasm-simd-threaded.wasm': `${origin}/ort-wasm-simd-threaded.wasm`
      } as unknown as typeof ort.env.wasm.wasmPaths;

      console.log(`[YoloWorker] WASM 性能优化参数: numThreads=${numThreads}, simd=true, hasSharedArrayBuffer=${hasSharedArrayBuffer}`);

      // 创建推理会话：使用优化后的 WASM + SIMD 保证运算结果 100% 正确与稳定
      session = await ort.InferenceSession.create(new Uint8Array(arrayBuffer), {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
        extra: {
          session: {
            intra_op_num_threads: numThreads,
            inter_op_num_threads: numThreads
          }
        }
      });

      // 从模型第一个输入元数据对象中推断输入分辨率 inputSize (inputMetadata 是数组)
      // ORT 类型声明的 ValueMetadata 不含 shape 字段，但运行时张量元数据带有（类型断言不改行为）
      const inputMeta = session.inputMetadata[0] as unknown as { shape?: Array<number | string> } | undefined;
      if (inputMeta && inputMeta.shape && inputMeta.shape[2]) {
        const dim2 = inputMeta.shape[2];
        if (typeof dim2 === 'number') {
          config.inputSize = dim2;
        } else if (typeof dim2 === 'string') {
          const parsed = parseInt(dim2, 10);
          if (!isNaN(parsed)) {
            config.inputSize = parsed;
          }
        }
        console.log(`[YoloWorker] 自动从模型结构中推断输入分辨率为: ${config.inputSize}x${config.inputSize}`);
      }

      console.log('[YoloWorker] 模型加载成功，输入:', session.inputNames, '输出:', session.outputNames);
      self.postMessage({ type: 'init_done', payload: { success: true, inputSize: config.inputSize } });
    } catch (err: any) {
      console.error('[YoloWorker] 模型加载失败:', err);
      self.postMessage({ type: 'init_done', payload: { success: false, error: err.message } });
    }
  }

  else if (type === 'detect') {
    if (!session) {
      self.postMessage({ type: 'error', payload: 'Model not initialized' });
      return;
    }

    try {
      const { pixelData, width, height } = payload;
      const startTime = performance.now();

      // 1. 图像预处理
      const input = preprocessImage(pixelData, config.inputSize);

      // 2. 创建 Tensor
      const inputTensor = new ort.Tensor('float32', input, [1, 3, config.inputSize, config.inputSize]);

      // 3. 推理
      const feeds = { [session.inputNames[0]]: inputTensor };
      const results = await session.run(feeds);
      const elapsed = performance.now() - startTime;

      // 4. 解析输出
      const output = results[session.outputNames[0]];
      const detections = parseYoloOutput(
        output.data as Float32Array,
        output.dims as number[],
        width,
        height
      );

      // 5. 将结果发送回主线程，同时回收 pixelData buffer
      // Worker 环境的 postMessage 支持 transfer 参数；DOM lib 类型签名不匹配（断言不改行为）
      (self.postMessage as (message: unknown, transfer: Transferable[]) => void)(
        { type: 'result', payload: { detections, inferenceMs: Math.round(elapsed) } },
        [pixelData.buffer] // 转移所有权，零内存拷贝
      );
    } catch (err: any) {
      console.error('[YoloWorker] 推理失败:', err);
      self.postMessage({ type: 'error', payload: err.message });
    }
  }
};
