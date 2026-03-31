#!/usr/bin/env python
"""
Django开发服务器启动脚本
系统必须依赖PPE模型，启动前会检查PPE模型是否可用
"""
import os
import sys
import subprocess
from pathlib import Path

def check_ppe_model():
    """
    检查PPE模型是否可用
    """
    try:
        # 设置Django环境
        os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
        
        # 导入Django
        import django
        django.setup()
        
        # 导入PPE模型检查函数
        from inspection.yolo import validate_model_availability, get_ppe_model_info
        
        print("=" * 60)
        print("PPE模型启动检查")
        print("=" * 60)
        
        # 获取PPE模型信息
        model_info = get_ppe_model_info()
        print(f"模型类型: {model_info['model_type']}")
        print(f"模型路径: {model_info['model_path']}")
        print(f"模型存在: {'✅' if model_info['model_exists'] else '❌'}")
        print(f"模型大小: {model_info['model_size'] / (1024*1024):.2f} MB" if model_info['model_exists'] else "模型不存在")
        print(f"是否必需: {'✅' if model_info['required'] else '❌'}")
        print(f"描述: {model_info['description']}")
        print()
        
        # 验证模型是否可用
        print("正在验证PPE模型...")
        is_available = validate_model_availability()
        if is_available:
            print("✅ PPE模型验证成功，系统可以正常启动")
            return True
        else:
            print("❌ PPE模型验证失败，系统无法启动")
            return False
            
    except Exception as e:
        print(f"❌ PPE模型检查异常: {str(e)}")
        return False

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
        import django
        print(f"Django版本: {django.get_version()}")
    except ImportError:
        print("错误：Django未安装，请运行: pip install -r requirements.txt")
        sys.exit(1)
    
    # 检查PPE模型是否可用
    if not check_ppe_model():
        print("\n" + "=" * 60)
        print("❌ 系统启动失败")
        print("=" * 60)
        print("系统必须依赖PPE模型，但PPE模型不可用。")
        print("请检查以下项目:")
        print("1. PPE模型文件是否存在")
        print("2. PPE模型文件是否完整")
        print("3. 模型文件路径是否正确")
        print("4. 是否有足够的磁盘空间")
        print("5. 是否有读取权限")
        print("\n解决方案:")
        print("1. 将PPE模型文件放置在正确位置")
        print("2. 设置PPE_MODEL_PATH环境变量")
        print("3. 检查文件权限")
        print("4. 重新下载模型文件")
        sys.exit(1)
    
    # 运行数据库迁移
    print("运行数据库迁移...")
    subprocess.run([sys.executable, 'manage.py', 'migrate'], check=True)
    
    # 创建超级用户（如果不存在）
    print("检查超级用户...")
    try:
        from django.contrib.auth.models import User
        if not User.objects.filter(is_superuser=True).exists():
            print("创建超级用户...")
            subprocess.run([sys.executable, 'manage.py', 'createsuperuser', '--noinput'], 
                         env={**os.environ, 'DJANGO_SUPERUSER_USERNAME': 'admin', 
                              'DJANGO_SUPERUSER_EMAIL': 'admin@example.com',
                              'DJANGO_SUPERUSER_PASSWORD': 'admin123'}, check=True)
            print("超级用户已创建: admin/admin123")
    except Exception as e:
        print(f"创建超级用户时出错: {e}")
    
    # 启动开发服务器
    print("启动Django开发服务器...")
    print("服务器将在 http://localhost:8000 运行")
    print("管理界面: http://localhost:8000/admin")
    print("API文档: http://localhost:8000/api/")
    print("PPE模型状态: http://localhost:8000/api/results/ppe-model-status/")
    print("按 Ctrl+C 停止服务器")
    
    subprocess.run([sys.executable, 'manage.py', 'runserver', '0.0.0.0:8000'])

if __name__ == '__main__':
    main()
