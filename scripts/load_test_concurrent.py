#!/usr/bin/env python3
"""
并发压力测试脚本 — jeston-step2 fixture_qr 追踪链路稳定性验证

测试场景:
  T1  不同工装并发写入  POST /api/results/       → 期望全部 201，无 429
  T2  同工装并发写入    POST /api/results/       → 期望最终追踪一致，429 数量受控
  T3  OCR 接口并发      POST /api/ocr/extract/   → 期望全部成功（会暴露全局锁问题）
  T4  条码接口并发      POST /api/barcode/detect/ → 同 T3
  T5  YOLO 接口并发     POST /api/results/yolo-detect/ → 同 T3
  T6  PATCH 更新并发    PATCH /api/results/<id>/ → 期望追踪重算在每次更新后收敛
  T7  最终一致性检查    GET /api/results/?fixture_qr=FIXTURE-TEST-SAME
                       → 验证同工装所有记录的 trace_conclusion 最终一致

用法:
  python scripts/load_test_concurrent.py
  python scripts/load_test_concurrent.py http://localhost:8000
  python scripts/load_test_concurrent.py http://192.168.1.100:8000
"""

import sys
import time
import json
import random
import string
import statistics
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    import requests
except ImportError:
    print("缺少 requests 包，请先执行: pip install requests")
    sys.exit(1)

BASE_URL = sys.argv[1].rstrip('/') if len(sys.argv) > 1 else 'http://localhost:8000'

# 1x1 白色 PNG base64（用于不关心图片内容的接口测试）
TINY_PNG_B64 = (
    'data:image/png;base64,'
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAC'
    'hwGA60e6kgAAAABJRU5ErkJggg=='
)

# ANSI 颜色
GREEN  = '\033[92m'
YELLOW = '\033[93m'
RED    = '\033[91m'
CYAN   = '\033[96m'
RESET  = '\033[0m'
BOLD   = '\033[1m'


# ─── 工具函数 ──────────────────────────────────────────────────────────────────

def _rand_suffix(n=6):
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=n))


def _minimal_result_payload(fixture_qr: str, stage_code: str = '', business_code: str = ''):
    """构造最小检测结果请求体（不带图片，减少 I/O 干扰）"""
    return {
        'overall_quality': '合格',
        'score': 0.9,
        'reason': '压力测试',
        'detection_type': 'ocr_inspection',
        'fixture_qr': fixture_qr,
        'fixture_qr_source': 'manual',
        'fixture_qr_input_status': 'success',
        'fixture_qr_detected': True,
        'process_stage_code': stage_code or 'stage_load_test',
        'process_stage_name': f'工序{stage_code[-1:] or "X"}',
        'page_instance_id': f'page_load_{_rand_suffix(4)}',
        'camera_id': 'cam_test',
        'business_code': business_code or f'BC-{_rand_suffix(6)}',
        'business_code_type': 'test_code',
        'trace_context': {
            'fixtureQrPrefixes': ['FIXTURE-'],
        },
    }


def _send(method: str, url: str, payload=None, timeout=10) -> dict:
    try:
        t0 = time.time()
        if method == 'POST':
            resp = requests.post(url, json=payload, timeout=timeout)
        elif method == 'PATCH':
            resp = requests.patch(url, json=payload, timeout=timeout)
        elif method == 'GET':
            resp = requests.get(url, params=payload, timeout=timeout)
        else:
            return {'status': -1, 'latency': 0, 'body': {}}
        latency = time.time() - t0
        try:
            body = resp.json()
        except Exception:
            body = {}
        return {'status': resp.status_code, 'latency': latency, 'body': body}
    except requests.exceptions.ConnectionError:
        return {'status': 0, 'latency': 0, 'body': {'error': 'connection refused'}}
    except requests.exceptions.Timeout:
        return {'status': -2, 'latency': timeout, 'body': {'error': 'timeout'}}
    except Exception as e:
        return {'status': -1, 'latency': 0, 'body': {'error': str(e)}}


def _run_concurrent(fn, n_workers: int, tasks: list) -> list:
    results = []
    with ThreadPoolExecutor(max_workers=n_workers) as pool:
        futures = {pool.submit(fn, task): task for task in tasks}
        for f in as_completed(futures):
            results.append(f.result())
    return results


def _summarize(label: str, results: list, expect_200_201=True):
    status_counts = {}
    latencies = [r['latency'] for r in results if r['latency'] > 0]
    for r in results:
        s = r['status']
        status_counts[s] = status_counts.get(s, 0) + 1

    total = len(results)
    ok = status_counts.get(200, 0) + status_counts.get(201, 0)
    too_many = status_counts.get(429, 0)
    errors = sum(v for k, v in status_counts.items() if k not in (200, 201, 429))

    ok_pct = ok / total * 100 if total else 0
    color = GREEN if ok_pct == 100 else (YELLOW if ok_pct >= 50 else RED)

    p50 = statistics.median(latencies) if latencies else 0
    p95 = sorted(latencies)[int(len(latencies) * 0.95)] if latencies else 0

    print(f"\n{BOLD}[{label}]{RESET}")
    print(f"  总请求: {total}")
    print(f"  {color}成功 (2xx): {ok} ({ok_pct:.0f}%){RESET}")
    if too_many:
        print(f"  {YELLOW}429 限流: {too_many}{RESET}")
    if errors:
        print(f"  {RED}其他错误: {errors}  (详情: {status_counts}){RESET}")
    if latencies:
        print(f"  延迟 p50={p50*1000:.0f}ms  p95={p95*1000:.0f}ms")
    return {'ok': ok, 'total': total, 'too_many': too_many, 'errors': errors}


# ─── 各测试场景 ────────────────────────────────────────────────────────────────

def test_t1_different_fixtures(concurrency=10):
    """T1: 不同工装并发写入 — 期望全部 201，不应相互阻塞"""
    print(f"\n{CYAN}{'─'*60}{RESET}")
    print(f"{CYAN}T1  不同工装并发写入 (并发={concurrency}){RESET}")
    print("    期望: 全部 201，不出现 429")

    url = f'{BASE_URL}/api/results/'
    tasks = [_minimal_result_payload(
        fixture_qr=f'FIXTURE-DIFF-{_rand_suffix(8)}',
        stage_code='stage_t1',
    ) for _ in range(concurrency)]

    results = _run_concurrent(
        lambda payload: _send('POST', url, payload),
        n_workers=concurrency,
        tasks=tasks,
    )
    summary = _summarize('T1 不同工装并发', results)
    if summary['too_many'] > 0:
        print(f"  {YELLOW}⚠ 不同工装之间出现 429，说明锁粒度仍然过粗{RESET}")
    return summary


def test_t2_same_fixture(concurrency=8, fixture_qr=None):
    """T2: 同工装并发写入 — 429 数量可接受，但最终 DB 状态应收敛"""
    if not fixture_qr:
        fixture_qr = f'FIXTURE-SAME-{_rand_suffix(6)}'

    print(f"\n{CYAN}{'─'*60}{RESET}")
    print(f"{CYAN}T2  同工装并发写入 fixture_qr={fixture_qr} (并发={concurrency}){RESET}")
    print("    期望: 部分 429 可接受，201 结果最终状态一致")

    url = f'{BASE_URL}/api/results/'

    def make_payload(i):
        stage = f'stage_{i % 3 + 1}'
        bc = f'BC-SAME-{_rand_suffix(4)}'
        return _minimal_result_payload(fixture_qr=fixture_qr, stage_code=stage, business_code=bc)

    tasks = [make_payload(i) for i in range(concurrency)]
    results = _run_concurrent(
        lambda payload: _send('POST', url, payload),
        n_workers=concurrency,
        tasks=tasks,
    )
    summary = _summarize('T2 同工装并发', results)

    # 最终一致性检查
    time.sleep(0.3)  # 等待级联刷新完成
    check = _send('GET', f'{BASE_URL}/api/results/', {'limit': 50})
    if check['status'] == 200:
        all_results = check['body'].get('results', check['body'])
        if isinstance(all_results, list):
            related = [r for r in all_results if r.get('fixture_qr') == fixture_qr]
            conclusions = set(r.get('trace_conclusion', '') for r in related)
            if len(related) > 0:
                print(f"  同工装记录数: {len(related)}")
                if len(conclusions) == 1:
                    c = list(conclusions)[0]
                    print(f"  {GREEN}最终一致性: ✓ 所有记录 trace_conclusion = '{c}'{RESET}")
                else:
                    print(f"  {YELLOW}最终一致性: △ 结论不统一 → {conclusions}{RESET}")
                    print(f"  {YELLOW}  说明: 可能需要等待级联刷新或同工装写入顺序不确定性{RESET}")
    return summary, fixture_qr


def test_t3_ocr_concurrent(concurrency=10):
    """T3: OCR 接口并发 — 暴露 DatabaseLockMiddleware 全局路径锁问题"""
    print(f"\n{CYAN}{'─'*60}{RESET}")
    print(f"{CYAN}T3  OCR 接口并发 POST /api/ocr/extract/ (并发={concurrency}){RESET}")
    print("    期望: 全部成功（OCR 接口是纯计算，不写 DB，不应触发锁）")
    print(f"    {YELLOW}⚠ 已知风险: DatabaseLockMiddleware 对 /api/ocr/extract/ 也上锁{RESET}")
    print(f"    {YELLOW}  全部并发请求共抢同一把路径锁，会大量触发 429{RESET}")

    url = f'{BASE_URL}/api/ocr/extract/'
    payload = {
        'image': TINY_PNG_B64,
        'model': 'auto',
    }
    results = _run_concurrent(
        lambda _: _send('POST', url, payload),
        n_workers=concurrency,
        tasks=list(range(concurrency)),
    )
    summary = _summarize('T3 OCR并发', results)
    if summary['too_many'] > 0:
        print(f"  {RED}✗ 确认: 出现 {summary['too_many']} 次 429{RESET}")
        print(f"  {RED}  根因: DatabaseLockMiddleware._build_lock_key 对非 /api/results/ 路径{RESET}")
        print(f"  {RED}  返回 db_lock_/api/ocr/extract/ 全局单锁{RESET}")
        print(f"  {RED}  修复方向: 将 OCR/barcode/YOLO 这类纯计算接口排除在锁范围之外{RESET}")
    return summary


def test_t4_barcode_concurrent(concurrency=10):
    """T4: 条码接口并发 — 同 T3，暴露全局锁"""
    print(f"\n{CYAN}{'─'*60}{RESET}")
    print(f"{CYAN}T4  条码接口并发 POST /api/barcode/detect/ (并发={concurrency}){RESET}")
    print("    期望: 全部成功（条码检测是纯计算，不写 DB）")

    url = f'{BASE_URL}/api/barcode/detect/'
    payload = {'image': TINY_PNG_B64}
    results = _run_concurrent(
        lambda _: _send('POST', url, payload),
        n_workers=concurrency,
        tasks=list(range(concurrency)),
    )
    summary = _summarize('T4 条码并发', results)
    if summary['too_many'] > 0:
        print(f"  {RED}✗ 出现 429，条码接口不应被 DatabaseLockMiddleware 锁住{RESET}")
    return summary


def test_t5_yolo_concurrent(concurrency=8):
    """T5: YOLO 接口并发 — 同 T3/T4"""
    print(f"\n{CYAN}{'─'*60}{RESET}")
    print(f"{CYAN}T5  YOLO 接口并发 POST /api/results/yolo-detect/ (并发={concurrency}){RESET}")
    print("    期望: 全部成功（YOLO 检测是纯计算，不写 DB）")

    url = f'{BASE_URL}/api/results/yolo-detect/'
    payload = {
        'image': TINY_PNG_B64,
        'conf': 0.5,
        'detection_type': 'ocr_inspection',
    }
    results = _run_concurrent(
        lambda _: _send('POST', url, payload),
        n_workers=concurrency,
        tasks=list(range(concurrency)),
    )
    summary = _summarize('T5 YOLO并发', results)
    if summary['too_many'] > 0:
        print(f"  {RED}✗ 出现 429，YOLO 接口不应被 DatabaseLockMiddleware 锁住{RESET}")
    return summary


def test_t6_patch_concurrent(result_id: int, concurrency=6, fixture_qr: str = ''):
    """T6: PATCH 更新并发 — 验证 update() 中追踪重算是否稳定"""
    print(f"\n{CYAN}{'─'*60}{RESET}")
    print(f"{CYAN}T6  PATCH 更新并发 PATCH /api/results/{result_id}/ (并发={concurrency}){RESET}")
    print("    期望: 全部 200，每次 PATCH 后 trace_conclusion 应重算")

    url = f'{BASE_URL}/api/results/{result_id}/'

    def make_patch(i):
        return {
            'fixture_qr': fixture_qr,
            'fixture_qr_source': 'manual',
            'fixture_qr_input_status': 'success',
            'fixture_qr_detected': True,
            'business_code': f'BC-PATCH-{i:03d}',
            'process_stage_code': 'stage_patch',
        }

    tasks = [make_patch(i) for i in range(concurrency)]
    results = _run_concurrent(
        lambda payload: _send('PATCH', url, payload),
        n_workers=concurrency,
        tasks=tasks,
    )
    summary = _summarize('T6 PATCH并发', results)

    # 检查最终状态是否有 trace_conclusion
    final = _send('GET', f'{BASE_URL}/api/results/{result_id}/', timeout=5)
    if final['status'] == 200:
        tc = final['body'].get('trace_conclusion', '')
        trd = final['body'].get('trace_rule_details', [])
        print(f"  最终 trace_conclusion: {GREEN}{tc or '(空)'}{RESET}")
        print(f"  规则明细条数: {len(trd) if isinstance(trd, list) else '?'}")
    return summary


def test_t7_final_consistency(fixture_qr: str):
    """T7: 最终一致性检查 — 同工装所有记录 trace_conclusion 应相同"""
    print(f"\n{CYAN}{'─'*60}{RESET}")
    print(f"{CYAN}T7  最终一致性检查 fixture_qr={fixture_qr}{RESET}")

    resp = _send('GET', f'{BASE_URL}/api/results/', {'limit': 100})
    if resp['status'] != 200:
        print(f"  {RED}列表接口失败: {resp['status']}{RESET}")
        return

    all_results = resp['body']
    if isinstance(all_results, dict):
        all_results = all_results.get('results', [])
    if not isinstance(all_results, list):
        print(f"  {RED}响应格式不符合预期{RESET}")
        return

    related = [r for r in all_results if r.get('fixture_qr') == fixture_qr]
    if not related:
        print(f"  {YELLOW}未找到 fixture_qr={fixture_qr} 的记录，可能被限制在 limit 之外{RESET}")
        return

    print(f"  找到 {len(related)} 条记录")
    conclusions = {}
    for r in related:
        tc = r.get('trace_conclusion', '(空)')
        conclusions[tc] = conclusions.get(tc, 0) + 1
    for tc, cnt in sorted(conclusions.items()):
        color = GREEN if len(conclusions) == 1 else YELLOW
        print(f"  {color}trace_conclusion={tc!r}: {cnt} 条{RESET}")

    if len(conclusions) == 1:
        print(f"  {GREEN}✓ 最终一致性通过{RESET}")
    else:
        print(f"  {YELLOW}△ 追踪结论不统一 — 可能原因:  1) 并发响应体仍是中间态  2) 各工序 business_code 确实不同导致 '需复检'{RESET}")


def test_t8_evaluate_concurrent(fixture_qr: str = '', concurrency=10):
    """T8: /api/product-trace/evaluate/ 并发 — 不保存结果、不上锁，应全部 200"""
    if not fixture_qr:
        fixture_qr = f'FIXTURE-EVAL-{_rand_suffix(6)}'

    print(f"\n{CYAN}{'─'*60}{RESET}")
    print(f"{CYAN}T8  追踪判定预查接口并发 POST /api/product-trace/evaluate/ (并发={concurrency}){RESET}")
    print("    期望: 全部 200，不写 DB，无锁，trace_conclusion 有值")

    url = f'{BASE_URL}/api/product-trace/evaluate/'

    def make_payload(i):
        return {
            'fixture_qr': fixture_qr,
            'fixture_qr_source': 'manual',
            'fixture_qr_input_status': 'success',
            'fixture_qr_detected': True,
            'process_stage_code': f'stage_{i % 3 + 1}',
            'process_stage_name': f'工序{i % 3 + 1}',
            'business_code': f'BC-EVAL-{i:03d}',
        }

    tasks = [make_payload(i) for i in range(concurrency)]
    results = _run_concurrent(
        lambda payload: _send('POST', url, payload),
        n_workers=concurrency,
        tasks=tasks,
    )
    summary = _summarize('T8 evaluate并发', results)

    # 功能验证：检查响应体结构
    ok_results = [r for r in results if r['status'] == 200]
    if ok_results:
        sample = ok_results[0]['body']
        ti = sample.get('trace_info', {})
        tc = ti.get('traceConclusion', '')
        has_trace_info = 'trace_info' in sample
        print(f"  响应体包含 trace_info: {GREEN if has_trace_info else RED}{has_trace_info}{RESET}")
        print(f"  sample trace_conclusion: {GREEN if tc else YELLOW}{tc or '(空)'}{RESET}")
        if not has_trace_info:
            print(f"  {RED}✗ 响应体缺少 trace_info 字段{RESET}")
    return summary


# ─── 前置检查 ──────────────────────────────────────────────────────────────────

def preflight():
    print(f"\n{BOLD}=== 压力测试前置检查 ==={RESET}")
    print(f"目标服务: {BASE_URL}")
    resp = _send('GET', f'{BASE_URL}/api/results/', {'limit': 1})
    if resp['status'] == 0:
        print(f"{RED}✗ 无法连接到服务，请先启动后端: backend/venv/bin/python backend/manage.py runserver{RESET}")
        return False
    if resp['status'] not in (200, 201):
        print(f"{YELLOW}⚠ /api/results/ 返回 {resp['status']}，请确认后端配置{RESET}")
    else:
        print(f"{GREEN}✓ 后端服务正常 (status={resp['status']}){RESET}")
    return True


def seed_result(fixture_qr: str, stage_code: str = 'stage_seed'):
    """预先写入一条结果，返回 id，用于 T6 PATCH 测试"""
    payload = _minimal_result_payload(fixture_qr=fixture_qr, stage_code=stage_code)
    resp = _send('POST', f'{BASE_URL}/api/results/', payload)
    if resp['status'] == 201:
        return resp['body'].get('id')
    return None


# ─── 主程序 ───────────────────────────────────────────────────────────────────

def main():
    if not preflight():
        sys.exit(1)

    print(f"\n{BOLD}{'='*60}{RESET}")
    print(f"{BOLD}开始并发压力测试{RESET}")
    print(f"{BOLD}{'='*60}{RESET}")

    summaries = {}

    # T1: 不同工装
    summaries['T1'] = test_t1_different_fixtures(concurrency=10)

    # T2: 同工装
    same_fixture_qr = f'FIXTURE-SAME-{_rand_suffix(6)}'
    summaries['T2'], same_fixture_qr = test_t2_same_fixture(
        concurrency=8, fixture_qr=same_fixture_qr,
    )

    # T3: OCR 并发
    summaries['T3'] = test_t3_ocr_concurrent(concurrency=10)

    # T4: 条码并发
    summaries['T4'] = test_t4_barcode_concurrent(concurrency=10)

    # T5: YOLO 并发
    summaries['T5'] = test_t5_yolo_concurrent(concurrency=8)

    # T6: PATCH 并发（先写入一条种子记录）
    seed_id = seed_result(fixture_qr=same_fixture_qr, stage_code='stage_patch_seed')
    if seed_id:
        summaries['T6'] = test_t6_patch_concurrent(
            result_id=seed_id, concurrency=6, fixture_qr=same_fixture_qr,
        )
    else:
        print(f"\n{YELLOW}T6: 种子结果写入失败，跳过 PATCH 并发测试{RESET}")

    # T7: 最终一致性检查
    test_t7_final_consistency(same_fixture_qr)

    # T8: /api/product-trace/evaluate/ 并发 + 功能验证
    summaries['T8'] = test_t8_evaluate_concurrent(fixture_qr=same_fixture_qr)

    # 最终汇总
    print(f"\n{BOLD}{'='*60}{RESET}")
    print(f"{BOLD}测试汇总{RESET}")
    print(f"{BOLD}{'='*60}{RESET}")
    for name, s in summaries.items():
        if isinstance(s, tuple):
            s = s[0]
        ok = s.get('ok', 0)
        total = s.get('total', 0)
        too_many = s.get('too_many', 0)
        errs = s.get('errors', 0)
        ok_pct = ok / total * 100 if total else 0
        color = GREEN if ok_pct == 100 else (YELLOW if ok_pct >= 50 else RED)
        flag = ''
        if too_many > 0 and name in ('T3', 'T4', 'T5'):
            flag = f'  ← {RED}⚠ 纯计算接口不应触发 429，需排除中间件锁范围{RESET}'
        elif too_many > 0 and name == 'T1':
            flag = f'  ← {RED}⚠ 不同工装不应阻塞，需检查锁粒度{RESET}'
        print(f"  {name}: {color}{ok}/{total} 成功{RESET}  429={too_many}  err={errs}{flag}")

    print(f"\n{YELLOW}关键参考:{RESET}")
    print(f"  middleware.py DatabaseLockMiddleware._build_lock_key() 当前逻辑:")
    print(f"    /api/results/ + fixture_qr → 细粒度锁  ✓")
    print(f"    其他所有 POST 路径         → 全局路径锁 (含 OCR/barcode/YOLO)")
    print(f"  修复方向: 在 _build_lock_key 中对纯计算接口返回 None 跳过加锁")
    print(f"  参考路径: backend/inspection/middleware.py:101-105\n")


if __name__ == '__main__':
    main()
