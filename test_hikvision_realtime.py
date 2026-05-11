#!/usr/bin/env python3
"""
海康摄像头实时性测试脚本
用于测试不同配置（主码流/子码流、普通/低延迟模式）下的延迟表现。

使用方法:
    cd /Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django
    python3 test_hikvision_realtime.py

测试项:
    1. 主码流(101) + 普通模式  —— 模拟用户当前的延迟体验
    2. 主码流(101) + 低延迟模式 —— 启用快速丢帧+FFmpeg低延迟选项
    3. 子码流(102) + 低延迟模式 —— 强烈推荐的生产配置

输出:
    - 连接状态与耗时
    - 实际分辨率
    - 消费端帧率
    - 截图文件 (test_*.jpg)
"""
import sys
import os
import time

# 将项目根目录加入 Python 路径，以便导入 backend 模块
project_root = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, project_root)

from backend.inspection.stream_service import StreamReader
import cv2


def test_stream(stream_id: str, url: str, low_latency: bool = False, duration: int = 5):
    """测试单个流配置并返回结果字典"""
    print(f"\n{'='*60}")
    print(f"配置: {stream_id}")
    print(f"URL : {url}")
    print(f"低延迟: {low_latency}")
    print(f"{'='*60}")

    reader = StreamReader(
        stream_id=stream_id,
        url=url,
        auto_reconnect=True,
        reconnect_interval=5,
        low_latency=low_latency
    )

    t0 = time.time()
    success = reader.start()
    connect_elapsed = time.time() - t0

    if not success:
        print(f"❌ 连接失败: {reader.error_message}")
        reader.stop()
        return None

    print(f"✅ 连接成功 | 耗时: {connect_elapsed:.2f}s")

    # 等待 1s 让码流稳定
    time.sleep(1)

    # 统计消费端帧率（模拟前端以较快速度取帧）
    frame_count = 0
    test_start = time.time()
    while time.time() - test_start < duration:
        f = reader.get_frame()
        if f is not None:
            frame_count += 1
        time.sleep(0.01)
    elapsed = time.time() - test_start
    consumer_fps = frame_count / elapsed

    # 读取分辨率
    width = int(reader.cap.get(cv2.CAP_PROP_FRAME_WIDTH)) if reader.cap else 0
    height = int(reader.cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) if reader.cap else 0

    status = reader.get_status()
    print(f"分辨率 : {width}x{height}")
    print(f"消费FPS: {consumer_fps:.1f} (取帧端)")
    print(f"状态   : 运行={status['is_running']} 连接={status['is_connected']}")

    # 保存一张截图
    frame = reader.get_frame()
    if frame is not None:
        filename = f"test_{stream_id}.jpg"
        cv2.imwrite(filename, frame)
        print(f"📸 截图保存: {filename}")

    reader.stop()
    return {
        'stream_id': stream_id,
        'url': url,
        'low_latency': low_latency,
        'resolution': f"{width}x{height}",
        'consumer_fps': consumer_fps,
        'connected': True,
    }


def main():
    # 海康摄像头配置（请根据实际环境修改）
    IP   = "192.168.1.64"
    USER = "admin"
    PASS = "wenyili1987"

    # 海康 RTSP URL 格式说明
    # 101 = 主码流（通常 1080p/4M，画质高但带宽/解码压力大）
    # 102 = 子码流（通常 D1/720p/CIF，带宽小、解码快、延迟低，推荐用于实时检测）
    url_101 = f"rtsp://{USER}:{PASS}@{IP}:554/Streaming/Channels/101"
    url_102 = f"rtsp://{USER}:{PASS}@{IP}:554/Streaming/Channels/102"

    results = []

    # 1. 主码流 + 普通模式（对比基线）
    results.append(test_stream('hik_101_normal', url_101, low_latency=False, duration=5))

    # 2. 主码流 + 低延迟模式
    results.append(test_stream('hik_101_lowlat', url_101, low_latency=True, duration=5))

    # 3. 子码流 + 低延迟模式（强烈推荐）
    results.append(test_stream('hik_102_lowlat', url_102, low_latency=True, duration=5))

    # 汇总
    print(f"\n{'='*60}")
    print("测试结果汇总")
    print(f"{'='*60}")
    print(f"{'配置':<20} {'低延迟':<8} {'分辨率':<12} {'消费FPS':<10}")
    print("-" * 60)
    for r in results:
        if r:
            print(f"{r['stream_id']:<20} {str(r['low_latency']):<8} {r['resolution']:<12} {r['consumer_fps']:<10.1f}")
        else:
            print(f"{'连接失败':<20} {'-':<8} {'-':<12} {'-':<10}")

    print(f"\n💡 优化建议:")
    print(f"   1. 【最关键】使用子码流 (Channels/102)")
    print(f"      子码流分辨率低、解码快、网络占用小，延迟通常比主码流低 200~800ms。")
    print(f"   2. 确保 stream_service.py 中 low_latency=True（已在本次修改中默认启用）。")
    print(f"      低延迟模式会快速丢弃缓冲旧帧，只保留最新画面。")
    print(f"   3. 如果仍在内网且丢包率极低，可尝试将 rtsp_transport 改为 udp 进一步降低延迟。")
    print(f"   4. 前端 MJPEG 播放时，适当降低 target_width（如 1280）可减少编码/传输耗时。")
    print(f"\n   请查看当前目录生成的 test_*.jpg 截图，验证画面是否正常。")


if __name__ == '__main__':
    main()
