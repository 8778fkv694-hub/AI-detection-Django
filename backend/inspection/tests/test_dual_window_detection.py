import threading
import time
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

import numpy as np
from django.test import SimpleTestCase

from inspection.detection_loop import DetectionLoopManager
from inspection.ocr_service import OCRService
from inspection.roi_cache import ROICacheManager
from inspection.yolo import run_inference


class _FakeDetectionLoop:
    def __init__(self, stream_id, model_id, conf_threshold=0.5):
        self.stream_id = stream_id
        self.model_id = model_id
        self.conf_threshold = conf_threshold
        self.is_running = False

    def start(self):
        self.is_running = True

    def stop(self):
        self.is_running = False

    def get_status(self):
        return {
            'stream_id': self.stream_id,
            'model_id': self.model_id,
            'conf_threshold': self.conf_threshold,
            'is_running': self.is_running,
        }

    def get_latest_result(self):
        return {'stream_id': self.stream_id, 'model_id': self.model_id, 'boxes': []}

    def get_latest_boxes(self):
        return []

    def get_snapshot_jpeg(self, frame_id=None):
        return b'jpeg', frame_id or 1


class DualWindowLoopIsolationTests(SimpleTestCase):
    def setUp(self):
        self.manager = DetectionLoopManager()
        self.manager._loops = {}
        self.manager._anonymous_ref_counts = {}
        self.manager._owners = {}
        self.manager._owner_loops = {}

    def tearDown(self):
        self.manager._loops = {}
        self.manager._anonymous_ref_counts = {}
        self.manager._owners = {}
        self.manager._owner_loops = {}

    @patch('inspection.yolo.unpin_model')
    @patch('inspection.yolo.pin_model')
    @patch('inspection.detection_loop.DetectionLoop', _FakeDetectionLoop)
    def test_same_stream_keeps_two_models_isolated_by_owner(self, pin_model, unpin_model):
        first = self.manager.start_loop('camera-1', 'filter_core_detection', 0.6, 'window-a')
        second = self.manager.start_loop('camera-1', 'waterprifer_detection', 0.5, 'window-b')

        self.assertTrue(first['success'])
        self.assertTrue(second['success'])
        self.assertEqual(self.manager.get_all_status()['active_loops'], 2)
        self.assertEqual(
            self.manager.get_latest_result('camera-1', 'window-a')['model_id'],
            'filter_core_detection',
        )
        self.assertEqual(
            self.manager.get_latest_result('camera-1', 'window-b')['model_id'],
            'waterprifer_detection',
        )

        stopped = self.manager.stop_loop('camera-1', 'window-a')
        self.assertTrue(stopped['success'])
        self.assertIsNone(self.manager.get_latest_result('camera-1', 'window-a'))
        self.assertEqual(
            self.manager.get_latest_result('camera-1', 'window-b')['model_id'],
            'waterprifer_detection',
        )
        unpin_model.assert_called_once_with('filter_core_detection')

    @patch('inspection.yolo.unpin_model')
    @patch('inspection.yolo.pin_model')
    @patch('inspection.detection_loop.DetectionLoop', _FakeDetectionLoop)
    def test_owner_recipe_switch_does_not_change_other_window(self, pin_model, unpin_model):
        self.manager.start_loop('camera-1', 'filter_core_detection', 0.6, 'window-a')
        self.manager.start_loop('camera-1', 'waterprifer_detection', 0.5, 'window-b')

        switched = self.manager.start_loop('camera-1', 'waterprifer_detection', 0.5, 'window-a')

        self.assertTrue(switched['success'])
        self.assertEqual(self.manager.get_all_status()['active_loops'], 1)
        self.assertEqual(
            self.manager.get_latest_result('camera-1', 'window-b')['model_id'],
            'waterprifer_detection',
        )
        self.assertEqual(
            self.manager.get_latest_result('camera-1', 'window-a')['model_id'],
            'waterprifer_detection',
        )


class SharedInferenceSafetyTests(SimpleTestCase):
    def test_gpu_scheduler_serializes_two_model_predictions(self):
        state = {'active': 0, 'max_active': 0}
        state_lock = threading.Lock()

        class FakeModel:
            def predict(self, **kwargs):
                with state_lock:
                    state['active'] += 1
                    state['max_active'] = max(state['max_active'], state['active'])
                time.sleep(0.03)
                with state_lock:
                    state['active'] -= 1
                return []

        image = np.zeros((16, 16, 3), dtype=np.uint8)
        with patch('inspection.yolo.load_model', side_effect=lambda _model_id: FakeModel()):
            with ThreadPoolExecutor(max_workers=2) as executor:
                futures = [
                    executor.submit(run_inference, image, 0.5, 'model-a'),
                    executor.submit(run_inference, image, 0.5, 'model-b'),
                ]
                for future in futures:
                    self.assertEqual(future.result(), [])

        self.assertEqual(state['max_active'], 1)

    def test_rapidocr_singleton_is_not_entered_concurrently(self):
        service = OCRService()
        state = {'active': 0, 'max_active': 0}
        state_lock = threading.Lock()

        class FakeRapidOCR:
            def __call__(self, *args, **kwargs):
                with state_lock:
                    state['active'] += 1
                    state['max_active'] = max(state['max_active'], state['active'])
                time.sleep(0.03)
                with state_lock:
                    state['active'] -= 1
                return [], 0.03

        image = np.zeros((16, 16, 3), dtype=np.uint8)
        with patch.object(service, '_load_rapidocr_model', return_value=FakeRapidOCR()):
            with ThreadPoolExecutor(max_workers=2) as executor:
                futures = [
                    executor.submit(service._extract_text_rapidocr, image),
                    executor.submit(service._extract_text_rapidocr, image),
                ]
                for future in futures:
                    self.assertTrue(future.result()['success'])

        self.assertEqual(state['max_active'], 1)

    @patch('inspection.roi_cache.time.time', return_value=123.456)
    def test_same_label_same_millisecond_has_unique_roi_ids(self, _mocked_time):
        cache = ROICacheManager()
        first = cache.store('barcode_label', object(), {})
        second = cache.store('barcode_label', object(), {})

        self.assertNotEqual(first, second)
        self.assertIsNotNone(cache.get(first))
        self.assertIsNotNone(cache.get(second))
