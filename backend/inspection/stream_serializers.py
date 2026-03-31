"""
流媒体序列化器
"""
from rest_framework import serializers
from .stream_models import StreamSource


class StreamSourceSerializer(serializers.ModelSerializer):
    """流媒体源序列化器"""
    display_url = serializers.SerializerMethodField()
    is_active = serializers.SerializerMethodField()
    
    class Meta:
        model = StreamSource
        fields = [
            'id', 'name', 'url', 'stream_type', 'status',
            'play_mode', 'enabled', 'auto_reconnect', 'reconnect_interval',
            'username', 'password',
            'last_connected_at', 'last_error', 'error_count',
            'created_at', 'updated_at',
            'display_url', 'is_active'
        ]
        read_only_fields = ['id', 'status', 'last_connected_at', 'last_error', 
                           'error_count', 'created_at', 'updated_at']
        extra_kwargs = {
            'password': {'write_only': True}  # 密码只写不读
        }
    
    def get_display_url(self, obj):
        """安全获取display_url"""
        try:
            return obj.display_url
        except Exception:
            return obj.url
    
    def get_is_active(self, obj):
        """安全获取is_active"""
        try:
            return obj.is_active
        except Exception:
            return obj.status == 'active' and obj.enabled


class StreamSourceListSerializer(serializers.ModelSerializer):
    """流媒体源列表序列化器（简化版）"""
    display_url = serializers.SerializerMethodField()
    is_active = serializers.SerializerMethodField()
    
    class Meta:
        model = StreamSource
        fields = [
            'id', 'name', 'display_url', 'stream_type', 'status',
            'play_mode', 'enabled', 'is_active', 'last_connected_at', 'created_at'
        ]
        read_only_fields = fields
    
    def get_display_url(self, obj):
        """安全获取display_url"""
        try:
            return obj.display_url
        except Exception:
            return obj.url
    
    def get_is_active(self, obj):
        """安全获取is_active"""
        try:
            return obj.is_active
        except Exception:
            return obj.status == 'active' and obj.enabled

