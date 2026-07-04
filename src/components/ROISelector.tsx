import React, { useState, useRef, useCallback, useEffect } from 'react';
import { InspectionArea, DefectType, DefectSeverity } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';

import { Trash2, Edit3, Eye, EyeOff, Settings } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { DefectTypeSelector } from './DefectTypeSelector';

interface ROISelectorProps {
  imageUrl: string;
  areas: InspectionArea[];
  onAreasChange: (areas: InspectionArea[]) => void;
  templateDefectTypes?: DefectType[];
  templateSeverities?: DefectSeverity[];
}

const ROISelector: React.FC<ROISelectorProps> = ({ imageUrl, areas, onAreasChange, templateDefectTypes, templateSeverities }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [selectedArea, setSelectedArea] = useState<InspectionArea | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showAreas, setShowAreas] = useState(true);
  const [newAreaName, setNewAreaName] = useState('');
  const [newAreaDescription, setNewAreaDescription] = useState('');
  const [showDefectTypeSelector, setShowDefectTypeSelector] = useState(false);

  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', 
    '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'
  ];

  // 获取画布坐标
  const getCanvasCoordinates = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  }, []);

  // 绘制所有区域
  const drawAreas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (!showAreas) return;
    
    areas.forEach((area) => {
      const x = area.x * canvas.width;
      const y = area.y * canvas.height;
      const width = area.width * canvas.width;
      const height = area.height * canvas.height;
      
      // 绘制矩形
      ctx.strokeStyle = area.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, width, height);
      
      // 绘制半透明填充
      ctx.fillStyle = area.color + '20';
      ctx.fillRect(x, y, width, height);
      
      // 绘制标签
      ctx.fillStyle = area.color;
      ctx.font = '12px Arial';
      ctx.fillText(area.name, x + 5, y + 15);
    });
  }, [areas, showAreas]);

  useEffect(() => {
    drawAreas();
  }, [drawAreas]);

  // 鼠标按下事件
  const handleMouseDown = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (isEditing) return;
    
    const coords = getCanvasCoordinates(event);
    setStartPos(coords);
    setIsDrawing(true);
  }, [isEditing, getCanvasCoordinates]);

  // 鼠标移动事件
  const handleMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || isEditing) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const coords = getCanvasCoordinates(event);
    
    // 清除画布并重新绘制
    drawAreas();
    
    // 绘制当前选择的矩形
    const x = Math.min(startPos.x, coords.x) * canvas.width;
    const y = Math.min(startPos.y, coords.y) * canvas.height;
    const width = Math.abs(coords.x - startPos.x) * canvas.width;
    const height = Math.abs(coords.y - startPos.y) * canvas.height;
    
    // 绘制虚线框
    ctx.strokeStyle = '#FF6B6B';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 4]);
    ctx.strokeRect(x, y, width, height);
    ctx.setLineDash([]);
    
    // 绘制半透明填充
    ctx.fillStyle = '#FF6B6B20';
    ctx.fillRect(x, y, width, height);
  }, [isDrawing, isEditing, startPos, getCanvasCoordinates, drawAreas]);

  // 鼠标松开事件
  const handleMouseUp = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || isEditing) return;
    
    const coords = getCanvasCoordinates(event);
    const width = Math.abs(coords.x - startPos.x);
    const height = Math.abs(coords.y - startPos.y);
    
    // 只有当区域足够大时才添加
    if (width > 0.02 && height > 0.02) {
      const newArea: InspectionArea = {
        id: uuidv4(),
        name: `区域 ${areas.length + 1}`,
        x: Math.min(startPos.x, coords.x),
        y: Math.min(startPos.y, coords.y),
        width,
        height,
        description: '',
        color: colors[areas.length % colors.length],
        defectTypes: [],
        severityThreshold: '轻微',
        importance: '中'
      };
      
      onAreasChange([...areas, newArea]);
      setSelectedArea(newArea);
      setIsEditing(true);
      setNewAreaName(newArea.name);
      setNewAreaDescription(newArea.description);
    }
    
    setIsDrawing(false);
  }, [isDrawing, isEditing, startPos, getCanvasCoordinates, areas, onAreasChange, colors]);

  // 保存区域编辑
  const handleSaveArea = useCallback(() => {
    if (!selectedArea) return;
    
    const updatedAreas = areas.map(area => 
      area.id === selectedArea.id 
        ? { ...area, name: newAreaName, description: newAreaDescription }
        : area
    );
    
    onAreasChange(updatedAreas);
    setIsEditing(false);
    setSelectedArea(null);
  }, [selectedArea, areas, newAreaName, newAreaDescription, onAreasChange]);

  // 删除区域
  const handleDeleteArea = useCallback((areaId: string) => {
    const updatedAreas = areas.filter(area => area.id !== areaId);
    onAreasChange(updatedAreas);
    if (selectedArea?.id === areaId) {
      setIsEditing(false);
      setSelectedArea(null);
    }
  }, [areas, selectedArea, onAreasChange]);

  // 选择区域进行编辑
  const handleSelectArea = useCallback((area: InspectionArea) => {
    setSelectedArea(area);
    setIsEditing(true);
    setNewAreaName(area.name);
    setNewAreaDescription(area.description);
  }, []);

  // 更新区域配置
  const handleUpdateArea = useCallback((updatedArea: InspectionArea) => {
    const updatedAreas = areas.map(area => 
      area.id === updatedArea.id ? updatedArea : area
    );
    onAreasChange(updatedAreas);
    setSelectedArea(updatedArea);
  }, [areas, onAreasChange]);

  // 获取区域配置摘要
  const getAreaConfigSummary = (area: InspectionArea) => {
    const typeCount = area.defectTypes?.length || 0;
    const threshold = area.severityThreshold || '轻微';
    const importance = area.importance || '中';
    
    return `${typeCount}种缺陷类型 | 阈值:${threshold} | 重要性:${importance}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>ROI区域标注</Label>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAreas(!showAreas)}
          >
            {showAreas ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {showAreas ? '隐藏' : '显示'}区域
          </Button>
        </div>
      </div>
      
      <div className="bg-muted/20 border border-border rounded-lg p-4">
        <div className="relative">
          {/* 背景图片 */}
          <img
            src={imageUrl}
            alt="标准图片"
            className="w-full h-auto object-contain border border-border rounded"
          />
          {/* Canvas覆盖层 - 确保在图片之上 */}
          <canvas
            ref={canvasRef}
            width={600}
            height={400}
            className="absolute top-0 left-0 w-full h-full cursor-crosshair"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          />
        </div>
        
        <div className="mt-4 text-sm text-muted-foreground">
          {isEditing ? '编辑模式：点击区域列表中的区域进行编辑' : '绘制模式：在图片上拖拽绘制ROI区域'}
        </div>
      </div>

      {/* 区域编辑面板 */}
      {isEditing && selectedArea && (
        <div className="bg-muted/20 border border-border rounded-lg p-4">
          <h4 className="font-medium mb-3 text-foreground">编辑区域</h4>
          <div className="space-y-3">
            <div>
              <Label htmlFor="area-name" className="text-foreground">区域名称</Label>
              <Input
                id="area-name"
                value={newAreaName}
                onChange={(e) => setNewAreaName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="area-description" className="text-foreground">区域描述</Label>
              <Input
                id="area-description"
                value={newAreaDescription}
                onChange={(e) => setNewAreaDescription(e.target.value)}
                placeholder="描述这个区域需要检测的内容"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSaveArea} size="sm">保存</Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setIsEditing(false)}
              >
                取消
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 区域列表 */}
      {areas.length > 0 && (
        <div className="bg-muted/20 border border-border rounded-lg p-4">
          <h4 className="font-medium mb-3 text-foreground">已标注区域 ({areas.length})</h4>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {areas.map((area) => (
              <div
                key={area.id}
                className="flex items-center justify-between p-2 border border-border rounded bg-background hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2 flex-1">
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: area.color }}
                  />
                  <div className="flex-1">
                    <div className="font-medium text-foreground">{area.name}</div>
                    {area.description && (
                      <div className="text-sm text-muted-foreground">
                        {area.description}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {getAreaConfigSummary(area)}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSelectArea(area)}
                    title="编辑基本信息"
                  >
                    <Edit3 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedArea(area);
                      setShowDefectTypeSelector(true);
                    }}
                    title="配置缺陷类型"
                  >
                    <Settings className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteArea(area.id)}
                    title="删除区域"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 缺陷类型选择器 */}
      {showDefectTypeSelector && selectedArea && (
        <DefectTypeSelector
          area={selectedArea}
          onUpdate={handleUpdateArea}
          onClose={() => setShowDefectTypeSelector(false)}
          templateDefectTypes={templateDefectTypes}
          templateSeverities={templateSeverities}
        />
      )}
    </div>
  );
};

export default ROISelector; 