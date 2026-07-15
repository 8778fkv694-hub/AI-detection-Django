import json
from unittest.mock import Mock, patch

from django.test import SimpleTestCase, TestCase

from inspection.batch_detection_service import BatchDetectionService
from inspection.fqc_service import generate_fqc_record
from inspection.models import InspectionResult, ProductRecipe, ProductStage, StageRecipeTemplate
from inspection.product_trace_service import evaluate_trace_for_result
from inspection.roi_cache import ROICacheManager, get_roi_cache


class OnlineFusionApiTests(TestCase):
    def test_requires_a_selected_standard(self):
        response = self.client.post(
            '/api/ai/analyze',
            data=json.dumps({
                'image': 'dGVzdA==',
                'config': {'apiBaseUrl': 'https://example.invalid/chat', 'modelName': 'vision'},
                'standard': {},
            }),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('检测标准', response.json()['error'])

    @patch('inspection.ai_api.requests.post')
    def test_invalid_model_quality_is_normalized_to_recheck(self, mocked_post):
        upstream = Mock()
        upstream.raise_for_status.return_value = None
        upstream.json.return_value = {
            'choices': [{'message': {'content': '{"overallQuality":"优秀","score":999,"reason":"无法确认"}'}}]
        }
        mocked_post.return_value = upstream

        response = self.client.post(
            '/api/ai/analyze',
            data=json.dumps({
                'image': 'dGVzdA==',
                'config': {'apiBaseUrl': 'https://example.invalid/chat', 'modelName': 'vision'},
                'standard': {'id': 'standard-1', 'name': '标准1', 'criteria': '文字必须清晰'},
            }),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['overallQuality'], '需复检')
        self.assertEqual(response.json()['score'], 100)


class BatchDetectionSafetyTests(SimpleTestCase):
    @patch('inspection.barcode_service.barcode_service.detect')
    @patch('inspection.ocr_service.ocr_service.extract_text')
    def test_selected_target_runs_ocr_without_keyword_rules(self, extract_text, detect_barcode):
        extract_text.return_value = {
            'success': True,
            'full_text': 'ABC123',
            'confidence': 0.99,
        }
        service = BatchDetectionService(max_workers=1)
        image = object()

        result = service.process_batch(
            rois=[{'label': 'serial_label', 'image': image, 'bbox': {}}],
            enable_barcode=False,
            selected_targets=['serial_label'],
            ocr_model='rapidocr',
        )

        self.assertTrue(result['success'])
        self.assertEqual(result['ocr_text'], '[serial_label] ABC123')
        extract_text.assert_called_once_with(
            image,
            model_name='rapidocr',
            use_angle_cls=False,
        )
        detect_barcode.assert_not_called()

    def test_any_roi_failure_marks_batch_unsuccessful(self):
        service = BatchDetectionService(max_workers=1)
        result = service._merge_results(
            [
                {'label': 'a', 'success': True, 'qualified': True, 'ocr_text': '', 'barcodes': []},
                {'label': 'b', 'success': False, 'qualified': False, 'error': 'OCR failed'},
            ],
            [{'label': 'a'}, {'label': 'b'}],
        )

        self.assertFalse(result['success'])
        self.assertEqual(result['overall_quality'], '不合格')

    def test_any_barcode_rule_does_not_pass_without_a_detected_barcode(self):
        service = BatchDetectionService(max_workers=1)
        validation = service._validate_roi(
            'serial_label',
            {'barcode_count': 0, 'ocr_text': 'plain OCR text'},
            {'require_barcode': True},
            [{'enabled': True, 'expectedText': '', 'targetRoi': 'serial_label'}],
        )

        self.assertFalse(validation['qualified'])
        self.assertIn('条码', validation['reason'])

    def test_orientation_rule_fails_when_ocr_has_no_orientation_evidence(self):
        service = BatchDetectionService(max_workers=1)
        validation = service._validate_roi(
            'serial_label',
            {
                'ocr_text': 'ABC123',
                'ocr_confidence': 0.99,
                'detected_orientation': None,
                'barcode_count': 0,
            },
            {'enable_keywords': False},
            keyword_configs=[{
                'text': 'ABC123',
                'confidence': 0.8,
                'requiredCount': 1,
                'expectedOrientation': 0,
                'targetRoi': 'serial_label',
            }],
        )

        self.assertFalse(validation['qualified'])
        self.assertIn('方向', validation['reason'])

    def test_roi_cache_capacity_cleanup_does_not_deadlock(self):
        cache = ROICacheManager(max_size=1, ttl=300)
        cache.store('a', object(), {})
        cache.store('b', object(), {})

        self.assertEqual(cache.get_stats()['total_count'], 1)


class BatchDetectionApiCompletenessTests(TestCase):
    def setUp(self):
        self.cache = get_roi_cache()
        self.cache.clear()

    def tearDown(self):
        self.cache.clear()

    def test_missing_selected_target_is_rejected(self):
        roi_id = self.cache.store('target-a', object(), {})
        response = self.client.post(
            '/api/ocr/batch-detection/',
            data=json.dumps({
                'roi_ids': [roi_id],
                'selected_targets': ['target-a', 'target-b'],
            }),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 409)
        self.assertFalse(response.json()['success'])
        self.assertEqual(response.json()['missing_labels'], ['target-b'])


class TraceQualityGateTests(TestCase):
    def test_fixture_disabled_does_not_create_false_missing_code_failure(self):
        record = InspectionResult(
            overall_quality='合格',
            trace_context={'fixtureEnabled': False},
        )

        evaluated = evaluate_trace_for_result(record)

        self.assertEqual(evaluated.trace_conclusion, '合格')
        self.assertEqual(evaluated.overall_quality, '合格')
        self.assertTrue(evaluated.trace_context['fixtureTrackingSkipped'])

    def test_missing_fixture_code_downgrades_release_quality(self):
        record = InspectionResult(
            overall_quality='合格',
            fixture_qr_source='manual',
            fixture_qr_input_status='failed',
            trace_context={'fixtureEnabled': True},
        )

        evaluated = evaluate_trace_for_result(record)

        self.assertEqual(evaluated.trace_conclusion, '需复检')
        self.assertEqual(evaluated.overall_quality, '需复检')
        self.assertEqual(evaluated.trace_context['inspectionQualityBeforeTrace'], '合格')

    def test_quality_recovers_after_matching_stage_arrives(self):
        first = InspectionResult.objects.create(
            overall_quality='合格',
            fixture_qr='FIXTURE-1',
            fixture_qr_detected=True,
            fixture_qr_input_status='success',
            process_stage_code='S1',
            business_code='ABC-001',
            trace_context={'fixtureEnabled': True},
        )
        InspectionResult.objects.create(
            overall_quality='合格',
            fixture_qr='FIXTURE-1',
            fixture_qr_detected=True,
            fixture_qr_input_status='success',
            process_stage_code='S2',
            business_code='ABC-001',
            trace_context={'fixtureEnabled': True},
        )

        evaluated = evaluate_trace_for_result(first)

        self.assertEqual(evaluated.trace_conclusion, '合格')
        self.assertEqual(evaluated.overall_quality, '合格')


class FqcCompletenessTests(TestCase):
    def test_fqc_assignment_rejects_a_stage_without_fixture_tracking(self):
        product = ProductRecipe.objects.create(name='product-with-invalid-fqc')
        fqc_stage = StageRecipeTemplate.objects.create(
            name='fqc-without-fixture',
            process_stage_code='FQC-NO-FIXTURE',
            fixture_enabled=False,
        )

        response = self.client.post(
            f'/api/product-recipes/{product.id}/assign-stages/',
            data=json.dumps({
                'stages': [{
                    'stage_recipe_id': str(fqc_stage.id),
                    'order': 1,
                    'is_fqc': True,
                }],
            }),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('FQC', response.json()['error'])

    def test_fqc_stays_pending_when_a_recipe_stage_is_missing(self):
        stage_one = StageRecipeTemplate.objects.create(name='stage-one', process_stage_code='S1')
        fqc_stage = StageRecipeTemplate.objects.create(name='fqc-stage', process_stage_code='FQC')
        product = ProductRecipe.objects.create(name='product-one')
        ProductStage.objects.create(product_recipe=product, stage_recipe=stage_one, order=1)
        ProductStage.objects.create(product_recipe=product, stage_recipe=fqc_stage, order=2, is_fqc=True)
        trigger = InspectionResult.objects.create(
            overall_quality='合格',
            fixture_qr='FIXTURE-FQC',
            process_stage_code='FQC',
            trace_conclusion='合格',
        )

        fqc = generate_fqc_record(trigger)

        self.assertIsNotNone(fqc)
        self.assertEqual(fqc.overall_result, '存疑')
        self.assertIn('S1', fqc.result_reason)
