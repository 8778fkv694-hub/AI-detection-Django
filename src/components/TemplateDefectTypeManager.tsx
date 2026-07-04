import React, { useState, useEffect } from 'react';
import { DefectType, DefectSeverity } from '../types';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Label } from './ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/Select';
import { Textarea } from './ui/Textarea';

// 默认数据
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

// 默认分类
const DEFAULT_CATEGORIES = ['表面缺陷', '尺寸缺陷', '结构缺陷', '质量缺陷'];

interface TemplateDefectTypeManagerProps {
    onClose: () => void;
    onSave: (defectTypes: DefectType[], severities: DefectSeverity[]) => void;
    initialDefectTypes?: DefectType[];
    initialSeverities?: DefectSeverity[];
}

export const TemplateDefectTypeManager: React.FC<TemplateDefectTypeManagerProps> = ({ 
    onClose, 
    onSave, 
    initialDefectTypes = [], 
    initialSeverities = [] 
}) => {
    const [defectTypes, setDefectTypes] = useState<DefectType[]>(initialDefectTypes.length > 0 ? initialDefectTypes : DEFAULT_DEFECT_TYPES);
    const [severities, setSeverities] = useState<DefectSeverity[]>(initialSeverities.length > 0 ? initialSeverities : DEFAULT_SEVERITIES);
    const [activeTab, setActiveTab] = useState<'types' | 'severities'>('types');
    const [editingType, setEditingType] = useState<DefectType | null>(null);
    const [editingSeverity, setEditingSeverity] = useState<DefectSeverity | null>(null);
    
    // 分类管理状态
    const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
    const [newCategory, setNewCategory] = useState('');
    const [showCategoryInput, setShowCategoryInput] = useState(false);

    // 表单状态
    const [typeForm, setTypeForm] = useState({
        name: '',
        category: '',
        description: '',
        color: '#FF6B6B',
        severityLevels: [] as string[]
    });

    const [severityForm, setSeverityForm] = useState({
        name: '',
        level: 1,
        description: '',
        color: '#4CAF50'
    });

    // 初始化数据
    useEffect(() => {
        if (initialDefectTypes.length === 0 && initialSeverities.length === 0) {
            // 如果没有初始数据，使用默认数据
            setDefectTypes(DEFAULT_DEFECT_TYPES);
            setSeverities(DEFAULT_SEVERITIES);
        }
    }, [initialDefectTypes, initialSeverities]);

    // 分类管理函数
    const handleAddCategory = () => {
        if (newCategory.trim() && !categories.includes(newCategory.trim())) {
            setCategories([...categories, newCategory.trim()]);
            setNewCategory('');
            setShowCategoryInput(false);
        }
    };

    const handleDeleteCategory = (categoryToDelete: string) => {
        // 检查是否有缺陷类型使用这个分类
        const typesUsingCategory = defectTypes.filter(type => type.category === categoryToDelete);
        if (typesUsingCategory.length > 0) {
            alert(`无法删除分类"${categoryToDelete}"，因为还有${typesUsingCategory.length}个缺陷类型在使用它。请先修改或删除这些缺陷类型。`);
            return;
        }
        
        if (confirm(`确定要删除分类"${categoryToDelete}"吗？`)) {
            setCategories(categories.filter(cat => cat !== categoryToDelete));
        }
    };

    const handleSaveType = () => {
        if (!typeForm.name.trim()) {
            alert('请输入缺陷类型名称');
            return;
        }

        if (!typeForm.category.trim()) {
            alert('请选择或输入分类');
            return;
        }

        if (editingType) {
            // 编辑现有类型
            const updatedTypes = defectTypes.map(type => 
                type.id === editingType.id 
                    ? { ...type, ...typeForm }
                    : type
            );
            setDefectTypes(updatedTypes);
        } else {
            // 添加新类型
            const newType: DefectType = {
                id: Date.now(), // 临时ID
                ...typeForm
            };
            setDefectTypes([...defectTypes, newType]);
        }
        resetTypeForm();
    };

    const handleSaveSeverity = () => {
        if (!severityForm.name.trim()) {
            alert('请输入严重程度名称');
            return;
        }

        if (editingSeverity) {
            // 编辑现有严重程度
            const updatedSeverities = severities.map(severity => 
                severity.id === editingSeverity.id 
                    ? { ...severity, ...severityForm }
                    : severity
            );
            setSeverities(updatedSeverities);
        } else {
            // 添加新严重程度
            const newSeverity: DefectSeverity = {
                id: Date.now(), // 临时ID
                ...severityForm
            };
            setSeverities([...severities, newSeverity]);
        }
        resetSeverityForm();
    };

    const handleDeleteType = (id: number) => {
        if (confirm('确定要删除这个缺陷类型吗？')) {
            setDefectTypes(defectTypes.filter(type => type.id !== id));
        }
    };

    const handleDeleteSeverity = (id: number) => {
        if (confirm('确定要删除这个严重程度吗？')) {
            setSeverities(severities.filter(severity => severity.id !== id));
        }
    };

    const resetTypeForm = () => {
        setTypeForm({ name: '', category: '', description: '', color: '#FF6B6B', severityLevels: [] });
        setEditingType(null);
    };

    const resetSeverityForm = () => {
        setSeverityForm({ name: '', level: 1, description: '', color: '#4CAF50' });
        setEditingSeverity(null);
    };

    const editType = (type: DefectType) => {
        setEditingType(type);
        setTypeForm({
            name: type.name,
            category: type.category,
            description: type.description,
            color: type.color,
            severityLevels: type.severityLevels || []
        });
    };

    const editSeverity = (severity: DefectSeverity) => {
        setEditingSeverity(severity);
        setSeverityForm({
            name: severity.name,
            level: severity.level,
            description: severity.description,
            color: severity.color
        });
    };

    const handleSaveAll = () => {
        onSave(defectTypes, severities);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40">
            <div className="bg-background p-6 rounded-lg w-4/5 h-4/5 overflow-hidden flex flex-col border border-border">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-foreground">模板缺陷类型管理</h2>
                    <div className="flex gap-2">
                        <Button onClick={handleSaveAll} variant="default">
                            保存到模板
                        </Button>
                        <Button onClick={onClose} variant="outline">关闭</Button>
                    </div>
                </div>

                <div className="flex mb-4">
                    <button
                        className={`px-4 py-2 rounded-l-lg transition-colors ${activeTab === 'types' ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                        onClick={() => setActiveTab('types')}
                    >
                        缺陷类型 ({defectTypes.length})
                    </button>
                    <button
                        className={`px-4 py-2 rounded-r-lg transition-colors ${activeTab === 'severities' ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                        onClick={() => setActiveTab('severities')}
                    >
                        严重程度 ({severities.length})
                    </button>
                </div>

                <div className="flex-1 overflow-hidden">
                    {activeTab === 'types' && (
                        <div className="flex h-full gap-4">
                            {/* 左侧：类型列表 */}
                            <div className="w-1/2 overflow-y-auto">
                                <div className="h-full bg-muted/20 border border-border rounded-lg p-4">
                                    <div className="p-4">
                                        <h3 className="text-lg font-semibold mb-4 text-foreground">缺陷类型列表</h3>
                                        <div className="space-y-2">
                                            {defectTypes.length === 0 ? (
                                                <div className="text-center text-muted-foreground py-8">
                                                    暂无缺陷类型，请添加
                                                </div>
                                            ) : (
                                                defectTypes.map(type => (
                                                    <div key={type.id} className="flex items-center justify-between p-3 border border-border rounded-lg bg-background hover:bg-muted/50 transition-colors">
                                                        <div className="flex items-center gap-3">
                                                            <div 
                                                                className="w-4 h-4 rounded"
                                                                style={{ backgroundColor: type.color }}
                                                            />
                                                            <div>
                                                                <div className="font-medium text-foreground">{type.name}</div>
                                                                <div className="text-sm text-muted-foreground">{type.category}</div>
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <Button 
                                                                size="sm" 
                                                                variant="outline"
                                                                onClick={() => editType(type)}
                                                            >
                                                                编辑
                                                            </Button>
                                                            <Button 
                                                                size="sm" 
                                                                variant="destructive"
                                                                onClick={() => handleDeleteType(type.id)}
                                                            >
                                                                删除
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 右侧：编辑表单 */}
                            <div className="w-1/2">
                                <div className="h-full bg-muted/20 border border-border rounded-lg p-4 overflow-y-auto">
                                    <div className="p-4">
                                        <h3 className="text-lg font-semibold mb-4 text-foreground">
                                            {editingType ? '编辑缺陷类型' : '新增缺陷类型'}
                                        </h3>
                                        <div className="space-y-4">
                                            <div>
                                                <Label htmlFor="typeName">类型名称</Label>
                                                <Input
                                                    id="typeName"
                                                    value={typeForm.name}
                                                    onChange={(e) => setTypeForm({...typeForm, name: e.target.value})}
                                                    placeholder="输入缺陷类型名称"
                                                />
                                            </div>
                                            <div>
                                                <Label htmlFor="typeCategory">分类</Label>
                                                <div className="space-y-2">
                                                    <Select value={typeForm.category} onValueChange={(value) => setTypeForm({...typeForm, category: value})}>
                                                        <SelectTrigger className="w-full">
                                                            <SelectValue placeholder="选择分类" />
                                                        </SelectTrigger>
                                                        <SelectContent className="z-[9999]">
                                                            {categories.map(cat => (
                                                                <SelectItem key={cat} value={cat}>
                                                                    {cat}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    
                                                    {/* 分类管理 */}
                                                    <div className="flex items-center gap-2">
                                                        <Button 
                                                            size="sm" 
                                                            variant="outline"
                                                            onClick={() => setShowCategoryInput(!showCategoryInput)}
                                                        >
                                                            {showCategoryInput ? '取消' : '添加分类'}
                                                        </Button>
                                                        {showCategoryInput && (
                                                            <div className="flex gap-2 flex-1">
                                                                <Input
                                                                    value={newCategory}
                                                                    onChange={(e) => setNewCategory(e.target.value)}
                                                                    placeholder="输入新分类名称"
                                                                    onKeyPress={(e) => e.key === 'Enter' && handleAddCategory()}
                                                                />
                                                                <Button size="sm" onClick={handleAddCategory}>
                                                                    添加
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </div>
                                                    
                                                    {/* 分类列表 */}
                                                    <div className="flex flex-wrap gap-2 mt-2">
                                                        {categories.map(cat => (
                                                            <div key={cat} className="flex items-center gap-1 bg-muted/30 px-2 py-1 rounded text-sm">
                                                                <span>{cat}</span>
                                                                <button
                                                                    onClick={() => handleDeleteCategory(cat)}
                                                                    className="text-red-400 hover:text-red-600 text-xs"
                                                                >
                                                                    ×
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                            <div>
                                                <Label htmlFor="typeDescription">描述</Label>
                                                <Textarea
                                                    id="typeDescription"
                                                    value={typeForm.description}
                                                    onChange={(e) => setTypeForm({...typeForm, description: e.target.value})}
                                                    placeholder="输入缺陷类型描述"
                                                />
                                            </div>
                                            <div>
                                                <Label htmlFor="typeColor">颜色</Label>
                                                <Input
                                                    id="typeColor"
                                                    type="color"
                                                    value={typeForm.color}
                                                    onChange={(e) => setTypeForm({...typeForm, color: e.target.value})}
                                                />
                                            </div>
                                            <div className="flex gap-2">
                                                <Button onClick={handleSaveType}>
                                                    {editingType ? '更新' : '添加'}
                                                </Button>
                                                {editingType && (
                                                    <Button variant="outline" onClick={resetTypeForm}>
                                                        取消
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'severities' && (
                        <div className="flex h-full gap-4">
                            {/* 左侧：严重程度列表 */}
                            <div className="w-1/2 overflow-y-auto">
                                <div className="h-full bg-muted/20 border border-border rounded-lg p-4">
                                    <div className="p-4">
                                        <h3 className="text-lg font-semibold mb-4 text-foreground">严重程度列表</h3>
                                        <div className="space-y-2">
                                            {severities.length === 0 ? (
                                                <div className="text-center text-muted-foreground py-8">
                                                    暂无严重程度，请添加
                                                </div>
                                            ) : (
                                                severities.map(severity => (
                                                    <div key={severity.id} className="flex items-center justify-between p-3 border border-border rounded-lg bg-background hover:bg-muted/50 transition-colors">
                                                        <div className="flex items-center gap-3">
                                                            <div 
                                                                className="w-4 h-4 rounded"
                                                                style={{ backgroundColor: severity.color }}
                                                            />
                                                            <div>
                                                                <div className="font-medium text-foreground">{severity.name}</div>
                                                                <div className="text-sm text-muted-foreground">级别 {severity.level}</div>
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <Button 
                                                                size="sm" 
                                                                variant="outline"
                                                                onClick={() => editSeverity(severity)}
                                                            >
                                                                编辑
                                                            </Button>
                                                            <Button 
                                                                size="sm" 
                                                                variant="destructive"
                                                                onClick={() => handleDeleteSeverity(severity.id)}
                                                            >
                                                                删除
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 右侧：编辑表单 */}
                            <div className="w-1/2">
                                <div className="h-full bg-muted/20 border border-border rounded-lg p-4 overflow-y-auto">
                                    <div className="p-4">
                                        <h3 className="text-lg font-semibold mb-4 text-foreground">
                                            {editingSeverity ? '编辑严重程度' : '新增严重程度'}
                                        </h3>
                                        <div className="space-y-4">
                                            <div>
                                                <Label htmlFor="severityName">严重程度名称</Label>
                                                <Input
                                                    id="severityName"
                                                    value={severityForm.name}
                                                    onChange={(e) => setSeverityForm({...severityForm, name: e.target.value})}
                                                    placeholder="输入严重程度名称"
                                                />
                                            </div>
                                            <div>
                                                <Label htmlFor="severityLevel">级别</Label>
                                                <Input
                                                    id="severityLevel"
                                                    type="number"
                                                    min="1"
                                                    max="10"
                                                    value={severityForm.level}
                                                    onChange={(e) => setSeverityForm({...severityForm, level: parseInt(e.target.value)})}
                                                />
                                            </div>
                                            <div>
                                                <Label htmlFor="severityDescription">描述</Label>
                                                <Textarea
                                                    id="severityDescription"
                                                    value={severityForm.description}
                                                    onChange={(e) => setSeverityForm({...severityForm, description: e.target.value})}
                                                    placeholder="输入严重程度描述"
                                                />
                                            </div>
                                            <div>
                                                <Label htmlFor="severityColor">颜色</Label>
                                                <Input
                                                    id="severityColor"
                                                    type="color"
                                                    value={severityForm.color}
                                                    onChange={(e) => setSeverityForm({...severityForm, color: e.target.value})}
                                                />
                                            </div>
                                            <div className="flex gap-2">
                                                <Button onClick={handleSaveSeverity}>
                                                    {editingSeverity ? '更新' : '添加'}
                                                </Button>
                                                {editingSeverity && (
                                                    <Button variant="outline" onClick={resetSeverityForm}>
                                                        取消
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}; 