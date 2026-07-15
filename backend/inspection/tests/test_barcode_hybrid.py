import base64
import json
from io import BytesIO
from unittest.mock import patch

import numpy as np
from django.test import TestCase
from PIL import Image

from inspection.barcode_service import BarcodeDetectionService
from inspection.batch_detection_service import BatchDetectionService


def make_ean13_image(code='5901234123457'):
    left = [
        '0001101', '0011001', '0010011', '0111101', '0100011',
        '0110001', '0101111', '0111011', '0110111', '0001011',
    ]
    left_even = [
        '0100111', '0110011', '0011011', '0100001', '0011101',
        '0111001', '0000101', '0010001', '0001001', '0010111',
    ]
    right = [
        '1110010', '1100110', '1101100', '1000010', '1011100',
        '1001110', '1010000', '1000100', '1001000', '1110100',
    ]
    parity = [
        'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
        'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL',
    ]
    bits = '101'
    bits += ''.join(
        (left if encoding == 'L' else left_even)[int(digit)]
        for digit, encoding in zip(code[1:7], parity[int(code[0])])
    )
    bits += '01010'
    bits += ''.join(right[int(digit)] for digit in code[7:])
    bits += '101'
    bits = ('0' * 20) + bits + ('0' * 20)

    module_width = 2
    image = np.full((180, len(bits) * module_width, 3), 255, dtype=np.uint8)
    for index, bit in enumerate(bits):
        if bit == '1':
            image[30:130, index * module_width:(index + 1) * module_width] = 0
    return Image.fromarray(image)


class HybridBarcodeDetectionTests(TestCase):
    def test_linear_detection_decodes_ean13(self):
        service = BarcodeDetectionService()
        result = service._detect_linear_barcodes(make_ean13_image())

        self.assertTrue(result['codes'])
        detected = result['codes'][0]
        self.assertEqual(detected['type'], 'barcode')
        self.assertEqual(detected['data'], '5901234123457')
        # zxing-cpp 是一维码的首选解码器（单次调用更快更准），OpenCV+ZBar
        # 级联仅在 zxing 未检出时才会触发，因此这里不强绑定具体解码器来源。
        self.assertIn(detected['source'], ('zxingcpp', 'opencv_barcode', 'zbar'))
        self.assertEqual(
            ''.join(ch for ch in detected['format'].upper() if ch.isalnum()),
            'EAN13',
        )

    def test_opencv_zbar_fallback_still_decodes_ean13_without_zxing(self):
        service = BarcodeDetectionService()
        with patch.object(service, '_detect_zxing', return_value=[]):
            result = service._detect_linear_barcodes(make_ean13_image())

        self.assertTrue(result['codes'])
        detected = result['codes'][0]
        self.assertEqual(detected['type'], 'barcode')
        self.assertEqual(detected['data'], '5901234123457')
        self.assertIn(detected['source'], ('opencv_barcode', 'zbar'))

    def test_barcode_api_can_request_linear_only(self):
        buffer = BytesIO()
        make_ean13_image().save(buffer, format='PNG')
        encoded = base64.b64encode(buffer.getvalue()).decode()

        with patch('inspection.barcode_api.barcode_service.detect_from_base64') as detect:
            detect.return_value = {'success': True, 'codes': [], 'count': 0}
            response = self.client.post(
                '/api/barcode/detect/',
                data=json.dumps({'image': encoded, 'code_types': ['linear']}),
                content_type='application/json',
            )

        self.assertEqual(response.status_code, 200)
        detect.assert_called_once_with(encoded, detect_qr=False, detect_linear=True)

    def test_linear_rule_uses_explicit_ocr_digit_fallback(self):
        service = BatchDetectionService()
        result = {
            'ocr_text': '商品号 5901 2341 2345 7',
            'ocr_detailed_results': [{'text': '5901234123457'}],
            'barcodes': [],
            'barcode_count': 0,
        }
        validation = service._validate_roi(
            'barcode_label',
            result,
            {'require_barcode': True},
            barcode_configs=[{
                'enabled': True,
                'codeType': 'linear',
                'barcodeFormat': 'ean13',
                'expectedText': '5901234123457',
                'matchMode': 'exact',
                'allowOcrFallback': True,
                'targetRoi': 'barcode_label',
            }],
        )

        self.assertTrue(validation['qualified'])
        self.assertEqual(result['barcode_match_details'][0]['source'], 'ocr_fallback')

    def test_qr_rule_never_uses_ocr_digit_fallback(self):
        service = BatchDetectionService()
        result = {
            'ocr_text': '5901234123457',
            'ocr_detailed_results': [{'text': '5901234123457'}],
            'barcodes': [],
            'barcode_count': 0,
        }
        validation = service._validate_roi(
            'qr_label',
            result,
            {'require_barcode': True},
            barcode_configs=[{
                'enabled': True,
                'codeType': 'qr',
                'expectedText': '5901234123457',
                'matchMode': 'exact',
                'targetRoi': 'qr_label',
            }],
        )

        self.assertFalse(validation['qualified'])
        self.assertEqual(result['barcode_match_details'][0]['source'], 'none')

    def test_real_linear_decode_is_sufficient_for_barcode_only_roi(self):
        service = BatchDetectionService()
        result = {
            'ocr_text': '',
            'ocr_detailed_results': [],
            'barcodes': [{
                'type': 'barcode',
                'data': '5901234123457',
                'format': 'EAN_13',
                'source': 'opencv_barcode',
            }],
            'barcode_count': 1,
        }
        validation = service._validate_roi(
            'barcode_label',
            result,
            {'require_barcode': True, 'enable_keywords': False},
            barcode_configs=[{
                'enabled': True,
                'codeType': 'linear',
                'barcodeFormat': 'ean13',
                'expectedText': '5901234123457',
                'matchMode': 'exact',
                'targetRoi': 'barcode_label',
            }],
        )

        self.assertTrue(validation['qualified'])
        self.assertEqual(result['barcode_match_details'][0]['source'], 'decoder')
