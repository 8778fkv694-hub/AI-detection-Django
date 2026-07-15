"""
批处理检测服务
支持CPU并发处理多个ROI，为GPU批处理做准备
"""
import time
import logging
from typing import List, Dict, Any, Optional
import os
import re

logger = logging.getLogger(__name__)


class BatchDetectionService:
    """
    批处理检测服务
    
    功能：
    1. CPU并发处理多个ROI（当前）
    2. 统一接口，将来可切换到GPU批处理
    3. 结果合并与验证
    4. 性能监控
    """
    
    def __init__(self, max_workers: Optional[int] = None):
        """
        初始化批处理服务
        
        Args:
            max_workers: 最大并发线程数，None表示自动检测
        """
        # 自动检测CPU核心数
        cpu_count = os.cpu_count() or 4
        
        # 默认使用CPU核心数-2，最少1个，最多4个
        if max_workers is None:
            max_workers = min(max(cpu_count - 2, 1), 4)
        
        self.max_workers = max_workers
        logger.info(f"批处理服务已初始化: max_workers={max_workers}, cpu_count={cpu_count}")
    
    def process_batch(
        self,
        rois: List[Dict[str, Any]],
        apply_rules: bool = False,
        enable_barcode: bool = True,
        target_configs: Optional[Dict] = None,
        keyword_configs: Optional[List] = None,
        keyword_match_mode: str = 'contains',
        barcode_configs: Optional[List] = None,
        selected_targets: Optional[List[str]] = None,
        ocr_model: Optional[str] = None,
        use_angle_cls: bool = False,
    ) -> Dict[str, Any]:
        """
        批处理多个ROI
        
        Args:
            rois: ROI数据列表
            apply_rules: 是否应用目标规则验证
            enable_barcode: 是否启用条码检测
            target_configs: 目标配置（关键词、条码规则等）
            keyword_configs: 关键词配置列表（用于决定哪些ROI需要OCR）
            barcode_configs: 条码配置列表（用于决定哪些ROI需要条码检测）
        
        Returns:
            批处理结果
        """
        start_time = time.time()
        
        # 1. 参数验证
        if not rois:
            return self._create_error_result("没有可处理的ROI")
        
        logger.info(f"开始批处理: {len(rois)}个ROI, 并发数={self.max_workers}")
        logger.info(f"批处理条码配置: enable_barcode={enable_barcode}, barcode_configs={barcode_configs}")
        
        # 2. CPU并发处理
        try:
            roi_results = self._process_concurrent(
                rois, 
                apply_rules, 
                enable_barcode,
                target_configs,
                keyword_configs,
                keyword_match_mode,
                barcode_configs,
                selected_targets,
                ocr_model,
                use_angle_cls,
            )
        except Exception as e:
            logger.error(f"批处理失败: {e}", exc_info=True)
            return self._create_error_result(f"批处理失败: {str(e)}")
        
        # 3. 合并结果
        merged_result = self._merge_results(roi_results, rois)
        
        # 4. 添加性能指标
        processing_time = time.time() - start_time
        merged_result['processing_time'] = round(processing_time, 3)
        merged_result['processing_mode'] = 'cpu_serial_safe'
        merged_result['worker_count'] = 1
        
        logger.info(
            f"批处理完成: {len(rois)}个ROI, "
            f"耗时{processing_time:.3f}s, "
            f"状态={merged_result['overall_quality']}"
        )
        
        return merged_result
    
    def _process_concurrent(
        self,
        rois: List[Dict[str, Any]],
        apply_rules: bool,
        enable_barcode: bool,
        target_configs: Optional[Dict],
        keyword_configs: Optional[List] = None,
        keyword_match_mode: str = 'contains',
        barcode_configs: Optional[List] = None,
        selected_targets: Optional[List[str]] = None,
        ocr_model: Optional[str] = None,
        use_angle_cls: bool = False,
    ) -> List[Dict[str, Any]]:
        """
        处理多个ROI
        注意：已从并发改为串行，以避免多线程下的OpenCV/OCR库崩溃风险
        
        Returns:
            ROI处理结果列表
        """
        results = []
        
        for idx, roi in enumerate(rois):
            try:
                # 记录日志，方便追踪进度
                roi_label = roi.get('label', f'ROI_{idx+1}')
                logger.info(f"正在处理ROI [{idx+1}/{len(rois)}]: {roi_label}")
                
                result = self._process_single_roi(
                    roi,
                    apply_rules,
                    enable_barcode,
                    target_configs,
                    keyword_configs,
                    keyword_match_mode,
                    barcode_configs,
                    selected_targets,
                    ocr_model,
                    use_angle_cls,
                )
                results.append(result)
                
            except Exception as e:
                logger.error(f"ROI处理失败 [{idx}] {roi.get('label')}: {e}")
                results.append({
                    'label': roi.get('label', f'ROI_{idx+1}'),
                    'grid_index': idx + 1,
                    'success': False,
                    'error': str(e),
                    'ocr_text': '',
                    'barcodes': [],
                    'barcode_count': 0,
                    'qualified': False,
                    'reason': f'处理失败: {str(e)}'
                })
        
        return results
    
    def _process_single_roi(
        self,
        roi: Dict[str, Any],
        apply_rules: bool,
        enable_barcode: bool,
        target_configs: Optional[Dict],
        keyword_configs: Optional[List] = None,
        keyword_match_mode: str = 'contains',
        barcode_configs: Optional[List] = None,
        selected_targets: Optional[List[str]] = None,
        ocr_model: Optional[str] = None,
        use_angle_cls: bool = False,
    ) -> Dict[str, Any]:
        """
        处理单个ROI（OCR + 条码检测 + 规则验证）
        
        Args:
            roi: ROI数据
            apply_rules: 是否应用规则
            enable_barcode: 是否检测条码
            target_configs: 目标配置
            keyword_configs: 关键词配置列表（用于判断是否需要OCR）
            barcode_configs: 条码配置列表（用于判断是否需要条码检测）
        
        Returns:
            处理结果
        """
        from inspection.ocr_service import ocr_service
        from inspection.barcode_service import barcode_service
        
        label = roi.get('label', 'unknown')
        image = roi.get('image')
        
        result = {
            'label': label,
            'grid_index': 0,  # 将在合并时设置
            'success': True,
            'ocr_text': '',
            'barcodes': [],
            'barcode_count': 0,
            'qualified': True,
            'reason': '',
            'bbox': roi.get('bbox', {}),
            'skipped_ocr': False,
            'skipped_barcode': False
        }
        
        if image is None:
            result['success'] = False
            result['error'] = 'ROI图像为空'
            result['qualified'] = False
            result['reason'] = 'ROI图像为空'
            return result
        
        # 检查该ROI是否有配置的关键词规则（targetRoi匹配）
        has_keyword_config = False
        if keyword_configs:
            has_keyword_config = any(
                cfg.get('targetRoi') in (None, '', 'all', label)
                for cfg in keyword_configs
            )
        
        # 检查该ROI是否有配置的条码规则（targetRoi匹配）
        has_barcode_config = False
        if barcode_configs:
            has_barcode_config = any(
                cfg.get('enabled', True)
                and cfg.get('targetRoi') in (None, '', 'all', label)
                for cfg in barcode_configs
            )
        
        # 只要ROI在选中的目标列表中(target_configs)，或者有特定的关键词配置，就执行OCR
        is_selected_target = label in (selected_targets or [])
        should_run_ocr = is_selected_target or has_keyword_config
        if target_configs and label in target_configs:
            should_run_ocr = True
            
        # 只要ROI在选中的目标列表中(target_configs)，或者有特定的条码配置，就执行条码检测
        should_run_barcode = is_selected_target or has_barcode_config
        if target_configs and label in target_configs:
            should_run_barcode = True
        logger.info(
            f"[{label}] 条码检测触发判断: enable_barcode={enable_barcode}, "
            f"has_barcode_config={has_barcode_config}, "
            f"target_in_configs={bool(target_configs and label in target_configs)}, "
            f"should_run_barcode={should_run_barcode}"
        )
        
        try:
            # 1. OCR检测
            if should_run_ocr:
                ocr_result = ocr_service.extract_text(
                    image,
                    model_name=ocr_model,
                    use_angle_cls=use_angle_cls,
                )
                if not ocr_result.get('success', False):
                    raise RuntimeError(ocr_result.get('error') or 'OCR识别失败')
                detailed_results = ocr_result.get('detailed_results', [])
                confidence = ocr_result.get('confidence')
                if confidence is None and detailed_results:
                    scores = [
                        float(item.get('confidence', 0) or 0)
                        for item in detailed_results
                        if isinstance(item, dict)
                    ]
                    confidence = sum(scores) / len(scores) if scores else 0.0
                result['ocr_text'] = ocr_result.get('full_text', '')
                result['ocr_confidence'] = confidence or 0.0
                result['ocr_detailed_results'] = detailed_results
                result['detected_orientation'] = ocr_result.get('detected_orientation')
                result['detected_orientation_degrees'] = ocr_result.get('detected_orientation_degrees')
                if not result['ocr_text'].strip() or not detailed_results:
                    result['qualified'] = False
                    result['reason'] = 'OCR未识别到可复核文字'
            else:
                result['skipped_ocr'] = True
                logger.debug(f"[{label}] 跳过OCR检测（非选中目标且无规则）")
            
            # 2. 条码检测
            if enable_barcode and should_run_barcode:
                scoped_barcode_configs = [
                    cfg for cfg in (barcode_configs or [])
                    if cfg.get('enabled', True)
                    and cfg.get('targetRoi') in (None, '', 'all', label)
                ]
                # 兼容旧规则：未声明 codeType 时按二维码处理。
                detect_qr = not scoped_barcode_configs or any(
                    cfg.get('codeType', 'qr') == 'qr' for cfg in scoped_barcode_configs
                )
                detect_linear = not scoped_barcode_configs or any(
                    cfg.get('codeType') == 'linear' for cfg in scoped_barcode_configs
                )
                barcode_result = barcode_service.detect(
                    image,
                    detect_qr=detect_qr,
                    detect_linear=detect_linear,
                )
                result['barcodes'] = barcode_result.get('codes', [])
                result['barcode_count'] = len(result['barcodes'])
                result['barcode_models_used'] = barcode_result.get('models_used', [])
                result['barcode_errors'] = barcode_result.get('errors', {})
                result['barcode_linear_attempts'] = barcode_result.get('linear_attempts', [])
                logger.info(f"[{label}] 条码检测结果: count={result['barcode_count']}, codes={result['barcodes']}")
            else:
                result['skipped_barcode'] = True
                if enable_barcode:
                    logger.debug(f"[{label}] 跳过条码检测（非选中目标且无规则）")
            
            # 3. 应用规则验证
            if apply_rules and target_configs:
                validation = self._validate_roi(
                    label, 
                    result, 
                    target_configs.get(label, {}),
                    barcode_configs,
                    keyword_configs,
                    keyword_match_mode,
                )
                result['qualified'] = validation['qualified']
                result['reason'] = validation['reason']
            
        except Exception as e:
            logger.error(f"ROI处理异常 [{label}]: {e}", exc_info=True)
            result['success'] = False
            result['error'] = str(e)
            result['qualified'] = False
            result['reason'] = f'处理异常: {str(e)}'
        
        return result
    
    def _validate_roi(
        self,
        label: str,
        result: Dict[str, Any],
        config: Dict[str, Any],
        barcode_configs: Optional[List] = None,
        keyword_configs: Optional[List] = None,
        keyword_match_mode: str = 'contains',
    ) -> Dict[str, bool]:
        """
        验证ROI是否符合规则
        
        Args:
            label: 目标标签
            result: ROI处理结果
            config: 目标配置（关键词、条码规则等）
        
        Returns:
            {'qualified': bool, 'reason': str}
        """
        reasons = []

        has_scoped_keyword_rules = any(
            keyword_config.get('targetRoi') in (None, '', 'all', label)
            for keyword_config in (keyword_configs or [])
        )
        # 条码专用 ROI 以真实解码为主、OCR数字为兜底；真实条码已解码时不强制额外 OCR。
        # 普通目标或同时配置关键词的目标仍必须具备可复核 OCR 证据。
        requires_ocr_evidence = (
            bool(config.get('enable_keywords'))
            or has_scoped_keyword_rules
            or not bool(config.get('require_barcode'))
        )
        if requires_ocr_evidence and (
            not str(result.get('ocr_text') or '').strip()
            or not result.get('ocr_detailed_results')
        ):
            reasons.append('OCR未识别到可复核文字')

        def count_matches(text: str, keyword: str) -> int:
            if not text or not keyword:
                return 0
            if keyword_match_mode == 'exact':
                normalized = text.strip()
                if normalized == keyword:
                    return 1
                return sum(
                    1 for segment in re.split(r'[\s,;，；。|]+', normalized)
                    if segment == keyword
                )
            return text.count(keyword)
        
        # 1. 关键词验证
        if config.get('enable_keywords'):
            required = config.get('required_keywords', '').split(',')
            excluded = config.get('excluded_keywords', '').split(',')
            ocr_text = result.get('ocr_text', '')
            
            # 必需关键词
            for kw in required:
                kw = kw.strip()
                if kw and kw not in ocr_text:
                    reasons.append(f'缺少必需关键词: {kw}')
            
            # 排除关键词
            for kw in excluded:
                kw = kw.strip()
                if kw and kw in ocr_text:
                    reasons.append(f'包含排除关键词: {kw}')

        # 执行完整关键词规则：目标、正/负面、次数、置信度和方向。
        for keyword_config in keyword_configs or []:
            target = keyword_config.get('targetRoi')
            if target not in (None, '', 'all', label):
                continue
            keyword = str(keyword_config.get('text') or '')
            if not keyword:
                reasons.append('关键词规则内容为空')
                continue
            raw_count = count_matches(result.get('ocr_text', ''), keyword)
            if keyword_config.get('type', 'positive') == 'negative':
                if raw_count > 0:
                    reasons.append(f'包含排除关键词: {keyword}')
                continue

            required_count = max(1, int(keyword_config.get('requiredCount', 1) or 1))
            min_confidence = float(keyword_config.get('confidence', 0) or 0)
            if raw_count > 0 and float(result.get('ocr_confidence', 0) or 0) < min_confidence:
                reasons.append(f'关键词置信度不足: {keyword}')
                continue

            expected_orientation = keyword_config.get('expectedOrientation')
            if raw_count > 0 and expected_orientation is not None:
                detected_orientation = result.get('detected_orientation_degrees')
                if detected_orientation is None:
                    detected_orientation = result.get('detected_orientation')
                if detected_orientation is None:
                    reasons.append(f'无法确认关键词方向: {keyword}')
                    continue
                expected = float(expected_orientation) % 360
                detected = float(detected_orientation) % 360
                difference = abs(expected - detected) % 360
                tolerance = float(keyword_config.get('orientationTolerance', 30) or 30)
                if min(difference, 360 - difference) > tolerance:
                    reasons.append(f'关键词方向不匹配: {keyword}')
                    continue

            if raw_count < required_count:
                reasons.append(f'关键词次数不足: {keyword} ({raw_count}/{required_count})')
        
        # 2. 二维码/一维条码分别验证；一维码可显式启用 OCR 数字兜底。
        if config.get('require_barcode'):
            detected_codes = result.get('barcodes') or []
            ocr_text = str(result.get('ocr_text') or '')
            scoped_configs = [
                cfg for cfg in (barcode_configs or [])
                if cfg.get('enabled', True)
                and cfg.get('targetRoi') in (None, '', 'all', label)
            ]
            match_details = []

            def normalize_format(value: Any) -> str:
                normalized = re.sub(r'[^A-Z0-9]', '', str(value or '').upper())
                return {
                    'I25': 'ITF',
                    'INTERLEAVED2OF5': 'ITF',
                }.get(normalized, normalized)

            def text_matches(actual: str, expected: str, mode: str) -> bool:
                if not expected:
                    return bool(actual.strip())
                if mode == 'exact':
                    return actual.strip() == expected
                return expected in actual or actual in expected

            for barcode_config in scoped_configs:
                code_type = barcode_config.get('codeType', 'qr')
                expected = str(barcode_config.get('expectedText') or '').strip()
                mode = barcode_config.get('matchMode', 'contains')
                expected_format = normalize_format(barcode_config.get('barcodeFormat', 'auto'))
                matching_codes = []
                for code in detected_codes:
                    actual_type = code.get('type', 'barcode')
                    if code_type == 'qr' and actual_type != 'qr':
                        continue
                    if code_type == 'linear' and actual_type == 'qr':
                        continue
                    if code_type == 'linear' and expected_format not in ('', 'AUTO'):
                        if normalize_format(code.get('format')) != expected_format:
                            continue
                    if text_matches(str(code.get('data') or ''), expected, mode):
                        matching_codes.append(code)

                source = 'decoder' if matching_codes else None
                detected_text = str(matching_codes[0].get('data') or '') if matching_codes else ''

                if (
                    not matching_codes
                    and code_type == 'linear'
                    and barcode_config.get('allowOcrFallback', True)
                    and expected
                ):
                    expected_digits = re.sub(r'\D', '', expected)
                    ocr_digits = re.sub(r'\D', '', ocr_text)
                    if expected_digits and (
                        (mode == 'exact' and ocr_digits == expected_digits)
                        or (mode != 'exact' and expected_digits in ocr_digits)
                    ):
                        source = 'ocr_fallback'
                        detected_text = expected_digits
                        logger.info('[%s] 一维条码解码失败，OCR数字兜底匹配: %s', label, expected_digits)

                matched = source is not None
                match_details.append({
                    'expectedText': expected,
                    'matchMode': mode,
                    'codeType': code_type,
                    'barcodeFormat': barcode_config.get('barcodeFormat', 'auto'),
                    'matched': matched,
                    'detectedText': detected_text,
                    'source': source or 'none',
                })
                if not matched:
                    rule_name = '二维码/条码' if code_type == 'qr' else '一维条码'
                    reasons.append(f'{rule_name}规则未匹配: {expected or "任意内容"}')

            result['barcode_match_details'] = match_details
            if not scoped_configs and not detected_codes:
                reasons.append('未检测到必需的二维码或一维条码')
        
        qualified = len(reasons) == 0
        reason = '; '.join(reasons) if reasons else '验证通过'
        
        return {
            'qualified': qualified,
            'reason': reason
        }
    
    def _merge_results(
        self,
        roi_results: List[Dict[str, Any]],
        rois: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        合并所有ROI的处理结果
        
        Args:
            roi_results: ROI处理结果列表
            rois: 原始ROI数据列表
        
        Returns:
            合并后的最终结果
        """
        merged = {
            'success': True,
            'overall_quality': '合格',
            'reason': '',
            'ocr_text': '',
            'barcode_count': 0,
            'roi_count': len(rois),
            'details': []
        }
        
        all_ocr_texts = []
        all_barcodes = []
        reasons = []
        success_count = 0
        
        for idx, result in enumerate(roi_results):
            # 设置grid_index
            result['grid_index'] = idx + 1
            
            # 检查处理是否成功
            if not result.get('success', True):
                merged['overall_quality'] = '不合格'
                reasons.append(f"[{idx+1}] {result.get('error', '处理失败')}")
                merged['details'].append(result)
                continue
            
            success_count += 1
            
            # 收集OCR文本
            ocr_text = result.get('ocr_text', '').strip()
            if ocr_text:
                all_ocr_texts.append(f"[{result['label']}] {ocr_text}")
            
            # 收集条码
            barcodes = result.get('barcodes', [])
            all_barcodes.extend(barcodes)
            
            # 检查合格状态
            if not result.get('qualified', True):
                merged['overall_quality'] = '不合格'
                reason = result.get('reason', '未通过验证')
                reasons.append(f"[{idx+1} {result['label']}] {reason}")
            
            # 添加详情
            merged['details'].append(result)
        
        # 汇总文本和条码
        merged['ocr_text'] = '\n'.join(all_ocr_texts)
        merged['barcode_count'] = len(all_barcodes)
        merged['success_count'] = success_count
        merged['success'] = success_count == len(rois) and len(roi_results) == len(rois)
        
        # 生成最终原因
        if reasons:
            merged['reason'] = '; '.join(reasons)
        else:
            merged['reason'] = f'批处理完成: {success_count}/{len(rois)}个ROI处理成功'
        
        return merged
    
    def _create_error_result(self, error_message: str) -> Dict[str, Any]:
        """创建错误结果"""
        return {
            'success': False,
            'overall_quality': '不合格',
            'reason': error_message,
            'ocr_text': '',
            'barcode_count': 0,
            'roi_count': 0,
            'details': [],
            'error': error_message
        }


# 全局单例实例
_batch_service_instance = None


def get_batch_detection_service() -> BatchDetectionService:
    """
    获取批处理服务实例（单例模式）
    
    Returns:
        BatchDetectionService实例
    """
    global _batch_service_instance
    if _batch_service_instance is None:
        _batch_service_instance = BatchDetectionService()
    return _batch_service_instance
