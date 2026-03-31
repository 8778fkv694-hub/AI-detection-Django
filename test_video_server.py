#!/usr/bin/env python3
"""
简单的本地视频流测试服务器
用于测试流媒体虚拟摄像头功能
"""
from flask import Flask, Response
import cv2
import time

app = Flask(__name__)

def generate_frames():
    """生成测试视频帧"""
    # 使用摄像头（如果有）或生成测试图案
    cap = cv2.VideoCapture(0)  # 0 表示默认摄像头
    
    # 如果没有摄像头，创建测试图案
    if not cap.isOpened():
        print("没有检测到摄像头，使用测试图案...")
        width, height = 640, 480
        frame_count = 0
        
        while True:
            # 创建彩色测试图案
            frame = cv2.imread('/dev/null')  # 占位
            frame = generate_test_pattern(width, height, frame_count)
            
            # 编码为JPEG
            ret, buffer = cv2.imencode('.jpg', frame)
            frame_bytes = buffer.tobytes()
            
            # 生成multipart响应
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
            
            frame_count += 1
            time.sleep(0.033)  # 约30 FPS
    else:
        print("使用摄像头生成视频流...")
        while True:
            success, frame = cap.read()
            if not success:
                break
            
            # 编码为JPEG
            ret, buffer = cv2.imencode('.jpg', frame)
            frame_bytes = buffer.tobytes()
            
            # 生成multipart响应
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

def generate_test_pattern(width, height, frame_count):
    """生成测试图案"""
    import numpy as np
    
    # 创建渐变背景
    frame = np.zeros((height, width, 3), dtype=np.uint8)
    
    # 彩色渐变
    for y in range(height):
        for x in range(width):
            frame[y, x] = [
                (x * 255 // width),
                (y * 255 // height),
                ((x + y + frame_count) * 255 // (width + height))
            ]
    
    # 添加文字
    text = f"Test Pattern - Frame {frame_count}"
    cv2.putText(frame, text, (50, height // 2), 
                cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
    
    # 添加移动的圆形
    center_x = int(width / 2 + 100 * np.sin(frame_count * 0.1))
    center_y = int(height / 2 + 100 * np.cos(frame_count * 0.1))
    cv2.circle(frame, (center_x, center_y), 50, (0, 255, 255), -1)
    
    return frame

@app.route('/')
def index():
    """主页"""
    return '''
    <html>
    <head><title>本地视频流测试</title></head>
    <body style="background: #1a1a1a; color: white; font-family: Arial;">
        <h1>🎥 本地视频流测试服务器</h1>
        <p>视频流地址：<code>http://localhost:5000/video_feed</code></p>
        <p>在流媒体管理中使用：</p>
        <ul>
            <li>流类型：HTTP流</li>
            <li>流地址：http://localhost:5000/video_feed</li>
        </ul>
        <hr>
        <h2>实时预览：</h2>
        <img src="/video_feed" style="max-width: 100%; border: 2px solid #4a9eff;">
        <hr>
        <p><small>按 Ctrl+C 停止服务器</small></p>
    </body>
    </html>
    '''

@app.route('/video_feed')
def video_feed():
    """视频流端点"""
    return Response(generate_frames(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')

if __name__ == '__main__':
    print("="*60)
    print("🎥 本地视频流测试服务器")
    print("="*60)
    print("\n访问地址：")
    print("  - 浏览器预览：http://localhost:5000")
    print("  - 流媒体地址：http://localhost:5000/video_feed")
    print("\n在流媒体管理中配置：")
    print("  - 流类型：HTTP流")
    print("  - 流地址：http://localhost:5000/video_feed")
    print("\n按 Ctrl+C 停止服务器")
    print("="*60)
    
    # 启动服务器
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)

