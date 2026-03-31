"""
HLS流媒体服务
使用 FFmpeg 将视频源转换为 HLS 流
"""
import os
import subprocess
import threading
import time
import logging
from pathlib import Path
from typing import Optional, Dict
from datetime import datetime

logger = logging.getLogger(__name__)


class HLSStreamGenerator:
    """HLS流生成器"""
    
    def __init__(self, stream_id: str, source_url: str, output_dir: str, 
                 fps: int = 15, width: int = 0, height: int = 0, 
                 crf: int = 26, preset: str = 'ultrafast', threads: int = 0):
        """
        Args:
            stream_id: 流ID
            source_url: 视频源URL或文件路径
            output_dir: HLS输出目录
            fps: 输出帧率（默认15fps，降低CPU占用）
            width: 输出宽度（0表示不缩放，默认保持原分辨率）
            height: 输出高度（0表示自动计算，保持宽高比）
            crf: 恒定质量因子（18-28，默认26，值越大质量越低但CPU占用越低）
            preset: 编码预设（ultrafast/veryfast/fast/medium，默认ultrafast最快）
            threads: 编码线程数（0表示自动，可以限制CPU核心数）
        """
        self.stream_id = stream_id
        self.source_url = source_url
        self.output_dir = Path(output_dir)
        self.fps = fps  # 输出帧率
        self.width = width  # 输出宽度
        self.height = height  # 输出高度
        self.crf = crf  # 恒定质量因子
        self.preset = preset  # 编码预设
        self.threads = threads  # 编码线程数
        self.process: Optional[subprocess.Popen] = None
        self.is_running = False
        self.error_message = ""
        
        # 创建输出目录
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # HLS文件路径
        self.playlist_file = self.output_dir / "playlist.m3u8"
        self.segment_pattern = str(self.output_dir / "segment%03d.ts")
    
    def start(self) -> bool:
        """启动HLS流生成"""
        if self.is_running:
            logger.warning(f"HLS stream {self.stream_id} is already running")
            return True
        
        try:
            logger.info(f"Starting HLS stream {self.stream_id} from {self.source_url}")
            
            # 处理本地文件路径：如果是相对路径，转换为绝对路径
            input_source = self.source_url
            if not input_source.startswith(('http://', 'https://', 'rtsp://', 'rtmp://', 'listen:')):
                # 本地文件路径
                if not os.path.isabs(input_source):
                    # 相对路径，转换为绝对路径（相对于项目根目录）
                    base_dir = Path(__file__).resolve().parent.parent.parent
                    input_source = str(base_dir / input_source)
                # 检查文件是否存在
                if not os.path.exists(input_source):
                    logger.error(f"Video source file not found: {input_source}")
                    self.error_message = f"视频源文件不存在: {input_source}"
                    return False
                # 处理文件名中的特殊字符（如空格），用引号包裹路径
                # 但保留原始路径用于FFmpeg -i 参数（FFmpeg会自动处理）
                logger.info(f"Using absolute path for local file: {input_source}")
            
            # FFmpeg 命令参数
            cmd = [
                'ffmpeg',
                '-re',  # 实时模式（按源视频帧率读取）
            ]
            
            # 如果是本地文件，添加循环播放参数
            if not input_source.startswith(('http://', 'https://', 'rtsp://', 'rtmp://', 'listen:')):
                cmd.extend(['-stream_loop', '-1'])  # 无限循环播放
            
            # 输入源
            if input_source.startswith('listen:'):
                # 监听模式：允许外部推流（如OBS）
                # 去掉 listen: 前缀，例如 listen:rtmp://0.0.0.0:1935/live/obs
                real_url = input_source.replace('listen:', '', 1)
                
                # 监听模式下通常不需要 -re，因为速率由推流端控制
                # 尝试从cmd中移除 -re
                if '-re' in cmd:
                    cmd.remove('-re')
                    
                # 添加监听参数
                # -timeout: 等待推流超时时间（秒），避免无限挂起
                cmd.extend(['-listen', '1', '-timeout', '30', '-i', real_url])
                logger.info(f"启用监听模式，等待推流: {real_url}")
            else:
                cmd.extend(['-i', input_source])
            
            # 构建视频过滤器（用于缩放）- 必须在 -i 之后
            video_filters = []
            if self.width > 0:
                if self.height > 0:
                    video_filters.append(f'scale={self.width}:{self.height}')
                else:
                    video_filters.append(f'scale={self.width}:-1')  # 保持宽高比
            
            # 如果有视频过滤器，添加-vf参数
            if video_filters:
                cmd.extend(['-vf', ','.join(video_filters)])
            
            cmd.extend([
                '-c:v', 'libx264',  # H.264视频编码
                '-preset', self.preset,  # 编码速度（ultrafast最快，CPU占用最低）
                '-crf', str(self.crf),  # 恒定质量模式（23默认，值越大CPU占用越低）
                '-r', str(self.fps),  # 输出帧率（降低CPU占用）
                '-g', str(int(self.fps * 2)),  # GOP大小（关键帧间隔，设为2倍FPS）
                '-sc_threshold', '0',  # 禁用场景切换检测
                '-an',  # 禁用音频（视频流通常不需要音频）
            ])
            
            # 限制线程数（如果指定）
            if self.threads > 0:
                cmd.extend(['-threads', str(self.threads)])
            
            # 计算HLS base URL（相对于playlist.m3u8的路径）
            # playlist.m3u8在 /api/streams/{stream_id}/hls/playlist.m3u8
            # 片段应该在 /api/streams/{stream_id}/hls/segment000.ts
            # 所以base URL应该是空（相对路径）或者使用绝对路径
            # 使用相对路径，hls.js会自动相对于playlist.m3u8的目录解析
            hls_base_url = ''  # 空字符串表示使用相对路径
            
            # 判断是否是本地文件
            is_local_file = not input_source.startswith(('http://', 'https://', 'rtsp://', 'rtmp://', 'listen:'))
            
            # 根据文件类型决定播放列表类型和参数
            # 根据文件类型决定播放列表类型和参数
            # 统统使用实时流配置，这样本地文件也能循环模拟直播
            playlist_type = 'event'
            hls_list_size = 10  # 保留10个片段实现滑动窗口
            hls_flags = 'delete_segments+append_list'  # 追加模式且删除旧片段
            
            if is_local_file:
                logger.info(f"检测到本地文件，使用模拟实时流配置 (Loop Mode)")
            else:
                logger.info(f"检测到实时流，使用EVENT播放列表类型")
            
            cmd.extend([
                '-f', 'hls',  # HLS格式
                '-hls_time', '2',  # 每个TS片段的时长（秒）
                '-hls_list_size', str(hls_list_size),  # 播放列表中保留的片段数
                '-hls_flags', hls_flags,  # HLS标志
                '-hls_segment_filename', self.segment_pattern,  # 片段文件名模板
                '-hls_base_url', hls_base_url,  # 片段base URL（空表示相对路径）
                '-hls_playlist_type', playlist_type,  # 播放列表类型（event/vod）
                '-loglevel', 'warning',  # 日志级别
                str(self.playlist_file)  # 输出播放列表
            ])
            
            # 启动FFmpeg进程
            logger.info(f"Executing FFmpeg command: {' '.join(cmd)}")
            self.process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                universal_newlines=True
            )
            
            self.is_running = True
            self.error_message = ""
            
            # 启动错误监控线程
            threading.Thread(target=self._monitor_process, daemon=True).start()
            
            # 简化逻辑：不等待播放列表生成，直接返回成功
            # FFmpeg启动需要时间，让前端轮询播放列表
            logger.info(f"HLS stream {self.stream_id} process started")
            return True

            # 等待播放列表文件生成
            # for i in range(50):  # 最多等待5秒
            #     if self.playlist_file.exists():
            #         logger.info(f"HLS stream {self.stream_id} started successfully")
            #         return True
                
            #     # 检查进程是否已经退出（表示启动失败）
            #     if self.process.poll() is not None:
            #         # 进程已退出，读取错误信息
            #         stderr_output = self.process.stderr.read() if self.process.stderr else ""
            #         logger.error(f"FFmpeg process exited early. Exit code: {self.process.returncode}")
            #         logger.error(f"FFmpeg stderr: {stderr_output}")
            #         self.error_message = f"FFmpeg启动失败: {stderr_output[:200]}"  # 限制长度
            #         self.stop()
            #         return False
                
            #     time.sleep(0.1)
            
            # # 超时，检查进程状态
            # if self.process.poll() is not None:
            #     stderr_output = self.process.stderr.read() if self.process.stderr else ""
            #     logger.error(f"HLS playlist file not created for stream {self.stream_id}")
            #     logger.error(f"FFmpeg exit code: {self.process.returncode}, stderr: {stderr_output[:200]}")
            #     self.error_message = f"播放列表文件未生成: {stderr_output[:200]}"
            # else:
            #     logger.error(f"HLS playlist file not created for stream {self.stream_id} (timeout)")
            #     self.error_message = "播放列表文件生成超时"
            
            # self.stop()
            # return False
            
        except Exception as e:
            logger.error(f"Failed to start HLS stream {self.stream_id}: {e}")
            self.error_message = str(e)
            self.is_running = False
            return False
    
    def stop(self):
        """停止HLS流生成"""
        if not self.is_running:
            return
        
        logger.info(f"Stopping HLS stream {self.stream_id}")
        self.is_running = False
        
        if self.process:
            try:
                self.process.terminate()
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait()
            except Exception as e:
                logger.error(f"Error stopping process: {e}")
            finally:
                self.process = None
        
        # 清理HLS文件（可选）
        # self._cleanup_files()
        
        logger.info(f"HLS stream {self.stream_id} stopped")
    
    def _monitor_process(self):
        """监控FFmpeg进程"""
        if not self.process:
            return
        
        while self.is_running and self.process:
            try:
                # 读取stderr输出
                if self.process.stderr:
                    line = self.process.stderr.readline()
                    if line:
                        # FFmpeg 错误/警告信息
                        if 'error' in line.lower() or 'failed' in line.lower():
                            logger.warning(f"FFmpeg: {line.strip()}")
                
                # 检查进程是否退出
                if self.process.poll() is not None:
                    logger.warning(f"FFmpeg process for stream {self.stream_id} exited")
                    self.is_running = False
                    break
                
                time.sleep(0.1)
                
            except Exception as e:
                logger.error(f"Error monitoring process: {e}")
                break
    
    def _cleanup_files(self):
        """清理HLS文件"""
        try:
            if self.output_dir.exists():
                for file in self.output_dir.glob("*"):
                    if file.is_file():
                        file.unlink()
                logger.info(f"Cleaned up HLS files for stream {self.stream_id}")
        except Exception as e:
            logger.error(f"Error cleaning up files: {e}")
    
    def get_status(self) -> Dict:
        """获取流状态"""
        return {
            'stream_id': self.stream_id,
            'is_running': self.is_running,
            'playlist_exists': self.playlist_file.exists(),
            'playlist_path': str(self.playlist_file),
            'error_message': self.error_message,
            'segment_count': len(list(self.output_dir.glob("*.ts"))) if self.output_dir.exists() else 0
        }


class HLSStreamManager:
    """HLS流管理器"""
    
    def __init__(self, base_output_dir: str = "media/hls"):
        """
        Args:
            base_output_dir: HLS文件基础输出目录
        """
        self.base_output_dir = Path(base_output_dir)
        self.base_output_dir.mkdir(parents=True, exist_ok=True)
        self.streams: Dict[str, HLSStreamGenerator] = {}
        logger.info(f"HLSStreamManager initialized with output dir: {self.base_output_dir}")
    
    def start_stream(self, stream_id: str, source_url: str, 
                     fps: int = 15, width: int = 0, height: int = 0,
                     crf: int = 26, preset: str = 'ultrafast', threads: int = 0) -> bool:
        """启动HLS流
        
        Args:
            stream_id: 流ID
            source_url: 视频源URL或文件路径
            fps: 输出帧率（默认15fps，降低CPU占用）
            width: 输出宽度（0表示不缩放）
            height: 输出高度（0表示自动计算）
            crf: 恒定质量因子（18-28，默认26）
            preset: 编码预设（ultrafast/veryfast/fast，默认ultrafast）
            threads: 编码线程数（0表示自动）
            
        Returns:
            bool: 是否成功启动
        """
        # 如果已存在，先停止
        if stream_id in self.streams:
            self.stop_stream(stream_id)
        
        # 创建流专属输出目录
        output_dir = self.base_output_dir / stream_id
        
        # 创建并启动HLS生成器（使用指定的优化参数）
        generator = HLSStreamGenerator(
            stream_id, source_url, str(output_dir),
            fps=fps, width=width, height=height,
            crf=crf, preset=preset, threads=threads
        )
        success = generator.start()
        
        if success:
            self.streams[stream_id] = generator
            logger.info(f"HLS stream {stream_id} started")
        else:
            logger.error(f"Failed to start HLS stream {stream_id}")
        
        return success
    
    def stop_stream(self, stream_id: str):
        """停止HLS流"""
        if stream_id in self.streams:
            self.streams[stream_id].stop()
            del self.streams[stream_id]
            logger.info(f"HLS stream {stream_id} removed")
    
    def get_stream(self, stream_id: str) -> Optional[HLSStreamGenerator]:
        """获取HLS流生成器"""
        return self.streams.get(stream_id)
    
    def get_playlist_path(self, stream_id: str) -> Optional[Path]:
        """获取HLS播放列表路径"""
        generator = self.get_stream(stream_id)
        if generator and generator.playlist_file.exists():
            return generator.playlist_file
        return None
    
    def get_stream_status(self, stream_id: str) -> Optional[Dict]:
        """获取流状态"""
        generator = self.get_stream(stream_id)
        return generator.get_status() if generator else None
    
    def get_all_streams_status(self) -> Dict[str, Dict]:
        """获取所有流状态"""
        return {
            stream_id: generator.get_status()
            for stream_id, generator in self.streams.items()
        }
    
    def stop_all_streams(self):
        """停止所有流"""
        for stream_id in list(self.streams.keys()):
            self.stop_stream(stream_id)
        logger.info("All HLS streams stopped")


# 全局HLS流管理器实例
hls_stream_manager = HLSStreamManager()

