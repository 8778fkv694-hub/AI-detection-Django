import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { YoloDetection } from '@/lib/yoloDetector';
import { yoloDetectBackend } from '@/lib/api';
import toast from 'react-hot-toast';

const YoloTestScreen: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [detections, setDetections] = useState<YoloDetection[]>([]);
  const [testImage, setTestImage] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);



  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setTestImage(result);
        setDetections([]);
      };
      reader.readAsDataURL(file);
    }
  };

  const runDetection = async () => {
    if (!testImage) {
      toast.error('请先选择图片');
      return;
    }

    setIsLoading(true);
    try {
      const base64 = testImage.includes(',') ? testImage.split(',')[1] : testImage;
      const backend = await yoloDetectBackend(base64, 0.5);
      const results: YoloDetection[] = backend.map(d => ({
        class: d.label,
        confidence: d.confidence,
        bbox: [d.bbox.x1, d.bbox.y1, d.bbox.x2 - d.bbox.x1, d.bbox.y2 - d.bbox.y1]
      }));
      setDetections(results);
      toast.success(`检测完成，发现 ${results.length} 个对象`);
    } catch (error) {
      toast.error('检测失败: ' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold">前端YOLO测试</h1>

      {/* 移除模型加载相关UI */}

      <Card>
        <CardHeader>
          <CardTitle>图片检测</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex space-x-4">
            <Button onClick={() => fileInputRef.current?.click()}>
              选择图片
            </Button>
            <Button
              onClick={runDetection}
              disabled={!testImage || isLoading}
            >
              开始检测
            </Button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />

          {testImage && (
            <div className="space-y-4">
              <img
                src={testImage}
                alt="测试图片"
                className="max-w-md border rounded"
              />

              {detections.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2">检测结果:</h3>
                  <div className="space-y-2">
                    {detections.map((detection, index) => (
                      <div key={index} className="p-2 bg-gray-100 rounded">
                        <span className="font-medium">{detection.class}</span>
                        <span className="ml-2 text-sm text-gray-600">
                          置信度: {(detection.confidence * 100).toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default YoloTestScreen; 