import React, { useState, useEffect } from 'react';
import { DefectType, DefectSeverity } from '../types';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Label } from './ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/Select';
import { Textarea } from './ui/Textarea';
import ConfirmDialog from './ConfirmDialog';
import toast from 'react-hot-toast';

interface DefectTypeManagerProps {
    onClose: () => void;
}

export const DefectTypeManager: React.FC<DefectTypeManagerProps> = ({ onClose }) => {
    const [defectTypes, setDefectTypes] = useState<DefectType[]>([]);
    const [severities, setSeverities] = useState<DefectSeverity[]>([]);
    const [activeTab, setActiveTab] = useState<'types' | 'severities'>('types');
    const [editingType, setEditingType] = useState<DefectType | null>(null);
    const [editingSeverity, setEditingSeverity] = useState<DefectSeverity | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    
    // 确认对话框状态
    const [showDeleteTypeDialog, setShowDeleteTypeDialog] = useState(false);
    const [showDeleteSeverityDialog, setShowDeleteSeverityDialog] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<{ id: number; name: string; type: 'type' | 'severity' } | null>(null);

    // 表单状态
    const [typeForm, setTypeForm] = useState({
        name: '',
        category: '',
        description: '',
        color: '#FF6B6B'
    });

    const [severityForm, setSeverityForm] = useState({
        name: '',
        level: 1,
        description: '',
        color: '#4CAF50'
    });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setIsLoading(true);
            const [typesResponse, severitiesResponse] = await Promise.all([
                fetch('/api/defect-types'),
                fetch('/api/defect-severities')
            ]);
            
            if (typesResponse.ok) {
                const types = await typesResponse.json();
                setDefectTypes(types);
            } else {
                throw new Error(`加载缺陷类型失败: ${typesResponse.status}`);
            }
            
            if (severitiesResponse.ok) {
                const sevs = await severitiesResponse.json();
                setSeverities(sevs);
            } else {
                throw new Error(`加载严重程度失败: ${severitiesResponse.status}`);
            }
        } catch (error) {
            console.error('加载缺陷类型数据失败:', error);
            toast.error(`加载数据失败: ${error instanceof Error ? error.message : '未知错误'}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveType = async () => {
        try {
            const url = editingType ? `/api/defect-types/${editingType.id}` : '/api/defect-types';
            const method = editingType ? 'PUT' : 'POST';
            
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(typeForm)
            });
            
            if (response.ok) {
                await loadData();
                resetTypeForm();
                toast.success(editingType ? '缺陷类型更新成功！' : '缺陷类型添加成功！');
            } else {
                const errorData = await response.json();
                throw new Error(errorData.message || '保存失败');
            }
        } catch (error) {
            console.error('保存缺陷类型失败:', error);
            toast.error(`保存失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    };

    const handleSaveSeverity = async () => {
        try {
            const url = editingSeverity ? `/api/defect-severities/${editingSeverity.id}` : '/api/defect-severities';
            const method = editingSeverity ? 'PUT' : 'POST';
            
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(severityForm)
            });
            
            if (response.ok) {
                await loadData();
                resetSeverityForm();
                toast.success(editingSeverity ? '严重程度更新成功！' : '严重程度添加成功！');
            } else {
                const errorData = await response.json();
                throw new Error(errorData.message || '保存失败');
            }
        } catch (error) {
            console.error('保存严重程度失败:', error);
            toast.error(`保存失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    };

    const handleDeleteType = async (id: number, name: string) => {
        setItemToDelete({ id, name, type: 'type' });
        setShowDeleteTypeDialog(true);
    };

    const handleDeleteSeverity = async (id: number, name: string) => {
        setItemToDelete({ id, name, type: 'severity' });
        setShowDeleteSeverityDialog(true);
    };

    const confirmDelete = async () => {
        if (!itemToDelete) return;

        try {
            const url = `/api/defect-types/${itemToDelete.id}`;
            const response = await fetch(url, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                await loadData();
                toast.success(`${itemToDelete.name} 删除成功！`);
            } else {
                const errorData = await response.json();
                throw new Error(errorData.message || '删除失败');
            }
        } catch (error) {
            console.error('删除失败:', error);
            toast.error(`删除失败: ${error instanceof Error ? error.message : '未知错误'}`);
        } finally {
            setShowDeleteTypeDialog(false);
            setShowDeleteSeverityDialog(false);
            setItemToDelete(null);
        }
    };

    const resetTypeForm = () => {
        setTypeForm({ name: '', category: '', description: '', color: '#FF6B6B' });
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
            color: type.color
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

    const categories = ['表面缺陷', '尺寸缺陷', '结构缺陷', '质量缺陷'];

    if (isLoading) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-background p-6 rounded-lg border border-border">
                    <div className="text-center text-foreground">加载中...</div>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-background p-6 rounded-lg w-4/5 h-4/5 overflow-hidden flex flex-col border border-border">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold text-foreground">缺陷类型管理</h2>
                        <Button onClick={onClose} variant="outline">关闭</Button>
                    </div>

                    <div className="flex mb-4">
                        <button
                            className={`px-4 py-2 rounded-l-lg transition-colors ${activeTab === 'types' ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                            onClick={() => setActiveTab('types')}
                        >
                            缺陷类型
                        </button>
                        <button
                            className={`px-4 py-2 rounded-r-lg transition-colors ${activeTab === 'severities' ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                            onClick={() => setActiveTab('severities')}
                        >
                            严重程度
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
                                                {defectTypes.map(type => (
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
                                                                onClick={() => handleDeleteType(type.id, type.name)}
                                                            >
                                                                删除
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* 右侧：编辑表单 */}
                                <div className="w-1/2">
                                    <div className="h-full bg-muted/20 border border-border rounded-lg p-4">
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
                                                    <Select
                                                        value={typeForm.category}
                                                        onValueChange={(value) => setTypeForm({...typeForm, category: value})}
                                                    >
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="选择分类" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="">选择分类</SelectItem>
                                                            {categories.map(cat => (
                                                                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
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
                                                {severities.map(severity => (
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
                                                                onClick={() => handleDeleteSeverity(severity.id, severity.name)}
                                                            >
                                                                删除
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* 右侧：编辑表单 */}
                                <div className="w-1/2">
                                    <div className="h-full bg-muted/20 border border-border rounded-lg p-4">
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

            {/* 确认删除对话框 */}
            <ConfirmDialog
                isOpen={showDeleteTypeDialog}
                title="确认删除"
                message={`确定要删除缺陷类型 "${itemToDelete?.name}" 吗？此操作不可撤销。`}
                confirmText="删除"
                cancelText="取消"
                variant="danger"
                onConfirm={confirmDelete}
                onCancel={() => {
                    setShowDeleteTypeDialog(false);
                    setItemToDelete(null);
                }}
            />

            <ConfirmDialog
                isOpen={showDeleteSeverityDialog}
                title="确认删除"
                message={`确定要删除严重程度 "${itemToDelete?.name}" 吗？此操作不可撤销。`}
                confirmText="删除"
                cancelText="取消"
                variant="danger"
                onConfirm={confirmDelete}
                onCancel={() => {
                    setShowDeleteSeverityDialog(false);
                    setItemToDelete(null);
                }}
            />
        </>
    );
}; 