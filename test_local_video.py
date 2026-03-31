#!/usr/bin/env python3
"""测试本地视频文件读取"""
import cv2
import sys

video_path = "/Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django/IMG_2043.MOV"

print(f"测试视频文件: {video_path}")
print(f"OpenCV版本: {cv2.__version__}")
print("-" * 50)

# 尝试打开视频
cap = cv2.VideoCapture(video_path)

if not cap.isOpened():
    print("❌ 无法打开视频文件")
    sys.exit(1)

print("✅ 视频文件打开成功！")

# 获取视频信息
fps = cap.get(cv2.CAP_PROP_FPS)
frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
duration = frame_count / fps if fps > 0 else 0

print(f"视频信息:")
print(f"  - 分辨率: {width}x{height}")
print(f"  - 帧率: {fps:.2f} FPS")
print(f"  - 总帧数: {frame_count}")
print(f"  - 时长: {duration:.2f} 秒")
print("-" * 50)

# 尝试读取前5帧
print("尝试读取前5帧...")
for i in range(5):
    ret, frame = cap.read()
    if ret:
        print(f"  ✅ 第{i+1}帧读取成功 (shape: {frame.shape})")
    else:
        print(f"  ❌ 第{i+1}帧读取失败")
        break

cap.release()
print("-" * 50)
print("测试完成！")

