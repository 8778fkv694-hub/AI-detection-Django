#!/usr/bin/env python3
"""
OCR edge test runner.
- direct mode: call ocr_service.extract_text
- http mode: call /api/ocr/extract/ endpoint
Outputs JSON report to reports/ocr_edge_test_report_YYYYMMDD_HHMMSS.json
"""
import argparse
import base64
import json
import os
import sys
import time
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Any, Dict, List, Optional

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
REPORT_DIR = os.path.join(ROOT, 'reports')

IMAGE_CANDIDATES = [
    'problematic_black.png',
    'problematic_blank.png',
    'problematic_blurry.png',
    'problematic_low_contrast.png',
    'problematic_noisy.png',
    'problematic_rotated.png',
    'problematic_single_pixel.png',
    'realistic_test_image.jpg',
    'test_ocr.png',
    'test_ocr_en.png',
    'test_ocr_with_text.png',
]


def _b64_from_path(path: str) -> str:
    with open(path, 'rb') as f:
        return base64.b64encode(f.read()).decode('ascii')


def _safe_mkdir(path: str) -> None:
    if not os.path.isdir(path):
        os.makedirs(path, exist_ok=True)


def _try_import_pil():
    try:
        from PIL import Image  # type: ignore
        return Image
    except Exception:
        return None


def _maybe_gen_image_bytes(mode: str, size: int) -> Optional[bytes]:
    Image = _try_import_pil()
    if Image is None:
        return None
    try:
        if mode == 'RGBA':
            img = Image.new('RGBA', (size, size), (255, 0, 0, 128))
        else:
            img = Image.new('RGB', (size, size), (255, 255, 255))
        import io
        buf = io.BytesIO()
        fmt = 'PNG' if mode == 'RGBA' else 'JPEG'
        img.save(buf, format=fmt)
        return buf.getvalue()
    except Exception:
        return None


def build_cases(image_paths: List[str]) -> List[Dict[str, Any]]:
    cases: List[Dict[str, Any]] = []

    # valid images
    for path in image_paths:
        cases.append({
            'name': f'valid:{os.path.basename(path)}',
            'type': 'image',
            'path': path,
            'payload': None,
        })

    # empty/invalid
    cases.append({'name': 'invalid:empty', 'type': 'raw', 'payload': ''})
    cases.append({'name': 'invalid:not_base64', 'type': 'raw', 'payload': 'not_base64@@@'})
    cases.append({'name': 'invalid:text_base64', 'type': 'raw', 'payload': base64.b64encode(b'hello world').decode('ascii')})

    # generated RGBA + large RGB
    rgba_bytes = _maybe_gen_image_bytes('RGBA', 512)
    if rgba_bytes:
        cases.append({
            'name': 'generated:rgba_512',
            'type': 'raw',
            'payload': base64.b64encode(rgba_bytes).decode('ascii')
        })

    big_bytes = _maybe_gen_image_bytes('RGB', 4096)
    if big_bytes:
        cases.append({
            'name': 'generated:rgb_4096',
            'type': 'raw',
            'payload': base64.b64encode(big_bytes).decode('ascii')
        })

    return cases


def run_direct_case(case: Dict[str, Any], use_angle_cls: bool) -> Dict[str, Any]:
    start = time.time()
    try:
        from inspection.ocr_service import ocr_service  # type: ignore
    except Exception as e:
        return {
            'name': case['name'],
            'success': False,
            'error': f'failed_import_ocr_service: {e}',
            'duration_ms': int((time.time() - start) * 1000),
        }

    try:
        if case['type'] == 'image':
            payload = _b64_from_path(case['path'])
        else:
            payload = case['payload']
        result = ocr_service.extract_text(payload, use_angle_cls=use_angle_cls)
        ok = isinstance(result, dict) and result.get('success') is True
        return {
            'name': case['name'],
            'success': ok,
            'duration_ms': int((time.time() - start) * 1000),
            'result_keys': list(result.keys()) if isinstance(result, dict) else None,
            'error': result.get('error') if isinstance(result, dict) else None,
        }
    except Exception as e:
        return {
            'name': case['name'],
            'success': False,
            'error': f'exception: {e}',
            'traceback': traceback.format_exc(),
            'duration_ms': int((time.time() - start) * 1000),
        }


def http_post_json(url: str, data: Any, timeout: int) -> Dict[str, Any]:
    import http.client
    from urllib.parse import urlparse

    parsed = urlparse(url)
    host = parsed.hostname or 'localhost'
    port = parsed.port or (443 if parsed.scheme == 'https' else 80)
    path = parsed.path or '/'

    payload = json.dumps(data).encode('utf-8')
    headers = {
        'Content-Type': 'application/json',
        'Content-Length': str(len(payload)),
    }
    start = time.time()
    try:
        if parsed.scheme == 'https':
            conn = http.client.HTTPSConnection(host, port, timeout=timeout)
        else:
            conn = http.client.HTTPConnection(host, port, timeout=timeout)
        conn.request('POST', path, body=payload, headers=headers)
        resp = conn.getresponse()
        body = resp.read().decode('utf-8', errors='replace')
        conn.close()
        return {
            'status': resp.status,
            'body': body,
            'duration_ms': int((time.time() - start) * 1000)
        }
    except Exception as e:
        return {
            'status': None,
            'error': str(e),
            'duration_ms': int((time.time() - start) * 1000)
        }


def run_http_case(case: Dict[str, Any], base_url: str, timeout: int, use_angle_cls: bool, expected_orientation: Optional[int]) -> Dict[str, Any]:
    start = time.time()
    try:
        if case['type'] == 'image':
            payload = _b64_from_path(case['path'])
        else:
            payload = case['payload']
        data = {
            'image': payload,
            'model': 'auto',
            'use_angle_cls': use_angle_cls,
        }
        if expected_orientation is not None:
            data['expected_orientation'] = expected_orientation
        resp = http_post_json(f'{base_url.rstrip("/")}/ocr/extract/', data, timeout)
        ok = resp.get('status') == 200
        return {
            'name': case['name'],
            'success': ok,
            'duration_ms': int((time.time() - start) * 1000),
            'http_status': resp.get('status'),
            'error': resp.get('error'),
            'body_snippet': (resp.get('body') or '')[:500]
        }
    except Exception as e:
        return {
            'name': case['name'],
            'success': False,
            'error': f'exception: {e}',
            'traceback': traceback.format_exc(),
            'duration_ms': int((time.time() - start) * 1000)
        }


def run_concurrent(cases: List[Dict[str, Any]], worker_fn, max_workers: int) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=max_workers) as exe:
        futs = [exe.submit(worker_fn, c) for c in cases]
        for fut in as_completed(futs):
            try:
                results.append(fut.result())
            except Exception as e:
                results.append({'name': 'concurrent_case', 'success': False, 'error': str(e)})
    return results


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', choices=['direct', 'http', 'all'], default='direct')
    parser.add_argument('--base-url', default='http://localhost:8012/api')
    parser.add_argument('--timeout', type=int, default=30)
    parser.add_argument('--concurrency', type=int, default=5)
    args = parser.parse_args()

    image_paths = []
    for name in IMAGE_CANDIDATES:
        path = os.path.join(ROOT, name)
        if os.path.exists(path):
            image_paths.append(path)

    cases = build_cases(image_paths)

    report: Dict[str, Any] = {
        'timestamp': datetime.now().isoformat(timespec='seconds'),
        'mode': args.mode,
        'base_url': args.base_url,
        'cases_total': len(cases),
        'results': {},
        'notes': []
    }

    if args.mode in ('direct', 'all'):
        direct_results = []
        for use_angle_cls in (False, True):
            for case in cases:
                direct_results.append(run_direct_case(case, use_angle_cls))
        # concurrent smoke test
        conc = run_concurrent(cases[: min(len(cases), args.concurrency)],
                              lambda c: run_direct_case(c, False),
                              max_workers=args.concurrency)
        report['results']['direct'] = {
            'serial': direct_results,
            'concurrent_smoke': conc
        }

    if args.mode in ('http', 'all'):
        http_results = []
        for use_angle_cls in (False, True):
            for case in cases:
                http_results.append(run_http_case(case, args.base_url, args.timeout, use_angle_cls, expected_orientation=0))
        # invalid json body
        try:
            import urllib.request
            req = urllib.request.Request(
                f'{args.base_url.rstrip("/")}/ocr/extract/',
                data=b'{invalid-json',
                headers={'Content-Type': 'application/json'}
            )
            with urllib.request.urlopen(req, timeout=args.timeout) as resp:
                report['results'].setdefault('http', {})['invalid_json_status'] = resp.status
        except Exception as e:
            report['results'].setdefault('http', {})['invalid_json_error'] = str(e)

        # concurrent smoke test
        conc = run_concurrent(cases[: min(len(cases), args.concurrency)],
                              lambda c: run_http_case(c, args.base_url, args.timeout, False, None),
                              max_workers=args.concurrency)
        report['results'].setdefault('http', {})['serial'] = http_results
        report['results'].setdefault('http', {})['concurrent_smoke'] = conc

    _safe_mkdir(REPORT_DIR)
    report_path = os.path.join(REPORT_DIR, f'ocr_edge_test_report_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json')
    with open(report_path, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print(f'Report saved: {report_path}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
