#!/usr/bin/env python3
"""
使用ModelScope下载Qwen2.5-VL-7B-Instruct模型文件
支持多种下载方式：完整模型库、单个文件、Git下载
"""

import os
import sys
import subprocess
from pathlib import Path
from modelscope import snapshot_download
import requests

def check_disk_space():
    """检查磁盘空间"""
    import shutil
    
    # 检查可用空间（需要约15GB）
    total, used, free = shutil.disk_usage("/")
    free_gb = free // (1024**3)
    
    print(f"可用磁盘空间: {free_gb} GB")
    
    if free_gb < 15:
        print("⚠️  警告: 可用磁盘空间不足15GB，模型下载可能失败")
        return False
    else:
        print("✓ 磁盘空间充足")
        return True

def download_full_model():
    """下载完整模型库"""
    print("=== 方式1: 下载完整模型库 ===")
    print("模型大小约14GB，下载可能需要较长时间...")
    
    # 设置模型缓存目录
    cache_dir = Path(__file__).parent.parent / "models"
    cache_dir.mkdir(exist_ok=True)
    
    try:
        print("正在从ModelScope下载完整模型...")
        model_path = snapshot_download(
            model_id="Qwen/Qwen2.5-VL-7B-Instruct",
            cache_dir=str(cache_dir),
            local_dir=str(cache_dir / "Qwen2.5-VL-7B-Instruct"),
            local_dir_use_symlinks=False
        )
        
        print(f"✓ 完整模型下载完成！")
        print(f"模型路径: {model_path}")
        return True
        
    except Exception as e:
        print(f"✗ 模型下载失败: {e}")
        print("请确保已安装ModelScope: pip install modelscope")
        return False

def download_single_file():
    """下载单个文件到指定目录"""
    print("=== 方式2: 下载单个文件 ===")
    
    # 创建目标目录
    target_dir = Path(__file__).parent.parent / "models" / "single_files"
    target_dir.mkdir(parents=True, exist_ok=True)
    
    # 要下载的文件列表
    files_to_download = [
        "README.md",
        "config.json",
        "tokenizer.json",
        "tokenizer_config.json"
    ]
    
    success_count = 0
    
    for file_name in files_to_download:
        try:
            print(f"正在下载 {file_name}...")
            # 使用ModelScope下载单个文件
            file_path = snapshot_download(
                model_id="Qwen/Qwen2.5-VL-7B-Instruct",
                file_filter=file_name,
                local_dir=str(target_dir),
                local_dir_use_symlinks=False
            )
            print(f"✓ {file_name} 下载完成")
            success_count += 1
            
        except Exception as e:
            print(f"✗ {file_name} 下载失败: {e}")
    
    print(f"成功下载 {success_count}/{len(files_to_download)} 个文件")
    return success_count > 0

def download_via_git():
    """通过Git下载模型"""
    print("=== 方式3: Git下载 ===")
    
    # 检查git lfs是否已安装
    try:
        subprocess.run(["git", "lfs", "version"], check=True, capture_output=True)
        print("✓ Git LFS 已安装")
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("✗ Git LFS 未安装，正在安装...")
        try:
            subprocess.run(["git", "lfs", "install"], check=True)
            print("✓ Git LFS 安装完成")
        except subprocess.CalledProcessError:
            print("✗ Git LFS 安装失败，请手动安装")
            return False
    
    # 设置目标目录
    target_dir = Path(__file__).parent.parent / "models" / "git_download"
    target_dir.mkdir(parents=True, exist_ok=True)
    
    try:
        print("正在通过Git克隆模型仓库...")
        # 设置环境变量跳过LFS大文件下载（可选）
        env = os.environ.copy()
        # env["GIT_LFS_SKIP_SMUDGE"] = "1"  # 取消注释以跳过大文件下载
        
        subprocess.run([
            "git", "clone", 
            "https://www.modelscope.cn/Qwen/Qwen2.5-VL-7B-Instruct.git",
            str(target_dir / "Qwen2.5-VL-7B-Instruct")
        ], check=True, env=env)
        
        print("✓ Git下载完成")
        print(f"模型路径: {target_dir / 'Qwen2.5-VL-7B-Instruct'}")
        return True
        
    except subprocess.CalledProcessError as e:
        print(f"✗ Git下载失败: {e}")
        return False

def verify_model(model_path):
    """验证模型文件"""
    print("验证模型文件...")
    
    if not model_path.exists():
        print("✗ 模型目录不存在")
        return False
    
    # 检查关键文件
    required_files = [
        "config.json",
        "tokenizer.json",
        "tokenizer_config.json"
    ]
    
    for file in required_files:
        if not (model_path / file).exists():
            print(f"✗ 缺少文件: {file}")
            return False
    
    print("✓ 模型文件验证通过")
    return True

def show_usage():
    """显示使用说明"""
    print("=== ModelScope 模型下载器 ===")
    print("支持以下下载方式：")
    print("1. 完整模型库下载 (推荐)")
    print("2. 单个文件下载")
    print("3. Git下载")
    print("4. 显示使用说明")
    print("5. 退出")
    print()

def main():
    """主函数"""
    show_usage()
    
    # 检查磁盘空间
    if not check_disk_space():
        response = input("是否继续下载？(y/N): ")
        if response.lower() != 'y':
            print("下载已取消")
            return
    
    while True:
        print("\n" + "="*50)
        choice = input("请选择下载方式 (1-5): ").strip()
        
        if choice == "1":
            if download_full_model():
                model_path = Path(__file__).parent.parent / "models" / "Qwen2.5-VL-7B-Instruct"
                if verify_model(model_path):
                    print("\n🎉 完整模型下载完成！现在可以启动服务了")
                else:
                    print("\n❌ 模型文件验证失败")
            break
            
        elif choice == "2":
            if download_single_file():
                print("\n🎉 单个文件下载完成！")
            break
            
        elif choice == "3":
            if download_via_git():
                print("\n🎉 Git下载完成！")
            break
            
        elif choice == "4":
            show_usage()
            continue
            
        elif choice == "5":
            print("退出下载器")
            break
            
        else:
            print("无效选择，请重新输入")

if __name__ == "__main__":
    main()
