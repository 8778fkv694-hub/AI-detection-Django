#!/usr/bin/env python3
"""
测试WebP API的脚本
"""
import requests
import sys

STREAM_ID = "cd2b481b-6f0a-4b6e-9250-215e4924c4d8"
DJANGO_API = "http://localhost:8000"
NODEJS_API = "http://localhost:3000"

def test_nodejs():
    """测试Node.js服务"""
    print("=" * 50)
    print("测试 Node.js 服务")
    print("=" * 50)
    
    # 健康检查
    try:
        r = requests.get(f"{NODEJS_API}/health", timeout=2)
        print(f"健康检查: {r.status_code} - {r.json()}")
    except Exception as e:
        print(f"❌ Node.js服务不可用: {e}")
        return False
    
    # 测试WebP格式
    try:
        r = requests.get(
            f"{NODEJS_API}/api/streams/{STREAM_ID}/frame",
            params={
                'format': 'webp',
                'quality': 100,
                'width': 1280,
                'url': '/Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django/IMG_2043.MOV',
                'stream_type': 'file'
            },
            timeout=15
        )
        print(f"WebP请求: {r.status_code}")
        if r.status_code == 200:
            data = r.json()
            frame = data.get('frame', '')
            print(f"✅ 成功！格式: {data.get('format')}")
            print(f"帧数据长度: {len(frame)}")
            print(f"是否WebP: {frame.startswith('data:image/webp')}")
            return True
        else:
            print(f"❌ 错误: {r.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ 请求失败: {e}")
        return False

def test_django():
    """测试Django API"""
    print("\n" + "=" * 50)
    print("测试 Django API")
    print("=" * 50)
    
    # 检查流媒体对象
    try:
        r = requests.get(f"{DJANGO_API}/api/streams/{STREAM_ID}/")
        print(f"流媒体对象: {r.status_code}")
        if r.status_code == 200:
            data = r.json()
            print(f"流名称: {data.get('name')}")
            print(f"流状态: {data.get('status')}")
        else:
            print(f"❌ 无法获取流媒体对象: {r.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ 请求失败: {e}")
        return False
    
    # 测试frame API
    try:
        r = requests.get(
            f"{DJANGO_API}/api/streams/{STREAM_ID}/frame/",
            params={
                'format': 'webp',
                'quality': 100,
                'width': 1280
            },
            timeout=15
        )
        print(f"\nFrame API请求: {r.status_code}")
        if r.status_code == 200:
            data = r.json()
            frame = data.get('frame', '')
            print(f"✅ 成功！")
            print(f"帧数据长度: {len(frame)}")
            print(f"是否WebP: {frame.startswith('data:image/webp')}")
            return True
        else:
            print(f"❌ 错误: {r.text[:200]}")
            print("\n可能原因:")
            print("1. Django服务未重启，新代码未加载")
            print("2. Node.js服务调用失败")
            print("3. stream_manager中没有该流")
            return False
    except Exception as e:
        print(f"❌ 请求失败: {e}")
        return False

if __name__ == "__main__":
    print("WebP API 测试脚本")
    print("=" * 50)
    
    nodejs_ok = test_nodejs()
    django_ok = test_django()
    
    print("\n" + "=" * 50)
    print("测试总结")
    print("=" * 50)
    print(f"Node.js服务: {'✅ 正常' if nodejs_ok else '❌ 异常'}")
    print(f"Django API: {'✅ 正常' if django_ok else '❌ 异常'}")
    
    if not django_ok and nodejs_ok:
        print("\n💡 建议:")
        print("1. 重启Django服务以加载新代码")
        print("2. 检查Django控制台的日志输出")
        print("3. 确保流媒体已启动")
    
    sys.exit(0 if (nodejs_ok and django_ok) else 1)

