"""
POST /api/product-trace/evaluate/

独立追踪判定接口（无需保存检测结果）。
前端可在保存前预查当前工序的工装追踪状态。

设计参考: docs/工装二维码多工序追踪系统设计说明_v1.md §9.2
"""

from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse
import json

from .models import InspectionResult
from .product_trace_service import evaluate_trace_for_result


def _camel(d: dict) -> dict:
    """snake_case → camelCase（浅层转换，用于响应序列化）"""
    def _convert(k: str) -> str:
        parts = k.split('_')
        return parts[0] + ''.join(p.capitalize() for p in parts[1:])
    return {_convert(k): v for k, v in d.items()}


def _build_trace_info(record: InspectionResult) -> dict:
    return {
        'fixtureQr': record.fixture_qr or '',
        'fixtureQrDetected': record.fixture_qr_detected,
        'fixtureQrSource': record.fixture_qr_source or '',
        'fixtureQrInputStatus': record.fixture_qr_input_status or '',
        'fixtureQrConfidence': record.fixture_qr_confidence,
        'processStageCode': record.process_stage_code or '',
        'processStageName': record.process_stage_name or '',
        'pageInstanceId': record.page_instance_id or '',
        'cameraId': record.camera_id or '',
        'businessCode': record.business_code or '',
        'businessCodeType': record.business_code_type or '',
        'traceConclusion': record.trace_conclusion or '',
        'traceConclusionReason': record.trace_conclusion_reason or '',
        'fixtureRulePassed': record.fixture_rule_passed,
        'fixtureRuleReason': record.fixture_rule_reason or '',
        'traceRuleSummary': record.trace_rule_summary or '',
        'traceRuleDetails': record.trace_rule_details or [],
        'relatedStages': record.related_stages or [],
        'traceContext': record.trace_context or {},
    }


@csrf_exempt
@require_http_methods(['POST'])
def product_trace_evaluate(request):
    """
    不保存结果，仅执行追踪判定并返回 trace_info。

    请求体字段（均可选）:
      fixture_qr, fixture_qr_source, fixture_qr_input_status, fixture_qr_detected,
      fixture_qr_confidence, barcode_result, ocr_result,
      process_stage_code, process_stage_name, page_instance_id, camera_id,
      business_code, business_code_type, trace_context
    """
    try:
        body = json.loads(request.body.decode('utf-8'))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({'success': False, 'error': '请求体必须是有效 JSON'}, status=400)

    # 构造临时 InspectionResult 实例（不落库）
    record = InspectionResult()
    record.fixture_qr            = str(body.get('fixture_qr') or '').strip()
    record.fixture_qr_source     = str(body.get('fixture_qr_source') or '').strip()
    record.fixture_qr_input_status = str(body.get('fixture_qr_input_status') or '').strip()
    record.fixture_qr_detected   = bool(body.get('fixture_qr_detected', False))
    record.fixture_qr_confidence = body.get('fixture_qr_confidence')
    record.process_stage_code    = str(body.get('process_stage_code') or '').strip()
    record.process_stage_name    = str(body.get('process_stage_name') or '').strip()
    record.page_instance_id      = str(body.get('page_instance_id') or '').strip()
    record.camera_id             = str(body.get('camera_id') or '').strip()
    record.business_code         = str(body.get('business_code') or '').strip()
    record.business_code_type    = str(body.get('business_code_type') or '').strip()
    record.barcode_result        = body.get('barcode_result')
    record.ocr_result            = body.get('ocr_result')
    record.trace_context         = body.get('trace_context') or {}
    # 其余追踪字段初始化（evaluate_trace_for_result 会覆盖它们）
    record.trace_conclusion      = ''
    record.trace_conclusion_reason = ''
    record.fixture_rule_passed   = None
    record.fixture_rule_reason   = ''
    record.trace_rule_summary    = ''
    record.trace_rule_details    = []
    record.related_stages        = []

    evaluate_trace_for_result(record)

    return JsonResponse({
        'success': True,
        'trace_info': _build_trace_info(record),
    })
