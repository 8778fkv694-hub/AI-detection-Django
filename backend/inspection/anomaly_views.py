"""异常管理 ViewSets"""
import logging
from datetime import timedelta
from django.utils import timezone
from django.db.models import Count, Q
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import AnomalyRule, AnomalyRecord
from .serializers import AnomalyRuleSerializer, AnomalyRecordSerializer
from .anomaly_service import transition_anomaly_status

logger = logging.getLogger(__name__)


class AnomalyRuleViewSet(viewsets.ModelViewSet):
    queryset = AnomalyRule.objects.all()
    serializer_class = AnomalyRuleSerializer


class AnomalyRecordViewSet(viewsets.ModelViewSet):
    queryset = AnomalyRecord.objects.select_related('rule', 'recipe').all()
    serializer_class = AnomalyRecordSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        if params.get('status'):
            qs = qs.filter(status=params['status'])
        if params.get('anomaly_type'):
            qs = qs.filter(anomaly_type=params['anomaly_type'])
        if params.get('process_stage_code'):
            qs = qs.filter(process_stage_code=params['process_stage_code'])
        if params.get('severity'):
            qs = qs.filter(severity=params['severity'])
        limit = params.get('limit')
        if limit:
            try:
                qs = qs[:int(limit)]
            except (ValueError, TypeError):
                pass
        return qs

    @action(detail=True, methods=['post'], url_path='transition')
    def transition(self, request, pk=None):
        """状态流转：POST /api/anomaly-records/{id}/transition/"""
        record = self.get_object()
        act = request.data.get('action', '')
        password = request.data.get('password', '')
        comment = request.data.get('comment', '')
        operator = request.data.get('operator', '')

        try:
            record = transition_anomaly_status(record, act, password, comment, operator)
            serializer = self.get_serializer(record)
            return Response(serializer.data)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='active-alerts')
    def active_alerts(self, request):
        """轻量级告警查询，OCRDetectionScreen 轮询用"""
        process_code = request.query_params.get('process_stage_code', '')
        qs = AnomalyRecord.objects.filter(
            status__in=['open', 'in_progress']
        )
        if process_code:
            qs = qs.filter(
                Q(process_stage_code=process_code) | Q(process_stage_code='')
            )
        alerts = qs.order_by('-opened_at')[:20].values(
            'id', 'title', 'severity', 'anomaly_type', 'status', 'opened_at', 'process_stage_code'
        )
        return Response({'alerts': list(alerts)})

    @action(detail=False, methods=['get'], url_path='dashboard')
    def dashboard(self, request):
        """异常看板统计"""
        time_range = request.query_params.get('time_range', '24h')
        process_code = request.query_params.get('process_stage_code', '')

        # 时间范围
        range_map = {'24h': 1, '7d': 7, '30d': 30}
        days = range_map.get(time_range, 1)
        cutoff = timezone.now() - timedelta(days=days)

        base_qs = AnomalyRecord.objects.all()
        if process_code:
            base_qs = base_qs.filter(process_stage_code=process_code)

        # 状态统计
        open_count = base_qs.filter(status='open').count()
        suspended_count = base_qs.filter(status='suspended').count()
        in_progress_count = base_qs.filter(status='in_progress').count()
        resolved_today = base_qs.filter(
            status='resolved',
            resolved_at__date=timezone.now().date()
        ).count()

        # 按类型统计
        by_type = dict(
            base_qs.filter(status__in=['open', 'suspended', 'in_progress'])
            .values_list('anomaly_type')
            .annotate(count=Count('id'))
            .values_list('anomaly_type', 'count')
        )

        # 按严重度统计
        by_severity = dict(
            base_qs.filter(status__in=['open', 'suspended', 'in_progress'])
            .values_list('severity')
            .annotate(count=Count('id'))
            .values_list('severity', 'count')
        )

        # 趋势（按天）
        from django.db.models.functions import TruncDate
        trend_qs = base_qs.filter(opened_at__gte=cutoff).annotate(
            date=TruncDate('opened_at')
        ).values('date').annotate(count=Count('id')).order_by('date')
        trend = [{'date': str(t['date']), 'count': t['count']} for t in trend_qs]

        # 最近异常
        recent = AnomalyRecordSerializer(
            base_qs.order_by('-opened_at')[:10],
            many=True
        ).data

        return Response({
            'openCount': open_count,
            'suspendedCount': suspended_count,
            'inProgressCount': in_progress_count,
            'resolvedToday': resolved_today,
            'byType': by_type,
            'bySeverity': by_severity,
            'trend': trend,
            'recentAnomalies': recent,
        })

    @action(detail=False, methods=['post'], url_path='sync-batch')
    def sync_batch(self, request):
        """离线同步：批量上传异常记录，按 client_id 去重"""
        records = request.data.get('records', [])
        created = 0
        skipped = 0

        for item in records:
            client_id = item.get('client_id', '')
            if client_id and AnomalyRecord.objects.filter(client_id=client_id).exists():
                skipped += 1
                continue

            serializer = AnomalyRecordSerializer(data=item)
            if serializer.is_valid():
                serializer.save(synced=True)
                created += 1
            else:
                skipped += 1
                logger.warning(f'离线同步失败: {serializer.errors}')

        return Response({'created': created, 'skipped': skipped})
