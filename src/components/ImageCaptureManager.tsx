import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Label } from '@/components/ui/Label';
import { Input } from '@/components/ui/Input';
import { Progress } from '@/components/ui/Progress';
import toast from 'react-hot-toast';
import { Camera, FolderOpen, Trash2, Download, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImageCaptureManagerProps {
  images: string[]; // base64图片数组
  onCaptureComplete?: () => void;
}

interface SaveResult {
  index: number;
  success: boolean;
  filePath?: string;
  error?: string;
}

const ImageCaptureManager: React.FC<ImageCaptureManagerProps> = ({ 
  images, 
  onCaptureComplete 
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [saveResults, setSaveResults] = useState<SaveResult[]>([]);
  // 移除硬编码路径，使用相对路径显示
  const [tempFolderPath, setTempFolderPath] = useState('临时文件夹');

  const handleSaveToTempFolder = async () => {
    if (images.length === 0) {
      toast.error('没有图片可保存');
      return;
    }

    setIsSaving(true);
    setProgress(0);
    setSaveResults([]);

    try {
      // 准备批量保存的数据
      const imagesData = images.map((image, index) => ({
        base64Image: `data:image/jpeg;base64,${image}`,
        fileName: `capture_${Date.now()}_${index}.jpg`
      }));

      console.log(`开始批量保存 ${images.length} 张图片到临时文件夹`);
      
      // 使用批量保存API
      const saveResponse = await fetch('/api/rpa/save-images-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: imagesData })
      });
      
      if (saveResponse.ok) {
        const saveResult = await saveResponse.json();
        console.log('批量保存结果:', saveResult);
        
        // 处理批量保存结果
        const results: SaveResult[] = saveResult.results.map((result: any, index: number) => ({
          index: index + 1,
          success: result.success,
          filePath: result.filePath,
          error: result.error
        }));
        
        setSaveResults(results);
        
        const successCount = saveResult.successCount;
        const errorCount = saveResult.errorCount;
        
        if (successCount > 0) {
          toast.success(`批量保存完成：成功 ${successCount} 张，失败 ${errorCount} 张`);
          onCaptureComplete?.();
        } else {
          toast.error('所有图片保存失败');
        }
        
        // 设置进度为100%
        setProgress(100);
      } else {
        const errorData = await saveResponse.json();
        throw new Error(errorData.message || '批量保存失败');
      }
      
    } catch (error) {
      console.error('批量保存操作失败:', error);
      toast.error(`批量保存失败: ${error instanceof Error ? error.message : '未知错误'}`);
      
      // 如果批量保存失败，尝试逐个保存作为备选方案
      await fallbackIndividualSave();
    } finally {
      setIsSaving(false);
    }
  };

  // 备选方案：逐个保存（当批量保存失败时使用）
  const fallbackIndividualSave = async () => {
    console.log('使用备选方案：逐个保存图片');
    
    const results: SaveResult[] = [];
    let successCount = 0;

    for (let i = 0; i < images.length; i++) {
      try {
        const fileName = `capture_${Date.now()}_${i}.jpg`;
        const base64Image = `data:image/jpeg;base64,${images[i]}`;
        
        const saveResponse = await fetch('/api/rpa/save-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64Image, fileName })
        });
        
        if (saveResponse.ok) {
          const saveResult = await saveResponse.json();
          results.push({ 
            index: i + 1, 
            success: true,
            filePath: saveResult.filePath
          });
          successCount++;
        } else {
          throw new Error('保存图片失败');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '保存失败';
        results.push({ index: i + 1, success: false, error: errorMessage });
      }

      setProgress(((i + 1) / images.length) * 100);
      setSaveResults([...results]);
    }

    if (successCount > 0) {
      toast.success(`备选方案完成：成功保存 ${successCount}/${images.length} 张图片`);
      onCaptureComplete?.();
    }
  };

  const handleOpenTempFolder = async () => {
    try {
      // 修改API调用，不传递路径参数
      const response = await fetch('/api/rpa/open-temp-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
        // 移除 body: JSON.stringify({ folderPath: tempFolderPath })
      });
      
      if (response.ok) {
        toast.success('已打开临时文件夹');
      } else {
        toast.error('打开文件夹失败');
      }
    } catch (error) {
      toast.error('打开文件夹失败');
    }
  };

  const handleClearTempFolder = async () => {
    try {
      // 修改API调用，不传递路径参数
      const response = await fetch('/api/rpa/clear-temp-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
        // 移除 body: JSON.stringify({ folderPath: tempFolderPath })
      });
      
      if (response.ok) {
        const result = await response.json();
        toast.success(`已清空临时文件夹，删除了 ${result.deletedCount} 个文件`);
      } else {
        toast.error('清空文件夹失败');
      }
    } catch (error) {
      toast.error('清空文件夹失败');
    }
  };

  const getStatusIcon = (result: SaveResult) => {
    if (result.success) {
      return <CheckCircle2 className="h-4 w-4 text-green-400" />;
    } else {
      return <XCircle className="h-4 w-4 text-red-400" />;
    }
  };

  const getSuccessCount = () => {
    return saveResults.filter(r => r.success).length;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5" />
          图片抓拍管理器
          {saveResults.length > 0 && (
            <span className="text-sm text-slate-400">
              ({getSuccessCount()}/{saveResults.length})
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>临时文件夹</Label>
          <Input
            value={tempFolderPath}
            onChange={(e) => setTempFolderPath(e.target.value)}
            placeholder="临时文件夹"
            disabled={true}
          />
          <div className="text-xs text-slate-400">
            路径由后端服务管理，无需手动配置
          </div>
        </div>

        <div className="text-sm text-slate-400 space-y-1">
          <p>• 将抓拍的图片保存到临时文件夹</p>
          <p>• 自动生成带时间戳的文件名</p>
          <p>• 支持批量保存多张图片</p>
          <p>• 提供文件夹管理功能</p>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleSaveToTempFolder}
            disabled={isSaving || images.length === 0}
            className="flex-1"
          >
            <Download className="mr-2 h-4 w-4" />
            {isSaving ? '保存中...' : `保存到临时文件夹 (${images.length}张)`}
          </Button>
        </div>

        {isSaving && (
          <div className="space-y-2">
            <Progress value={progress} className="w-full" />
            <div className="text-xs text-slate-400 text-center">
              保存进度: {Math.round(progress)}%
            </div>
          </div>
        )}

        {saveResults.length > 0 && (
          <div className="space-y-2">
            <Label>保存结果</Label>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {saveResults.map((result) => (
                <div key={result.index} className="flex items-center gap-2 text-sm">
                  {getStatusIcon(result)}
                  <span className={cn(
                    result.success ? 'text-green-400' : 'text-red-400'
                  )}>
                    第 {result.index} 张图片: {result.success ? '保存成功' : result.error}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleOpenTempFolder}
            className="flex-1"
          >
            <FolderOpen className="mr-2 h-4 w-4" />
            打开临时文件夹
          </Button>
          
          <Button
            variant="outline"
            onClick={handleClearTempFolder}
            className="flex-1"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            清空临时文件夹
          </Button>
        </div>

        <div className="p-3 rounded-lg bg-blue-900/20 border border-blue-500/30">
          <h4 className="text-sm font-medium text-blue-300 mb-2">功能说明</h4>
          <div className="text-xs text-blue-200 space-y-1">
            <p>• 保存图片: 将抓拍的图片保存到临时文件夹</p>
            <p>• 打开文件夹: 在文件管理器中打开临时文件夹</p>
            <p>• 清空文件夹: 删除临时文件夹中的所有文件</p>
            <p>• 文件命名: 自动生成 capture_时间戳_序号.jpg 格式</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ImageCaptureManager; 