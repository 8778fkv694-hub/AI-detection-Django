"""
异常评估引擎 — 参考 product_trace_service.py 的模式
每次保存检测结果后调用，检查匹配的活跃规则并创建异常记录
"""
import logging
from datetime import timedelta
from django.utils import timezone
from django.db.models import Q

logger = logging.getLogger(__name__)


def evaluate_anomalies_for_result(result):
    """
    每次 InspectionResult 保存后调用。
    检查所有匹配的活跃 AnomalyRule，返回新建/更新的 AnomalyRecord 列表。
    """
    from .models import AnomalyRule, AnomalyRecord

    process_code = getattr(result, 'process_stage_code', '') or ''
    if not process_code:
        return []

    # 查找匹配规则：by process_stage_code 或 recipe 关联 或 全局规则（无 process_stage_code）
    rules = AnomalyRule.objects.filter(is_active=True).filter(
        Q(process_stage_code=process_code) |
        Q(process_stage_code='') |
        Q(recipe__process_stage_code=process_code)
    ).distinct()

    new_anomalies = []
    for rule in rules:
        try:
            record = _evaluate_rule(result, rule)
            if record:
                new_anomalies.append(record)
        except Exception as e:
            logger.error(f'异常规则评估失败 rule={rule.id}: {e}')

    return new_anomalies


def _evaluate_rule(result, rule):
    """根据规则类型分发到对应检查器"""
    checkers = {
        'consecutive_fail': _check_consecutive_fail,
        'batch_anomaly': _check_batch_anomaly,
        'trace_break': _check_trace_break,
        'critical_defect': _check_critical_defect,
    }
    checker = checkers.get(rule.anomaly_type)
    if not checker:
        return None
    return checker(result, rule)


def _check_consecutive_fail(result, rule):
    """连续不合格：查最近 N 条同工序结果是否全部不合格"""
    from .models import InspectionResult, AnomalyRecord

    threshold = rule.thresholds.get('consecutive_count', 3)
    process_code = result.process_stage_code or ''

    recent = InspectionResult.objects.filter(
        process_stage_code=process_code
    ).order_by('-timestamp')[:threshold]

    results_list = list(recent)
    if len(results_list) < threshold:
        return None

    all_fail = all(r.overall_quality == '不合格' for r in results_list)
    if not all_fail:
        return None

    # 去重：同规则+同工序的 open/suspended 异常不重复创建
    existing = AnomalyRecord.objects.filter(
        rule=rule,
        process_stage_code=process_code,
        status__in=['open', 'suspended', 'in_progress']
    ).first()

    if existing:
        existing.related_results.add(result)
        existing.trigger_snapshot = {
            'consecutive_count': threshold,
            'latest_result_ids': [str(r.id) for r in results_list],
            'updated_at': timezone.now().isoformat(),
        }
        existing.save(update_fields=['trigger_snapshot', 'updated_at'])
        return existing

    record = AnomalyRecord.objects.create(
        rule=rule,
        recipe=rule.recipe,
        anomaly_type=rule.anomaly_type,
        severity=rule.severity,
        process_stage_code=process_code,
        fixture_qr=getattr(result, 'fixture_qr', '') or '',
        title=f'连续{threshold}次不合格 - {process_code}',
        description=f'工序 {process_code} 最近 {threshold} 次检测均为不合格',
        trigger_snapshot={
            'consecutive_count': threshold,
            'latest_result_ids': [str(r.id) for r in results_list],
        },
    )
    record.related_results.add(*results_list)
    logger.info(f'异常触发: {record.title} (rule={rule.name})')
    return record


def _check_batch_anomaly(result, rule):
    """批量异常：时间窗口内失败率超阈值"""
    from .models import InspectionResult, AnomalyRecord

    thresholds = rule.thresholds
    window_minutes = thresholds.get('time_window_minutes', 60)
    rate_threshold = thresholds.get('failure_rate_threshold', 0.3)
    min_sample = thresholds.get('min_sample_size', 10)
    process_code = result.process_stage_code or ''

    cutoff = timezone.now() - timedelta(minutes=window_minutes)
    recent = InspectionResult.objects.filter(
        process_stage_code=process_code,
        timestamp__gte=cutoff
    )
    total = recent.count()
    if total < min_sample:
        return None

    fail_count = recent.filter(overall_quality='不合格').count()
    fail_rate = fail_count / total

    if fail_rate < rate_threshold:
        return None

    existing = AnomalyRecord.objects.filter(
        rule=rule,
        process_stage_code=process_code,
        status__in=['open', 'suspended', 'in_progress']
    ).first()

    snapshot = {
        'time_window_minutes': window_minutes,
        'total_count': total,
        'fail_count': fail_count,
        'fail_rate': round(fail_rate, 3),
        'threshold': rate_threshold,
    }

    if existing:
        existing.related_results.add(result)
        existing.trigger_snapshot = snapshot
        existing.save(update_fields=['trigger_snapshot', 'updated_at'])
        return existing

    record = AnomalyRecord.objects.create(
        rule=rule,
        recipe=rule.recipe,
        anomaly_type=rule.anomaly_type,
        severity=rule.severity,
        process_stage_code=process_code,
        title=f'批量异常 - {process_code} ({fail_count}/{total}, {round(fail_rate*100)}%)',
        description=f'工序 {process_code} 近{window_minutes}分钟内失败率 {round(fail_rate*100)}% 超过阈值 {round(rate_threshold*100)}%',
        trigger_snapshot=snapshot,
    )
    record.related_results.add(result)
    logger.info(f'异常触发: {record.title} (rule={rule.name})')
    return record


def _check_trace_break(result, rule):
    """追踪断裂：fixture_qr 的追踪结论为需复检"""
    from .models import AnomalyRecord

    trace_conclusion = getattr(result, 'trace_conclusion', '') or ''
    fixture_qr = getattr(result, 'fixture_qr', '') or ''

    if trace_conclusion != '需复检' or not fixture_qr:
        return None

    existing = AnomalyRecord.objects.filter(
        rule=rule,
        fixture_qr=fixture_qr,
        status__in=['open', 'suspended', 'in_progress']
    ).first()

    if existing:
        existing.related_results.add(result)
        existing.save(update_fields=['updated_at'])
        return existing

    record = AnomalyRecord.objects.create(
        rule=rule,
        recipe=rule.recipe,
        anomaly_type=rule.anomaly_type,
        severity=rule.severity,
        process_stage_code=result.process_stage_code or '',
        fixture_qr=fixture_qr,
        title=f'追踪断裂 - {fixture_qr}',
        description=f'工装 {fixture_qr} 追踪结论为需复检: {getattr(result, "trace_conclusion_reason", "")}',
        trigger_snapshot={
            'trace_conclusion': trace_conclusion,
            'trace_conclusion_reason': getattr(result, 'trace_conclusion_reason', ''),
        },
    )
    record.related_results.add(result)
    logger.info(f'异常触发: {record.title} (rule={rule.name})')
    return record


def _check_critical_defect(result, rule):
    """关键缺陷：检测结果中包含指定关键词"""
    from .models import AnomalyRecord

    defect_keywords = rule.thresholds.get('defect_keywords', [])
    if not defect_keywords:
        return None

    # 检查 ocr_result 和 overall_quality
    result_text = ''
    ocr_result = getattr(result, 'ocr_result', None)
    if isinstance(ocr_result, dict):
        result_text = str(ocr_result)
    overall = getattr(result, 'overall_quality', '') or ''

    # 检查 defects
    defect_texts = []
    try:
        for defect in result.defects.all():
            defect_texts.append(f'{defect.defect_type} {defect.description}')
    except Exception:
        pass

    all_text = f'{result_text} {overall} {" ".join(defect_texts)}'.lower()
    matched = [kw for kw in defect_keywords if kw.lower() in all_text]
    if not matched:
        return None

    process_code = result.process_stage_code or ''
    existing = AnomalyRecord.objects.filter(
        rule=rule,
        process_stage_code=process_code,
        status__in=['open', 'suspended', 'in_progress']
    ).first()

    if existing:
        existing.related_results.add(result)
        existing.save(update_fields=['updated_at'])
        return existing

    record = AnomalyRecord.objects.create(
        rule=rule,
        recipe=rule.recipe,
        anomaly_type=rule.anomaly_type,
        severity=rule.severity,
        process_stage_code=process_code,
        fixture_qr=getattr(result, 'fixture_qr', '') or '',
        title=f'关键缺陷 - {", ".join(matched)}',
        description=f'检测到关键缺陷关键词: {", ".join(matched)}',
        trigger_snapshot={
            'matched_keywords': matched,
            'defect_keywords_rule': defect_keywords,
        },
    )
    record.related_results.add(result)
    logger.info(f'异常触发: {record.title} (rule={rule.name})')
    return record


def check_timeout_anomalies():
    """
    定时调用（management command 或 cron）。
    检查活跃的 timeout 规则，如果工序超时未报告则创建异常。
    """
    from .models import AnomalyRule, AnomalyRecord, InspectionResult

    rules = AnomalyRule.objects.filter(is_active=True, anomaly_type='timeout')
    new_anomalies = []

    for rule in rules:
        timeout_minutes = rule.thresholds.get('timeout_minutes', 30)
        process_code = rule.process_stage_code or ''
        if not process_code:
            continue

        cutoff = timezone.now() - timedelta(minutes=timeout_minutes)
        latest = InspectionResult.objects.filter(
            process_stage_code=process_code
        ).order_by('-timestamp').first()

        if latest and latest.timestamp >= cutoff:
            continue  # 未超时

        # 已超时
        existing = AnomalyRecord.objects.filter(
            rule=rule,
            process_stage_code=process_code,
            status__in=['open', 'suspended', 'in_progress']
        ).first()

        if existing:
            continue

        record = AnomalyRecord.objects.create(
            rule=rule,
            recipe=rule.recipe,
            anomaly_type='timeout',
            severity=rule.severity,
            process_stage_code=process_code,
            title=f'超时未检 - {process_code} ({timeout_minutes}分钟)',
            description=f'工序 {process_code} 超过 {timeout_minutes} 分钟未提交检测结果',
            trigger_snapshot={
                'timeout_minutes': timeout_minutes,
                'last_result_time': latest.timestamp.isoformat() if latest else None,
            },
        )
        new_anomalies.append(record)
        logger.info(f'超时异常触发: {record.title}')

    return new_anomalies


def verify_action_password(rule, action, password):
    """校验操作密码"""
    if not rule:
        return password == 'password'

    field_map = {
        'suspend': 'password_suspend',
        'resolve': 'password_resolve',
        'escalate': 'password_escalate',
        'scrap': 'password_scrap',
    }
    field = field_map.get(action)
    if not field:
        return password == 'password'

    expected = getattr(rule, field, 'password')
    return password == expected


def transition_anomaly_status(record, action, password, comment='', operator=''):
    """
    执行状态流转 + 创建 AnomalyResolution。
    状态转换规则：
      open → suspended (suspend)
      open → in_progress (resume)
      suspended → in_progress (resume)
      in_progress → resolved (resolve)
      in_progress → escalated (escalate)
      in_progress → scrapped (scrap)
      open → resolved (resolve)  # 直接关闭
    """
    from .models import AnomalyResolution

    # 密码验证（comment 操作不需要密码）
    needs_password = action != 'comment'
    password_ok = True
    if needs_password:
        password_ok = verify_action_password(record.rule, action, password)
        if not password_ok:
            raise ValueError('密码错误')

    # 状态转换映射
    transitions = {
        'suspend': {'from': ['open', 'in_progress'], 'to': 'suspended'},
        'resume': {'from': ['suspended', 'open'], 'to': 'in_progress'},
        'resolve': {'from': ['open', 'in_progress'], 'to': 'resolved'},
        'escalate': {'from': ['open', 'in_progress'], 'to': 'escalated'},
        'scrap': {'from': ['in_progress'], 'to': 'scrapped'},
        'comment': {'from': None, 'to': None},  # 不改变状态
    }

    transition = transitions.get(action)
    if not transition:
        raise ValueError(f'未知操作: {action}')

    if transition['from'] is not None and record.status not in transition['from']:
        raise ValueError(f'当前状态 {record.get_status_display()} 不允许 {action} 操作')

    # 创建处理记录
    AnomalyResolution.objects.create(
        anomaly=record,
        action=action,
        comment=comment,
        operator=operator,
        password_verified=password_ok,
    )

    # 更新状态
    if transition['to']:
        record.status = transition['to']
        update_fields = ['status', 'updated_at']
        if action == 'resolve':
            record.resolved_at = timezone.now()
            update_fields.append('resolved_at')
        elif action == 'escalate':
            record.escalated_at = timezone.now()
            update_fields.append('escalated_at')
        record.save(update_fields=update_fields)

    return record
