import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  Loader2,
  Maximize,
  Minimize,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ServerCog,
  Settings2,
  Square,
  Trash2,
  Upload,
  Video,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { StreamPlayer } from '@/lib/streamPlayer';
import { HLSPlayer } from '@/lib/hlsPlayer';
import { getHLSPlaylistUrl } from '@/api/streamApi';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Switch } from '@/components/ui/Switch';
import { Badge } from '@/components/ui/Badge';
import {
  createStreamSource,
  deleteStreamSource,
  getStreamFrame,
  getStreamManagerStatus,
  getStreamSource,
  getStreamSources,
  getStreamStatus,
  restartAllStreams,
  startHLSStream,
  startStream,
  stopAllStreams,
  stopHLSStream,
  stopStream,
  updateStreamSource,
  uploadStreamVideo,
} from '@/api/streamApi';
import type {
  PlayMode,
  StreamManagerStatus,
  StreamRuntimeStatus,
  StreamSource,
  StreamSourceCreate,
  StreamStatus,
  StreamType,
} from '@/types/stream';

type StatusFilter = 'all' | StreamStatus;
type FormMode = 'create' | 'edit';

interface HlsOptionsState {
  fps: number;
  width: number;
  height: number;
  crf: number;
  preset: 'ultrafast' | 'veryfast' | 'faster' | 'fast' | 'medium';
  threads: number;
}

const STREAM_TYPES: Array<{ value: StreamType; label: string; hint: string }> = [
  { value: 'rtsp', label: 'RTSP', hint: '网络摄像头、NVR、IPC' },
  { value: 'rtmp', label: 'RTMP', hint: '推流服务、直播源' },
  { value: 'http', label: 'HTTP', hint: 'MJPEG、HTTP 视频地址' },
  { value: 'hls', label: 'HLS', hint: 'm3u8 播放地址' },
  { value: 'file', label: '本地文件', hint: '本地视频文件路径' },
];

const PLAY_MODES: Array<{ value: PlayMode; label: string; hint: string }> = [
  { value: 'jpg', label: 'JPG 低延迟', hint: '推荐默认模式，适合检测和预览' },
  { value: 'ffmpeg', label: 'FFmpeg / HLS', hint: '适合高画质播放或兼容性排查' },
];

const EMPTY_FORM: StreamSourceCreate = {
  name: '',
  url: '',
  stream_type: 'rtsp',
  play_mode: 'jpg',
  enabled: true,
  auto_reconnect: true,
  reconnect_interval: 5,
  username: '',
  password: '',
};

const DEFAULT_HLS_OPTIONS: HlsOptionsState = {
  fps: 15,
  width: 0,
  height: 0,
  crf: 26,
  preset: 'ultrafast',
  threads: 0,
};

const STATUS_META: Record<StreamStatus, { label: string; className: string; icon: React.ReactNode }> = {
  active: {
    label: '运行中',
    className: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
  },
  connecting: {
    label: '连接中',
    className: 'bg-sky-500/15 text-sky-300 border border-sky-500/30',
    icon: <Loader2 className="h-4 w-4 animate-spin text-sky-400" />,
  },
  error: {
    label: '异常',
    className: 'bg-rose-500/15 text-rose-300 border border-rose-500/30',
    icon: <AlertCircle className="h-4 w-4 text-rose-400" />,
  },
  inactive: {
    label: '未运行',
    className: 'bg-slate-500/15 text-slate-300 border border-slate-500/30',
    icon: <PauseCircle className="h-4 w-4 text-slate-400" />,
  },
};

const formatTime = (value?: string) => {
  if (!value) {
    return '暂无';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const clampNumber = (value: number, fallback: number, min: number, max: number) => {
  if (Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
};

const StreamSettingsScreen: React.FC = () => {
  const [streams, setStreams] = useState<StreamSource[]>([]);
  const [managerStatus, setManagerStatus] = useState<StreamManagerStatus | null>(null);
  const [selectedStreamId, setSelectedStreamId] = useState<string | null>(null);
  const [selectedStreamDetail, setSelectedStreamDetail] = useState<StreamSource | null>(null);
  const [selectedRuntimeStatus, setSelectedRuntimeStatus] = useState<StreamRuntimeStatus | null>(null);
  const [previewFrame, setPreviewFrame] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [enabledOnly, setEnabledOnly] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>('create');
  const [formData, setFormData] = useState<StreamSourceCreate>(EMPTY_FORM);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loadingPage, setLoadingPage] = useState(true);
  const [submittingForm, setSubmittingForm] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [hlsOptions, setHlsOptions] = useState<HlsOptionsState>(DEFAULT_HLS_OPTIONS);

  const [isLivePreview, setIsLivePreview] = useState(false);
  const [previewTransport, setPreviewTransport] = useState<'hls' | 'mjpeg' | 'frame'>('mjpeg');
  const videoRef = useRef<HTMLVideoElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const hlsPlayerRef = useRef<HLSPlayer | null>(null);
  const streamPlayerRef = useRef<StreamPlayer | null>(null);
  const previewBroadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const previewWindowIdRef = useRef(`stream-settings-preview-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [isFullscreenPreview, setIsFullscreenPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedStream = useMemo(() => {
    if (!selectedStreamId) {
      return null;
    }
    return streams.find((stream) => stream.id === selectedStreamId) ?? selectedStreamDetail;
  }, [selectedStreamDetail, selectedStreamId, streams]);

  const filteredStreams = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return streams.filter((stream) => {
      const matchesKeyword =
        !keyword ||
        stream.name.toLowerCase().includes(keyword) ||
        (stream.display_url || '').toLowerCase().includes(keyword);
      const matchesStatus = statusFilter === 'all' || stream.status === statusFilter;
      const matchesEnabled = !enabledOnly || !!stream.enabled;
      return matchesKeyword && matchesStatus && matchesEnabled;
    });
  }, [enabledOnly, search, statusFilter, streams]);

  const stats = useMemo(() => {
    const active = streams.filter((stream) => stream.status === 'active').length;
    const connecting = streams.filter((stream) => stream.status === 'connecting').length;
    const error = streams.filter((stream) => stream.status === 'error').length;
    const enabled = streams.filter((stream) => stream.enabled).length;

    return {
      total: streams.length,
      active,
      connecting,
      error,
      enabled,
    };
  }, [streams]);

  const loadStreams = async (preserveSelection = true) => {
    const data = await getStreamSources();
    setStreams(data);

    if (data.length === 0) {
      setSelectedStreamId(null);
      setSelectedStreamDetail(null);
      setSelectedRuntimeStatus(null);
      setPreviewFrame(null);
      return;
    }

    if (preserveSelection && selectedStreamId && data.some((stream) => stream.id === selectedStreamId)) {
      return;
    }

    setSelectedStreamId(data[0].id);
  };

  const loadManagerStatus = async () => {
    const data = await getStreamManagerStatus();
    setManagerStatus(data);

    if (selectedStreamId && data.streams[selectedStreamId]) {
      setSelectedRuntimeStatus(data.streams[selectedStreamId]);
    }
  };

  const loadSelectedStreamDetail = async (streamId: string) => {
    setDetailLoading(true);
    try {
      const [detail, statusResponse] = await Promise.all([
        getStreamSource(streamId),
        getStreamStatus(streamId),
      ]);
      setSelectedStreamDetail(detail);
      setSelectedRuntimeStatus(statusResponse.runtime_status);
    } catch (error) {
      console.error('加载流详情失败:', error);

      if (error instanceof Error && error.message.includes('未找到')) {
        const fallbackStream = streams[0] ?? null;
        setSelectedStreamDetail(null);
        setSelectedRuntimeStatus(null);
        setPreviewFrame(null);

        if (!fallbackStream) {
          setSelectedStreamId(null);
        } else if (fallbackStream.id !== streamId) {
          setSelectedStreamId(fallbackStream.id);
        }
        return;
      }

      toast.error(error instanceof Error ? error.message : '加载流详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshAll = async (preserveSelection = true) => {
    try {
      await Promise.all([loadStreams(preserveSelection), loadManagerStatus()]);
    } catch (error) {
      console.error('刷新流媒体数据失败:', error);
      toast.error(error instanceof Error ? error.message : '刷新流媒体数据失败');
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      setLoadingPage(true);
      await refreshAll(false);
      setLoadingPage(false);
    };

    bootstrap();
  }, []);

  useEffect(() => {
    if (!selectedStreamId) {
      return;
    }
    loadSelectedStreamDetail(selectedStreamId);
  }, [selectedStreamId]);

  useEffect(() => {
    if (!autoRefresh) {
      return;
    }

    const timer = window.setInterval(() => {
      refreshAll(true);
    }, 10000);

    return () => window.clearInterval(timer);
  }, [autoRefresh, selectedStreamId]);

  // 管理预览播放器
  const stopLivePreview = useCallback(() => {
    if (hlsPlayerRef.current) {
      hlsPlayerRef.current.destroy();
      hlsPlayerRef.current = null;
    }
    if (streamPlayerRef.current) {
      streamPlayerRef.current.destroy();
      streamPlayerRef.current = null;
    }
    if (previewBroadcastChannelRef.current) {
      previewBroadcastChannelRef.current.close();
      previewBroadcastChannelRef.current = null;
    }
    if (imgRef.current) {
      imgRef.current.src = '';
    }
    setPreviewTransport('mjpeg');
    setIsLivePreview(false);
  }, []);

  const startLivePreview = async () => {
    if (!selectedStreamId) return;

    // 先停止旧的
    stopLivePreview();

    const mode = selectedStream?.play_mode || 'jpg';
    console.log(`[StreamSettings] 启动实时预览: ${selectedStreamId}, 模式: ${mode}`);

    try {
      if (mode === 'ffmpeg') {
        if (!videoRef.current) return;
        setPreviewTransport('hls');
        const hlsUrl = getHLSPlaylistUrl(selectedStreamId);
        const player = new HLSPlayer({
          videoElement: videoRef.current,
          hlsUrl: hlsUrl,
          onError: (err) => {
            console.error('HLS 预览失败:', err);
            toast.error('HLS 预览连接失败');
            setIsLivePreview(false);
          }
        });
        await player.start();
        hlsPlayerRef.current = player;
        setIsLivePreview(true);
      } else {
        // JPG 模式：通过同源 SPA 代理拉 MJPEG，避免 HTTPS 页面跨端口直连失败。
        if (!imgRef.current) return;
        setPreviewTransport('mjpeg');
        try {
          const channel = new BroadcastChannel(`stream_${selectedStreamId}`);
          previewBroadcastChannelRef.current = channel;
          channel.onmessage = (event) => {
            const { type, windowId } = event.data || {};
            if (type !== 'REQUEST_STREAM' || windowId === previewWindowIdRef.current) return;
            console.log(`[StreamSettings] 流 ${selectedStreamId} 被窗口 ${windowId} 接管，停止设置页预览`);
            stopLivePreview();
          };
          channel.postMessage({
            type: 'REQUEST_STREAM',
            windowId: previewWindowIdRef.current,
            streamId: selectedStreamId,
            timestamp: Date.now(),
          });
        } catch (broadcastError) {
          console.warn('[StreamSettings] BroadcastChannel 不可用，预览互斥功能关闭', broadcastError);
        }
        const mjpegUrl = `${window.location.origin}/api/streams/${selectedStreamId}/mjpeg/?quality=80&width=960&fps=12`;
        console.log(`[StreamSettings] MJPEG 预览: ${mjpegUrl}`);

        try {
          await new Promise<void>((resolve, reject) => {
            const timeout = window.setTimeout(() => {
              reject(new Error('MJPEG 流连接超时'));
            }, 10000);

            const img = imgRef.current!;
            img.onload = () => {
              window.clearTimeout(timeout);
              resolve();
            };
            img.onerror = () => {
              window.clearTimeout(timeout);
              reject(new Error('MJPEG 流连接失败'));
            };
            img.src = mjpegUrl;
          });

          setIsLivePreview(true);
        } catch (mjpegError) {
          console.warn('[StreamSettings] MJPEG 预览失败，回退到 /frame/ 轮询', mjpegError);
          if (imgRef.current) {
            imgRef.current.src = '';
          }
          setPreviewTransport('frame');
          setIsLivePreview(true);
          await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
          if (!videoRef.current) {
            throw mjpegError;
          }
          const player = new StreamPlayer({
            videoElement: videoRef.current,
            streamId: selectedStreamId,
            fps: 10,
            quality: 90,
            targetWidth: 1280,
            windowId: 'stream-settings-preview',
            onError: (err) => {
              console.error('帧轮询预览失败:', err);
              toast.error('实时预览连接失败');
              streamPlayerRef.current?.destroy();
              streamPlayerRef.current = null;
              setIsLivePreview(false);
            },
          });
          streamPlayerRef.current = player;
          await player.start();
          setIsLivePreview(true);
          toast('MJPEG 透传不可用，已自动切到兼容预览', { icon: '⚠️' });
        }
      }
    } catch (error) {
      console.error('启动预览失败:', error);
      toast.error('无法开启实时预览');
      setIsLivePreview(false);
    }
  };

  // 切换流时停止预览
  useEffect(() => {
    stopLivePreview();
  }, [selectedStreamId, selectedStream?.play_mode, stopLivePreview]);

  useEffect(() => {
    if (isLivePreview && selectedStream && selectedStream.status !== 'active') {
      stopLivePreview();
    }
  }, [isLivePreview, selectedStream, stopLivePreview]);

  // 组件卸载清理
  useEffect(() => {
    return () => stopLivePreview();
  }, []);

  const toggleFullscreenPreview = () => {
    if (!previewContainerRef.current) return;

    if (!document.fullscreenElement) {
      previewContainerRef.current.requestFullscreen().catch((err) => {
        toast.error(`无法进入全屏: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreenPreview(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setFormMode('create');
    setShowPassword(false);
  };

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = async (streamId: string) => {
    setActionKey(`edit-${streamId}`);
    try {
      const detail = await getStreamSource(streamId);
      setFormMode('edit');
      setFormData({
        name: detail.name,
        url: detail.url,
        stream_type: detail.stream_type,
        play_mode: detail.play_mode,
        enabled: detail.enabled,
        auto_reconnect: detail.auto_reconnect,
        reconnect_interval: detail.reconnect_interval,
        username: detail.username || '',
        password: '',
      });
      setSelectedStreamDetail(detail);
      setSelectedStreamId(streamId);
      setShowForm(true);
    } catch (error) {
      console.error('加载编辑数据失败:', error);
      toast.error('加载编辑数据失败');
    } finally {
      setActionKey(null);
    }
  };

  const handleSubmitForm = async () => {
    if (!formData.name.trim() || !formData.url.trim()) {
      toast.error('名称和流地址不能为空');
      return;
    }

    setSubmittingForm(true);
    try {
      if (formMode === 'create') {
        const created = await createStreamSource({
          ...formData,
          name: formData.name.trim(),
          url: formData.url.trim(),
        });
        toast.success('流媒体已创建');
        setSelectedStreamId(created.id);
      } else if (selectedStreamId) {
        await updateStreamSource(selectedStreamId, {
          ...formData,
          name: formData.name.trim(),
          url: formData.url.trim(),
        });
        toast.success('流媒体已更新');
      }

      setShowForm(false);
      resetForm();
      await refreshAll(true);
      if (selectedStreamId) {
        await loadSelectedStreamDetail(selectedStreamId);
      }
    } catch (error) {
      console.error('保存流媒体失败:', error);
      toast.error(error instanceof Error ? error.message : '保存流媒体失败');
    } finally {
      setSubmittingForm(false);
    }
  };

  const handleSelectVideoFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setUploadingVideo(true);
    try {
      const result = await uploadStreamVideo(file);
      setFormData((current) => ({
        ...current,
        stream_type: 'file',
        url: result.file_path,
        name: current.name.trim() ? current.name : file.name.replace(/\.[^.]+$/, ''),
      }));
      toast.success(`视频文件已上传: ${result.file_name}`);
    } catch (error) {
      console.error('上传视频文件失败:', error);
      toast.error(error instanceof Error ? error.message : '上传视频文件失败');
    } finally {
      setUploadingVideo(false);
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  const handleDelete = async (stream: StreamSource) => {
    if (!window.confirm(`确定删除流媒体“${stream.name}”吗？`)) {
      return;
    }

    setActionKey(`delete-${stream.id}`);
    try {
      await deleteStreamSource(stream.id);
      toast.success('流媒体已删除');
      if (selectedStreamId === stream.id) {
        setSelectedStreamId(null);
        setSelectedStreamDetail(null);
        setSelectedRuntimeStatus(null);
        setPreviewFrame(null);
      }
      await refreshAll(false);
    } catch (error) {
      console.error('删除流媒体失败:', error);
      toast.error('删除流媒体失败');
    } finally {
      setActionKey(null);
    }
  };

  const handleSingleAction = async (
    key: string,
    action: () => Promise<unknown>,
    successMessage: string,
    streamId?: string
  ) => {
    setActionKey(key);
    try {
      await action();
      toast.success(successMessage);
      await refreshAll(true);
      if (streamId) {
        await loadSelectedStreamDetail(streamId);
      }
    } catch (error) {
      console.error(`${successMessage}失败:`, error);
      toast.error(error instanceof Error ? error.message : `${successMessage}失败`);
    } finally {
      setActionKey(null);
    }
  };

  const handlePreview = async (streamId: string) => {
    setPreviewLoading(true);
    try {
      const frame = await getStreamFrame(streamId, 90, 1280);
      setPreviewFrame(frame.frame);
      toast.success('预览已更新');
    } catch (error) {
      console.error('获取预览帧失败:', error);
      toast.error('获取预览帧失败');
    } finally {
      setPreviewLoading(false);
    }
  };

  const managerStreamsCount = managerStatus?.total_streams ?? 0;
  const runtimeStatus = selectedRuntimeStatus || (selectedStreamId ? managerStatus?.streams[selectedStreamId] ?? null : null);
  const selectedStatus = selectedStream?.status ?? 'inactive';
  const selectedMeta = STATUS_META[selectedStatus];

  return (
    <div className="min-h-full bg-[#020617] p-4 relative overflow-hidden">
      {/* 动态背景装饰 */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-500/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-500/10 blur-[120px] rounded-full pointer-events-none" />
      
      <div className="mx-auto max-w-7xl space-y-6 relative z-10">
        <section className="rounded-[24px] border border-white/10 bg-white/[0.02] p-5 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] backdrop-blur-md">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/30 px-3 py-1 text-xs font-semibold tracking-wider">STREAM CONTROL CENTER</Badge>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl lg:text-4xl bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-slate-500">
                  流媒体管理
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-slate-400 max-w-2xl">
                  统一配置流地址、启停状态、HLS 参数和实时预览。这里维护的流会出现在检测页面中，作为虚拟摄像头来源。
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button size="sm" variant="outline" onClick={() => refreshAll(true)} isLoading={loadingPage || actionKey === 'refresh-all'}>
                <RefreshCw className="h-4 w-4" />
                刷新数据
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleSingleAction('stop-all', stopAllStreams, '已停止全部流媒体')}>
                <Square className="h-4 w-4" />
                全部停止
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleSingleAction('restart-all', restartAllStreams, '已重启全部流媒体')}>
                <RotateCcw className="h-4 w-4" />
                全部重启
              </Button>
              <Button size="sm" onClick={openCreateForm}>
                <Plus className="h-4 w-4" />
                新建流媒体
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <StatsCard title="总流数" value={stats.total} hint="已登记配置" icon={<Video className="h-6 w-6" />} color="cyan" />
            <StatsCard title="启用中" value={stats.enabled} hint="允许被调用" icon={<Wifi className="h-6 w-6" />} color="emerald" />
            <StatsCard title="运行中" value={stats.active} hint="状态 active" icon={<PlayCircle className="h-6 w-6" />} color="blue" />
            <StatsCard title="连接中" value={stats.connecting} hint="等待画面建立" icon={<Clock3 className="h-6 w-6" />} color="amber" />
            <StatsCard title="管理器进程" value={managerStreamsCount} hint="运行时登记数" icon={<ServerCog className="h-6 w-6" />} color="purple" />
          </div>
        </section>

        <div className="space-y-4">
          <div className="space-y-6">
            <Card className="border-white/10 bg-white/[0.02] backdrop-blur-md shadow-2xl overflow-hidden rounded-[20px]">
              <CardHeader className="flex flex-col gap-4 lg:items-start lg:justify-between border-b border-white/5 pb-4">
                <div className="flex-shrink-0">
                  <CardTitle className="text-2xl font-bold text-white whitespace-nowrap">流列表</CardTitle>
                  <CardDescription className="text-slate-400">搜索、筛选并切换管理流媒体源。</CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="relative min-w-[200px] flex-1 sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="搜索名称或地址..."
                      className="h-10 border-white/10 bg-white/5 pl-10 text-white placeholder:text-slate-500 rounded-xl"
                    />
                  </div>
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                    className="h-10 rounded-xl border border-white/10 bg-slate-900 px-4 text-sm text-white outline-none transition-colors hover:bg-slate-800 flex-shrink-0"
                  >
                    <option value="all">全部状态</option>
                    <option value="active">运行中</option>
                    <option value="connecting">连接中</option>
                    <option value="error">异常</option>
                    <option value="inactive">未运行</option>
                  </select>
                  <div className="flex items-center gap-3 flex-wrap">
                    <label className="flex h-10 items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-slate-200 transition-colors hover:bg-white/10 cursor-pointer whitespace-nowrap min-w-max">
                      <Switch checked={enabledOnly} onCheckedChange={setEnabledOnly} />
                      <span className="flex-shrink-0 text-white">仅看启用</span>
                    </label>
                    <label className="flex h-10 items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-slate-200 transition-colors hover:bg-white/10 cursor-pointer whitespace-nowrap min-w-max">
                      <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
                      <span className="flex-shrink-0 text-white font-medium">10秒刷新</span>
                    </label>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingPage ? (
                  <div className="flex min-h-[220px] items-center justify-center text-slate-300">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    正在加载流媒体列表...
                  </div>
                ) : filteredStreams.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-slate-900/50 p-10 text-center text-slate-400">
                    没有匹配的流媒体源。
                  </div>
                ) : (
                  filteredStreams.map((stream) => {
                    const statusMeta = STATUS_META[stream.status];
                    const runtime = managerStatus?.streams[stream.id];
                    const selected = stream.id === selectedStreamId;

                    return (
                      <div
                        key={stream.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedStreamId(stream.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedStreamId(stream.id);
                          }
                        }}
                        className={`w-full cursor-pointer rounded-[18px] border p-4 text-left transition-all duration-300 backdrop-blur-sm ${
                          selected
                            ? 'border-cyan-500/50 bg-cyan-500/10 shadow-[0_0_20px_-5px_rgba(6,182,212,0.3)]'
                            : 'border-white/5 bg-white/[0.03] hover:border-white/10 hover:bg-white/[0.06] hover:translate-x-1'
                        }`}
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-lg font-medium text-white">{stream.name}</span>
                              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${statusMeta.className}`}>
                                {statusMeta.icon}
                                {statusMeta.label}
                              </span>
                              {!stream.enabled ? (
                                <Badge className="bg-slate-600/20 text-slate-300">已禁用</Badge>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                              <span>{STREAM_TYPES.find((item) => item.value === stream.stream_type)?.label || stream.stream_type}</span>
                              <span>•</span>
                              <span>{PLAY_MODES.find((item) => item.value === stream.play_mode)?.label || stream.play_mode}</span>
                              <span>•</span>
                              <span>最后连接 {formatTime(stream.last_connected_at)}</span>
                            </div>
                            <p className="truncate font-mono text-xs text-slate-400">{stream.display_url || '暂无地址'}</p>
                            {runtime?.error_message ? (
                              <p className="line-clamp-2 text-xs text-rose-300">运行时错误: {runtime.error_message}</p>
                            ) : null}
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleSingleAction(`start-${stream.id}`, () => startStream(stream.id), '流媒体已启动', stream.id);
                              }}
                              isLoading={actionKey === `start-${stream.id}`}
                              disabled={!stream.enabled}
                            >
                              <PlayCircle className="h-4 w-4" />
                              启动
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleSingleAction(`stop-${stream.id}`, () => stopStream(stream.id), '流媒体已停止', stream.id);
                              }}
                              isLoading={actionKey === `stop-${stream.id}`}
                            >
                              <Square className="h-4 w-4" />
                              停止
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(event) => {
                                event.stopPropagation();
                                openEditForm(stream.id);
                              }}
                              isLoading={actionKey === `edit-${stream.id}`}
                            >
                              <Settings2 className="h-4 w-4" />
                              编辑
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleDelete(stream);
                              }}
                              isLoading={actionKey === `delete-${stream.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                              删除
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            {showForm ? (
              <Card className="border-white/10 bg-white/[0.02] backdrop-blur-lg shadow-2xl rounded-[20px] overflow-hidden">
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-white">{formMode === 'create' ? '新建流媒体' : '编辑流媒体'}</CardTitle>
                    <CardDescription>基础信息、认证和重连策略统一在这里维护。</CardDescription>
                  </div>
                  <Button variant="ghost" onClick={() => setShowForm(false)}>
                    关闭
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <FieldBlock label="名称">
                      <Input
                        value={formData.name}
                        onChange={(event) => setFormData((current) => ({ ...current, name: event.target.value }))}
                        placeholder="例如：车间东侧 1 号机"
                      />
                    </FieldBlock>
                    <FieldBlock label="流类型">
                      <select
                        value={formData.stream_type}
                        onChange={(event) => setFormData((current) => ({ ...current, stream_type: event.target.value as StreamType }))}
                        className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                      >
                        {STREAM_TYPES.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label} | {item.hint}
                          </option>
                        ))}
                      </select>
                    </FieldBlock>
                  </div>

                  <FieldBlock label="流地址">
                    <div className="space-y-3">
                      <Input
                        value={formData.url}
                        onChange={(event) => setFormData((current) => ({ ...current, url: event.target.value }))}
                        placeholder="rtsp://192.168.1.100:554/stream 或 /Users/demo/video.mp4"
                        className="font-mono text-sm"
                      />
                      {formData.stream_type === 'file' ? (
                        <div className="flex flex-wrap items-center gap-3">
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,video/webm,.mp4,.mov,.avi,.mkv,.webm,.m4v"
                            className="hidden"
                            onChange={handleSelectVideoFile}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => fileInputRef.current?.click()}
                            isLoading={uploadingVideo}
                          >
                            <Upload className="h-4 w-4" />
                            从文件夹选择视频文件
                          </Button>
                          <p className="text-xs text-slate-400">
                            选择后会先上传到服务器，再自动填入可用的视频文件路径。
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </FieldBlock>

                  <div className="grid gap-4 md:grid-cols-2">
                    <FieldBlock label="播放模式">
                      <select
                        value={formData.play_mode}
                        onChange={(event) => setFormData((current) => ({ ...current, play_mode: event.target.value as PlayMode }))}
                        className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                      >
                        {PLAY_MODES.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label} | {item.hint}
                          </option>
                        ))}
                      </select>
                    </FieldBlock>
                    <FieldBlock label="重连间隔（秒）">
                      <Input
                        type="number"
                        min={1}
                        max={60}
                        value={formData.reconnect_interval}
                        onChange={(event) =>
                          setFormData((current) => ({
                            ...current,
                            reconnect_interval: clampNumber(parseInt(event.target.value, 10), 5, 1, 60),
                          }))
                        }
                      />
                    </FieldBlock>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <FieldBlock label="用户名">
                      <Input
                        value={formData.username || ''}
                        onChange={(event) => setFormData((current) => ({ ...current, username: event.target.value }))}
                        placeholder="可选"
                      />
                    </FieldBlock>
                    <FieldBlock label="密码">
                      <div className="flex gap-2">
                        <Input
                          type={showPassword ? 'text' : 'password'}
                          value={formData.password || ''}
                          onChange={(event) => setFormData((current) => ({ ...current, password: event.target.value }))}
                          placeholder={formMode === 'edit' ? '留空则保持原密码' : '可选'}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => setShowPassword((current) => !current)}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </FieldBlock>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.05]">
                      <div>
                        <p className="text-sm font-semibold text-white">启用此流</p>
                        <p className="text-xs text-slate-400 mt-0.5">允许被检测页面调用</p>
                      </div>
                      <Switch
                        checked={formData.enabled}
                        onCheckedChange={(checked) => setFormData((current) => ({ ...current, enabled: checked }))}
                      />
                    </label>
                    <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.05]">
                      <div>
                        <p className="text-sm font-semibold text-white">自动重连</p>
                        <p className="text-xs text-slate-400 mt-0.5">流断开时自动重试</p>
                      </div>
                      <Switch
                        checked={formData.auto_reconnect}
                        onCheckedChange={(checked) => setFormData((current) => ({ ...current, auto_reconnect: checked }))}
                      />
                    </label>
                  </div>

                  <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={resetForm}>
                      重置
                    </Button>
                    <Button variant="outline" onClick={() => setShowForm(false)}>
                      取消
                    </Button>
                    <Button onClick={handleSubmitForm} isLoading={submittingForm}>
                      {formMode === 'create' ? '创建流媒体' : '保存修改'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>

          <div className="space-y-6">
            <Card className="border-white/10 bg-white/[0.02] backdrop-blur-md shadow-2xl rounded-[20px] overflow-hidden">
              <CardHeader className="border-b border-white/5 pb-4">
                <CardTitle className="flex items-center gap-3 text-2xl font-bold text-white">
                  <Activity className="h-6 w-6 text-cyan-400 animate-pulse" />
                  选中流详情
                </CardTitle>
                <CardDescription className="text-slate-400">查看实时状态、预览和控制面板。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!selectedStream ? (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-slate-900/50 p-10 text-center text-slate-400">
                    选择左侧某一路流媒体后，可在这里管理细节。
                  </div>
                ) : (
                  <>
                    <div className="rounded-[18px] border border-white/10 bg-white/[0.04] p-4">
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="text-xl font-semibold text-white">{selectedStream.name}</h2>
                              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${selectedMeta.className}`}>
                                {selectedMeta.icon}
                                {selectedMeta.label}
                              </span>
                              {detailLoading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
                            </div>
                            <p className="font-mono text-xs text-slate-400">{selectedStreamDetail?.display_url || selectedStream.display_url}</p>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSingleAction(`start-${selectedStream.id}`, () => startStream(selectedStream.id), '流媒体已启动', selectedStream.id)}
                              isLoading={actionKey === `start-${selectedStream.id}`}
                              disabled={!selectedStream.enabled}
                            >
                              <PlayCircle className="h-4 w-4" />
                              启动
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSingleAction(`stop-${selectedStream.id}`, () => stopStream(selectedStream.id), '流媒体已停止', selectedStream.id)}
                              isLoading={actionKey === `stop-${selectedStream.id}`}
                            >
                              <Square className="h-4 w-4" />
                              停止
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handlePreview(selectedStream.id)}
                              isLoading={previewLoading}
                              disabled={!selectedStream.enabled}
                            >
                              <Eye className="h-4 w-4" />
                              抓取预览
                            </Button>
                            <Button
                              size="sm"
                              variant={isLivePreview ? "default" : "outline"}
                              onClick={isLivePreview ? stopLivePreview : startLivePreview}
                              disabled={selectedStream.status !== 'active' || !selectedStream.enabled}
                            >
                              {isLivePreview ? <EyeOff className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
                              {isLivePreview ? '停止实时预览' : '开启实时预览'}
                            </Button>
                          </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <MetricRow
                            label="来源类型"
                            value={STREAM_TYPES.find((item) => item.value === selectedStream.stream_type)?.label || selectedStream.stream_type}
                          />
                          <MetricRow
                            label="播放模式"
                            value={PLAY_MODES.find((item) => item.value === selectedStream.play_mode)?.label || selectedStream.play_mode}
                          />
                          <MetricRow label="启用状态" value={selectedStream.enabled ? '已启用' : '已禁用'} />
                          <MetricRow label="最后连接" value={formatTime(selectedStream.last_connected_at)} />
                          <MetricRow label="自动重连" value={selectedStreamDetail?.auto_reconnect ? '开启' : '关闭'} />
                          <MetricRow label="重连间隔" value={`${selectedStreamDetail?.reconnect_interval ?? 5} 秒`} />
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <RuntimeCard
                        title="运行时状态"
                        icon={runtimeStatus?.is_connected ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                        lines={[
                          ['读取器运行', runtimeStatus?.is_running ? '是' : '否'],
                          ['链路连接', runtimeStatus?.is_connected ? '已连接' : '未连接'],
                          ['最近帧时间', formatTime(runtimeStatus?.last_frame_time)],
                          ['错误次数', String(runtimeStatus?.error_count ?? selectedStreamDetail?.error_count ?? 0)],
                        ]}
                        accent={runtimeStatus?.is_connected ? 'emerald' : 'slate'}
                      />
                      <RuntimeCard
                        title="异常信息"
                        icon={<AlertCircle className="h-4 w-4" />}
                        lines={[
                          ['最近错误', selectedStreamDetail?.last_error || runtimeStatus?.error_message || '暂无'],
                          ['更新时间', formatTime(selectedStreamDetail?.updated_at)],
                          ['创建时间', formatTime(selectedStreamDetail?.created_at)],
                          ['运行时 ID', runtimeStatus?.stream_id || selectedStream.id],
                        ]}
                        accent={selectedStream.status === 'error' ? 'rose' : 'slate'}
                      />
                    </div>

                    <Card className="border-white/10 bg-slate-900/50 p-5 shadow-none">
                      <CardHeader className="p-0">
                        <CardTitle className="text-lg text-white">实时预览</CardTitle>
                        <CardDescription>调用 `/frame/` 接口抓取一帧，便于确认地址和认证是否正确。</CardDescription>
                      </CardHeader>
                      <CardContent className="p-0 pt-4">
                        <div 
                          ref={previewContainerRef}
                          className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/70 group"
                        >
                          <div className={`relative aspect-video w-full bg-black ${isLivePreview ? 'flex items-center justify-center' : 'hidden'}`}>
                            {selectedStream?.play_mode === 'ffmpeg' || previewTransport === 'frame' ? (
                              <video
                                ref={videoRef}
                                className="h-full w-full object-contain"
                                autoPlay
                                muted
                                playsInline
                              />
                            ) : (
                              <img
                                ref={imgRef}
                                className="h-full w-full object-contain"
                                alt="实时预览"
                              />
                            )}
                            <div className="absolute left-4 top-4 flex items-center gap-2">
                              <Badge className="bg-rose-500 text-white animate-pulse">LIVE</Badge>
                              <span className="rounded bg-black/50 px-2 py-0.5 text-[10px] text-white backdrop-blur">
                                {previewTransport === 'hls' ? 'HLS' : previewTransport === 'frame' ? 'JPG 轮询' : 'MJPEG'}
                              </span>
                            </div>
                          </div>

                          {!isLivePreview && previewFrame ? (
                            <img
                              src={previewFrame}
                              alt={`${selectedStream.name} 预览`}
                              className="aspect-video w-full object-contain"
                            />
                          ) : !isLivePreview ? (
                            <div className="flex aspect-video items-center justify-center text-sm text-slate-500">
                              点击“抓取预览”或“开启实时预览”获取当前画面
                            </div>
                          ) : null}

                          {/* 全屏切换按钮 - 仅在有内容时显示 */}
                          {(isLivePreview || previewFrame) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="absolute bottom-4 right-4 h-8 w-8 bg-black/40 text-white opacity-0 backdrop-blur hover:bg-black/60 group-hover:opacity-100 transition-opacity"
                              onClick={toggleFullscreenPreview}
                              title={isFullscreenPreview ? "退出全屏" : "全屏查看"}
                            >
                              {isFullscreenPreview ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-white/10 bg-slate-900/50 p-5 shadow-none">
                      <CardHeader className="p-0">
                        <CardTitle className="text-lg text-white">HLS / FFmpeg 控制</CardTitle>
                        <CardDescription>在高画质模式下单独启停 HLS 流，并调整编码参数排查性能问题。</CardDescription>
                      </CardHeader>
                      <CardContent className="grid gap-4 p-0 pt-4 md:grid-cols-2">
                        <FieldBlock label="FPS">
                          <Input
                            type="number"
                            min={5}
                            max={30}
                            value={hlsOptions.fps}
                            onChange={(event) =>
                              setHlsOptions((current) => ({
                                ...current,
                                fps: clampNumber(parseInt(event.target.value, 10), 15, 5, 30),
                              }))
                            }
                          />
                        </FieldBlock>
                        <FieldBlock label="Preset">
                          <select
                            value={hlsOptions.preset}
                            onChange={(event) =>
                              setHlsOptions((current) => ({
                                ...current,
                                preset: event.target.value as HlsOptionsState['preset'],
                              }))
                            }
                            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                          >
                            <option value="ultrafast">ultrafast</option>
                            <option value="veryfast">veryfast</option>
                            <option value="faster">faster</option>
                            <option value="fast">fast</option>
                            <option value="medium">medium</option>
                          </select>
                        </FieldBlock>
                        <FieldBlock label="宽度">
                          <Input
                            type="number"
                            min={0}
                            max={3840}
                            value={hlsOptions.width}
                            onChange={(event) =>
                              setHlsOptions((current) => ({
                                ...current,
                                width: clampNumber(parseInt(event.target.value, 10), 0, 0, 3840),
                              }))
                            }
                          />
                        </FieldBlock>
                        <FieldBlock label="高度">
                          <Input
                            type="number"
                            min={0}
                            max={2160}
                            value={hlsOptions.height}
                            onChange={(event) =>
                              setHlsOptions((current) => ({
                                ...current,
                                height: clampNumber(parseInt(event.target.value, 10), 0, 0, 2160),
                              }))
                            }
                          />
                        </FieldBlock>
                        <FieldBlock label="CRF">
                          <Input
                            type="number"
                            min={18}
                            max={28}
                            value={hlsOptions.crf}
                            onChange={(event) =>
                              setHlsOptions((current) => ({
                                ...current,
                                crf: clampNumber(parseInt(event.target.value, 10), 26, 18, 28),
                              }))
                            }
                          />
                        </FieldBlock>
                        <FieldBlock label="线程数">
                          <Input
                            type="number"
                            min={0}
                            max={16}
                            value={hlsOptions.threads}
                            onChange={(event) =>
                              setHlsOptions((current) => ({
                                ...current,
                                threads: clampNumber(parseInt(event.target.value, 10), 0, 0, 16),
                              }))
                            }
                          />
                        </FieldBlock>
                        <div className="md:col-span-2 flex flex-wrap gap-3 pt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              handleSingleAction(
                                `start-hls-${selectedStream.id}`,
                                () => startHLSStream(selectedStream.id, hlsOptions),
                                'HLS 流已启动',
                                selectedStream.id
                              )
                            }
                            isLoading={actionKey === `start-hls-${selectedStream.id}`}
                            disabled={!selectedStream.enabled}
                          >
                            <PlayCircle className="h-4 w-4" />
                            启动 HLS
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              handleSingleAction(
                                `stop-hls-${selectedStream.id}`,
                                () => stopHLSStream(selectedStream.id),
                                'HLS 流已停止',
                                selectedStream.id
                              )
                            }
                            isLoading={actionKey === `stop-hls-${selectedStream.id}`}
                            disabled={!selectedStream.enabled}
                          >
                            <Square className="h-4 w-4" />
                            停止 HLS
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setHlsOptions(DEFAULT_HLS_OPTIONS)}>
                            恢复默认参数
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </>
                )}
	              </CardContent>
	            </Card>
	          </div>
	        </div>
	      </div>
	    </div>
	  );
};

const StatsCard: React.FC<{ title: string; value: number; hint: string; icon: React.ReactNode, color: string }> = ({
  title,
  value,
  hint,
  icon,
  color
}) => {
  const colorMap: Record<string, string> = {
    cyan: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20',
    emerald: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    blue: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
    amber: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
    purple: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  };

  return (
    <div className="group rounded-[20px] border border-white/5 bg-white/[0.03] p-4 transition-all duration-300 hover:bg-white/[0.06] hover:border-white/10 hover:translate-y-[-2px]">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400 tracking-wide uppercase">{title}</span>
        <div className={`rounded-xl p-2 flex items-center justify-center transition-transform group-hover:scale-110 ${colorMap[color] || 'text-cyan-400 bg-cyan-400/10'}`}>
          {icon}
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <div className="text-2xl font-bold text-white tracking-tight">{value}</div>
        <div className="text-[10px] font-medium text-slate-500 uppercase tracking-[0.2em]">{hint}</div>
      </div>
    </div>
  );
};

const FieldBlock: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-2">
    <Label className="text-slate-200">{label}</Label>
    {children}
  </div>
);

const MetricRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3">
    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
    <p className="mt-1 text-sm text-slate-200">{value}</p>
  </div>
);

const RuntimeCard: React.FC<{
  title: string;
  icon: React.ReactNode;
  lines: Array<[string, string]>;
  accent: 'emerald' | 'rose' | 'slate';
}> = ({ title, icon, lines, accent }) => {
  const accentClass =
    accent === 'emerald'
      ? 'border-emerald-500/20 bg-emerald-500/[0.04]'
      : accent === 'rose'
        ? 'border-rose-500/20 bg-rose-500/[0.04]'
        : 'border-white/10 bg-slate-900/50';

  return (
    <div className={`rounded-2xl border p-4 ${accentClass}`}>
      <div className="mb-4 flex items-center gap-2 text-sm font-medium text-white">
        {icon}
        {title}
      </div>
      <div className="space-y-3">
        {lines.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-3 border-b border-white/5 pb-2 last:border-b-0 last:pb-0">
            <span className="text-xs text-slate-400">{label}</span>
            <span className="text-right text-sm text-slate-200">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StreamSettingsScreen;
