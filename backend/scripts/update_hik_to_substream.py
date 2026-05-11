#!/usr/bin/env python3
"""
将海康摄像头流配置自动切换为子码流（Channels/102）
子码流分辨率低（通常 640x360 / 720p），带宽占用小，延迟更低。

用法:
    cd /Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django
    python3 backend/scripts/update_hik_to_substream.py
"""
import os
import sys
import django

# 设置 Django 环境
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.config.settings')
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
django.setup()

from backend.inspection.stream_models import StreamSource


def update_hikvision_to_substream():
    """将所有包含 /101 的 RTSP 地址改为 /102"""
    updated = 0
    for stream in StreamSource.objects.filter(stream_type='rtsp'):
        original_url = stream.url
        # 海康主码流通常是 /101，子码流是 /102
        if '/101' in original_url and '/102' not in original_url:
            new_url = original_url.replace('/101', '/102')
            stream.url = new_url
            stream.save(update_fields=['url', 'updated_at'])
            print(f"✅ 已更新: {stream.name}")
            print(f"   {original_url}")
            print(f"   → {new_url}")
            updated += 1

    if updated == 0:
        print("ℹ️ 没有找到需要更新的海康主码流配置")
    else:
        print(f"\n🎉 共更新 {updated} 条流媒体配置为子码流")
        print("💡 子码流带宽占用小、解码快、延迟低，推荐用于实时检测")
        print("   如需恢复主码流画质，请手动将地址中的 /102 改回 /101")


if __name__ == '__main__':
    update_hikvision_to_substream()
