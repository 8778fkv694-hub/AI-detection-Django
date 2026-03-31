#!/usr/bin/env python
"""
Celery工作进程启动脚本
"""
import os
import sys
import subprocess
from pathlib import Path

def main():
    # 设置Django设置模块
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    
    # 获取项目根目录
    project_root = Path(__file__).parent
    
    # 检查是否在正确的目录
    if not (project_root / 'manage.py').exists():
        print("错误：请在backend目录下运行此脚本")
        sys.exit(1)
    
    # 检查依赖是否安装
    try:
        import celery
        print(f"Celery版本: {celery.__version__}")
    except ImportError:
        print("错误：Celery未安装，请运行: pip install -r requirements.txt")
        sys.exit(1)
    
    # 启动Celery工作进程
    print("启动Celery工作进程...")
    print("确保Redis服务器正在运行 (docker-compose up redis)")
    print("按 Ctrl+C 停止工作进程")
    
    subprocess.run([
        sys.executable, '-m', 'celery', '-A', 'config', 'worker',
        '--loglevel=info', '--concurrency=2'
    ])

if __name__ == '__main__':
    main()
