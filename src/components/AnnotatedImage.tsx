
    import React from 'react';
    import { Defect, InspectionArea } from '@/types';
    import { Badge } from './ui/Badge';

    interface AnnotatedImageProps {
      imageUrl: string;
      defects?: Defect[];
      inspectionAreas?: InspectionArea[];
      showAreas?: boolean;
      showDefects?: boolean;
    }

    const AnnotatedImage: React.FC<AnnotatedImageProps> = ({ 
      imageUrl, 
      defects = [], 
      inspectionAreas = [],
      showAreas = true,
      showDefects = true
    }) => {
      // 获取严重程度对应的颜色
      const getSeverityColor = (severity?: string) => {
        switch (severity) {
          case '轻微': return '#4CAF50';
          case '一般': return '#FF9800';
          case '严重': return '#F44336';
          case '致命': return '#9C27B0';
          default: return '#FF6B6B';
        }
      };

      // 获取严重程度对应的Badge变体
      const getSeverityVariant = (severity?: string) => {
        switch (severity) {
          case '轻微': return 'default' as const;
          case '一般': return 'secondary' as const;
          case '严重': return 'destructive' as const;
          case '致命': return 'destructive' as const;
          default: return 'default' as const;
        }
      };

      return (
        <div className="relative w-full h-full">
          {imageUrl ? (
            <img src={imageUrl} alt="Inspection" className="w-full h-full object-contain" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-800 text-gray-400">
              <div className="text-center">
                <div className="text-4xl mb-2">📷</div>
                <div className="text-sm">暂无图片</div>
              </div>
            </div>
          )}
          
          {/* 绘制ROI区域 */}
          {showAreas && inspectionAreas.map((area) => (
            <div
              key={area.id}
              className="absolute border-2 pointer-events-none"
              style={{
                left: `${area.x * 100}%`,
                top: `${area.y * 100}%`,
                width: `${area.width * 100}%`,
                height: `${area.height * 100}%`,
                borderColor: area.color,
                backgroundColor: area.color + '20'
              }}
            >
              <div
                className="absolute -top-6 left-0 px-2 py-1 text-xs font-medium text-white rounded"
                style={{ backgroundColor: area.color }}
              >
                {area.name}
              </div>
              {/* 显示区域配置信息 */}
              {area.defectTypes && area.defectTypes.length > 0 && (
                <div className="absolute -bottom-6 left-0 px-2 py-1 text-xs bg-gray-800 text-white rounded opacity-75">
                  {area.defectTypes.length}种缺陷类型
                </div>
              )}
            </div>
          ))}
          
          {/* 绘制缺陷标注 */}
          {showDefects && defects.map((defect, index) => (
            <div
              key={index}
              className="absolute pointer-events-none"
              style={{
                left: `${(defect.x || 0.5) * 100}%`,
                top: `${(defect.y || 0.5) * 100}%`,
                transform: 'translate(-50%, -50%)'
              }}
            >
              {/* 缺陷标记点 */}
              <div 
                className="w-4 h-4 border-2 border-white rounded-full shadow-lg"
                style={{ 
                  backgroundColor: getSeverityColor(defect.severity),
                  boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                }}
              />
              
              {/* 缺陷信息标签 */}
              <div className="absolute -top-20 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs p-2 rounded-lg shadow-lg min-w-max">
                <div className="space-y-1">
                  <div className="font-medium">{defect.type}</div>
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant={getSeverityVariant(defect.severity)} 
                      size="sm"
                      className="text-xs"
                    >
                      {defect.severity}
                    </Badge>
                    {defect.confidence && (
                      <span className="text-gray-300">
                        {(defect.confidence * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  {defect.description && (
                    <div className="text-gray-300 max-w-xs">
                      {defect.description}
                    </div>
                  )}
                </div>
                {/* 小三角形指向标记点 */}
                <div 
                  className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent"
                  style={{ borderTopColor: '#1f2937' }}
                />
              </div>
            </div>
          ))}
        </div>
      );
    };

    export default AnnotatedImage;
  