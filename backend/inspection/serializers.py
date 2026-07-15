
import base64
import os
import uuid
import hashlib

from django.core.files.base import ContentFile
from rest_framework import serializers

from .models import (AIConfig, Defect, DefectSeverity, DefectType,
                   InspectionArea, InspectionResult, Standard,
                   ModelVersion, ModelDeployment, ModelUpload, ModelPerformance,
                   OCRKeywordTemplate, OCRBarcodeTemplate, StageRecipeTemplate,
                   FixtureTemplate,
                   AnomalyRule, AnomalyRecord, AnomalyResolution,
                   ProductRecipe, ProductStage, FQCRecord)
from .product_trace_service import evaluate_trace_for_result, refresh_fixture_trace_results


ALLOWED_FQC_RULE_TYPES = {'occurrence_count', 'cross_stage_match', 'target_match'}
ALLOWED_FQC_SOURCE_FIELDS = {'businessCode', 'quality', 'stageCode', 'stageName', 'detectionType'}
ALLOWED_FQC_EXTRACT_MODES = {'suffix', 'prefix', 'full'}
ALLOWED_FQC_OPERATORS = {'eq', 'gte', 'lte'}


def validate_fqc_validation_rules(value):
    if value in (None, ''):
        return []

    if not isinstance(value, list):
        raise serializers.ValidationError('fqc_validation_rules 必须为数组')

    validated_rules = []
    for index, rule in enumerate(value):
        prefix = f'第 {index + 1} 条规则'
        if not isinstance(rule, dict):
            raise serializers.ValidationError(f'{prefix} 必须为对象')

        name = str(rule.get('name') or '').strip()
        if not name:
            raise serializers.ValidationError(f'{prefix} 缺少 name')

        rule_type = str(rule.get('type') or '').strip()
        if rule_type not in ALLOWED_FQC_RULE_TYPES:
            raise serializers.ValidationError(f'{prefix} type 非法: {rule_type}')

        normalized_rule = {
            'name': name,
            'type': rule_type,
        }

        description = str(rule.get('description') or '').strip()
        if description:
            normalized_rule['description'] = description

        if rule_type in {'occurrence_count', 'cross_stage_match'}:
            source_field = str(rule.get('source_field') or '').strip()
            if source_field not in ALLOWED_FQC_SOURCE_FIELDS:
                raise serializers.ValidationError(f'{prefix} source_field 非法: {source_field}')

            extract_mode = str(rule.get('extract_mode') or 'full').strip()
            if extract_mode not in ALLOWED_FQC_EXTRACT_MODES:
                raise serializers.ValidationError(f'{prefix} extract_mode 非法: {extract_mode}')

            try:
                extract_length = int(rule.get('extract_length', 0) or 0)
            except (TypeError, ValueError):
                raise serializers.ValidationError(f'{prefix} extract_length 必须为整数')
            if extract_length < 0:
                raise serializers.ValidationError(f'{prefix} extract_length 不能小于 0')
            if extract_mode != 'full' and extract_length <= 0:
                raise serializers.ValidationError(f'{prefix} 截取模式为前缀/后缀时，extract_length 必须大于 0')

            normalized_rule['source_field'] = source_field
            normalized_rule['extract_mode'] = extract_mode
            normalized_rule['extract_length'] = extract_length

        if rule_type == 'occurrence_count':
            try:
                expected_count = int(rule.get('expected_count', 1) or 0)
            except (TypeError, ValueError):
                raise serializers.ValidationError(f'{prefix} expected_count 必须为整数')
            if expected_count < 0:
                raise serializers.ValidationError(f'{prefix} expected_count 不能小于 0')

            operator = str(rule.get('operator') or 'eq').strip()
            if operator not in ALLOWED_FQC_OPERATORS:
                raise serializers.ValidationError(f'{prefix} operator 非法: {operator}')

            normalized_rule['expected_count'] = expected_count
            normalized_rule['operator'] = operator

        if rule_type == 'cross_stage_match':
            stage_codes = rule.get('stage_codes') or []
            if not isinstance(stage_codes, list):
                raise serializers.ValidationError(f'{prefix} stage_codes 必须为数组')
            normalized_rule['stage_codes'] = [
                str(code).strip()
                for code in stage_codes
                if str(code).strip()
            ]

        if rule_type == 'target_match':
            target_labels = rule.get('target_labels') or []
            if not isinstance(target_labels, list):
                raise serializers.ValidationError(f'{prefix} target_labels 必须为数组')

            try:
                min_target_count = int(rule.get('min_target_count', 1) or 0)
            except (TypeError, ValueError):
                raise serializers.ValidationError(f'{prefix} min_target_count 必须为整数')
            if min_target_count < 1:
                raise serializers.ValidationError(f'{prefix} min_target_count 必须大于等于 1')

            try:
                same_prefix_length = int(rule.get('same_prefix_length', 0) or 0)
                same_suffix_length = int(rule.get('same_suffix_length', 0) or 0)
            except (TypeError, ValueError):
                raise serializers.ValidationError(f'{prefix} 前后缀长度必须为整数')
            if same_prefix_length < 0 or same_suffix_length < 0:
                raise serializers.ValidationError(f'{prefix} 前后缀长度不能小于 0')

            contains_text = str(rule.get('contains_text') or '').strip()
            regex_pattern = str(rule.get('regex_pattern') or '').strip()
            if not contains_text and not regex_pattern and same_prefix_length == 0 and same_suffix_length == 0:
                raise serializers.ValidationError(f'{prefix} 至少配置一种文本条件')

            normalized_rule['source_field'] = 'businessCode'
            normalized_rule['target_labels'] = [
                str(label).strip()
                for label in target_labels
                if str(label).strip()
            ]
            normalized_rule['min_target_count'] = min_target_count
            normalized_rule['contains_text'] = contains_text
            normalized_rule['same_prefix_length'] = same_prefix_length
            normalized_rule['same_suffix_length'] = same_suffix_length
            normalized_rule['regex_pattern'] = regex_pattern

        validated_rules.append(normalized_rule)

    return validated_rules


def _append_target_value(target_values, label, value):
    label = str(label or '').strip()
    value = str(value or '').strip()
    if not label or not value:
        return
    bucket = target_values.setdefault(label, [])
    if value not in bucket:
        bucket.append(value)


def _build_target_values_snapshot(process_stage_code, ocr_result, barcode_result):
    process_stage_code = str(process_stage_code or '').strip()
    if not process_stage_code:
        return {}

    try:
        recipe = StageRecipeTemplate.objects.filter(process_stage_code=process_stage_code).first()
    except Exception:
        recipe = None
    if not recipe:
        return {}

    selected_targets = [str(item).strip() for item in (recipe.selected_targets or []) if str(item).strip()]
    if not selected_targets:
        return {}
    target_set = set(selected_targets)
    target_values = {}

    ocr_data = ocr_result if isinstance(ocr_result, dict) else {}
    batch_processing = ocr_data.get('batch_processing') if isinstance(ocr_data, dict) else {}
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

    detailed_results = ocr_data.get('detailed_results') if isinstance(ocr_data, dict) else []
    if isinstance(detailed_results, list):
        for item in detailed_results:
            if not isinstance(item, dict):
                continue
            label = str(item.get('label') or '').strip()
            if label in target_set:
                _append_target_value(target_values, label, item.get('text') or '')

    barcode_data = barcode_result if isinstance(barcode_result, dict) else {}
    barcode_results = barcode_data.get('results') if isinstance(barcode_data, dict) else []
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


def _inject_target_values_snapshot(validated_data):
    process_stage_code = validated_data.get('process_stage_code')
    ocr_result = validated_data.get('ocr_result')
    barcode_result = validated_data.get('barcode_result')
    target_values = _build_target_values_snapshot(process_stage_code, ocr_result, barcode_result)
    if not target_values:
        return

    if not isinstance(ocr_result, dict):
        ocr_result = {}
    validated_data['ocr_result'] = {
        **ocr_result,
        'targetValues': target_values,
    }

def guess_mime_from_name(name: str) -> str:
    ext = os.path.splitext(name)[1].lower()
    return {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp',
    }.get(ext, 'image/png')

def detect_image_format(data: bytes) -> str:
    """检测图片格式"""
    if data.startswith(b'\xff\xd8\xff'):
        return 'jpg'
    elif data.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'png'
    elif data.startswith(b'GIF87a') or data.startswith(b'GIF89a'):
        return 'gif'
    elif data.startswith(b'RIFF') and data[8:12] == b'WEBP':
        return 'webp'
    elif data.startswith(b'BM'):
        return 'bmp'
    else:
        return 'png'  # 默认使用png

class Base64ImageField(serializers.ImageField):
    def to_internal_value(self, data):
        if hasattr(data, 'read'):
            return super().to_internal_value(data)
        if isinstance(data, str):
            if 'base64,' in data:
                _, data = data.split('base64,', 1)
            try:
                decoded = base64.b64decode(data)
            except (TypeError, ValueError):
                raise serializers.ValidationError('Invalid base64 image')
            file_name = str(uuid.uuid4())[:12]
            ext = detect_image_format(decoded)
            return ContentFile(decoded, name=f'{file_name}.{ext}')
        return super().to_internal_value(data)

    def to_representation(self, value):
        if not value or not hasattr(value, 'open'):
            return None
        try:
            with value.open('rb') as f:
                raw = f.read()
            b64 = base64.b64encode(raw).decode('utf-8')
            mime = guess_mime_from_name(value.name)
            return f'data:{mime};base64,{b64}'
        except Exception:
            return None

class AIConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIConfig
        fields = '__all__'

class DefectTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = DefectType
        fields = '__all__'

class DefectSeveritySerializer(serializers.ModelSerializer):
    class Meta:
        model = DefectSeverity
        fields = '__all__'

class InspectionAreaSerializer(serializers.ModelSerializer):
    class Meta:
        model = InspectionArea
        fields = '__all__'
        read_only_fields = ['id']

class DefectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Defect
        fields = '__all__'
        read_only_fields = ['id', 'inspection_result']

class StandardSerializer(serializers.ModelSerializer):
    standard_image = Base64ImageField(required=False, allow_null=True)
    inspection_areas = InspectionAreaSerializer(many=True, required=False)

    class Meta:
        model = Standard
        fields = '__all__'
        read_only_fields = ['id']

    def create(self, validated_data):
        areas = validated_data.pop('inspection_areas', [])
        standard = Standard.objects.create(**validated_data)
        for a in areas:
            InspectionArea.objects.create(standard=standard, **a)
        return standard

    def update(self, instance, validated_data):
        areas = validated_data.pop('inspection_areas', None)
        for k, v in validated_data.items():
            setattr(instance, k, v)
        instance.save()
        if areas is not None:
            instance.inspection_areas.all().delete()
            for a in areas:
                InspectionArea.objects.create(standard=instance, **a)
        return instance

class InspectionResultSerializer(serializers.ModelSerializer):
    image = Base64ImageField(required=False, allow_null=True)
    defects = DefectSerializer(many=True, required=False)
    standard_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    detection_type = serializers.CharField(required=False, allow_blank=True)
    # 新增：支持OCR和LLM详细结果
    ocr_result = serializers.JSONField(required=False, allow_null=True)
    # 新增：支持二维码/条码检测结果
    barcode_result = serializers.JSONField(required=False, allow_null=True)
    llm_result = serializers.JSONField(required=False, allow_null=True)
    # 新增：LLM返回的完整文字
    llm_full_text = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    # 新增：结构化详细结果
    llm_full_detail = serializers.JSONField(required=False, allow_null=True)

    class Meta:
        model = InspectionResult
        fields = '__all__'
        read_only_fields = ['id', 'timestamp', 'standard']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # 附加FQC信息（由create/update在instance上暂存）
        if hasattr(instance, '_fqc_record_id'):
            data['fqc_record_id'] = instance._fqc_record_id
            data['fqc_overall_result'] = getattr(instance, '_fqc_overall_result', None)
        return data

    def create(self, validated_data):
        _inject_target_values_snapshot(validated_data)
        defects_data = validated_data.pop('defects', [])
        std_id = validated_data.pop('standard_id', None)
        standard = None
        if std_id:
            try:
                standard = Standard.objects.get(id=std_id)
            except Standard.DoesNotExist:
                pass
        result = InspectionResult.objects.create(standard=standard, **validated_data)
        result = evaluate_trace_for_result(result)
        result.save(update_fields=[
            'fixture_qr',
            'fixture_qr_detected',
            'fixture_qr_source',
            'fixture_qr_input_status',
            'fixture_qr_confidence',
            'business_code',
            'business_code_type',
            'overall_quality',
            'trace_conclusion',
            'trace_conclusion_reason',
            'fixture_rule_passed',
            'fixture_rule_reason',
            'trace_rule_summary',
            'trace_rule_details',
            'related_stages',
            'trace_context',
        ])
        if result.fixture_qr:
            refresh_fixture_trace_results(result.fixture_qr, exclude_result_id=result.id)
        for d in defects_data:
            Defect.objects.create(inspection_result=result, **d)
        # 异常评估
        try:
            from .anomaly_service import evaluate_anomalies_for_result
            new_anomalies = evaluate_anomalies_for_result(result)
            if new_anomalies:
                result._new_anomaly_count = len(new_anomalies)
        except Exception:
            pass
        # FQC终检评估
        try:
            from .fqc_service import generate_fqc_record
            fqc = generate_fqc_record(result)
            if fqc:
                result._fqc_record_id = str(fqc.id)
                result._fqc_overall_result = fqc.overall_result
        except Exception:
            import logging
            logging.getLogger(__name__).exception('FQC终检评估失败 result_id=%s', result.id)
        return result

    def update(self, instance, validated_data):
        _inject_target_values_snapshot(validated_data)
        defects_data = validated_data.pop('defects', None)
        std_id = validated_data.pop('standard_id', serializers.empty)

        if std_id is not serializers.empty:
            standard = None
            if std_id:
                try:
                    standard = Standard.objects.get(id=std_id)
                except Standard.DoesNotExist:
                    standard = None
            instance.standard = standard

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if 'overall_quality' in validated_data:
            trace_context = dict(instance.trace_context or {})
            trace_context.pop('traceQualityGateApplied', None)
            trace_context.pop('inspectionQualityBeforeTrace', None)
            instance.trace_context = trace_context

        instance = evaluate_trace_for_result(instance)
        instance.save()

        if instance.fixture_qr:
            refresh_fixture_trace_results(instance.fixture_qr, exclude_result_id=instance.id)

        if defects_data is not None:
            instance.defects.all().delete()
            for defect in defects_data:
                Defect.objects.create(inspection_result=instance, **defect)

        # 异常评估（与 create 保持一致）
        try:
            from .anomaly_service import evaluate_anomalies_for_result
            new_anomalies = evaluate_anomalies_for_result(instance)
            if new_anomalies:
                instance._new_anomaly_count = len(new_anomalies)
        except Exception:
            pass

        # FQC终检评估（与 create 保持一致）
        try:
            from .fqc_service import generate_fqc_record
            fqc = generate_fqc_record(instance)
            if fqc:
                instance._fqc_record_id = str(fqc.id)
                instance._fqc_overall_result = fqc.overall_result
        except Exception:
            import logging
            logging.getLogger(__name__).exception('FQC终检评估失败 result_id=%s', instance.id)

        return instance

class ModelVersionSerializer(serializers.ModelSerializer):
    """模型版本序列化器"""
    file_size_mb = serializers.ReadOnlyField()
    is_active = serializers.ReadOnlyField()
    
    class Meta:
        model = ModelVersion
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at', 'file_size', 'file_size_mb', 'is_active']

class ModelDeploymentSerializer(serializers.ModelSerializer):
    """模型部署序列化器"""
    model_version = ModelVersionSerializer(read_only=True)
    model_version_id = serializers.UUIDField(write_only=True)
    success_rate = serializers.ReadOnlyField()
    
    class Meta:
        model = ModelDeployment
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at', 'success_rate']

class ModelUploadSerializer(serializers.ModelSerializer):
    """模型上传序列化器"""
    class Meta:
        model = ModelUpload
        fields = '__all__'
        read_only_fields = ['id', 'uploaded_at', 'completed_at', 'validation_result', 'model_version']

class ModelPerformanceSerializer(serializers.ModelSerializer):
    """模型性能序列化器"""
    class Meta:
        model = ModelPerformance
        fields = '__all__'
        read_only_fields = ['id', 'timestamp']

class ModelVersionDetailSerializer(serializers.ModelSerializer):
    """模型版本详细信息序列化器"""
    deployments = ModelDeploymentSerializer(many=True, read_only=True)
    performance_records = ModelPerformanceSerializer(many=True, read_only=True)
    file_size_mb = serializers.ReadOnlyField()
    is_active = serializers.ReadOnlyField()
    
    class Meta:
        model = ModelVersion
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at', 'file_size', 'file_size_mb', 'is_active']

class ModelUploadProgressSerializer(serializers.ModelSerializer):
    """模型上传进度序列化器"""
    class Meta:
        model = ModelUpload
        fields = ['id', 'file_name', 'upload_progress', 'status', 'uploaded_at', 'error_message']

class ModelDeploymentStatusSerializer(serializers.ModelSerializer):
    """模型部署状态序列化器"""
    model_version = ModelVersionSerializer(read_only=True)
    success_rate = serializers.ReadOnlyField()
    
    class Meta:
        model = ModelDeployment
        fields = ['id', 'model_version', 'environment', 'status', 'deployed_at', 'request_count', 'error_count', 'avg_response_time', 'success_rate'] 


class OCRKeywordTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = OCRKeywordTemplate
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']


class OCRBarcodeTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = OCRBarcodeTemplate
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']


class FixtureTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = FixtureTemplate
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']


class StageRecipeTemplateSerializer(serializers.ModelSerializer):
    fixture_template_detail = FixtureTemplateSerializer(source='fixture_template', read_only=True)

    class Meta:
        model = StageRecipeTemplate
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']


class AnomalyResolutionSerializer(serializers.ModelSerializer):
    class Meta:
        model = AnomalyResolution
        fields = '__all__'
        read_only_fields = ['id', 'created_at']


class AnomalyRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = AnomalyRule
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']
        extra_kwargs = {
            'password_suspend': {'write_only': True},
            'password_resolve': {'write_only': True},
            'password_escalate': {'write_only': True},
            'password_scrap': {'write_only': True},
        }


class AnomalyRecordSerializer(serializers.ModelSerializer):
    resolutions = AnomalyResolutionSerializer(many=True, read_only=True)
    rule_name = serializers.CharField(source='rule.name', read_only=True, default='')
    recipe_name = serializers.CharField(source='recipe.name', read_only=True, default='')

    class Meta:
        model = AnomalyRecord
        fields = '__all__'
        read_only_fields = ['id', 'opened_at', 'updated_at', 'resolved_at', 'escalated_at']


class ProductStageSerializer(serializers.ModelSerializer):
    stage_recipe_name = serializers.CharField(source='stage_recipe.name', read_only=True)

    class Meta:
        model = ProductStage
        fields = ['id', 'stage_recipe', 'stage_recipe_name', 'order', 'is_fqc']


class ProductRecipeSerializer(serializers.ModelSerializer):
    stages = ProductStageSerializer(source='product_stage_links', many=True, read_only=True)
    fqc_validation_rules = serializers.JSONField(required=False, default=list)

    class Meta:
        model = ProductRecipe
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']

    def create(self, validated_data):
        return ProductRecipe.objects.create(**validated_data)

    def validate(self, attrs):
        attrs = super().validate(attrs)

        enabled = attrs.get(
            'fqc_validation_enabled',
            getattr(self.instance, 'fqc_validation_enabled', False),
        )
        has_rules = 'fqc_validation_rules' in attrs

        if enabled:
            attrs['fqc_validation_rules'] = validate_fqc_validation_rules(
                attrs.get('fqc_validation_rules', [])
            )
        elif has_rules and attrs.get('fqc_validation_rules') in (None, ''):
            attrs['fqc_validation_rules'] = []

        return attrs


class FQCRecordSerializer(serializers.ModelSerializer):
    related_inspection_ids = serializers.SerializerMethodField()
    product_recipe_id = serializers.UUIDField(source='product_recipe.id', read_only=True, default=None)

    class Meta:
        model = FQCRecord
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_related_inspection_ids(self, obj):
        return [str(r.id) for r in obj.related_inspections.all()]
