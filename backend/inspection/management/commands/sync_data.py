from django.core.management.base import BaseCommand
from django.utils import timezone
from django.core.cache import cache
from django.db import connection
from inspection.models import InspectionResult
from datetime import timedelta
import logging

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = '执行数据同步和清理操作'
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--clean-old',
            action='store_true',
            help='清理30天前的旧数据',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='强制同步，忽略时间限制',
        )
        parser.add_argument(
            '--days',
            type=int,
            default=30,
            help='清理多少天前的数据（默认30天）',
        )
    
    def handle(self, *args, **options):
        self.stdout.write('开始执行数据同步操作...')
        
        try:
            # 检查是否需要同步
            if not options['force']:
                last_sync = cache.get('last_data_sync')
                if last_sync and (timezone.now() - last_sync).total_seconds() < 300:
                    self.stdout.write('距离上次同步时间不足5分钟，跳过同步')
                    return
            
            # 执行数据同步
            self._perform_sync()
            
            # 清理旧数据
            if options['clean_old']:
                self._clean_old_data(options['days'])
            
            # 更新同步状态
            cache.set('last_data_sync', timezone.now(), 3600)
            cache.delete('needs_sync')
            
            self.stdout.write(
                self.style.SUCCESS('数据同步完成！')
            )
            
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f'数据同步失败: {e}')
            )
            logger.error(f'数据同步命令执行失败: {e}')
    
    def _perform_sync(self):
        """执行数据同步"""
        self.stdout.write('正在同步数据...')
        
        # 重新连接数据库
        connection.close()
        connection.ensure_connection()
        
        # 清理缓存
        cache.clear()
        
        # 统计当前数据
        total_results = InspectionResult.objects.count()
        qualified_count = InspectionResult.objects.filter(overall_quality='合格').count()
        unqualified_count = InspectionResult.objects.filter(overall_quality='不合格').count()
        recheck_count = InspectionResult.objects.filter(overall_quality='需复检').count()
        
        self.stdout.write(f'当前数据统计:')
        self.stdout.write(f'  总检测结果: {total_results}')
        self.stdout.write(f'  合格: {qualified_count}')
        self.stdout.write(f'  不合格: {unqualified_count}')
        self.stdout.write(f'  需复检: {recheck_count}')
        
        if total_results > 0:
            qualified_rate = (qualified_count / total_results) * 100
            self.stdout.write(f'  合格率: {qualified_rate:.1f}%')
    
    def _clean_old_data(self, days):
        """清理旧数据"""
        self.stdout.write(f'正在清理{days}天前的旧数据...')
        
        cutoff_date = timezone.now() - timedelta(days=days)
        old_results = InspectionResult.objects.filter(timestamp__lt=cutoff_date)
        old_count = old_results.count()
        
        if old_count > 0:
            old_results.delete()
            self.stdout.write(f'已清理 {old_count} 条旧数据')
        else:
            self.stdout.write('没有需要清理的旧数据')
