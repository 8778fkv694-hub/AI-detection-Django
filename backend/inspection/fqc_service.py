"""FQC终检服务 — 当FQC工序保存检验结果时，自动汇总同一工装板上所有工序的记录。"""
from __future__ import annotations

import logging
import re
from typing import Any

from django.db import transaction

logger = logging.getLogger(__name__)

from .models import (
    FQCRecord,
    InspectionResult,
    ProductRecipe,
    ProductStage,
    StageRecipeTemplate,
)


def _find_fqc_product_recipe(process_stage_code: str) -> tuple[ProductRecipe | None, ProductStage | None]:
    """查找包含当前工序且标记为FQC的产品配方。"""
    if not process_stage_code:
        return None, None

    # 从 ProductStage 中找到 is_fqc=True 且 stage_recipe.process_stage_code 匹配的记录
    fqc_links = ProductStage.objects.filter(
        is_fqc=True,
        stage_recipe__process_stage_code=process_stage_code,
    ).select_related('product_recipe', 'stage_recipe')

    for link in fqc_links:
        if link.product_recipe and link.product_recipe.is_active:
            return link.product_recipe, link
    return None, None


def _collect_fixture_inspections(fixture_qr: str, product_recipe: ProductRecipe) -> list[InspectionResult]:
    """收集同一工装板上、属于该产品配方工序的所有最新检验记录（每工序取最新一条）。"""
    stage_codes = set(
        ProductStage.objects.filter(product_recipe=product_recipe)
        .values_list('stage_recipe__process_stage_code', flat=True)
    )

    records = InspectionResult.objects.filter(
        fixture_qr=fixture_qr,
        process_stage_code__in=stage_codes,
    ).order_by('process_stage_code', '-timestamp')

    # 每个工序只取最新一条
    latest_by_stage: dict[str, InspectionResult] = {}
    for record in records:
        if record.process_stage_code not in latest_by_stage:
            latest_by_stage[record.process_stage_code] = record

    # 按工序顺序排列
    stage_order = {
        link.stage_recipe.process_stage_code: link.order
        for link in ProductStage.objects.filter(product_recipe=product_recipe).select_related('stage_recipe')
    }
    sorted_records = sorted(
        latest_by_stage.values(),
        key=lambda r: stage_order.get(r.process_stage_code, 999),
    )
    return sorted_records


def _build_stage_summary(records: list[InspectionResult], product_recipe: ProductRecipe) -> list[dict[str, Any]]:
    """构建各工序摘要（轻量引用，不复制完整数据）。"""
    stage_links = list(
        ProductStage.objects.filter(product_recipe=product_recipe).select_related('stage_recipe')
    )
    stage_names = {
        link.stage_recipe.process_stage_code: link.stage_recipe.process_stage_name or link.stage_recipe.name
        for link in stage_links
    }
    stage_targets = {
        link.stage_recipe.process_stage_code: list(link.stage_recipe.selected_targets or [])
        for link in stage_links
    }
    stage_recipes = {
        link.stage_recipe.process_stage_code: link.stage_recipe
        for link in stage_links
    }

    summary = []
    for record in records:
        stage_recipe = stage_recipes.get(record.process_stage_code)
        summary.append({
            'stageCode': record.process_stage_code,
            'stageName': stage_names.get(record.process_stage_code, record.process_stage_name or ''),
            'stageTargets': stage_targets.get(record.process_stage_code, []),
            'targetValues': _extract_target_values(record, stage_recipe),
            'resultId': str(record.id),
            'quality': record.overall_quality,
            'score': record.score,
            'timestamp': record.timestamp.isoformat() if record.timestamp else '',
            'businessCode': record.business_code or '',
            'detectionType': record.detection_type or '',
        })
    return summary


def _build_trace_flow(records: list[InspectionResult], product_recipe: ProductRecipe) -> list[dict[str, Any]]:
    """构建工装板流转记录。"""
    # 取同一 fixture_qr 的所有记录（按时间排序），记录流转轨迹
    if not records:
        return []

    fixture_qr = records[0].fixture_qr
    all_records = InspectionResult.objects.filter(
        fixture_qr=fixture_qr,
    ).order_by('timestamp')

    stage_names = {
        link.stage_recipe.process_stage_code: link.stage_recipe.process_stage_name or link.stage_recipe.name
        for link in ProductStage.objects.filter(product_recipe=product_recipe).select_related('stage_recipe')
    }

    flow = []
    for record in all_records:
        flow.append({
            'stageCode': record.process_stage_code or '',
            'stageName': stage_names.get(record.process_stage_code, record.process_stage_name or ''),
            'timestamp': record.timestamp.isoformat() if record.timestamp else '',
            'quality': record.overall_quality,
            'resultId': str(record.id),
            'detectionType': record.detection_type or '',
        })
    return flow


def _determine_overall_result(records: list[InspectionResult]) -> tuple[str, str]:
    """根据所有工序结果判定FQC总结论。"""
    if not records:
        return '存疑', '无检验记录'

    qualities = [r.overall_quality for r in records]

    if '不合格' in qualities:
        failed_stages = [r.process_stage_code or '未知' for r in records if r.overall_quality == '不合格']
        return '不合格', f"工序 {', '.join(failed_stages)} 不合格"

    if all(q == '合格' for q in qualities):
        return '合格', f"全部 {len(records)} 个工序检验合格"

    # 存在 需复检 或 存疑
    pending = [r.process_stage_code or '未知' for r in records if r.overall_quality not in ('合格', '不合格')]
    return '存疑', f"工序 {', '.join(pending)} 结果待定"


def _extract_value(raw: str, mode: str, length: int) -> str:
    """从原始字符串中按 mode 提取子串。"""
    if not raw:
        return ''
    length = max(0, length) if length else 0
    if mode == 'suffix':
        return raw[-length:] if length and length <= len(raw) else raw
    if mode == 'prefix':
        return raw[:length] if length and length <= len(raw) else raw
    # full 或未知模式
    return raw


def _append_target_value(target_values: dict[str, list[str]], label: str, value: str) -> None:
    label = str(label or '').strip()
    value = str(value or '').strip()
    if not label or not value:
        return
    bucket = target_values.setdefault(label, [])
    if value not in bucket:
        bucket.append(value)


def _extract_target_values(record: InspectionResult, stage_recipe: StageRecipeTemplate | None) -> dict[str, list[str]]:
    target_values: dict[str, list[str]] = {}
    ocr_result = record.ocr_result if isinstance(record.ocr_result, dict) else {}
    snapshot_values = ocr_result.get('targetValues') if isinstance(ocr_result, dict) else None
    if isinstance(snapshot_values, dict):
        for label, values in snapshot_values.items():
            if not isinstance(values, list):
                continue
            cleaned_values = [str(value).strip() for value in values if str(value).strip()]
            if cleaned_values:
                target_values[str(label).strip()] = cleaned_values
        if target_values:
            return target_values

    if not stage_recipe:
        return target_values

    selected_targets = [str(item).strip() for item in (stage_recipe.selected_targets or []) if str(item).strip()]
    if not selected_targets:
        return target_values

    target_set = set(selected_targets)
    batch_processing = ocr_result.get('batch_processing') if isinstance(ocr_result, dict) else {}
    roi_details = batch_processing.get('roi_details') if isinstance(batch_processing, dict) else []

    if isinstance(roi_details, list):
        for roi in roi_details:
            if not isinstance(roi, dict):
                continue
            label = str(roi.get('label') or '').strip()
            if label not in target_set:
                continue
            _append_target_value(target_values, label, roi.get('ocr_text') or '')
            for barcode in roi.get('barcodes') or []:
                if isinstance(barcode, str):
                    _append_target_value(target_values, label, barcode)
                elif isinstance(barcode, dict):
                    _append_target_value(
                        target_values,
                        label,
                        barcode.get('data') or barcode.get('detectedText') or barcode.get('qrCodeData') or '',
                    )
            for barcode_match in roi.get('barcode_match') or []:
                if not isinstance(barcode_match, dict):
                    continue
                for detected in barcode_match.get('detectedBarcodes') or []:
                    _append_target_value(target_values, label, detected)

    detailed_results = ocr_result.get('detailed_results') if isinstance(ocr_result, dict) else []
    if isinstance(detailed_results, list):
        for item in detailed_results:
            if not isinstance(item, dict):
                continue
            label = str(item.get('label') or '').strip()
            if label in target_set:
                _append_target_value(target_values, label, item.get('text') or '')

    barcode_result = record.barcode_result if isinstance(record.barcode_result, dict) else {}
    barcode_results = barcode_result.get('results') if isinstance(barcode_result, dict) else []
    if isinstance(barcode_results, list):
        for item in barcode_results:
            if not isinstance(item, dict):
                continue
            label = str(item.get('targetRoi') or item.get('label') or '').strip()
            if label in target_set:
                _append_target_value(
                    target_values,
                    label,
                    item.get('detectedText') or item.get('data') or item.get('qrCodeData') or '',
                )

    return target_values


def _run_target_text_rule(rule: dict[str, Any], stage_summary: list[dict[str, Any]], detail: dict[str, Any]) -> dict[str, Any]:
    target_labels = [str(item).strip() for item in (rule.get('target_labels') or []) if str(item).strip()]
    min_target_count = max(1, int(rule.get('min_target_count', 1) or 1))
    contains_text = str(rule.get('contains_text') or '').strip()
    regex_pattern = str(rule.get('regex_pattern') or '').strip()
    same_prefix_length = max(0, int(rule.get('same_prefix_length', 0) or 0))
    same_suffix_length = max(0, int(rule.get('same_suffix_length', 0) or 0))
    source_field = str(rule.get('source_field') or 'businessCode')

    values_by_target: dict[str, list[str]] = {label: [] for label in target_labels}
    for stage in stage_summary:
        target_values = stage.get('targetValues') or {}
        if not isinstance(target_values, dict):
            continue
        for label in target_labels:
            raw_values = target_values.get(label) or []
            if not isinstance(raw_values, list):
                continue
            for raw_value in raw_values:
                value = str(raw_value or '').strip()
                if value and value not in values_by_target[label]:
                    values_by_target[label].append(value)

    detail['expected'] = (
        f"目标 {', '.join(target_labels) if target_labels else '全部'} 至少 {min_target_count} 个，"
        "并满足文本条件"
    )
    detail['actual'] = ', '.join(
        f'{label}={values_by_target.get(label) or []}'
        for label in target_labels
    ) or '无有效数据'

    resolved_values: dict[str, str] = {}
    unresolved_reasons: list[str] = []
    for label in target_labels:
        values = values_by_target.get(label) or []
        if not values:
            continue
        if len(values) > 1:
            unresolved_reasons.append(f'{label} 存在多个候选值: {", ".join(values)}')
            continue
        resolved_values[label] = values[0]

    if len(resolved_values) < min_target_count:
        detail['message'] = (
            f'有效目标值不足，仅解析出 {len(resolved_values)} 个目标，要求至少 {min_target_count} 个'
            + (f'；{"；".join(unresolved_reasons)}' if unresolved_reasons else '')
        )
        return detail

    values = list(resolved_values.values())
    failed_reasons: list[str] = []

    if contains_text and any(contains_text not in value for value in values):
        failed_reasons.append(f'并非所有文本都包含“{contains_text}”')

    if regex_pattern:
        try:
            regex = re.compile(regex_pattern)
        except re.error as exc:
            detail['message'] = f'正则表达式非法: {exc}'
            return detail
        if any(not regex.search(value) for value in values):
            failed_reasons.append('并非所有文本都匹配正则')

    if same_prefix_length > 0:
        prefixes = {value[:same_prefix_length] for value in values if len(value) >= same_prefix_length}
        if len(prefixes) != 1 or len(prefixes) < 1:
            failed_reasons.append(f'前 {same_prefix_length} 位不一致')

    if same_suffix_length > 0:
        suffixes = {value[-same_suffix_length:] for value in values if len(value) >= same_suffix_length}
        if len(suffixes) != 1 or len(suffixes) < 1:
            failed_reasons.append(f'后 {same_suffix_length} 位不一致')

    if failed_reasons:
        detail['message'] = '；'.join(failed_reasons + unresolved_reasons)
        return detail

    detail['passed'] = True
    passed_conditions = []
    if contains_text:
        passed_conditions.append(f'包含“{contains_text}”')
    if same_prefix_length > 0:
        passed_conditions.append(f'前 {same_prefix_length} 位一致')
    if same_suffix_length > 0:
        passed_conditions.append(f'后 {same_suffix_length} 位一致')
    if regex_pattern:
        passed_conditions.append('正则匹配')
    if unresolved_reasons:
        passed_conditions.append('其余目标忽略歧义值')
    detail['message'] = f"校验通过: {', '.join(passed_conditions) if passed_conditions else '满足最少目标数'}"
    return detail


def _run_single_rule(rule: dict, stage_summary: list[dict[str, Any]]) -> dict[str, Any]:
    """
    执行单条校验规则，返回 {ruleName, passed, expected, actual, message}。

    支持的规则类型:
    - occurrence_count: 某字段值（经提取后）的出现次数校验
      配置: source_field, extract_mode(suffix/prefix/full), extract_length,
            expected_count, operator(eq/gte/lte)
    - cross_stage_match: 跨工序字段一致性校验
      配置: source_field, extract_mode, extract_length,
            stage_codes (要比对的工序code列表)
    - target_match: 按工序已配置目标筛选后，执行文本逻辑校验
      配置: target_labels, min_target_count, contains_text,
            same_prefix_length, same_suffix_length, regex_pattern
    """
    rule_name = rule.get('name', '未命名规则')
    rule_type = rule.get('type', '')
    source_field = rule.get('source_field', 'businessCode')
    extract_mode = rule.get('extract_mode', 'full')
    extract_length = int(rule.get('extract_length', 0))

    detail: dict[str, Any] = {'ruleName': rule_name, 'passed': False, 'expected': '', 'actual': '', 'message': ''}

    try:
        if rule_type == 'occurrence_count':
            expected_count = int(rule.get('expected_count', 1))
            operator = rule.get('operator', 'eq')

            # 统计每个提取值出现次数
            counter: dict[str, int] = {}
            for stage in stage_summary:
                val = _extract_value(str(stage.get(source_field, '')), extract_mode, extract_length)
                if val and val.strip():
                    counter[val] = counter.get(val, 0) + 1

            # 找出满足条件的值
            matched_values = []
            for val, cnt in counter.items():
                if operator == 'eq' and cnt == expected_count:
                    matched_values.append(f'{val}×{cnt}')
                elif operator == 'gte' and cnt >= expected_count:
                    matched_values.append(f'{val}×{cnt}')
                elif operator == 'lte' and cnt <= expected_count:
                    matched_values.append(f'{val}×{cnt}')

            op_label = {'eq': '等于', 'gte': '≥', 'lte': '≤'}.get(operator, '=')
            detail['expected'] = f'存在值出现次数{op_label}{expected_count}'
            detail['actual'] = ', '.join(f'{v}×{c}' for v, c in counter.items()) if counter else '无数据'

            if matched_values:
                detail['passed'] = True
                detail['message'] = f'校验通过: {", ".join(matched_values)}'
            else:
                detail['message'] = f'未找到满足条件的值（{op_label}{expected_count}次）'

        elif rule_type == 'cross_stage_match':
            target_codes = rule.get('stage_codes', [])
            values_by_stage: dict[str, str] = {}
            for stage in stage_summary:
                code = stage.get('stageCode', '')
                if not target_codes or code in target_codes:
                    val = _extract_value(str(stage.get(source_field, '')), extract_mode, extract_length)
                    if val and val.strip():  # 排除空值/纯空白
                        values_by_stage[code] = val

            detail['expected'] = f'工序 {", ".join(target_codes) if target_codes else "全部"} 的 {source_field} 一致'
            unique_values = set(values_by_stage.values())
            detail['actual'] = ', '.join(f'{k}={v}' for k, v in values_by_stage.items()) or '无有效数据'

            if len(unique_values) == 1 and len(values_by_stage) >= 2:
                detail['passed'] = True
                detail['message'] = f'一致: {unique_values.pop()}'
            elif len(values_by_stage) < 2:
                detail['message'] = f'数据不足，仅找到 {len(values_by_stage)} 个工序有有效值'
            else:
                detail['message'] = f'不一致: {", ".join(unique_values)}'

        elif rule_type == 'target_match':
            detail = _run_target_text_rule(rule, stage_summary, detail)

        else:
            detail['message'] = f'未知规则类型: {rule_type}'

    except Exception as exc:
        detail['message'] = f'规则执行异常: {exc}'

    return detail


def _run_validation(product_recipe: ProductRecipe, stage_summary: list[dict[str, Any]]) -> tuple[bool | None, list[dict[str, Any]]]:
    """
    执行产品配方上配置的FQC校验规则。
    返回 (validation_passed, validation_details)。
    如果未启用校验，返回 (None, [])。
    """
    if not product_recipe.fqc_validation_enabled:
        return None, []

    rules = product_recipe.fqc_validation_rules or []
    if not rules:
        return None, []

    details = [_run_single_rule(r, stage_summary) for r in rules]
    all_passed = all(d['passed'] for d in details)
    return all_passed, details


def generate_fqc_record(result: InspectionResult) -> FQCRecord | None:
    """
    检查当前检验结果是否触发FQC，如果是则生成/更新FQC记录。
    返回 FQCRecord 或 None。
    """
    fixture_qr = (result.fixture_qr or '').strip()
    if not fixture_qr:
        return None

    process_stage_code = (result.process_stage_code or '').strip()
    if not process_stage_code:
        return None

    product_recipe, fqc_link = _find_fqc_product_recipe(process_stage_code)
    if not product_recipe or not fqc_link:
        return None

    # 收集该工装板上所有工序的最新检验记录
    stage_records = _collect_fixture_inspections(fixture_qr, product_recipe)

    # 构建摘要
    stage_summary = _build_stage_summary(stage_records, product_recipe)
    trace_flow = _build_trace_flow(stage_records, product_recipe)
    overall_result, result_reason = _determine_overall_result(stage_records)

    expected_stage_codes = {
        code for code in ProductStage.objects.filter(product_recipe=product_recipe)
        .values_list('stage_recipe__process_stage_code', flat=True)
        if code
    }
    found_stage_codes = {record.process_stage_code for record in stage_records if record.process_stage_code}
    missing_stage_codes = sorted(expected_stage_codes - found_stage_codes)
    if missing_stage_codes:
        if overall_result == '合格':
            overall_result = '存疑'
        result_reason += f'; 缺少配方工序: {", ".join(missing_stage_codes)}'

    # 追踪总结论
    trace_conclusions = [r.trace_conclusion for r in stage_records if r.trace_conclusion]
    if '需复检' in trace_conclusions:
        trace_conclusion = '需复检'
    elif all(c == '合格' for c in trace_conclusions) and trace_conclusions:
        trace_conclusion = '合格'
    elif '存疑' in trace_conclusions:
        trace_conclusion = '存疑'
    else:
        trace_conclusion = '存疑'

    if trace_conclusion != '合格' and overall_result == '合格':
        overall_result = '存疑'
        result_reason += f'; 追踪结论为{trace_conclusion}'

    # 规则校验
    validation_passed, validation_details = _run_validation(product_recipe, stage_summary)

    # 如果规则校验未通过，覆盖 overall_result
    if validation_passed is False:
        overall_result = '不合格'
        failed_names = [d['ruleName'] for d in validation_details if not d['passed']]
        result_reason += f'; 规则校验未通过: {", ".join(failed_names)}'

    # 创建或更新FQC记录（同一 fixture_qr + product_recipe 只保留最新一条）
    with transaction.atomic():
        fqc_record, created = FQCRecord.objects.update_or_create(
            fixture_qr=fixture_qr,
            product_recipe=product_recipe,
            defaults={
                'product_recipe_name': product_recipe.name,
                'fqc_stage_code': process_stage_code,
                'fqc_stage_name': fqc_link.stage_recipe.process_stage_name or fqc_link.stage_recipe.name,
                'trigger_result': result,
                'overall_result': overall_result,
                'result_reason': result_reason,
                'stage_summary': stage_summary,
                'trace_flow': trace_flow,
                'trace_conclusion': trace_conclusion,
                'validation_passed': validation_passed,
                'validation_details': validation_details,
            },
        )
        fqc_record.related_inspections.set(stage_records)

    logger.info('FQC记录%s fixture_qr=%s recipe=%s result=%s',
                '创建' if created else '更新', fixture_qr, product_recipe.name, overall_result)
    return fqc_record
