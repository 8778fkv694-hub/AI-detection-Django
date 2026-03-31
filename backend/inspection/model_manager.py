import os
import hashlib
import shutil
import tempfile
from typing import Dict, Any, Optional, List
from django.core.files.storage import default_storage
from django.conf import settings
import torch
import numpy as np

class ModelManager:
    """模型管理工具类"""
    
    @staticmethod
    def calculate_file_hash(file_path: str) -> str:
        """计算文件哈希值"""
        hash_sha256 = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_sha256.update(chunk)
        return hash_sha256.hexdigest()
    
    @staticmethod
    def validate_model_file(file_path: str) -> Dict[str, Any]:
        """验证模型文件"""
        try:
            # 检查文件是否存在
            if not os.path.exists(file_path):
                return {'valid': False, 'error': '文件不存在'}
            
            # 检查文件大小
            file_size = os.path.getsize(file_path)
            if file_size == 0:
                return {'valid': False, 'error': '文件为空'}
            
            # 检查文件扩展名
            if not file_path.endswith('.pt'):
                return {'valid': False, 'error': '不支持的文件格式，仅支持.pt文件'}
            
            # 计算文件哈希
            file_hash = ModelManager.calculate_file_hash(file_path)
            
            # 尝试加载模型（可选）
            try:
                # 这里可以添加实际的模型验证逻辑
                # 例如：尝试加载YOLO模型
                pass
            except Exception as e:
                return {'valid': False, 'error': f'模型加载失败: {str(e)}'}
            
            return {
                'valid': True,
                'file_size': file_size,
                'file_hash': file_hash,
                'file_path': file_path
            }
            
        except Exception as e:
            return {'valid': False, 'error': f'验证失败: {str(e)}'}
    
    @staticmethod
    def copy_model_to_active_directory(model_file_path: str, model_name: str) -> str:
        """将模型文件复制到激活目录"""
        try:
            # 创建激活目录
            active_dir = os.path.join(settings.MEDIA_ROOT, 'active_models')
            os.makedirs(active_dir, exist_ok=True)
            
            # 复制文件
            active_path = os.path.join(active_dir, f'{model_name}.pt')
            shutil.copy2(model_file_path, active_path)
            
            return active_path
        except Exception as e:
            raise Exception(f'复制模型文件失败: {str(e)}')
    
    @staticmethod
    def get_model_info(model_path: str) -> Dict[str, Any]:
        """获取模型信息"""
        try:
            if not os.path.exists(model_path):
                return {'error': '模型文件不存在'}
            
            file_size = os.path.getsize(model_path)
            file_hash = ModelManager.calculate_file_hash(model_path)
            
            # 尝试获取模型详细信息
            try:
                # 这里可以添加获取模型详细信息的逻辑
                # 例如：模型结构、输入输出形状等
                pass
            except Exception as e:
                print(f"获取模型详细信息失败: {e}")
            
            return {
                'file_size': file_size,
                'file_hash': file_hash,
                'file_path': model_path,
                'file_size_mb': round(file_size / (1024 * 1024), 2)
            }
            
        except Exception as e:
            return {'error': f'获取模型信息失败: {str(e)}'}
    
    @staticmethod
    def backup_model(model_path: str, backup_dir: str = None) -> str:
        """备份模型文件"""
        try:
            if not os.path.exists(model_path):
                raise Exception('模型文件不存在')
            
            if backup_dir is None:
                backup_dir = os.path.join(settings.MEDIA_ROOT, 'model_backups')
            
            os.makedirs(backup_dir, exist_ok=True)
            
            # 生成备份文件名
            base_name = os.path.basename(model_path)
            name, ext = os.path.splitext(base_name)
            timestamp = int(time.time())
            backup_name = f'{name}_backup_{timestamp}{ext}'
            backup_path = os.path.join(backup_dir, backup_name)
            
            # 复制文件
            shutil.copy2(model_path, backup_path)
            
            return backup_path
            
        except Exception as e:
            raise Exception(f'备份模型失败: {str(e)}')
    
    @staticmethod
    def cleanup_old_models(keep_count: int = 5) -> List[str]:
        """清理旧模型文件"""
        try:
            model_dir = os.path.join(settings.MEDIA_ROOT, 'models')
            if not os.path.exists(model_dir):
                return []
            
            # 获取所有模型文件
            model_files = []
            for file in os.listdir(model_dir):
                if file.endswith('.pt'):
                    file_path = os.path.join(model_dir, file)
                    model_files.append((file_path, os.path.getmtime(file_path)))
            
            # 按修改时间排序
            model_files.sort(key=lambda x: x[1], reverse=True)
            
            # 删除旧文件
            deleted_files = []
            for file_path, _ in model_files[keep_count:]:
                try:
                    os.remove(file_path)
                    deleted_files.append(file_path)
                except Exception as e:
                    print(f"删除文件失败 {file_path}: {e}")
            
            return deleted_files
            
        except Exception as e:
            print(f"清理旧模型失败: {e}")
            return []
    
    @staticmethod
    def get_model_performance_stats(model_version_id: str) -> Dict[str, Any]:
        """获取模型性能统计"""
        from .models import ModelPerformance
        
        try:
            performance_records = ModelPerformance.objects.filter(
                model_version_id=model_version_id
            ).order_by('-timestamp')
            
            if not performance_records.exists():
                return {'message': '暂无性能数据'}
            
            # 计算统计信息
            total_records = performance_records.count()
            avg_response_time = performance_records.aggregate(
                avg=models.Avg('response_time')
            )['avg']
            avg_memory_usage = performance_records.aggregate(
                avg=models.Avg('memory_usage')
            )['avg']
            avg_cpu_usage = performance_records.aggregate(
                avg=models.Avg('cpu_usage')
            )['avg']
            
            total_requests = performance_records.aggregate(
                total=models.Sum('request_count')
            )['total']
            total_success = performance_records.aggregate(
                total=models.Sum('success_count')
            )['total']
            total_errors = performance_records.aggregate(
                total=models.Sum('error_count')
            )['total']
            
            success_rate = (total_success / total_requests * 100) if total_requests > 0 else 0
            
            return {
                'total_records': total_records,
                'avg_response_time': round(avg_response_time, 2) if avg_response_time else 0,
                'avg_memory_usage': round(avg_memory_usage, 2) if avg_memory_usage else 0,
                'avg_cpu_usage': round(avg_cpu_usage, 2) if avg_cpu_usage else 0,
                'total_requests': total_requests,
                'total_success': total_success,
                'total_errors': total_errors,
                'success_rate': round(success_rate, 2)
            }
            
        except Exception as e:
            return {'error': f'获取性能统计失败: {str(e)}'}

import time
from django.db import models
