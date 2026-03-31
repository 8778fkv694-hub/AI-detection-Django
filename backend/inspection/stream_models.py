"""
流媒体管理模型
"""
from django.db import models
import uuid


class StreamSource(models.Model):
    """流媒体源配置"""
    STATUS_CHOICES = [
        ('inactive', '未激活'),
        ('active', '激活中'),
        ('error', '错误'),
        ('connecting', '连接中'),
    ]
    
    STREAM_TYPE_CHOICES = [
        ('rtsp', 'RTSP流'),
        ('rtmp', 'RTMP流'),
        ('http', 'HTTP流'),
        ('file', '本地文件'),
        ('hls', 'HLS流'),
    ]
    
    PLAY_MODE_CHOICES = [
        ('jpg', 'JPG模式 (无压缩画质，低CPU占用，低延迟)'),
        ('ffmpeg', 'FFmpeg模式 (备选方案，高CPU占用)'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, help_text="流媒体名称")
    url = models.CharField(max_length=1024, help_text="流媒体地址")
    stream_type = models.CharField(max_length=20, choices=STREAM_TYPE_CHOICES, default='rtsp')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='inactive')
    
    # 配置
    play_mode = models.CharField(max_length=20, choices=PLAY_MODE_CHOICES, default='ffmpeg', help_text="播放模式")
    enabled = models.BooleanField(default=True, help_text="是否启用")
    auto_reconnect = models.BooleanField(default=True, help_text="自动重连")
    reconnect_interval = models.IntegerField(default=5, help_text="重连间隔(秒)")
    
    # 认证信息（可选）
    username = models.CharField(max_length=255, blank=True, default='', help_text="用户名")
    password = models.CharField(max_length=255, blank=True, default='', help_text="密码")
    
    # 状态信息
    last_connected_at = models.DateTimeField(null=True, blank=True, help_text="最后连接时间")
    last_error = models.TextField(blank=True, default='', help_text="最后错误信息")
    error_count = models.IntegerField(default=0, help_text="错误次数")
    
    # 时间戳
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = '流媒体源'
        verbose_name_plural = '流媒体源'
    
    def __str__(self):
        return f"{self.name} ({self.url})"
    
    @property
    def is_active(self):
        """流是否激活"""
        return self.status == 'active' and self.enabled
    
    @property
    def display_url(self):
        """显示用的URL（隐藏密码）"""
        if self.stream_type == 'file' and self.url:
            normalized = self.url.replace('\\', '/').rstrip('/')
            filename = normalized.split('/')[-1]
            return filename or self.url

        if self.username and self.password and '@' in self.url:
            # 隐藏密码部分
            parts = self.url.split('@')
            if len(parts) == 2:
                protocol_user = parts[0].split('//')
                if len(protocol_user) == 2:
                    return f"{protocol_user[0]}//{self.username}:****@{parts[1]}"
        return self.url
