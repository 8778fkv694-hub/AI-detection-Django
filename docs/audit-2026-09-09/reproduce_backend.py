"""Read current services against a disposable Django test database; never use production DB.

第一批整改回归：
- A07：装载会话限定 FQC 汇总范围；旧件（其它轮次）不能补齐新件缺检工序。
  未携带会话的历史/旧客户端记录保持旧行为（向后兼容）。
- A06：视觉来源的工装码必须与当前图像候选交叉校验，禁止沿用旧件视觉码。
"""
import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()
from django.test import TestCase
from django.test.runner import DiscoverRunner
from inspection.models import (
    FixtureLoadSession,
    InspectionResult,
    StageRecipeTemplate,
    ProductRecipe,
    ProductStage,
)
from inspection.fqc_service import generate_fqc_record
from inspection.product_trace_service import _resolve_fixture_qr_from_candidates

class ProductionAuditRegressions(TestCase):
    def _setup_recipe(self, fixture_qr):
        s1 = StageRecipeTemplate.objects.create(name=f'audit-s1-{fixture_qr}', process_stage_code='S1')
        f = StageRecipeTemplate.objects.create(name=f'audit-fqc-{fixture_qr}', process_stage_code='FQC')
        p = ProductRecipe.objects.create(name=f'audit-product-{fixture_qr}')
        ProductStage.objects.create(product_recipe=p, stage_recipe=s1, order=1)
        ProductStage.objects.create(product_recipe=p, stage_recipe=f, order=2, is_fqc=True)
        return s1, f, p

    def test_reused_fixture_with_new_round_cannot_inherit_old_stage_records(self):
        # A07：新装载轮次（session R2）不得继承旧轮次（session R1）的 S1 记录。
        self._setup_recipe('REUSED')
        old_session = FixtureLoadSession.objects.create(fixture_qr='REUSED')
        new_session = FixtureLoadSession.objects.create(fixture_qr='REUSED')
        old = InspectionResult.objects.create(
            fixture_qr='REUSED', process_stage_code='S1', overall_quality='合格',
            trace_conclusion='合格', fixture_session=old_session,
        )
        # 同一工装的新件：只做了 FQC，没有做 S1。
        new = InspectionResult.objects.create(
            fixture_qr='REUSED', process_stage_code='FQC', overall_quality='合格',
            trace_conclusion='合格', fixture_session=new_session,
        )
        report = generate_fqc_record(new)
        self.assertEqual(report.overall_result, '存疑')
        self.assertNotIn(old.pk, list(report.related_inspections.values_list('pk', flat=True)))
        self.assertIn('缺少配方工序', report.result_reason)
        print('A07 FIXED: a new load round no longer inherits the previous piece S1 record.')

    def test_legacy_trigger_keeps_legacy_aggregation(self):
        # 向后兼容：未携带会话的触发记录仍按旧逻辑汇总历史。
        self._setup_recipe('LEGACY')
        InspectionResult.objects.create(
            fixture_qr='LEGACY', process_stage_code='S1', overall_quality='合格',
            trace_conclusion='合格',
        )
        new = InspectionResult.objects.create(
            fixture_qr='LEGACY', process_stage_code='FQC', overall_quality='合格',
            trace_conclusion='合格',
        )
        report = generate_fqc_record(new)
        self.assertEqual(report.overall_result, '合格')

    def test_same_round_stage_records_still_aggregate(self):
        # 正常路径不受影响：同一会话内的工序记录仍可汇总为合格。
        self._setup_recipe('SAMEDAY')
        session = FixtureLoadSession.objects.create(fixture_qr='SAMEDAY')
        first = InspectionResult.objects.create(
            fixture_qr='SAMEDAY', process_stage_code='S1', overall_quality='合格',
            trace_conclusion='合格', fixture_session=session,
        )
        new = InspectionResult.objects.create(
            fixture_qr='SAMEDAY', process_stage_code='FQC', overall_quality='合格',
            trace_conclusion='合格', fixture_session=session,
        )
        report = generate_fqc_record(new)
        self.assertEqual(report.overall_result, '合格')
        self.assertIn(first.pk, list(report.related_inspections.values_list('pk', flat=True)))

    def test_nonempty_vision_code_must_match_current_candidates(self):
        # A06：视觉来源的旧码被当前图像候选推翻（前缀规则指向 NEW）。
        record = InspectionResult(fixture_qr='OLD', fixture_qr_source='vision', fixture_qr_input_status='success',
            barcode_result={'results': [{'data': 'NEW', 'type': 'qr'}]},
            trace_context={'fixtureQrPrefixes': ['NEW']})
        resolved = _resolve_fixture_qr_from_candidates(record)
        self.assertEqual(resolved[0], 'NEW')
        self.assertTrue(resolved[1])
        print('A06 FIXED: fresh candidate resolution wins over a stale vision fixture binding.')

    def test_stale_vision_code_with_no_matching_candidate_is_not_trusted(self):
        # A06：当前图像读不到候选且旧码不符合规则 → 绑定可疑，转存疑等待补录。
        record = InspectionResult(fixture_qr='OLD', fixture_qr_source='vision', fixture_qr_input_status='success',
            barcode_result={'results': []}, trace_context={'fixtureQrPrefixes': ['NEW']})
        resolved = _resolve_fixture_qr_from_candidates(record)
        self.assertEqual(resolved[0], '')
        self.assertFalse(resolved[1])
        self.assertEqual(resolved[3], 'failed')

    def test_manual_binding_is_trusted_as_explicit(self):
        # 手工/扫码/NFC 是显式绑定，不受候选交叉校验影响。
        record = InspectionResult(fixture_qr='MANUAL-CODE', fixture_qr_source='manual', fixture_qr_input_status='success',
            barcode_result={'results': [{'data': 'OTHER', 'type': 'qr'}]},
            trace_context={'fixtureQrPrefixes': ['NEW']})
        resolved = _resolve_fixture_qr_from_candidates(record)
        self.assertEqual(resolved[0], 'MANUAL-CODE')

if __name__ == '__main__':
    # Test runner creates and destroys its own database.
    failures = DiscoverRunner(verbosity=1, interactive=False).run_tests(['__main__.ProductionAuditRegressions'])
    sys.exit(bool(failures))
