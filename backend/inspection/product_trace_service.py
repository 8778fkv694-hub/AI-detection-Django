from __future__ import annotations

import re
from typing import Any

from .models import InspectionResult


TRACE_PASS = '合格'
TRACE_RECHECK = '需复检'
TRACE_PENDING = '存疑'


def _normalize_code(value: str | None) -> str:
    if not value:
        return ''
    return ''.join(ch for ch in str(value).strip().upper() if ch.isalnum())


def _extract_barcode_candidates(barcode_result: Any) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    if not isinstance(barcode_result, dict):
        return candidates

    results = barcode_result.get('results')
    if isinstance(results, list):
        for item in results:
            if not isinstance(item, dict):
                continue
            text = ''
            for key in ('detectedText', 'detected_text', 'qrCodeData', 'data'):
                value = item.get(key)
                if isinstance(value, str) and value.strip():
                    text = value.strip()
                    break
            if not text:
                continue
            candidates.append({
                'text': text,
                'confidence': item.get('confidence'),
                'location': item.get('location') or item.get('qrCodePosition'),
                'type': item.get('type') or item.get('qrCodeType') or 'qr',
            })

    if candidates:
        return candidates

    qr_codes_data = barcode_result.get('qr_codes_data')
    if isinstance(qr_codes_data, list):
        for item in qr_codes_data:
            if isinstance(item, str) and item.strip():
                candidates.append({
                    'text': item.strip(),
                    'confidence': None,
                    'location': None,
                    'type': 'qr',
                })

    return candidates


def _resolve_fixture_qr_from_candidates(record: InspectionResult) -> tuple[str, bool, str, str, float | None]:
    fixture_qr = (record.fixture_qr or '').strip()
    if fixture_qr:
        return (
            fixture_qr,
            True,
            record.fixture_qr_source or 'manual',
            record.fixture_qr_input_status or 'success',
            record.fixture_qr_confidence,
        )

    trace_context = record.trace_context or {}
    prefixes = trace_context.get('fixtureQrPrefixes') or trace_context.get('fixture_qr_prefixes') or []
    if isinstance(prefixes, str):
        prefixes = [item.strip() for item in prefixes.split(',') if item.strip()]
    prefixes = [str(item).strip().upper() for item in prefixes if str(item).strip()]

    pattern = trace_context.get('fixtureQrPattern') or trace_context.get('fixture_qr_pattern') or ''
    pattern = str(pattern).strip()
    regex = None
    if pattern:
        try:
            regex = re.compile(pattern)
        except re.error:
            regex = None

    candidates = _extract_barcode_candidates(record.barcode_result)
    if not candidates:
        return '', False, '', 'pending', None

    def _match_candidate(candidate: dict[str, Any]) -> bool:
        text = str(candidate.get('text') or '').strip()
        upper_text = text.upper()
        if prefixes and not any(upper_text.startswith(prefix) for prefix in prefixes):
            return False
        if regex and not regex.search(text):
            return False
        return True

    matched_candidates = [candidate for candidate in candidates if _match_candidate(candidate)]
    if prefixes or regex:
        if len(matched_candidates) == 1:
            matched = matched_candidates[0]
            return (
                matched['text'],
                True,
                'vision',
                'success',
                matched.get('confidence'),
            )
        if len(matched_candidates) > 1:
            return '', False, 'vision', 'failed', None
        return '', False, 'vision', 'failed', None

    # 未配置工装码规则时，不自动从整图二维码里盲选工装码。
    # 这样可以避免把业务码或包装码误判成工装码。
    return '', False, 'vision', 'pending', None


def _collect_fixture_qr_candidates_for_context(record: InspectionResult) -> list[dict[str, Any]]:
    trace_context = record.trace_context or {}
    prefixes = trace_context.get('fixtureQrPrefixes') or trace_context.get('fixture_qr_prefixes') or []
    if isinstance(prefixes, str):
        prefixes = [item.strip() for item in prefixes.split(',') if item.strip()]
    prefixes = [str(item).strip().upper() for item in prefixes if str(item).strip()]

    pattern = trace_context.get('fixtureQrPattern') or trace_context.get('fixture_qr_pattern') or ''
    pattern = str(pattern).strip()
    regex = None
    if pattern:
        try:
            regex = re.compile(pattern)
        except re.error:
            regex = None

    candidates = _extract_barcode_candidates(record.barcode_result)
    if not candidates:
        return []

    def _match_candidate(candidate: dict[str, Any]) -> bool:
        text = str(candidate.get('text') or '').strip()
        upper_text = text.upper()
        if prefixes and not any(upper_text.startswith(prefix) for prefix in prefixes):
            return False
        if regex and not regex.search(text):
            return False
        return True

    rules_configured = bool(prefixes or regex)
    filtered_candidates = [candidate for candidate in candidates if _match_candidate(candidate)] if rules_configured else candidates

    normalized: list[dict[str, Any]] = []
    for candidate in filtered_candidates[:10]:
        text = str(candidate.get('text') or '').strip()
        if not text:
            continue
        normalized.append({
            'text': text,
            'confidence': candidate.get('confidence'),
            'type': candidate.get('type') or 'qr',
            'matchedByRule': rules_configured,
        })
    return normalized


_MAX_BUSINESS_CODE_LENGTH = 50  # 业务码最大合理长度，防止OCR全文回退


def _extract_first_ocr_text(ocr_result: Any) -> str:
    if not isinstance(ocr_result, dict):
        return ''

    # 优先从 detailed_results 中取单项文字（更可靠，通常是短文本）
    detailed_results = ocr_result.get('detailed_results')
    if isinstance(detailed_results, list):
        for item in detailed_results:
            if not isinstance(item, dict):
                continue
            value = item.get('text')
            if isinstance(value, str) and value.strip() and len(value.strip()) <= _MAX_BUSINESS_CODE_LENGTH:
                return value.strip()

    # full_text 回退：仅在长度合理时使用，避免整页文本被当作业务码
    full_text = ocr_result.get('full_text')
    if isinstance(full_text, str) and full_text.strip() and len(full_text.strip()) <= _MAX_BUSINESS_CODE_LENGTH:
        return full_text.strip()

    return ''


def _resolve_business_code(record: InspectionResult, fixture_qr: str = '') -> tuple[str, str]:
    business_code = (record.business_code or '').strip()
    business_code_type = (record.business_code_type or '').strip()

    if business_code:
        return business_code, business_code_type or 'manual_input'

    normalized_fixture_qr = _normalize_code(fixture_qr)
    barcode_candidates = _extract_barcode_candidates(record.barcode_result)
    for candidate in barcode_candidates:
        candidate_text = str(candidate.get('text') or '').strip()
        if not candidate_text:
            continue
        if normalized_fixture_qr and _normalize_code(candidate_text) == normalized_fixture_qr:
            continue
        return candidate_text, business_code_type or 'barcode_detected'

    ocr_code = _extract_first_ocr_text(record.ocr_result)
    if ocr_code:
        return ocr_code, business_code_type or 'ocr_full_text'

    return '', business_code_type


def _build_stage_payload(record: InspectionResult, status: str) -> dict[str, Any]:
    return {
        'stageCode': record.process_stage_code or '',
        'stageName': record.process_stage_name or record.process_stage_code or '',
        'businessCode': record.business_code or '',
        'status': status,
        'resultId': str(record.id),
        'timestamp': record.timestamp.isoformat() if record.timestamp else '',
        'pageInstanceId': record.page_instance_id or '',
        'cameraId': record.camera_id or '',
    }


def _collect_latest_stages(record: InspectionResult) -> list[InspectionResult]:
    fixture_qr = (record.fixture_qr or '').strip()
    if not fixture_qr:
        return []

    queryset = InspectionResult.objects.filter(fixture_qr=fixture_qr).order_by('-timestamp')
    latest_by_stage: dict[str, InspectionResult] = {}

    for item in queryset:
        stage_key = item.process_stage_code or f'__no_stage__:{item.id}'
        if stage_key not in latest_by_stage:
            latest_by_stage[stage_key] = item

    ordered = list(latest_by_stage.values())
    ordered.sort(key=lambda item: (item.process_stage_code or '', item.timestamp))
    return ordered


def collect_fixture_records_for_refresh(fixture_qr: str) -> list[InspectionResult]:
    fixture_qr = (fixture_qr or '').strip()
    if not fixture_qr:
        return []
    return list(InspectionResult.objects.filter(fixture_qr=fixture_qr).order_by('timestamp', 'process_stage_code', 'id'))


def evaluate_trace_for_result(record: InspectionResult) -> InspectionResult:
    fixture_qr, fixture_qr_detected, fixture_qr_source, fixture_qr_input_status, fixture_qr_confidence = _resolve_fixture_qr_from_candidates(record)
    record.fixture_qr = fixture_qr
    record.fixture_qr_detected = fixture_qr_detected
    if fixture_qr_source:
        record.fixture_qr_source = fixture_qr_source
    if fixture_qr_input_status:
        record.fixture_qr_input_status = fixture_qr_input_status
    if fixture_qr_confidence is not None and record.fixture_qr_confidence is None:
        record.fixture_qr_confidence = fixture_qr_confidence

    resolved_business_code, resolved_business_code_type = _resolve_business_code(record, fixture_qr)
    if resolved_business_code and record.business_code != resolved_business_code:
        record.business_code = resolved_business_code
    if resolved_business_code_type and record.business_code_type != resolved_business_code_type:
        record.business_code_type = resolved_business_code_type

    trace_rule_details: list[dict[str, Any]] = []
    related_stages: list[dict[str, Any]] = []
    candidate_count = len(_extract_barcode_candidates(record.barcode_result))
    fixture_qr_candidates = _collect_fixture_qr_candidates_for_context(record)

    if not fixture_qr:
        if record.fixture_qr_source == 'vision':
            record.fixture_rule_passed = None
            if record.fixture_qr_input_status == 'failed':
                record.fixture_rule_reason = '整图视觉识别未能唯一确定工装二维码，需改用扫码、NFC或人工补录。'
                record.trace_conclusion = TRACE_PENDING
                record.trace_conclusion_reason = '工装二维码视觉识别失败，需补录工装码后才能完成跨工序追踪。'
                record.trace_rule_summary = '工装二维码视觉识别失败，等待其他输入方式补录。'
                fixture_rule_reason = '未能从整图多二维码结果中唯一确定工装二维码，建议切换扫码或NFC。'
            else:
                record.fixture_rule_reason = '等待工装二维码输入。可先尝试整图视觉识别，失败后切换扫码、NFC或人工补录。'
                record.trace_conclusion = TRACE_PENDING
                record.trace_conclusion_reason = '尚未拿到工装二维码，跨工序追踪等待工装码输入。'
                record.trace_rule_summary = '工装二维码待输入，跨工序规则暂未执行。'
                fixture_rule_reason = '当前尚未拿到工装二维码。'
        else:
            record.fixture_rule_passed = False
            record.fixture_rule_reason = '未提供有效工装二维码，无法建立跨工序关联。'
            record.trace_conclusion = TRACE_RECHECK
            record.trace_conclusion_reason = '缺少工装二维码，且当前输入方式未完成有效补录。'
            record.trace_rule_summary = '工装规则失败，跨工序规则未执行。'
            fixture_rule_reason = '当前结果未绑定有效工装二维码。'
        record.trace_rule_details = [{
            'ruleId': 'fixture_required',
            'ruleName': '工装二维码必填',
            'sourceStage': record.process_stage_code or '',
            'targetStage': record.process_stage_code or '',
            'passed': record.fixture_rule_passed,
            'result': 'pending' if record.trace_conclusion == TRACE_PENDING else 'recheck',
            'reason': fixture_rule_reason,
        }]
        record.related_stages = []
        record.trace_context = {
            **(record.trace_context or {}),
            'relatedStageCount': 0,
            'fixtureQrCandidateCount': candidate_count,
            'fixtureQrCandidates': fixture_qr_candidates,
            'fixtureQrFallbackRecommended': True,
        }
        return record

    record.fixture_rule_passed = True
    record.fixture_rule_reason = '工装二维码存在，可用于跨工序归并。'
    trace_rule_details.append({
        'ruleId': 'fixture_required',
        'ruleName': '工装二维码必填',
        'sourceStage': record.process_stage_code or '',
        'targetStage': record.process_stage_code or '',
        'passed': True,
        'result': 'passed',
        'reason': '已绑定工装二维码。',
    })

    latest_stages = _collect_latest_stages(record)
    normalized_current_code = _normalize_code(record.business_code)

    mismatch_found = False
    matched_found = False
    pending_found = False

    for stage_record in latest_stages:
        status = 'completed'
        if stage_record.id == record.id:
            related_stages.append(_build_stage_payload(stage_record, status))
            continue

        related_stages.append(_build_stage_payload(stage_record, status))
        if not record.process_stage_code or not stage_record.process_stage_code:
            pending_found = True
            continue

        related_code = _normalize_code(stage_record.business_code)
        if not normalized_current_code or not related_code:
            pending_found = True
            trace_rule_details.append({
                'ruleId': f'{record.process_stage_code}_to_{stage_record.process_stage_code}',
                'ruleName': '跨工序业务码比对',
                'sourceStage': record.process_stage_code or '',
                'targetStage': stage_record.process_stage_code or '',
                'passed': None,
                'result': 'pending',
                'reason': '至少一侧缺少业务编码，暂不执行比对。',
            })
            continue

        matched = (
            normalized_current_code == related_code or
            normalized_current_code in related_code or
            related_code in normalized_current_code
        )
        if matched:
            matched_found = True
            trace_rule_details.append({
                'ruleId': f'{record.process_stage_code}_to_{stage_record.process_stage_code}',
                'ruleName': '跨工序业务码比对',
                'sourceStage': record.process_stage_code or '',
                'targetStage': stage_record.process_stage_code or '',
                'passed': True,
                'result': 'passed',
                'reason': '当前工序与关联工序业务码在归一化后匹配。',
            })
        else:
            mismatch_found = True
            trace_rule_details.append({
                'ruleId': f'{record.process_stage_code}_to_{stage_record.process_stage_code}',
                'ruleName': '跨工序业务码比对',
                'sourceStage': record.process_stage_code or '',
                'targetStage': stage_record.process_stage_code or '',
                'passed': False,
                'result': 'recheck',
                'reason': '当前工序与关联工序业务码不匹配。',
            })

    if record.process_stage_code and not any(item.get('stageCode') == record.process_stage_code for item in related_stages):
        related_stages.append(_build_stage_payload(record, 'completed'))

    if mismatch_found:
        record.trace_conclusion = TRACE_RECHECK
        record.trace_conclusion_reason = '存在跨工序业务编码不匹配记录，需复检。'
        record.trace_rule_summary = '工装规则通过，跨工序业务码比对存在失败项。'
    elif matched_found:
        record.trace_conclusion = TRACE_PASS
        record.trace_conclusion_reason = '工装二维码有效，且已找到至少一条通过的跨工序业务码关联。'
        record.trace_rule_summary = '工装规则通过，存在已通过的跨工序业务码比对。'
    elif pending_found or len(related_stages) <= 1:
        record.trace_conclusion = TRACE_PENDING
        record.trace_conclusion_reason = '已建立工装关联，但关联工序或业务码信息尚不完整。'
        record.trace_rule_summary = '工装规则通过，跨工序规则等待更多工序数据。'
    else:
        record.trace_conclusion = TRACE_PENDING
        record.trace_conclusion_reason = '已建立工装关联，但暂无可执行的跨工序规则。'
        record.trace_rule_summary = '工装规则通过，暂无跨工序比对结果。'

    if not record.process_stage_code and record.trace_conclusion == TRACE_PASS:
        record.trace_conclusion = TRACE_PENDING
        record.trace_conclusion_reason = '当前结果缺少工序标识，无法形成稳定的跨工序判定。'
        record.trace_rule_summary = '工装规则通过，但当前结果缺少工序标识。'

    record.trace_rule_details = trace_rule_details
    record.related_stages = related_stages
    record.trace_context = {
        **(record.trace_context or {}),
        'relatedStageCount': len(related_stages),
        'fixtureQrCandidateCount': candidate_count,
        'fixtureQrCandidates': fixture_qr_candidates,
        'fixtureQrFallbackRecommended': False,
    }
    return record


def refresh_fixture_trace_results(fixture_qr: str, exclude_result_id=None) -> list[InspectionResult]:
    from django.db import transaction

    refreshed_records: list[InspectionResult] = []
    items_to_refresh = [
        item for item in collect_fixture_records_for_refresh(fixture_qr)
        if not (exclude_result_id and str(item.id) == str(exclude_result_id))
    ]
    if not items_to_refresh:
        return refreshed_records

    with transaction.atomic():
        for item in items_to_refresh:
            evaluate_trace_for_result(item)
            item.save(update_fields=[
                'fixture_qr',
                'fixture_qr_detected',
                'fixture_qr_source',
                'fixture_qr_input_status',
                'fixture_qr_confidence',
                'business_code',
                'business_code_type',
                'trace_conclusion',
                'trace_conclusion_reason',
                'fixture_rule_passed',
                'fixture_rule_reason',
                'trace_rule_summary',
                'trace_rule_details',
                'related_stages',
                'trace_context',
            ])
            refreshed_records.append(item)
    return refreshed_records
