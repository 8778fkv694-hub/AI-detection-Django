import React, { useState, useEffect, useMemo } from 'react';
import { DefectType, DefectSeverity, InspectionArea } from '../types';
import { Button } from './ui/Button';
import { Label } from './ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/Select';
import { Input } from './ui/Input';
import { Textarea } from './ui/Textarea';
import toast from 'react-hot-toast';
import { apiFetch } from '@/lib/config';

// 全局缓存，避免重复请求
let cachedDefectTypes: DefectType[] = [];
let cachedSeverities: DefectSeverity[] = [];
let isLoadingGlobal = false;

// 默认数据，确保离线时也能工作
const DEFAULT_DEFECT_TYPES: DefectType[] = [
    { id: 1, name: '划痕', category: '表面缺陷', description: '表面划痕', color: '#FF6B6B', severityLevels: [] },
    { id: 2, name: '污渍', category: '表面缺陷', description: '表面污渍', color: '#4ECDC4', severityLevels: [] },
    { id: 3, name: '变形', category: '结构缺陷', description: '结构变形', color: '#45B7D1', severityLevels: [] },
    { id: 4, name: '裂纹', category: '结构缺陷', description: '结构裂纹', color: '#FF9800', severityLevels: [] },
    { id: 5, name: '色差', category: '表面缺陷', description: '颜色差异', color: '#9C27B0', severityLevels: [] },
    { id: 6, name: '尺寸偏差', category: '尺寸缺陷', description: '尺寸不符合标准', color: '#607D8B', severityLevels: [] }
];

const DEFAULT_SEVERITIES: DefectSeverity[] = [
    { id: 1, name: '轻微', level: 1, description: '轻微缺陷，不影响功能', color: '#4CAF50' },
    { id: 2, name: '一般', level: 2, description: '一般缺陷，需要关注', color: '#FF9800' },
    { id: 3, name: '严重', level: 3, description: '严重缺陷，影响使用', color: '#F44336' }
];

interface DefectTypeSelectorProps {
    area: InspectionArea;
    onUpdate: (updatedArea: InspectionArea) => void;
    onClose: () => void;
    templateDefectTypes?: DefectType[];
    templateSeverities?: DefectSeverity[];
}

export const DefectTypeSelector: React.FC<DefectTypeSelectorProps> = ({
    area,
    onUpdate,
    onClose,
    templateDefectTypes,
    templateSeverities
}) => {
    const [defectTypes, setDefectTypes] = useState<DefectType[]>(
        templateDefectTypes && templateDefectTypes.length > 0
            ? templateDefectTypes
            : (cachedDefectTypes.length > 0 ? cachedDefectTypes : DEFAULT_DEFECT_TYPES)
    );
    const [severities, setSeverities] = useState<DefectSeverity[]>(
        templateSeverities && templateSeverities.length > 0
            ? templateSeverities
            : (cachedSeverities.length > 0 ? cachedSeverities : DEFAULT_SEVERITIES)
    );
    const [selectedTypes, setSelectedTypes] = useState<string[]>(area.defectTypes || []);
    const [severityThreshold, setSeverityThreshold] = useState<string>(area.severityThreshold || '轻微');
    const [importance, setImportance] = useState<'低' | '中' | '高'>(area.importance || '中');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isOfflineMode, setIsOfflineMode] = useState(false);

    // 自定义缺陷类型相关状态
    const [showCustomForm, setShowCustomForm] = useState(false);
    const [customDefect, setCustomDefect] = useState({
        name: '',
        category: '自定义缺陷',
        description: '',
        color: '#FF6B6B'
    });

    // 使用useMemo优化性能
    const sortedSeverities = useMemo(() => {
        return severities.sort((a: DefectSeverity, b: DefectSeverity) => a.level - b.level);
    }, [severities]);

    useEffect(() => {
        // 立即显示界面，然后异步加载数据
        if (cachedDefectTypes.length === 0 || cachedSeverities.length === 0) {
            loadData();
        }
    }, []);

    const loadData = async () => {
        // 如果已有缓存数据，直接使用
        if (cachedDefectTypes.length > 0 && cachedSeverities.length > 0) {
            setDefectTypes(cachedDefectTypes);
            setSeverities(cachedSeverities);
            return;
        }

        // 如果正在全局加载，等待
        if (isLoadingGlobal) {
            const checkInterval = setInterval(() => {
                if (cachedDefectTypes.length > 0 && cachedSeverities.length > 0) {
                    setDefectTypes(cachedDefectTypes);
                    setSeverities(cachedSeverities);
                    clearInterval(checkInterval);
                }
            }, 100);
            return;
        }

        try {
            setIsLoading(true);
            setError(null);
            isLoadingGlobal = true;

            // 设置超时时间
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000); // 3秒超时

            const [typesResponse, severitiesResponse] = await Promise.all([
                apiFetch('/defect-types', { signal: controller.signal }),
                apiFetch('/defect-severities', { signal: controller.signal })
            ]);

            clearTimeout(timeoutId);

            if (typesResponse.ok) {
                const types = await typesResponse.json();
                setDefectTypes(types);
                cachedDefectTypes = types;
            } else {
                throw new Error(`缺陷类型加载失败: ${typesResponse.status}`);
            }

            if (severitiesResponse.ok) {
                const sevs = await severitiesResponse.json();
                setSeverities(sevs);
                cachedSeverities = sevs;
            } else {
                throw new Error(`严重程度加载失败: ${severitiesResponse.status}`);
            }
        } catch (error) {
            console.error('加载缺陷类型数据失败:', error);
            setError(error instanceof Error ? error.message : '网络请求失败');
            setIsOfflineMode(true);

            // 使用默认数据
            if (cachedDefectTypes.length === 0) {
                setDefectTypes(DEFAULT_DEFECT_TYPES);
                cachedDefectTypes = DEFAULT_DEFECT_TYPES;
            }

            if (cachedSeverities.length === 0) {
                setSeverities(DEFAULT_SEVERITIES);
                cachedSeverities = DEFAULT_SEVERITIES;
            }
        } finally {
            setIsLoading(false);
            isLoadingGlobal = false;
        }
    };

    const handleSave = () => {
        const updatedArea: InspectionArea = {
            ...area,
            defectTypes: selectedTypes,
            severityThreshold,
            importance
        };
        onUpdate(updatedArea);
        onClose();
    };

    const toggleDefectType = (typeName: string) => {
        setSelectedTypes(prev =>
            prev.includes(typeName)
                ? prev.filter(t => t !== typeName)
                : [...prev, typeName]
        );
    };

    const addCustomDefect = () => {
        if (!customDefect.name.trim()) {
            toast.error('请输入缺陷类型名称');
            return;
        }

        const newDefect: DefectType = {
            id: Date.now(), // 使用时间戳作为临时ID
            name: customDefect.name.trim(),
            category: customDefect.category,
            description: customDefect.description.trim() || customDefect.name.trim(),
            color: customDefect.color,
            severityLevels: []
        };

        setDefectTypes(prev => [...prev, newDefect]);
        setSelectedTypes(prev => [...prev, newDefect.name]);

        // 重置表单
        setCustomDefect({
            name: '',
            category: '自定义缺陷',
            description: '',
            color: '#FF6B6B'
        });
        setShowCustomForm(false);

        toast.success('自定义缺陷类型添加成功！');
    };

    const removeCustomDefect = (defectName: string) => {
        setDefectTypes(prev => prev.filter(d => d.name !== defectName));
        setSelectedTypes(prev => prev.filter(t => t !== defectName));
    };

    // 显示错误信息
    if (error && !isOfflineMode) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-background p-6 rounded-lg border border-border max-w-md">
                    <div className="text-center">
                        <div className="text-red-400 mb-4">⚠️ 加载失败</div>
                        <div className="text-muted-foreground mb-4">{error}</div>
                        <div className="text-sm text-muted-foreground mb-4">
                            已加载默认数据，您可以继续配置
                        </div>
                        <Button onClick={() => setError(null)}>继续</Button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40 p-4">
            <div className="bg-background rounded-lg border border-border w-full max-w-4xl max-h-[90vh] flex flex-col">
                {/* 标题栏 */}
                <div className="flex justify-between items-center p-6 border-b border-border">
                    <h2 className="text-xl font-bold text-foreground">配置检测区域</h2>
                    <div className="flex items-center gap-2">
                        {isOfflineMode && (
                            <div className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded">
                                离线模式
                            </div>
                        )}
                        {isLoading && (
                            <div className="text-xs text-blue-400 bg-blue-400/10 px-2 py-1 rounded flex items-center gap-1">
                                <div className="animate-spin rounded-full h-3 w-3 border-b border-blue-400"></div>
                                加载中
                            </div>
                        )}
                        <Button onClick={onClose} variant="outline">关闭</Button>
                    </div>
                </div>

                {/* 内容区域 - 可滚动 */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="space-y-6">
                        {/* 区域信息 */}
                        <div className="bg-muted/20 border border-border rounded-lg p-4">
                            <h3 className="text-lg font-semibold mb-3 text-foreground">区域信息</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-foreground">区域名称</Label>
                                    <div className="text-muted-foreground">{area.name}</div>
                                </div>
                                <div>
                                    <Label className="text-foreground">位置描述</Label>
                                    <div className="text-muted-foreground">{area.description}</div>
                                </div>
                            </div>
                        </div>

                        {/* 缺陷类型选择 */}
                        <div className="bg-muted/20 border border-border rounded-lg p-4">
                            <div className="flex justify-between items-center mb-3">
                                <h3 className="text-lg font-semibold text-foreground">关注的缺陷类型</h3>
                                <Button
                                    onClick={() => setShowCustomForm(true)}
                                    variant="outline"
                                    size="sm"
                                >
                                    + 添加自定义
                                </Button>
                            </div>

                            {/* 自定义缺陷表单 */}
                            {showCustomForm && (
                                <div className="bg-background border border-border rounded-lg p-4 mb-4">
                                    <h4 className="font-medium text-foreground mb-3">添加自定义缺陷类型</h4>
                                    <div className="grid grid-cols-2 gap-4 mb-4">
                                        <div>
                                            <Label className="text-foreground">缺陷名称 *</Label>
                                            <Input
                                                value={customDefect.name}
                                                onChange={(e) => setCustomDefect(prev => ({ ...prev, name: e.target.value }))}
                                                placeholder="请输入缺陷类型名称"
                                                className="mt-1"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-foreground">分类</Label>
                                            <Select
                                                value={customDefect.category}
                                                onValueChange={(value) => setCustomDefect(prev => ({ ...prev, category: value }))}
                                            >
                                                <SelectTrigger className="w-full">
                                                    <SelectValue placeholder="选择分类" />
                                                </SelectTrigger>
                                                <SelectContent className="z-[9999]">
                                                    <SelectItem value="自定义缺陷">自定义缺陷</SelectItem>
                                                    <SelectItem value="表面缺陷">表面缺陷</SelectItem>
                                                    <SelectItem value="结构缺陷">结构缺陷</SelectItem>
                                                    <SelectItem value="尺寸缺陷">尺寸缺陷</SelectItem>
                                                    <SelectItem value="功能缺陷">功能缺陷</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div className="mb-4">
                                        <Label className="text-foreground">描述</Label>
                                        <Textarea
                                            value={customDefect.description}
                                            onChange={(e) => setCustomDefect(prev => ({ ...prev, description: e.target.value }))}
                                            placeholder="请输入缺陷描述（可选）"
                                            className="mt-1"
                                            rows={2}
                                        />
                                    </div>
                                    <div className="flex justify-end gap-2">
                                        <Button
                                            variant="outline"
                                            onClick={() => setShowCustomForm(false)}
                                        >
                                            取消
                                        </Button>
                                        <Button onClick={addCustomDefect}>
                                            添加
                                        </Button>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                                {defectTypes.map(type => (
                                    <div
                                        key={type.id}
                                        className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${selectedTypes.includes(type.name)
                                                ? 'border-accent bg-accent/10'
                                                : 'border-border bg-background hover:bg-muted/50'
                                            }`}
                                        onClick={() => toggleDefectType(type.name)}
                                    >
                                        <div
                                            className="w-4 h-4 rounded"
                                            style={{ backgroundColor: type.color }}
                                        />
                                        <div className="flex-1">
                                            <div className="font-medium text-foreground">{type.name}</div>
                                            <div className="text-sm text-muted-foreground">{type.category}</div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {type.category === '自定义缺陷' && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        removeCustomDefect(type.name);
                                                    }}
                                                    className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
                                                >
                                                    删除
                                                </Button>
                                            )}
                                            <div className={`w-4 h-4 rounded border-2 ${selectedTypes.includes(type.name)
                                                    ? 'border-accent bg-accent'
                                                    : 'border-border'
                                                }`}>
                                                {selectedTypes.includes(type.name) && (
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <div className="w-2 h-2 bg-background rounded"></div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {selectedTypes.length === 0 && (
                                <div className="text-center text-muted-foreground mt-4">
                                    请选择至少一种缺陷类型
                                </div>
                            )}
                        </div>

                        {/* 严重程度阈值 */}
                        <div className="bg-muted/20 border border-border rounded-lg p-4">
                            <h3 className="text-lg font-semibold mb-3 text-foreground">严重程度阈值</h3>
                            <div className="space-y-3">
                                <Label className="text-foreground">只报告达到以下严重程度及以上的缺陷</Label>
                                <div className="grid grid-cols-2 gap-3">
                                    {sortedSeverities.map(severity => (
                                        <div
                                            key={severity.id}
                                            className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${severityThreshold === severity.name
                                                    ? 'border-accent bg-accent/10'
                                                    : 'border-border bg-background hover:bg-muted/50'
                                                }`}
                                            onClick={() => setSeverityThreshold(severity.name)}
                                        >
                                            <div
                                                className="w-4 h-4 rounded"
                                                style={{ backgroundColor: severity.color }}
                                            />
                                            <div className="flex-1">
                                                <div className="font-medium text-foreground">{severity.name}</div>
                                                <div className="text-sm text-muted-foreground">{severity.description}</div>
                                            </div>
                                            <div className={`w-4 h-4 rounded-full border-2 ${severityThreshold === severity.name
                                                    ? 'border-accent bg-accent'
                                                    : 'border-border'
                                                }`}>
                                                {severityThreshold === severity.name && (
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <div className="w-2 h-2 bg-background rounded-full"></div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* 区域重要性 */}
                        <div className="bg-muted/20 border border-border rounded-lg p-4">
                            <h3 className="text-lg font-semibold mb-3 text-foreground">区域重要性</h3>
                            <div className="space-y-3">
                                <Label className="text-foreground">设置此区域在检测中的重要性</Label>
                                <Select
                                    value={importance}
                                    onValueChange={(value: '低' | '中' | '高') => setImportance(value)}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="低">低 - 一般关注</SelectItem>
                                        <SelectItem value="中">中 - 重点关注</SelectItem>
                                        <SelectItem value="高">高 - 关键区域</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 底部操作按钮 */}
                <div className="flex justify-end gap-3 p-6 border-t border-border">
                    <Button variant="outline" onClick={onClose}>
                        取消
                    </Button>
                    <Button onClick={handleSave} disabled={selectedTypes.length === 0}>
                        保存配置
                    </Button>
                </div>
            </div>
        </div>
    );
}; 