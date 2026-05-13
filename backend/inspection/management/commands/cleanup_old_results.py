"""B7修复：清理过期检测记录，防止 DB 无限增长。
使用方法: python manage.py cleanup_old_results --days 90
建议通过 cron 每周执行一次。
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from inspection.models import InspectionResult
from datetime import timedelta
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = '清理超过 N 天的旧检测记录（默认90天）'

    def add_arguments(self, parser):
        parser.add_argument(
            '--days',
            type=int,
            default=90,
            help='保留最近多少天的记录（默认90）',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='仅统计不删除',
        )

    def handle(self, *args, **options):
        days = options['days']
        dry_run = options['dry_run']
        if days < 1:
            raise ValueError('--days 必须大于 0')
        if days > 36500:
            self.stdout.write(
                self.style.WARNING('--days 超过 36500，已按 36500 天处理')
            )
            days = 36500
        cutoff = timezone.now() - timedelta(days=days)

        count = InspectionResult.objects.filter(timestamp__lt=cutoff).count()

        if dry_run:
            self.stdout.write(
                f'[DRY RUN] 将会删除 {count} 条 {days} 天前的记录 (截止 {cutoff.date()})'
            )
            return

        deleted, _ = InspectionResult.objects.filter(timestamp__lt=cutoff).delete()
        self.stdout.write(
            f'已删除 {deleted} 条 {days} 天前的记录 (截止 {cutoff.date()})'
        )
        logger.info('cleanup_old_results: deleted %d records older than %d days', deleted, days)
