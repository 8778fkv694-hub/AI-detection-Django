import React from 'react';
import { Switch } from '@/components/ui/Switch';
import { Label } from '@/components/ui/Label';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Server, Cloud, AlertCircle, RefreshCw } from 'lucide-react';
import { useModelMode } from '@/hooks/useModelMode';
import toast from 'react-hot-toast';

interface ModelModeSwitchProps {
  className?: string;
  showLabel?: boolean;
  showStatus?: boolean;
}

const ModelModeSwitch: React.FC<ModelModeSwitchProps> = ({ 
  className = '', 
  showLabel = true, 
  showStatus = true 
}) => {
  const { 
    mode, 
    isOnlineMode, 
    isLocalMode, 
    setMode, 
    checkLocalModelAvailable 
  } = useModelMode();

  const [isChecking, setIsChecking] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const handleModeChange = async (checked: boolean) => {
    const newMode = checked ? 'local' : 'online';
    
    if (newMode === 'local') {
      setIsChecking(true);
      try {
        const isAvailable = await checkLocalModelAvailable();
        if (!isAvailable) {
          toast.error('本地模型服务不可用，请先启动本地模型服务');
          return;
        }
      } catch (error) {
        toast.error('检查本地模型服务失败');
        return;
      } finally {
        setIsChecking(false);
      }
    }
    
    // 立即切换模式
    setMode(newMode);
    toast.success(`已切换到${newMode === 'local' ? '本地' : '在线'}模型`);
    
    // 强制重新渲染以确保状态同步
    setTimeout(() => {
      window.dispatchEvent(new Event('modelModeChanged'));
    }, 100);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // 提示用户刷新页面
      toast.success('请刷新页面以应用模型模式更改', {
        duration: 4000,
        icon: '🔄',
      });
    } catch (error) {
      console.error('刷新提示失败:', error);
      toast.error('操作失败');
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {showLabel && (
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-slate-400" />
          <Label htmlFor="model-mode-switch" className="text-sm font-medium">
            模型模式
          </Label>
        </div>
      )}
      
      <div className="flex items-center gap-2">
        <span className={`text-sm ${isOnlineMode ? 'text-slate-300' : 'text-slate-500'}`}>
          在线
        </span>
        
        <Switch
          id="model-mode-switch"
          checked={isLocalMode}
          onCheckedChange={handleModeChange}
          disabled={isChecking}
        />
        
        <span className={`text-sm ${isLocalMode ? 'text-slate-300' : 'text-slate-500'}`}>
          本地
        </span>
      </div>
      
      {showStatus && (
        <div className="flex items-center gap-2">
          {isOnlineMode ? (
            <Badge variant="outline" className="text-blue-400 border-blue-400">
              <Cloud className="h-3 w-3 mr-1" />
              在线模型
            </Badge>
          ) : (
            <Badge variant="outline" className="text-green-400 border-green-400">
              <Server className="h-3 w-3 mr-1" />
              本地模型
            </Badge>
          )}
          
          {isChecking && (
            <div className="flex items-center gap-1 text-slate-400">
              <AlertCircle className="h-3 w-3 animate-pulse" />
              <span className="text-xs">检查中...</span>
            </div>
          )}
        </div>
      )}
      
      {/* 刷新提示按钮 */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleRefresh}
        disabled={isRefreshing || isChecking}
        className="h-8 w-8 p-0 text-slate-400 hover:text-slate-300"
        title="点击后提示刷新页面"
      >
        <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
      </Button>
    </div>
  );
};

export default ModelModeSwitch;
