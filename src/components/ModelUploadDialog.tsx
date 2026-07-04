import React, { useState, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Progress } from '@/components/ui/Progress';
import { Upload, X, CheckCircle, AlertCircle } from 'lucide-react';
import { uploadModel, getUploadProgress } from '@/lib/api';
import toast from 'react-hot-toast';

interface ModelUploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const ModelUploadDialog: React.FC<ModelUploadDialogProps> = ({ isOpen, onClose, onSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [version, setVersion] = useState('');
  const [modelType, setModelType] = useState('PPE_YOLO');
  const [description, setDescription] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 派生状态：isUploading 从 uploadStatus 派生，确保状态一致性
  const isUploading = useMemo(() => uploadStatus === 'uploading', [uploadStatus]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      // 验证文件类型
      if (!selectedFile.name.endsWith('.pt')) {
        toast.error('只支持 .pt 格式的模型文件');
        return;
      }
      
      // 验证文件大小 (最大500MB)
      if (selectedFile.size > 500 * 1024 * 1024) {
        toast.error('文件大小不能超过500MB');
        return;
      }

      setFile(selectedFile);
      // 自动填充名称
      if (!name) {
        setName(selectedFile.name.replace('.pt', ''));
      }
    }
  };

  const handleUpload = async () => {
    if (!file || !name || !version) {
      toast.error('请填写所有必填字段');
      return;
    }

    setUploadStatus('uploading');
    setUploadProgress(0);
    setErrorMessage('');

    try {
      const result = await uploadModel(file, name, version, modelType, description);
      
      // 开始监控上传进度
      const uploadId = result.upload.id;
      const progressInterval = setInterval(async () => {
        try {
          const progress = await getUploadProgress(uploadId);
          setUploadProgress(progress.progress);
          
          if (progress.status === 'SUCCESS') {
            clearInterval(progressInterval);
            setUploadStatus('success');
            toast.success('模型上传成功！');
            onSuccess();
            setTimeout(() => onClose(), 2000);
          } else if (progress.status === 'FAILED') {
            clearInterval(progressInterval);
            setUploadStatus('error');
            setErrorMessage(progress.error_message || '上传失败');
            toast.error('模型上传失败');
          }
        } catch (error) {
          clearInterval(progressInterval);
          setUploadStatus('error');
          setErrorMessage('获取上传进度失败');
          toast.error('获取上传进度失败');
        }
      }, 1000);

    } catch (error) {
      setUploadStatus('error');
      setErrorMessage(error instanceof Error ? error.message : '上传失败');
      toast.error('模型上传失败');
    }
  };

  const resetForm = () => {
    setFile(null);
    setName('');
    setVersion('');
    setModelType('PPE_YOLO');
    setDescription('');
    setUploadProgress(0);
    setUploadStatus('idle');
    setErrorMessage('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    if (isUploading) {
      toast.error('请等待上传完成');
      return;
    }
    resetForm();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              上传模型
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={handleClose} disabled={isUploading}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 文件选择 */}
          <div className="space-y-2">
            <Label htmlFor="model-file">模型文件 *</Label>
            <div className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center">
              <input
                ref={fileInputRef}
                type="file"
                id="model-file"
                accept=".pt"
                onChange={handleFileSelect}
                className="hidden"
                disabled={isUploading}
              />
              {!file ? (
                <div className="space-y-2">
                  <Upload className="h-8 w-8 text-gray-400 mx-auto" />
                  <p className="text-sm text-gray-400">点击选择或拖拽模型文件</p>
                  <p className="text-xs text-gray-500">支持 .pt 格式，最大500MB</p>
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    选择文件
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <CheckCircle className="h-8 w-8 text-green-500 mx-auto" />
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-gray-400">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFile(null)}
                    disabled={isUploading}
                  >
                    重新选择
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* 模型信息 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="model-name">模型名称 *</Label>
              <Input
                id="model-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如: MyCustomModel"
                disabled={isUploading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model-version">版本号 *</Label>
              <Input
                id="model-version"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="例如: 1.0.0"
                disabled={isUploading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="model-type">模型类型</Label>
            <Select value={modelType} onValueChange={setModelType} disabled={isUploading}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PPE_YOLO">PPE YOLO检测模型</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="model-description">模型描述</Label>
            <Textarea
              id="model-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="描述模型的用途和特点..."
              rows={3}
              disabled={isUploading}
            />
          </div>

          {/* 上传进度 */}
          {uploadStatus === 'uploading' && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>上传进度</span>
                <span>{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
            </div>
          )}

          {/* 错误信息 */}
          {uploadStatus === 'error' && errorMessage && (
            <div className="flex items-center gap-2 p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <span className="text-sm text-red-400">{errorMessage}</span>
            </div>
          )}

          {/* 成功信息 */}
          {uploadStatus === 'success' && (
            <div className="flex items-center gap-2 p-3 bg-green-900/20 border border-green-500/30 rounded-lg">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm text-green-400">模型上传成功！</span>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={handleClose} disabled={isUploading}>
              取消
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!file || !name || !version || isUploading}
              isLoading={isUploading}
            >
              {isUploading ? '上传中...' : '开始上传'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ModelUploadDialog;
