import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { 
  BarChart3, 
  TrendingUp, 
  Calendar, 
  FileText, 
  Shield,
  CheckCircle,
  XCircle,
  Camera,
  Trash2,
  RefreshCw,
  Send,
  MapPin,
  Clock,
  AlertCircle
} from 'lucide-react';
import { useAppStore } from '@/state/appStore';

// 定义本地类型，避免导入问题
interface PPEDetectionStats {
  date: string;
  totalInspections: number;
  qualifiedCount: number;
  unqualifiedCount: number;
  recheckCount: number;
  qualifiedRate: number;
  captureCount: number;
  ppeDetections: {
    cleanroom_cap: number;
    mask: number;
    person: number;
  };
}

interface PPETrendData {
  date: string;
  qualifiedRate: number;
  captureCount: number;
  qualifiedCount: number;
}

const CleanroomInspectionResultsScreen: React.FC = () => {
  const { results } = useAppStore();
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month'>('today');
  
  // 报告发送相关状态
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [reportData, setReportData] = useState({
    startTime: '',
    endTime: '',
    location: '',
    description: ''
  });
  const [isSendingReport, setIsSendingReport] = useState(false);
  
  // 健康系统配置相关状态
  const [showHealthSystemConfig, setShowHealthSystemConfig] = useState(false);
  const [healthSystemConfig, setHealthSystemConfig] = useState({
    ipAddress: '',
    port: '4003',
    useManualConfig: false,
    useAutoDiscovery: true
  });
  const [healthSystemStatus, setHealthSystemStatus] = useState<{
    connected: boolean;
    message: string;
    lastChecked: string | null;
  }>({
    connected: false,
    message: '',
    lastChecked: null
  });

  // 组件加载时获取健康系统配置
  useEffect(() => {
    getHealthSystemConfig();
  }, []);
  
  // 行内编辑状态
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  
  // 挂起报告状态
  const [pendingReports, setPendingReports] = useState<Array<{
    id: string;
    reportData: any;
    retryCount: number;
    lastAttempt: string;
    error?: string;
  }>>([]);
  const [showPendingReports, setShowPendingReports] = useState(false);

  // 行内编辑处理函数
  const startEdit = (field: string, currentValue: string) => {
    setEditingField(field);
    setEditValue(currentValue);
  };

  const saveEdit = () => {
    if (editingField) {
      setReportData(prev => ({
        ...prev,
        [editingField]: editValue
      }));
      setEditingField(null);
      setEditValue('');
    }
  };

  const cancelEdit = () => {
    setEditingField(null);
    setEditValue('');
  };

  // 键盘事件处理
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  // 格式化时间显示
  const formatTimeDisplay = (timeString: string) => {
    if (!timeString) return '未设置';
    try {
      const date = new Date(timeString);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    } catch (error) {
      return timeString; // 如果解析失败，返回原始字符串
    }
  };

  // 过滤洁净用品检测结果
  const cleanroomResults = useMemo(() => {
    
    // 精确的洁净用品检测结果筛选条件
    const filtered = results.filter(result => {
      // 优先使用detectionType字段进行判断
      if ((result as any).detectionType === 'cleanroom_ppe') {
        return true;
      }
      
      // 如果没有detectionType字段，使用原有的判断逻辑
      const reason = result.reason || '';
      const lowerReason = reason.toLowerCase();
      
      // 检查是否包含洁净用品相关的关键词
      const hasCleanroomKeywords = (
        lowerReason.includes('洁净帽') || 
        lowerReason.includes('口罩') || 
        lowerReason.includes('洁净服') ||
        lowerReason.includes('洁净用品') ||
        lowerReason.includes('ppe') ||
        lowerReason.includes('防护装备') ||
        lowerReason.includes('灌缝帽') ||
        lowerReason.includes('未检测到人员或ppe装备严重不足') ||
        lowerReason.includes('洁净用品检测')
      );
      
      // 检查是否包含PPE检测相关的字段（暂时跳过，因为字段不存在）
      const hasPpeFields = false; // result.ppeDetections || result.ppeCompliance;
      
      // 检查reasonKeywords是否包含洁净用品相关词汇
      const reasonKeywords = result.reasonKeywords || '';
      const lowerKeywords = reasonKeywords.toLowerCase();
      const hasCleanroomKeywordsInReason = (
        lowerKeywords.includes('洁净帽') ||
        lowerKeywords.includes('口罩') ||
        lowerKeywords.includes('洁净服') ||
        lowerKeywords.includes('ppe') ||
        lowerKeywords.includes('洁净用品')
      );
      
      // 检查是否没有standardId（洁净用品检测通常没有标准ID）
      const hasNoStandard = !result.standardId;
      
      // 只有满足以下条件之一才认为是洁净用品检测结果：
      // 1. 有PPE相关字段
      // 2. 原因中包含洁净用品关键词
      // 3. 原因关键词中包含洁净用品词汇
      // 4. 没有standardId且原因中包含洁净用品相关词汇
      const isCleanroomResult = (
        hasPpeFields || 
        hasCleanroomKeywords || 
        hasCleanroomKeywordsInReason ||
        (hasNoStandard && hasCleanroomKeywords)
      );
      
      console.log(`结果 ${result.id}:`, {
        detectionType: (result as any).detectionType,
        hasPpeFields: !!hasPpeFields,
        hasCleanroomKeywords,
        hasCleanroomKeywordsInReason,
        hasNoStandard,
        isCleanroomResult,
        reason: reason.substring(0, 50) + '...',
        reasonKeywords,
        standardId: result.standardId
      });
      
      return isCleanroomResult;
    });
    
    console.log('筛选后的洁净用品结果:', filtered);
    console.log('筛选后数量:', filtered.length);
    
    return filtered;
  }, [results]);

  // 计算统计数据
  const stats = useMemo((): PPEDetectionStats => {
    const todayResults = cleanroomResults.filter(result => 
      result.timestamp.startsWith(selectedDate)
    );

    const totalInspections = todayResults.length;
    const qualifiedCount = todayResults.filter(r => r.overallQuality === '合格').length;
    const unqualifiedCount = todayResults.filter(r => r.overallQuality === '存疑').length;
    const recheckCount = todayResults.filter(r => r.overallQuality === '需复检').length;
    const qualifiedRate = totalInspections > 0 ? (qualifiedCount / totalInspections) * 100 : 0;

    return {
      date: selectedDate,
      totalInspections,
      qualifiedCount,
      unqualifiedCount,
      recheckCount,
      qualifiedRate,
      captureCount: totalInspections, // 假设每次检测都是一次抓拍
      ppeDetections: {
        cleanroom_cap: todayResults.filter(r => r.reason.includes('洁净帽')).length,
        mask: todayResults.filter(r => r.reason.includes('口罩')).length,

        person: todayResults.filter(r => r.reason.includes('人员')).length,
      }
    };
  }, [cleanroomResults, selectedDate]);

  // 获取日期范围
  const getDateRange = (range: 'today' | 'week' | 'month'): string[] => {
    const dates: string[] = [];
    const today = new Date();
    
    switch (range) {
      case 'today':
        dates.push(today.toISOString().split('T')[0]);
        break;
      case 'week':
        for (let i = 6; i >= 0; i--) {
          const date = new Date(today);
          date.setDate(date.getDate() - i);
          dates.push(date.toISOString().split('T')[0]);
        }
        break;
      case 'month':
        for (let i = 29; i >= 0; i--) {
          const date = new Date(today);
          date.setDate(date.getDate() - i);
          dates.push(date.toISOString().split('T')[0]);
        }
        break;
    }
    
    return dates;
  };

  // 计算趋势数据
  const trendData = useMemo((): PPETrendData[] => {
    const dates = getDateRange(dateRange);
    return dates.map(date => {
      const dayResults = cleanroomResults.filter(result => 
        result.timestamp.startsWith(date)
      );
      const total = dayResults.length;
      const qualified = dayResults.filter(r => r.overallQuality === '合格').length;
      const rate = total > 0 ? (qualified / total) * 100 : 0;

      return {
        date,
        qualifiedRate: rate,
        captureCount: total,
        qualifiedCount: qualified
      };
    });
  }, [cleanroomResults, dateRange]);

  // 刷新数据
  const handleRefresh = async () => {
    try {
      // 显示加载状态
      const refreshButton = document.querySelector('button[onclick*="handleRefresh"]');
      if (refreshButton) {
        refreshButton.innerHTML = '<RefreshCw className="mr-2 h-4 w-4 animate-spin" /> 刷新中...';
        (refreshButton as HTMLButtonElement).disabled = true;
      }

      // 重新同步数据
      await useAppStore.getState().syncData();
      
      // 显示成功消息
      alert('数据刷新成功！');
    } catch (error) {
      console.error('刷新数据失败:', error);
        alert(`刷新数据失败，请稍后重试: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      // 恢复按钮状态
      const refreshButton = document.querySelector('button[onclick*="handleRefresh"]');
      if (refreshButton) {
        refreshButton.innerHTML = '<RefreshCw className="mr-2 h-4 w-4" /> 刷新';
        (refreshButton as HTMLButtonElement).disabled = false;
      }
    }
  };

  // 清除洁净用品检测数据
  const handleClearData = async () => {
    if (cleanroomResults.length === 0) {
      alert('没有洁净用品检测结果需要清除');
      return;
    }

    // 确认对话框
    if (window.confirm(`确定要永久删除所有 ${cleanroomResults.length} 条洁净用品检测结果吗？\n\n此操作不可恢复！\n\n注意：只有洁净用品检测结果会被删除，标准检测结果将保留。`)) {
      try {
        // 使用POST请求调用清除API
        const response = await fetch('/api/results/clear-cleanroom/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            reason: '用户手动清除洁净用品检测结果',
            count: cleanroomResults.length
          })
        });

        if (response.ok) {
          const result = await response.json();
          // 重新同步数据
          await useAppStore.getState().syncData();
          // 显示成功消息
          alert(`已成功清除 ${result.deleted_count || cleanroomResults.length} 条洁净用品检测结果！\n\n删除的记录数量: ${result.deleted_count || cleanroomResults.length}\n原因: ${result.reason || '用户手动清除'}`);
        } else {
          const errorData = await response.json();
          throw new Error(errorData.message || '清除失败');
        }
      } catch (error) {
        console.error('清除数据失败:', error);
        alert(`清除数据失败: ${error instanceof Error ? error.message : '未知错误'}\n\n请检查后端服务是否正常运行。`);
      }
    }
  };

  // 导出检测报表
  const exportReport = () => {
    const todayResults = cleanroomResults.filter(result => 
      result.timestamp.startsWith(selectedDate)
    );

    // 创建CSV格式数据
    const csvData = [
      ['时间', '状态', '分数', '原因', 'ID'],
      ...todayResults.map(result => [
        new Date(result.timestamp).toLocaleString('zh-CN'),
        result.overallQuality,
        result.score,
        result.reason,
        result.id.slice(0, 8)
      ])
    ];

    // 转换为CSV字符串
    const csvContent = csvData.map(row => 
      row.map(cell => `"${cell}"`).join(',')
    ).join('\n');

    // 创建并下载CSV文件
    const blob = new Blob(['\ufeff' + csvContent], {
      type: 'text/csv;charset=utf-8'
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `洁净用品检测报表_${selectedDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 打开报告发送对话框
  const handleSendReport = () => {
    // 设置默认时间范围
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    // 格式化为本地时间字符串，用于datetime-local输入
    const formatDateTimeLocal = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    };

    setReportData({
      startTime: formatDateTimeLocal(startOfDay),
      endTime: formatDateTimeLocal(endOfDay),
      location: '',
      description: `洁净用品穿戴检查报告 - ${selectedDate}`
    });
    setShowReportDialog(true);
  };

  // 获取报告对话框中的统计数据
  const getReportStats = () => {
    if (!reportData.startTime || !reportData.endTime) {
      return {
        totalInspections: 0,
        qualifiedCount: 0,
        unqualifiedCount: 0,
        qualifiedRate: 0
      };
    }

    const filteredResults = cleanroomResults.filter(result => {
      const resultTime = new Date(result.timestamp);
      const startTime = new Date(reportData.startTime);
      const endTime = new Date(reportData.endTime);
      return resultTime >= startTime && resultTime <= endTime;
    });

    const totalInspections = filteredResults.length;
    const qualifiedCount = filteredResults.filter(r => r.overallQuality === '合格').length;
    const unqualifiedCount = filteredResults.filter(r => r.overallQuality === '存疑').length;
    const recheckCount = filteredResults.filter(r => r.overallQuality === '需复检').length;
    
    // 调试信息已移除，避免控制台日志过多
    
    // 计算合格率：只有"合格"才算通过，"需复检"不算通过
    const qualifiedRate = totalInspections > 0 ? (qualifiedCount / totalInspections) * 100 : 0;

    return {
      totalInspections,
      qualifiedCount, // 只显示真正合格的数量
      unqualifiedCount,
      recheckCount, // 单独统计需复检数量
      qualifiedRate
    };
  };

  // 生成报告数据
  const generateReportData = () => {
    const filteredResults = cleanroomResults.filter(result => {
      const resultTime = new Date(result.timestamp);
      const startTime = new Date(reportData.startTime);
      const endTime = new Date(reportData.endTime);
      return resultTime >= startTime && resultTime <= endTime;
    });

    const totalInspections = filteredResults.length;
    const qualifiedCount = filteredResults.filter(r => r.overallQuality === '合格').length;
    const unqualifiedCount = filteredResults.filter(r => r.overallQuality === '存疑').length;
    const recheckCount = filteredResults.filter(r => r.overallQuality === '需复检').length;
    
    // 计算合格率：只有"合格"才算通过，"需复检"不算通过
    const qualifiedRate = totalInspections > 0 ? (qualifiedCount / totalInspections) * 100 : 0;

    return {
      reportInfo: {
        title: '洁净用品穿戴检查记录',
        location: reportData.location,
        startTime: reportData.startTime,
        endTime: reportData.endTime,
        description: reportData.description,
        generatedAt: new Date().toISOString(),
        generatedBy: 'AI检测系统'
      },
      statistics: {
        totalInspections,
        qualifiedCount, // 只显示真正合格的数量
        unqualifiedCount,
        recheckCount, // 单独统计需复检数量
        qualifiedRate: Math.round(qualifiedRate * 100) / 100
      },
      details: filteredResults.map(result => ({
        timestamp: result.timestamp,
        quality: result.overallQuality,
        score: result.score,
        reason: result.reason,
        id: result.id
      }))
    };
  };

  // 获取健康系统配置
  const getHealthSystemConfig = async () => {
    try {
      const response = await fetch('/api/reports/health-system-config/');
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.config) {
          const config = data.config;
          setHealthSystemStatus({
            connected: config.discovery?.status === 'connected',
            message: config.discovery?.message || '未知状态',
            lastChecked: new Date().toISOString()
          });
          
          // 从URL中提取IP地址
          if (config.apiUrl && config.apiUrl !== 'http://localhost:4003') {
            const url = new URL(config.apiUrl);
            setHealthSystemConfig(prev => ({
              ...prev,
              ipAddress: url.hostname,
              port: url.port || '4003',
              useManualConfig: true,
              useAutoDiscovery: false
            }));
          }
        }
      }
    } catch (error) {
      console.error('获取健康系统配置失败:', error);
    }
  };

  // 测试健康系统连接
  const testHealthSystemConnection = async (ipAddress: string, port: string) => {
    try {
      const response = await fetch(`http://${ipAddress}:${port}/api/status`, {
        method: 'GET',
        // 注：fetch 无 timeout 选项（原 timeout: 5000 从未生效，移除不改变行为）
      });
      
      if (response.ok) {
        setHealthSystemStatus({
          connected: true,
          message: `连接成功: ${ipAddress}:${port}`,
          lastChecked: new Date().toISOString()
        });
        return true;
      } else {
        setHealthSystemStatus({
          connected: false,
          message: `连接失败: ${ipAddress}:${port} (状态码: ${response.status})`,
          lastChecked: new Date().toISOString()
        });
        return false;
      }
    } catch (error) {
      setHealthSystemStatus({
        connected: false,
        message: `连接失败: ${ipAddress}:${port} (错误: ${error instanceof Error ? error.message : String(error)})`,
        lastChecked: new Date().toISOString()
      });
      return false;
    }
  };

  // 保存健康系统配置
  const saveHealthSystemConfig = async () => {
    try {
      const configData = {
        health_system: {
          enabled: true,
          discovery: {
            enabled: healthSystemConfig.useAutoDiscovery
          },
          manual_config: {
            enabled: healthSystemConfig.useManualConfig,
            ip_address: healthSystemConfig.ipAddress,
            port: parseInt(healthSystemConfig.port)
          }
        }
      };

      const response = await fetch('/api/reports/health-system-config/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(configData)
      });

      if (response.ok) {
        alert('健康系统配置保存成功！');
        setShowHealthSystemConfig(false);
        // 重新获取配置状态
        await getHealthSystemConfig();
      } else {
        alert('健康系统配置保存失败，请重试');
      }
    } catch (error) {
      console.error('保存健康系统配置失败:', error);
      alert('保存配置时发生错误，请重试');
    }
  };

  // 扫描局域网中的健康系统
  const scanHealthSystem = async () => {
    try {
      setHealthSystemStatus({
        connected: false,
        message: '正在扫描局域网中的健康系统...',
        lastChecked: new Date().toISOString()
      });

      // 这里可以调用后端的扫描API
      const response = await fetch('/api/reports/scan-health-system/', {
        method: 'POST'
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.found_ips && data.found_ips.length > 0) {
          const firstIp = data.found_ips[0];
          setHealthSystemConfig(prev => ({
            ...prev,
            ipAddress: firstIp,
            useManualConfig: true,
            useAutoDiscovery: false
          }));
          
          // 测试连接
          await testHealthSystemConnection(firstIp, healthSystemConfig.port);
        } else {
          setHealthSystemStatus({
            connected: false,
            message: '未发现健康系统，请检查健康系统是否运行在端口4003',
            lastChecked: new Date().toISOString()
          });
        }
      }
    } catch (error) {
      console.error('扫描健康系统失败:', error);
      setHealthSystemStatus({
        connected: false,
        message: '扫描失败，请重试',
        lastChecked: new Date().toISOString()
      });
    }
  };

  // 发送报告到健康系统
  const sendReportToHealthSystem = async (isRetry = false, pendingReportId?: string) => {
    if (!reportData.location.trim()) {
      alert('请填写检查地点');
      return;
    }

    setIsSendingReport(true);
    try {
      const reportDataToSend = generateReportData();
      
      const response = await fetch('/api/reports/send-to-health-system/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(reportDataToSend)
      });

      if (response.ok) {
        const result = await response.json();
        alert(`报告发送成功！\n健康系统记录ID: ${result.recordId || 'N/A'}`);
        
        // 如果是重试，从挂起列表中移除
        if (isRetry && pendingReportId) {
          setPendingReports(prev => prev.filter(report => report.id !== pendingReportId));
        }
        
        setShowReportDialog(false);
        // 重置表单
        setReportData({
          startTime: '',
          endTime: '',
          location: '',
          description: ''
        });
      } else {
        const errorData = await response.json();
        // 发送失败，添加到挂起列表
        const pendingReport = {
          id: `pending_${Date.now()}`,
          reportData: reportDataToSend,
          retryCount: 0,
          lastAttempt: new Date().toISOString(),
          error: errorData.message || '发送失败'
        };
        
        setPendingReports(prev => [...prev, pendingReport]);
        alert(`发送失败，报告已挂起等待重试\n错误: ${errorData.message || '未知错误'}\n您可以稍后在挂起列表中重试发送`);
      }
    } catch (error) {
      console.error('发送报告失败:', error);
      
      // 网络错误也添加到挂起列表
      const pendingReport = {
        id: `pending_${Date.now()}`,
        reportData: generateReportData(),
        retryCount: 0,
        lastAttempt: new Date().toISOString(),
        error: error instanceof Error ? error.message : '网络错误'
      };
      
      setPendingReports(prev => [...prev, pendingReport]);
      alert(`网络错误，报告已挂起等待重试\n错误: ${error instanceof Error ? error.message : '未知错误'}\n您可以稍后在挂起列表中重试发送`);
    } finally {
      setIsSendingReport(false);
    }
  };

  // 重试发送挂起的报告
  const retryPendingReport = async (pendingReport: any) => {
    try {
      const response = await fetch('/api/reports/send-to-health-system/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(pendingReport.reportData)
      });

      if (response.ok) {
        const result = await response.json();
        alert(`报告重试发送成功！\n健康系统记录ID: ${result.recordId || 'N/A'}`);
        
        // 从挂起列表中移除
        setPendingReports(prev => prev.filter(report => report.id !== pendingReport.id));
      } else {
        const errorData = await response.json();
        
        // 更新重试次数和错误信息
        setPendingReports(prev => prev.map(report => 
          report.id === pendingReport.id 
            ? {
                ...report,
                retryCount: report.retryCount + 1,
                lastAttempt: new Date().toISOString(),
                error: errorData.message || '重试失败'
              }
            : report
        ));
        
        alert(`重试发送失败\n错误: ${errorData.message || '未知错误'}\n重试次数: ${pendingReport.retryCount + 1}`);
      }
    } catch (error) {
      // 更新重试次数和错误信息
      setPendingReports(prev => prev.map(report => 
        report.id === pendingReport.id 
          ? {
              ...report,
              retryCount: report.retryCount + 1,
              lastAttempt: new Date().toISOString(),
              error: error instanceof Error ? error.message : '网络错误'
            }
          : report
      ));
      
      alert(`重试发送失败\n错误: ${error instanceof Error ? error.message : '未知错误'}\n重试次数: ${pendingReport.retryCount + 1}`);
    }
  };

  // 删除挂起的报告
  const deletePendingReport = (reportId: string) => {
    if (confirm('确定要删除这个挂起的报告吗？')) {
      setPendingReports(prev => prev.filter(report => report.id !== reportId));
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* 页面标题 */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="text-center lg:text-left">
          <h1 className="text-2xl lg:text-3xl font-bold text-white mb-2">PPE检测结果</h1>
          <p className="text-slate-400 text-sm lg:text-base">统计数据、趋势分析和检测报告</p>
        </div>
        <div className="flex flex-wrap justify-center lg:justify-end gap-2 lg:gap-3">
          <Button 
            onClick={handleRefresh} 
            variant="outline" 
            size="sm"
            className="bg-slate-700 hover:bg-slate-600 border-slate-600 text-white"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            刷新
          </Button>
          <Button 
            onClick={handleClearData} 
            variant="destructive" 
            size="sm"
            className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
            disabled={cleanroomResults.length === 0}
            title={cleanroomResults.length === 0 ? '没有PPE检测结果需要清除' : `清除 ${cleanroomResults.length} 条PPE检测结果`}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            清除PPE结果 ({cleanroomResults.length})
          </Button>
          <Button 
            onClick={exportReport} 
            size="sm"
            className="bg-green-600 hover:bg-green-700"
          >
            <FileText className="mr-2 h-4 w-4" />
            导出CSV
          </Button>
          <Button 
            onClick={handleSendReport} 
            size="sm"
            className="bg-blue-600 hover:bg-blue-700"
            disabled={cleanroomResults.length === 0}
          >
            <Send className="mr-2 h-4 w-4" />
            发送报告
          </Button>
          <Button
            onClick={() => setShowHealthSystemConfig(true)}
            size="sm"
            variant="outline"
            className="border-slate-600 text-slate-300 hover:bg-slate-700"
          >
            <Shield className="mr-2 h-4 w-4" />
            健康系统配置
          </Button>
          {pendingReports.length > 0 && (
            <Button
              onClick={() => setShowPendingReports(true)}
              size="sm"
              className="bg-orange-600 hover:bg-orange-700"
            >
              <AlertCircle className="mr-2 h-4 w-4" />
              挂起报告 ({pendingReports.length})
            </Button>
          )}
        </div>
      </div>

      {/* 日期选择器 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-slate-400" />
              <span className="text-sm text-slate-400">日期范围：</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={dateRange === 'today' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDateRange('today')}
                className="text-xs px-3 py-1"
              >
                今日
              </Button>
              <Button
                variant={dateRange === 'week' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDateRange('week')}
                className="text-xs px-3 py-1"
              >
                本周
              </Button>
              <Button
                variant={dateRange === 'month' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDateRange('month')}
                className="text-xs px-3 py-1"
              >
                本月
              </Button>
            </div>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 border border-slate-600 rounded bg-slate-800 text-white text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* 统计概览 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <Card>
          <CardContent className="p-3 lg:p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs lg:text-sm text-slate-400">总检测次数</p>
                <p className="text-lg lg:text-2xl font-bold text-white">{stats.totalInspections}</p>
              </div>
              <Camera className="h-6 w-6 lg:h-8 lg:w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">合格次数</p>
                <p className="text-2xl font-bold text-green-500">{stats.qualifiedCount}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">存疑次数</p>
                <p className="text-2xl font-bold text-red-500">{stats.unqualifiedCount}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">合格率</p>
                <p className="text-2xl font-bold text-blue-500">{stats.qualifiedRate.toFixed(1)}%</p>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 详细统计 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PPE物品检测统计 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              PPE物品检测统计
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">洁净帽检测</span>
                <Badge variant="outline" className="text-blue-500">
                  {stats.ppeDetections.cleanroom_cap} 次
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">口罩检测</span>
                <Badge variant="outline" className="text-green-500">
                  {stats.ppeDetections.mask} 次
                </Badge>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">人员检测</span>
                <Badge variant="outline" className="text-orange-500">
                  {stats.ppeDetections.person} 次
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 趋势图表 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              合格率趋势
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {trendData.map((data) => (
                <div key={data.date} className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">
                    {new Date(data.date).toLocaleDateString('zh-CN', { 
                      month: 'short', 
                      day: 'numeric' 
                    })}
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 bg-slate-700 rounded-full h-2">
                      <div 
                        className="bg-blue-500 h-2 rounded-full transition-all"
                        style={{ width: `${data.qualifiedRate}%` }}
                      />
                    </div>
                    <span className="text-sm text-white w-12 text-right">
                      {data.qualifiedRate.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 检测结果列表 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            检测结果详情
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {cleanroomResults
              .filter(result => result.timestamp.startsWith(selectedDate))
              .map((result) => (
                <div key={result.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Badge 
                                      variant={result.overallQuality === '合格' ? 'default' :
                  result.overallQuality === '存疑' ? 'destructive' : 'secondary'}
              >
                {result.overallQuality}
                    </Badge>
                    <div>
                      <p className="text-sm text-white">
                        {new Date(result.timestamp).toLocaleString('zh-CN')}
                      </p>
                      <p className="text-xs text-slate-400">{result.reason}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-white">得分: {result.score}</p>
                    <p className="text-xs text-slate-400">ID: {result.id.slice(0, 8)}</p>
                  </div>
                </div>
              ))}
            {cleanroomResults.filter(result => result.timestamp.startsWith(selectedDate)).length === 0 && (
              <div className="text-center py-8 text-slate-400">
                暂无检测结果
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 调试信息 - 已注释 */}
      {/* <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            调试信息
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <p className="text-slate-400">总检测结果数量: {results.length}</p>
            <p className="text-slate-400">PPE结果数量: {cleanroomResults.length}</p>
            <p className="text-slate-400">选中日期: {selectedDate}</p>
            <p className="text-slate-400">当日结果数量: {cleanroomResults.filter(result => result.timestamp.startsWith(selectedDate)).length}</p>
            
            <div className="mt-4 p-3 bg-blue-900/20 border border-blue-500/30 rounded">
              <p className="text-blue-300 font-medium mb-2">PPE检测结果筛选条件:</p>
              <ul className="text-blue-200 text-xs space-y-1">
                <li>• detectionType = 'cleanroom_ppe'</li>
                <li>• 原因包含: 洁净帽、口罩、洁净服、洁净用品、PPE、防护装备、灌缝帽</li>
                <li>• 原因关键词包含: 洁净帽、口罩、洁净服、PPE、洁净用品</li>
                <li>• 有PPE相关字段: ppeDetections 或 ppeCompliance</li>
                <li>• 没有standardId且原因包含洁净用品关键词</li>
              </ul>
            </div>
            
            {results.length > 0 && (
              <div className="mt-4">
                <p className="text-slate-400 mb-2">所有检测结果示例:</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {results.slice(0, 5).map((result) => (
                    <div key={result.id} className="p-2 bg-slate-800/30 rounded text-xs">
                      <p className="text-white">ID: {result.id.slice(0, 8)}</p>
                      <p className="text-slate-300">时间: {new Date(result.timestamp).toLocaleString('zh-CN')}</p>
                      <p className="text-slate-300">状态: {result.overallQuality}</p>
                      <p className="text-slate-300">原因: {result.reason}</p>
                      <p className="text-slate-300">标准ID: {result.standardId ? '有' : '无'}</p>
                      <p className="text-slate-300">检测类型: {result.detectionType || '未知'}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {cleanroomResults.length === 0 && results.length > 0 && (
              <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-500/30 rounded">
                <p className="text-yellow-300 font-medium mb-2">提示:</p>
                <p className="text-yellow-200 text-xs">
                  当前没有识别到PPE检测结果。这可能是因为：
                </p>
                <ul className="text-yellow-200 text-xs mt-1 space-y-1">
                  <li>• 所有记录都有标准ID（标准检测结果）</li>
                  <li>• 记录的原因不包含洁净用品相关关键词</li>
                  <li>• 记录缺少PPE相关字段</li>
                </ul>
                <p className="text-yellow-200 text-xs mt-2">
                  请检查上方的"所有检测结果示例"来了解具体原因。
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card> */}

      {/* 报告发送对话框 */}
      {showReportDialog && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-700">
            <CardHeader className="bg-slate-800 border-b border-slate-700">
              <CardTitle className="flex items-center gap-2 text-white">
                <Send className="h-5 w-5" />
                发送报告到健康系统
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 bg-slate-900">
              {/* 报告预览 */}
              <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                <h3 className="font-semibold mb-3 text-white">报告预览</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-slate-300">总检测次数:</span>
                    <span className="ml-2 font-medium text-white">{getReportStats().totalInspections}</span>
                  </div>
                  <div>
                    <span className="text-slate-300">通过次数:</span>
                    <span className="ml-2 font-medium text-green-400">{getReportStats().qualifiedCount}</span>
                  </div>
                  <div>
                    <span className="text-slate-300">存疑次数:</span>
                    <span className="ml-2 font-medium text-red-400">{getReportStats().unqualifiedCount}</span>
                  </div>
                  <div>
                    <span className="text-slate-300">合格率:</span>
                    <span className="ml-2 font-medium text-blue-400">{getReportStats().qualifiedRate.toFixed(1)}%</span>
                  </div>
                </div>
                {/* 调试信息 - 已注释 */}
                {/* <div className="mt-3 p-2 bg-slate-700 rounded text-xs border border-slate-600">
                  <p className="text-yellow-400">调试信息:</p>
                  <p className="text-slate-300">时间范围: {reportData.startTime} 至 {reportData.endTime}</p>
                  <p className="text-slate-300">PPE结果总数: {cleanroomResults.length}</p>
                  <p className="text-slate-300">所有结果总数: {results.length}</p>
                  <p className="text-slate-300">通过次数 = 合格次数 + 需复检次数</p>
                  <p className="text-slate-300">请查看浏览器控制台获取详细统计信息</p>
                </div> */}
              </div>

              {/* 健康系统状态 */}
              <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-white flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    健康系统状态
                  </h3>
                  <Button
                    onClick={() => setShowHealthSystemConfig(true)}
                    size="sm"
                    variant="outline"
                    className="border-slate-600 text-slate-300 hover:bg-slate-700"
                  >
                    配置
                  </Button>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${healthSystemStatus.connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    <span className="text-slate-300">连接状态:</span>
                    <span className={`font-medium ${healthSystemStatus.connected ? 'text-green-400' : 'text-red-400'}`}>
                      {healthSystemStatus.connected ? '已连接' : '未连接'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-300">状态信息:</span>
                    <span className="ml-2 text-white">{healthSystemStatus.message || '未知'}</span>
                  </div>
                  {healthSystemStatus.lastChecked && (
                    <div>
                      <span className="text-slate-300">最后检查:</span>
                      <span className="ml-2 text-white">
                        {new Date(healthSystemStatus.lastChecked).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* 表单字段 - 行内编辑 */}
              <div className="space-y-6">
                {/* 检查开始时间 */}
                <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    <Clock className="inline h-4 w-4 mr-1" />
                    检查开始时间
                  </label>
                  {editingField === 'startTime' ? (
                    <div className="flex gap-2">
                      <input
                        type="datetime-local"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                      <Button
                        onClick={saveEdit}
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                      >
                        ✓
                      </Button>
                      <Button
                        onClick={cancelEdit}
                        size="sm"
                        variant="outline"
                        className="border-slate-600 text-slate-300 hover:bg-slate-700"
                      >
                        ✕
                      </Button>
                    </div>
                  ) : (
                    <div
                      onClick={() => startEdit('startTime', reportData.startTime)}
                      className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white cursor-pointer hover:bg-slate-600 transition-colors"
                    >
                      {formatTimeDisplay(reportData.startTime)}
                    </div>
                  )}
                </div>

                {/* 检查结束时间 */}
                <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    <Clock className="inline h-4 w-4 mr-1" />
                    检查结束时间
                  </label>
                  {editingField === 'endTime' ? (
                    <div className="flex gap-2">
                      <input
                        type="datetime-local"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                      <Button
                        onClick={saveEdit}
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                      >
                        ✓
                      </Button>
                      <Button
                        onClick={cancelEdit}
                        size="sm"
                        variant="outline"
                        className="border-slate-600 text-slate-300 hover:bg-slate-700"
                      >
                        ✕
                      </Button>
                    </div>
                  ) : (
                    <div
                      onClick={() => startEdit('endTime', reportData.endTime)}
                      className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white cursor-pointer hover:bg-slate-600 transition-colors"
                    >
                      {formatTimeDisplay(reportData.endTime)}
                    </div>
                  )}
                </div>

                {/* 检查地点 */}
                <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    <MapPin className="inline h-4 w-4 mr-1" />
                    检查地点 <span className="text-red-400">*</span>
                  </label>
                  {editingField === 'location' ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        placeholder="请输入检查地点，如：洁净室A区、生产车间等"
                        className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                      <Button
                        onClick={saveEdit}
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                      >
                        ✓
                      </Button>
                      <Button
                        onClick={cancelEdit}
                        size="sm"
                        variant="outline"
                        className="border-slate-600 text-slate-300 hover:bg-slate-700"
                      >
                        ✕
                      </Button>
                    </div>
                  ) : (
                    <div
                      onClick={() => startEdit('location', reportData.location)}
                      className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white cursor-pointer hover:bg-slate-600 transition-colors"
                    >
                      {reportData.location || '点击设置检查地点'}
                    </div>
                  )}
                </div>

                {/* 报告描述 */}
                <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    <FileText className="inline h-4 w-4 mr-1" />
                    报告描述
                  </label>
                  {editingField === 'description' ? (
                    <div className="flex gap-2">
                      <textarea
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        placeholder="请输入报告描述信息"
                        rows={3}
                        className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                      <div className="flex flex-col gap-2">
                        <Button
                          onClick={saveEdit}
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                        >
                          ✓
                        </Button>
                        <Button
                          onClick={cancelEdit}
                          size="sm"
                          variant="outline"
                          className="border-slate-600 text-slate-300 hover:bg-slate-700"
                        >
                          ✕
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => startEdit('description', reportData.description)}
                      className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white cursor-pointer hover:bg-slate-600 transition-colors min-h-[60px]"
                    >
                      {reportData.description || '点击设置报告描述'}
                    </div>
                  )}
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
                <Button
                  variant="outline"
                  onClick={() => setShowReportDialog(false)}
                  disabled={isSendingReport}
                  className="border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  取消
                </Button>
                <Button
                  onClick={() => sendReportToHealthSystem()}
                  disabled={isSendingReport || !reportData.location.trim()}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isSendingReport ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      发送中...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      发送报告
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 挂起报告列表对话框 */}
      {showPendingReports && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-700">
            <CardHeader className="bg-slate-800 border-b border-slate-700">
              <CardTitle className="flex items-center gap-2 text-white">
                <AlertCircle className="h-5 w-5" />
                挂起报告列表 ({pendingReports.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 bg-slate-900">
              {pendingReports.length === 0 ? (
                <div className="text-center py-8 text-slate-300">
                  <AlertCircle className="h-12 w-12 mx-auto mb-4 text-slate-500" />
                  <p>暂无挂起的报告</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingReports.map((report) => (
                    <div key={report.id} className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="font-semibold text-white">
                            报告ID: {report.id}
                          </h3>
                          <p className="text-sm text-slate-300">
                            地点: {report.reportData.reportInfo?.location || '未设置'}
                          </p>
                          <p className="text-sm text-slate-300">
                            时间范围: {report.reportData.reportInfo?.startTime} 至 {report.reportData.reportInfo?.endTime}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-slate-300">
                            重试次数: {report.retryCount}
                          </p>
                          <p className="text-sm text-slate-300">
                            最后尝试: {new Date(report.lastAttempt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      
                      <div className="mb-3">
                        <p className="text-sm text-slate-300 mb-1">错误信息:</p>
                        <p className="text-sm text-red-400 bg-slate-700 p-2 rounded">
                          {report.error}
                        </p>
                      </div>
                      
                      <div className="mb-3">
                        <p className="text-sm text-slate-300 mb-1">统计信息:</p>
                        <div className="grid grid-cols-4 gap-2 text-sm">
                          <div className="bg-slate-700 p-2 rounded">
                            <span className="text-slate-300">总数:</span>
                            <span className="ml-1 text-white">{report.reportData.statistics?.totalInspections || 0}</span>
                          </div>
                          <div className="bg-slate-700 p-2 rounded">
                            <span className="text-slate-300">通过:</span>
                            <span className="ml-1 text-green-400">{report.reportData.statistics?.qualifiedCount || 0}</span>
                          </div>
                          <div className="bg-slate-700 p-2 rounded">
                            <span className="text-slate-300">存疑:</span>
                            <span className="ml-1 text-red-400">{report.reportData.statistics?.unqualifiedCount || 0}</span>
                          </div>
                          <div className="bg-slate-700 p-2 rounded">
                            <span className="text-slate-300">合格率:</span>
                            <span className="ml-1 text-blue-400">{report.reportData.statistics?.qualifiedRate?.toFixed(1) || 0}%</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <Button
                          onClick={() => retryPendingReport(report)}
                          size="sm"
                          className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          <RefreshCw className="mr-2 h-4 w-4" />
                          重试发送
                        </Button>
                        <Button
                          onClick={() => deletePendingReport(report.id)}
                          size="sm"
                          variant="outline"
                          className="border-red-600 text-red-400 hover:bg-red-600 hover:text-white"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          删除
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              <div className="flex justify-end pt-4 border-t border-slate-700">
                <Button
                  onClick={() => setShowPendingReports(false)}
                  variant="outline"
                  className="border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  关闭
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 健康系统配置对话框 */}
      {showHealthSystemConfig && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-700">
            <CardHeader className="bg-slate-800 border-b border-slate-700">
              <CardTitle className="flex items-center gap-2 text-white">
                <Shield className="h-5 w-5" />
                健康系统配置
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 bg-slate-900">
              {/* 当前状态 */}
              <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                <h3 className="font-semibold mb-3 text-white">当前状态</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${healthSystemStatus.connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    <span className="text-slate-300">连接状态:</span>
                    <span className={`font-medium ${healthSystemStatus.connected ? 'text-green-400' : 'text-red-400'}`}>
                      {healthSystemStatus.connected ? '已连接' : '未连接'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-300">状态信息:</span>
                    <span className="ml-2 text-white">{healthSystemStatus.message || '未知'}</span>
                  </div>
                </div>
              </div>

              {/* 配置选项 */}
              <div className="space-y-4">
                <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                  <h3 className="font-semibold mb-3 text-white">配置选项</h3>
                  
                  {/* 自动发现 */}
                  <div className="space-y-3">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="configMode"
                        checked={healthSystemConfig.useAutoDiscovery}
                        onChange={() => setHealthSystemConfig(prev => ({
                          ...prev,
                          useAutoDiscovery: true,
                          useManualConfig: false
                        }))}
                        className="text-blue-600"
                      />
                      <span className="text-white">自动发现健康系统</span>
                    </label>
                    <p className="text-slate-400 text-sm ml-6">
                      系统会自动扫描局域网中的健康系统（端口4003）
                    </p>
                  </div>

                  {/* 手动配置 */}
                  <div className="space-y-3 mt-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="configMode"
                        checked={healthSystemConfig.useManualConfig}
                        onChange={() => setHealthSystemConfig(prev => ({
                          ...prev,
                          useAutoDiscovery: false,
                          useManualConfig: true
                        }))}
                        className="text-blue-600"
                      />
                      <span className="text-white">手动配置IP地址</span>
                    </label>
                    
                    {healthSystemConfig.useManualConfig && (
                      <div className="ml-6 space-y-3">
                        <div>
                          <label className="block text-sm text-slate-300 mb-1">IP地址</label>
                          <input
                            type="text"
                            value={healthSystemConfig.ipAddress}
                            onChange={(e) => setHealthSystemConfig(prev => ({
                              ...prev,
                              ipAddress: e.target.value
                            }))}
                            placeholder="例如: 192.168.1.100"
                            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-slate-300 mb-1">端口</label>
                          <input
                            type="text"
                            value={healthSystemConfig.port}
                            onChange={(e) => setHealthSystemConfig(prev => ({
                              ...prev,
                              port: e.target.value
                            }))}
                            placeholder="4003"
                            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="flex gap-3">
                  <Button
                    onClick={scanHealthSystem}
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700"
                    disabled={!healthSystemConfig.useAutoDiscovery}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    扫描网络
                  </Button>
                  
                  {healthSystemConfig.useManualConfig && healthSystemConfig.ipAddress && (
                    <Button
                      onClick={() => testHealthSystemConnection(healthSystemConfig.ipAddress, healthSystemConfig.port)}
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle className="mr-2 h-4 w-4" />
                      测试连接
                    </Button>
                  )}
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
                <Button
                  onClick={() => setShowHealthSystemConfig(false)}
                  variant="outline"
                  className="border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  取消
                </Button>
                <Button
                  onClick={saveHealthSystemConfig}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Shield className="mr-2 h-4 w-4" />
                  保存配置
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default CleanroomInspectionResultsScreen;


