"""
流媒体管理 API
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view
from rest_framework.response import Response
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.http import FileResponse, Http404
from django.conf import settings
import logging
import os
import uuid

from .stream_models import StreamSource
from .stream_serializers import StreamSourceSerializer, StreamSourceListSerializer
from .stream_service import stream_manager
from .stream_hls import hls_stream_manager

logger = logging.getLogger(__name__)


class StreamSourceViewSet(viewsets.ModelViewSet):
    """流媒体源管理ViewSet"""
    queryset = StreamSource.objects.all()
    serializer_class = StreamSourceSerializer
    
    def get_serializer_class(self):
        """根据action选择不同的序列化器"""
        if self.action == 'list':
            return StreamSourceListSerializer
        return StreamSourceSerializer
    
    def list(self, request, *args, **kwargs):
        """重写list方法，添加错误处理"""
        try:
            return super().list(request, *args, **kwargs)
        except Exception as e:
            logger.error(f'获取流媒体列表失败: {e}', exc_info=True)
            return Response(
                {'error': f'获取流媒体列表失败: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    def create(self, request, *args, **kwargs):
        """创建流媒体源"""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        
        # 如果启用，则启动流
        stream = serializer.instance
        if stream.enabled:
            self._start_stream(stream)
        
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)
    
    def update(self, request, *args, **kwargs):
        """更新流媒体源"""
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        
        # 记录旧的启用状态和URL
        old_enabled = instance.enabled
        old_url = instance.url
        
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        
        stream = serializer.instance
        stream_id = str(stream.id)
        
        # 如果URL改变或从禁用变为启用，需要重启流
        if stream.url != old_url or (not old_enabled and stream.enabled):
            self._stop_stream(stream)
            if stream.enabled:
                self._start_stream(stream)
        elif old_enabled and not stream.enabled:
            # 从启用变为禁用，停止流
            self._stop_stream(stream)
        
        return Response(serializer.data)
    
    def destroy(self, request, *args, **kwargs):
        """删除流媒体源"""
        instance = self.get_object()
        self._stop_stream(instance)
        self.perform_destroy(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=['post'], url_path='upload-video')
    def upload_video(self, request):
        """上传本地视频文件，返回服务端可用绝对路径"""
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'error': '未接收到视频文件'}, status=status.HTTP_400_BAD_REQUEST)

        allowed_exts = {'.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'}
        original_name = file_obj.name or 'video'
        _, ext = os.path.splitext(original_name)
        ext = ext.lower()
        if ext not in allowed_exts:
            return Response(
                {'error': f'不支持的文件类型: {ext or "unknown"}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        upload_dir = os.path.join(settings.MEDIA_ROOT, 'stream_uploads')
        os.makedirs(upload_dir, exist_ok=True)

        safe_name = f'{uuid.uuid4().hex}{ext}'
        saved_path = os.path.abspath(os.path.join(upload_dir, safe_name))

        with open(saved_path, 'wb+') as destination:
            for chunk in file_obj.chunks():
                destination.write(chunk)

        return Response({
            'message': '视频文件上传成功',
            'file_name': original_name,
            'file_path': saved_path,
            'file_size': file_obj.size,
        })
    
    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        """启动流媒体"""
        stream = self.get_object()
        
        if not stream.enabled:
            return Response(
                {'error': '流媒体源未启用'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # 根据播放模式选择启动方式
        if stream.play_mode == 'ffmpeg':
            # FFmpeg模式：使用HLS流
            logger.info(f'使用FFmpeg模式启动流媒体: {stream.id}')
            # 获取优化参数（使用默认值）
            fps = request.data.get('fps', request.query_params.get('fps', 15))
            width = request.data.get('width', request.query_params.get('width', 0))
            height = request.data.get('height', request.query_params.get('height', 0))
            crf = request.data.get('crf', request.query_params.get('crf', 26))
            preset = request.data.get('preset', request.query_params.get('preset', 'ultrafast'))
            threads = request.data.get('threads', request.query_params.get('threads', 0))
            
            # 调用start_hls的逻辑
            stream_id = str(stream.id)
            url = stream.url
            
            # 构建带认证的URL
            if stream.username and stream.password and '://' in url:
                protocol, rest = url.split('://', 1)
                url = f"{protocol}://{stream.username}:{stream.password}@{rest}"
            
            # 启动HLS流
            try:
                fps = int(fps) if isinstance(fps, (int, str)) else 15
                width = int(width) if isinstance(width, (int, str)) else 0
                height = int(height) if isinstance(height, (int, str)) else 0
                crf = int(crf) if isinstance(crf, (int, str)) else 26
                threads = int(threads) if isinstance(threads, (int, str)) else 0
                
                if preset not in ['ultrafast', 'veryfast', 'faster', 'fast', 'medium']:
                    preset = 'ultrafast'
                
                success = hls_stream_manager.start_stream(
                    stream_id=stream_id,
                    source_url=url,
                    fps=fps,
                    width=width,
                    height=height,
                    crf=crf,
                    preset=preset,
                    threads=threads
                )
            except Exception as e:
                logger.error(f"启动HLS流失败: {e}", exc_info=True)
                success = False
        else:
            # JPG模式：使用传统的流管理器
            logger.info(f'使用JPG模式启动流媒体: {stream.id}')
            success = self._start_stream(stream)
        
        if success:
            stream.status = 'active'
            stream.last_connected_at = timezone.now()
            stream.save(update_fields=['status', 'last_connected_at'])
            
            return Response({
                'message': '流媒体启动成功',
                'stream': StreamSourceSerializer(stream).data
            })
        else:
            stream.status = 'error'
            stream.save(update_fields=['status'])
            
            return Response(
                {'error': '流媒体启动失败'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['post'])
    def stop(self, request, pk=None):
        """停止流媒体"""
        stream = self.get_object()
        self._stop_stream(stream)
        
        stream.status = 'inactive'
        stream.save(update_fields=['status'])
        
        return Response({
            'message': '流媒体已停止',
            'stream': StreamSourceSerializer(stream).data
        })
    
    @action(detail=True, methods=['get'])
    def status(self, request, pk=None):
        """获取流媒体状态"""
        stream = self.get_object()
        stream_id = str(stream.id)
        
        # 从流管理器获取实时状态
        stream_status = stream_manager.get_stream_status(stream_id)
        
        if stream_status:
            # 更新数据库中的状态
            if stream_status['is_connected']:
                stream.status = 'active'
            elif stream_status['is_running']:
                stream.status = 'connecting'
            else:
                stream.status = 'inactive'
            
            if stream_status['error_message']:
                stream.last_error = stream_status['error_message']
                stream.error_count = stream_status['error_count']
            
            stream.save(update_fields=['status', 'last_error', 'error_count'])
        
        return Response({
            'stream': StreamSourceSerializer(stream).data,
            'runtime_status': stream_status
        })
    
    @action(detail=True, methods=['get'])
    def frame(self, request, pk=None):
        """获取流媒体当前帧（Base64编码，JPEG格式）
        
        查询参数:
            quality: JPEG质量 (1-100, 默认100，无压缩)
            width: 目标宽度 (默认1920, 0表示不缩放)
        """
        stream = self.get_object()
        stream_id = str(stream.id)
        
        logger.info(f'获取帧请求: stream_id={stream_id}, stream_status={stream.status}, enabled={stream.enabled}')
        
        # 获取质量参数
        quality = int(request.query_params.get('quality', 100))
        quality = max(1, min(100, quality))  # 限制在1-100之间
        
        # 获取宽度参数
        width = int(request.query_params.get('width', 1920))
        width = max(0, min(3840, width))  # 限制在0-3840之间
        
        # 检查流是否在运行
        stream_status = stream_manager.get_stream_status(stream_id)
        logger.info(f'流状态检查: stream_id={stream_id}, status={stream_status}')
        
        # 如果流没有运行且流媒体源已启用，尝试启动它
        if not stream_status and stream.enabled:
            logger.info(f'流未运行，尝试启动: stream_id={stream_id}')
            success = self._start_stream(stream)
            if success:
                stream.status = 'active'
                stream.last_connected_at = timezone.now()
                stream.save(update_fields=['status', 'last_connected_at'])
                logger.info(f'流启动成功: stream_id={stream_id}')
                # 等待一小段时间让流建立连接
                import time
                time.sleep(0.5)
            else:
                logger.error(f'流启动失败: stream_id={stream_id}')
                return Response(
                    {'error': '流媒体未运行且启动失败'},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE
                )
        elif not stream.enabled:
            logger.warning(f'流媒体源未启用: stream_id={stream_id}')
            return Response(
                {'error': '流媒体源未启用'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # 从流管理器获取帧
        frame_base64 = stream_manager.get_frame_base64(stream_id, quality, width)
        
        if frame_base64:
            logger.debug(f'成功获取帧: stream_id={stream_id}, quality={quality}, width={width}')
            return Response({
                'stream_id': stream_id,
                'frame': frame_base64,
                'timestamp': timezone.now().isoformat()
            })
        else:
            # 再次检查流状态以获取更多信息
            stream_status = stream_manager.get_stream_status(stream_id)
            error_msg = '无法获取视频帧'
            if stream_status:
                if not stream_status.get('is_connected', False):
                    error_msg = '流媒体未连接'
                elif not stream_status.get('is_running', False):
                    error_msg = '流媒体未运行'
                elif stream_status.get('error_message'):
                    error_msg = f"流媒体错误: {stream_status.get('error_message')}"
                else:
                    error_msg = '流媒体连接中，暂无可用帧'
            else:
                error_msg = '流媒体读取器不存在'
            
            logger.warning(f'获取帧失败: stream_id={stream_id}, error={error_msg}, status={stream_status}')
            return Response(
                {'error': error_msg},
                status=status.HTTP_404_NOT_FOUND
            )
    
    @action(detail=False, methods=['get'])
    def active_streams(self, request):
        """获取所有激活的流媒体"""
        streams = StreamSource.objects.filter(enabled=True)
        serializer = StreamSourceListSerializer(streams, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def start_hls(self, request, pk=None):
        """启动HLS流（高画质方案，支持多种CPU优化参数）
        
        请求参数（JSON body 或 query params）:
            fps: 输出帧率（默认15fps，降低CPU占用）
            width: 输出宽度（0表示不缩放，默认保持原分辨率）
            height: 输出高度（0表示自动计算）
            crf: 恒定质量因子（18-28，默认23，值越大CPU占用越低）
            preset: 编码预设（ultrafast/veryfast/fast/medium，默认ultrafast最快）
            threads: 编码线程数（0表示自动，可以限制CPU核心数）
        """
        stream = self.get_object()
        
        if not stream.enabled:
            return Response(
                {'error': '流媒体源未启用'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        stream_id = str(stream.id)
        url = stream.url
        
        # 获取优化参数（支持从data或query_params获取）
        def get_param(key, default, min_val=None, max_val=None):
            value = request.data.get(key, request.query_params.get(key, default))
            value = int(value) if isinstance(value, (int, str)) else default
            if min_val is not None:
                value = max(min_val, value)
            if max_val is not None:
                value = min(max_val, value)
            return value
        
        fps = get_param('fps', 15, 5, 30)  # 5-30fps
        width = get_param('width', 0, 0, 3840)  # 0-3840
        height = get_param('height', 0, 0, 2160)  # 0-2160
        crf = get_param('crf', 26, 18, 28)  # 18-28（26是默认值，降低CPU占用）
        preset = request.data.get('preset', request.query_params.get('preset', 'ultrafast'))
        if preset not in ['ultrafast', 'veryfast', 'faster', 'fast', 'medium']:
            preset = 'ultrafast'
        threads = get_param('threads', 0, 0, 16)  # 0-16（0表示自动）
        
        logger.info(f'启动HLS流: stream_id={stream_id}, fps={fps}, width={width}, height={height}, crf={crf}, preset={preset}, threads={threads}')
        
        # 构建带认证的URL
        if stream.username and stream.password and '://' in url:
            protocol, rest = url.split('://', 1)
            url = f"{protocol}://{stream.username}:{stream.password}@{rest}"
        
        # 启动HLS流（使用指定的优化参数）
        success = hls_stream_manager.start_stream(
            stream_id, url, 
            fps=fps, width=width, height=height,
            crf=crf, preset=preset, threads=threads
        )
        
        if success:
            stream.status = 'active'
            stream.last_connected_at = timezone.now()
            stream.save(update_fields=['status', 'last_connected_at'])
            
            return Response({
                'message': 'HLS流启动成功',
                'stream': StreamSourceSerializer(stream).data,
                'hls_url': f'/api/streams/{stream_id}/hls/playlist.m3u8'
            })
        else:
            stream.status = 'error'
            stream.save(update_fields=['status'])
            
            return Response(
                {'error': 'HLS流启动失败'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['post'])
    def stop_hls(self, request, pk=None):
        """停止HLS流"""
        stream = self.get_object()
        stream_id = str(stream.id)
        
        hls_stream_manager.stop_stream(stream_id)
        
        stream.status = 'inactive'
        stream.save(update_fields=['status'])
        
        return Response({
            'message': 'HLS流已停止',
            'stream': StreamSourceSerializer(stream).data
        })
    
    @action(detail=True, methods=['get'], url_path=r'hls/(?P<filename>[^/]+\.(?:m3u8|ts))/?')
    def hls_file(self, request, pk=None, filename=None):
        """提供HLS文件（playlist.m3u8或.ts片段）
        
        支持的URL格式：
        - /api/streams/{id}/hls/playlist.m3u8
        - /api/streams/{id}/hls/segment000.ts
        """
        from pathlib import Path
        
        stream_id = pk
        base_dir = Path('media/hls') / stream_id
        
        # 移除filename末尾可能的斜杠
        filename = filename.rstrip('/')
        file_path = base_dir / filename
        
        if not file_path.exists():
            raise Http404(f"HLS file not found: {filename}")
        
        # 设置正确的Content-Type
        if filename.endswith('.m3u8'):
            content_type = 'application/vnd.apple.mpegurl'
        elif filename.endswith('.ts'):
            content_type = 'video/MP2T'
        else:
            content_type = 'application/octet-stream'
        
        response = FileResponse(open(file_path, 'rb'), content_type=content_type)
        response['Cache-Control'] = 'no-cache'
        # 添加CORS头，支持跨域访问
        response['Access-Control-Allow-Origin'] = '*'
        return response
    
    def _start_stream(self, stream: StreamSource) -> bool:
        """启动流媒体（内部方法）"""
        stream_id = str(stream.id)
        url = stream.url
        
        # 如果有用户名和密码，构建带认证的URL
        if stream.username and stream.password:
            # 对于RTSP等协议，在URL中插入认证信息
            if '://' in url:
                protocol, rest = url.split('://', 1)
                url = f"{protocol}://{stream.username}:{stream.password}@{rest}"
        
        try:
            success = stream_manager.add_stream(
                stream_id=stream_id,
                url=url,
                auto_reconnect=stream.auto_reconnect,
                reconnect_interval=stream.reconnect_interval,
                low_latency=True
            )
            return success
        except Exception as e:
            logger.error(f"Failed to start stream {stream_id}: {e}")
            stream.last_error = str(e)
            stream.error_count += 1
            stream.save(update_fields=['last_error', 'error_count'])
            return False
    
    def _stop_stream(self, stream: StreamSource):
        """停止流媒体（内部方法）"""
        stream_id = str(stream.id)
        try:
            stream_manager.remove_stream(stream_id)
        except Exception as e:
            logger.error(f"Failed to stop stream {stream_id}: {e}")


@csrf_exempt
@api_view(['GET'])
def stream_manager_status(request):
    """获取流管理器状态"""
    all_status = stream_manager.get_all_streams_status()
    return Response({
        'total_streams': len(all_status),
        'streams': all_status
    })


@csrf_exempt
@api_view(['POST'])
def stop_all_streams(request):
    """停止所有流媒体"""
    try:
        stream_manager.stop_all_streams()
        
        # 更新数据库中的状态
        StreamSource.objects.filter(enabled=True).update(status='inactive')
        
        return Response({'message': '所有流媒体已停止'})
    except Exception as e:
        logger.error(f"Failed to stop all streams: {e}")
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@csrf_exempt
@api_view(['POST'])
def restart_all_streams(request):
    """重启所有启用的流媒体"""
    try:
        # 先停止所有流
        stream_manager.stop_all_streams()
        
        # 获取所有启用的流
        streams = StreamSource.objects.filter(enabled=True)
        
        success_count = 0
        failed_count = 0
        
        for stream in streams:
            stream_id = str(stream.id)
            url = stream.url
            
            # 构建带认证的URL
            if stream.username and stream.password and '://' in url:
                protocol, rest = url.split('://', 1)
                url = f"{protocol}://{stream.username}:{stream.password}@{rest}"
            
            # 启动流
            success = stream_manager.add_stream(
                stream_id=stream_id,
                url=url,
                auto_reconnect=stream.auto_reconnect,
                reconnect_interval=stream.reconnect_interval,
                low_latency=True
            )
            
            if success:
                stream.status = 'active'
                stream.last_connected_at = timezone.now()
                success_count += 1
            else:
                stream.status = 'error'
                failed_count += 1
            
            stream.save(update_fields=['status', 'last_connected_at'])
        
        return Response({
            'message': '流媒体重启完成',
            'success_count': success_count,
            'failed_count': failed_count,
            'total': streams.count()
        })
        
    except Exception as e:
        logger.error(f"Failed to restart streams: {e}")
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
