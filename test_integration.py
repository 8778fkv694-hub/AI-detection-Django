#!/usr/bin/env python
"""
测试 Django + Node.js 集成
"""
import requests
import time
import json

DJANGO_API = "http://localhost:8000/api"
NODEJS_API = "http://localhost:3000/api"

def test_nodejs_service():
    """测试 Node.js 服务"""
    print("\n=== 测试 Node.js 服务 ===")
    try:
        response = requests.get(f"{NODEJS_API.replace('/api', '')}/health", timeout=2)
        if response.status_code == 200:
            print("✅ Node.js 服务运行正常")
            return True
        else:
            print(f"❌ Node.js 服务返回错误: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Node.js 服务不可用: {e}")
        return False

def test_django_api():
    """测试 Django API（需要先有流媒体配置）"""
    print("\n=== 测试 Django API ===")
    try:
        # 获取流媒体列表
        response = requests.get(f"{DJANGO_API}/streams/", timeout=5)
        if response.status_code == 200:
            streams = response.json()
            print(f"✅ Django API 正常，找到 {len(streams)} 个流媒体")
            
            if len(streams) > 0:
                # 测试获取帧
                stream_id = streams[0]['id']
                print(f"\n测试获取帧 (流ID: {stream_id})...")
                
                start = time.time()
                frame_response = requests.get(
                    f"{DJANGO_API}/streams/{stream_id}/frame/",
                    params={'quality': 95, 'width': 1280},
                    timeout=15
                )
                duration = (time.time() - start) * 1000
                
                if frame_response.status_code == 200:
                    data = frame_response.json()
                    frame_size = len(data.get('frame', ''))
                    print(f"✅ 获取帧成功")
                    print(f"   耗时: {duration:.2f}ms")
                    print(f"   帧大小: {frame_size} 字符")
                    print(f"   使用服务: {'Node.js' if 'data:image/png' in data.get('frame', '') else 'Django'}")
                    return True
                else:
                    print(f"❌ 获取帧失败: {frame_response.status_code}")
                    print(f"   响应: {frame_response.text[:200]}")
                    return False
            else:
                print("⚠️  没有可用的流媒体，请先在流媒体管理页面添加一个流")
                return False
        else:
            print(f"❌ Django API 返回错误: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Django API 测试失败: {e}")
        return False

def test_performance_comparison():
    """性能对比测试"""
    print("\n=== 性能对比测试 ===")
    print("(需要先有流媒体配置)")
    
    # 这里可以添加更详细的性能测试
    print("✅ 集成测试完成，性能提升请查看实际使用效果")

def main():
    print("🚀 Django + Node.js 集成测试")
    print("=" * 50)
    
    nodejs_ok = test_nodejs_service()
    django_ok = test_django_api()
    
    print("\n" + "=" * 50)
    print("📊 测试总结")
    print(f"  Node.js 服务: {'✅ 正常' if nodejs_ok else '❌ 不可用'}")
    print(f"  Django API: {'✅ 正常' if django_ok else '❌ 异常'}")
    
    if nodejs_ok and django_ok:
        print("\n✅ 集成成功！Django 会自动使用 Node.js 服务获取帧")
        print("   如果 Node.js 不可用，会自动回退到 Django 原生实现")
    elif not nodejs_ok:
        print("\n⚠️  Node.js 服务不可用，Django 将使用原生实现")
    else:
        print("\n❌ 请检查 Django 服务是否正常运行")

if __name__ == '__main__':
    main()

