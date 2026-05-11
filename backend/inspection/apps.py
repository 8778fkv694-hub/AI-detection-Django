import logging
import os
import sys
import threading

from django.apps import AppConfig

logger = logging.getLogger(__name__)


class InspectionConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'inspection'

    def ready(self):
        # 跑迁移、shell、collectstatic 等管理命令时不预热，避免拖慢命令
        if os.environ.get('DJANGO_SKIP_WARMUP') == '1':
            return
        argv = ' '.join(sys.argv[1:]) if len(sys.argv) > 1 else ''
        if any(cmd in argv for cmd in ('migrate', 'makemigrations', 'collectstatic',
                                       'shell', 'createsuperuser', 'test', 'check')):
            return

        threading.Thread(target=_warmup_models, name='inspection-warmup',
                         daemon=True).start()


def _warmup_models():
    """启动后子线程预热 OCR + YOLO，把首次推理 5-15s 的卡顿前置到启动期。"""
    import time
    try:
        import numpy as np
    except Exception as exc:
        logger.warning('warmup skipped, numpy unavailable: %s', exc)
        return

    dummy_bgr = np.full((480, 640, 3), 240, dtype=np.uint8)

    # OCR 预热：加载 RapidOCR/PaddleOCR + 跑一次推理（含 ORT graph optimization）
    try:
        from . import ocr_service
        t0 = time.time()
        svc = getattr(ocr_service, 'ocr_service', None) or ocr_service.OCRService()
        svc.extract_text(dummy_bgr)
        logger.info('OCR warmup done in %.2fs', time.time() - t0)
    except Exception as exc:
        logger.warning('OCR warmup failed (will lazy-load on first request): %s', exc)

    # YOLO 预热：加载默认模型 + 跑一次推理
    try:
        from . import yolo
        t0 = time.time()
        yolo.load_model()
        yolo.run_inference(dummy_bgr, conf=0.5)
        logger.info('YOLO warmup done in %.2fs', time.time() - t0)
    except Exception as exc:
        logger.warning('YOLO warmup failed (will lazy-load on first request): %s', exc)
