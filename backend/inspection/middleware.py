"""
数据一致性中间件
防止localhost和局域网端数据不同步问题
"""

import json
import time
import logging
from django.utils.deprecation import MiddlewareMixin
from django.core.cache import cache
from django.db import connection
from django.http import JsonResponse
from django.utils import timezone

logger = logging.getLogger(__name__)

class DataConsistencyMiddleware(MiddlewareMixin):
    """
    数据一致性中间件
    确保不同设备访问时数据保持同步
    """
    # 类级别计数器，限制日志频率
    _reconnect_count = 0
    _last_reconnect_log = 0

    def process_request(self, request):
        """处理请求前检查数据一致性"""
        try:
            # 检查是否需要数据同步
            last_sync = cache.get('last_data_sync')
            current_time = timezone.now()

            # 如果距离上次同步超过5分钟，标记需要同步
            if not last_sync or (current_time - last_sync).total_seconds() > 300:
                cache.set('needs_sync', True, 60)
                logger.debug('标记需要数据同步')

            # Django 会在首次 ORM 查询时惰性建立连接。连接不存在是正常状态，
            # 不应让 OCR、二维码、模型状态等纯计算请求被迫访问数据库。
            connection_unusable = False
            if connection.connection is not None:
                try:
                    connection_unusable = not connection.is_usable()
                except Exception:
                    connection_unusable = True

            if connection_unusable:
                current_time_sec = time.time()
                DataConsistencyMiddleware._reconnect_count += 1

                # 每60秒最多记录一次警告，避免日志刷屏
                if current_time_sec - DataConsistencyMiddleware._last_reconnect_log > 60:
                    logger.warning(f'数据库连接重建 (最近60秒重连次数: {DataConsistencyMiddleware._reconnect_count})')
                    DataConsistencyMiddleware._reconnect_count = 0
                    DataConsistencyMiddleware._last_reconnect_log = current_time_sec

                # 关闭失效连接即可；下一次真实 ORM 查询会按 Django 机制重建。
                connection.close()

        except Exception as e:
            logger.error(f'数据一致性检查失败: {e}')

        return None
    
    def process_response(self, request, response):
        """处理响应后更新同步状态"""
        try:
            # 如果是数据修改操作，更新同步时间
            if request.method in ['POST', 'PUT', 'DELETE', 'PATCH']:
                cache.set('last_data_sync', timezone.now(), 3600)  # 1小时过期
                cache.delete('needs_sync')
                logger.debug('数据已更新，同步时间已刷新')

        except Exception as e:
            logger.error(f'更新同步状态失败: {e}')

        return response

class DatabaseLockMiddleware(MiddlewareMixin):
    """
    数据库锁中间件
    防止并发写入冲突
    """
    
    lock_timeout_seconds = 10
    wait_timeout_seconds = 2
    retry_interval_seconds = 0.05

    def _extract_fixture_scope(self, request):
        fixture_qr = ''
        try:
            if request.content_type and 'application/json' in request.content_type and request.body:
                payload = json.loads(request.body.decode('utf-8'))
                fixture_qr = str(payload.get('fixture_qr') or '').strip()
            elif request.method in ['POST', 'PUT', 'PATCH']:
                fixture_qr = str(request.POST.get('fixture_qr') or '').strip()
        except Exception:
            fixture_qr = ''
        return fixture_qr

    # 这些接口是纯计算（不写 DB），不需要参与并发锁
    _NO_LOCK_PATHS = frozenset([
        '/api/ocr/extract/',
        '/api/barcode/detect/',
        '/api/wechat-qr/detect/',
        '/api/wechat-qr/detect-with-retry/',
        '/api/results/yolo-detect/',
        '/api/ocr/batch-detection/',
        '/api/product-trace/evaluate/',
        '/api/anomaly-records/active-alerts/',
        '/api/anomaly-records/dashboard/',
    ])

    def _build_lock_key(self, request):
        if request.path in self._NO_LOCK_PATHS:
            return None
        fixture_qr = self._extract_fixture_scope(request)
        if request.path.startswith('/api/results/') and fixture_qr:
            return f'db_lock_{request.path}_{fixture_qr}'
        return f'db_lock_{request.path}'

    def process_request(self, request):
        """处理请求前获取数据库锁"""
        try:
            # 只对写操作加锁
            if request.method in ['POST', 'PUT', 'DELETE', 'PATCH']:
                lock_key = self._build_lock_key(request)
                if lock_key is None:
                    return None
                start_time = time.time()
                lock_acquired = False

                while time.time() - start_time <= self.wait_timeout_seconds:
                    lock_acquired = cache.add(lock_key, True, self.lock_timeout_seconds)
                    if lock_acquired:
                        break
                    time.sleep(self.retry_interval_seconds)

                if not lock_acquired:
                    logger.warning(f'数据库锁获取失败: {request.path}')
                    return JsonResponse({
                        'error': '系统繁忙，请稍后重试',
                        'retry_after': 1
                    }, status=429)
                
                # 将锁信息存储到请求中
                request.db_lock_key = lock_key
                
        except Exception as e:
            logger.error(f'数据库锁处理失败: {e}')
        
        return None
    
    def process_response(self, request, response):
        """处理响应后释放数据库锁"""
        try:
            # 释放数据库锁
            if hasattr(request, 'db_lock_key'):
                cache.delete(request.db_lock_key)
                logger.debug(f'数据库锁已释放: {request.db_lock_key}')
                
        except Exception as e:
            logger.error(f'释放数据库锁失败: {e}')
        
        return response

class AutoSyncMiddleware(MiddlewareMixin):
    """
    自动同步中间件
    定期检查并执行数据同步
    """
    
    def process_request(self, request):
        """处理请求前检查自动同步"""
        try:
            # 检查是否需要自动同步
            needs_sync = cache.get('needs_sync', False)
            last_auto_sync = cache.get('last_auto_sync')
            current_time = timezone.now()
            
            # 如果标记需要同步且距离上次自动同步超过1分钟
            if needs_sync and (not last_auto_sync or (current_time - last_auto_sync).total_seconds() > 60):
                # 执行自动同步
                self._perform_auto_sync()
                cache.set('last_auto_sync', current_time, 300)  # 5分钟过期
                
        except Exception as e:
            logger.error(f'自动同步检查失败: {e}')
        
        return None
    
    def _perform_auto_sync(self):
        """执行自动同步"""
        try:
            logger.debug('开始自动数据同步...')

            # 清理过期缓存
            cache.clear()

            # 重新连接数据库
            connection.close()
            connection.ensure_connection()

            # 更新同步状态
            cache.set('last_data_sync', timezone.now(), 3600)
            cache.delete('needs_sync')

            logger.debug('自动数据同步完成')

        except Exception as e:
            logger.error(f'自动数据同步失败: {e}')

class PerformanceMonitoringMiddleware(MiddlewareMixin):
    """
    性能监控中间件
    监控API响应时间和数据库查询性能
    """
    
    def process_request(self, request):
        """记录请求开始时间"""
        request.start_time = time.time()
        return None
    
    def process_response(self, request, response):
        """计算响应时间并记录性能指标"""
        try:
            if hasattr(request, 'start_time'):
                response_time = time.time() - request.start_time
                
                # 记录慢请求
                if response_time > 1.0:  # 超过1秒的请求
                    logger.warning(f'慢请求: {request.path} - {response_time:.2f}s')
                
                # 添加响应时间头
                response['X-Response-Time'] = f'{response_time:.3f}s'
                
                # 记录性能指标到缓存
                perf_key = f'perf_{request.path}'
                perf_data = cache.get(perf_key, {'count': 0, 'total_time': 0, 'avg_time': 0})
                perf_data['count'] += 1
                perf_data['total_time'] += response_time
                perf_data['avg_time'] = perf_data['total_time'] / perf_data['count']
                cache.set(perf_key, perf_data, 3600)  # 1小时过期
                
        except Exception as e:
            logger.error(f'性能监控失败: {e}')
        
        return response
