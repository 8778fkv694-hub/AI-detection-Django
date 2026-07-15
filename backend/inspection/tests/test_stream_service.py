import time
import uuid
from unittest import TestCase as UnitTestCase
from unittest.mock import patch

from django.test import TestCase
from django.urls import resolve

from inspection.stream_models import StreamSource
from inspection.stream_service import StreamReader


class StreamReaderStartTests(UnitTestCase):
    def test_network_stream_can_connect_after_old_three_second_window(self):
        reader = StreamReader("obs", "rtmp://127.0.0.1/live/obs")
        reader.NETWORK_START_TIMEOUT_SECONDS = 0.2

        def connect_later():
            time.sleep(0.05)
            reader.is_connected = True

        reader._read_loop = connect_later

        self.assertTrue(reader.start())
        self.assertTrue(reader.is_running)

    def test_timed_out_reader_is_stopped_instead_of_becoming_orphaned(self):
        reader = StreamReader("missing", "rtmp://127.0.0.1/live/missing")
        reader.NETWORK_START_TIMEOUT_SECONDS = 0.05

        def wait_until_stopped():
            while reader.is_running:
                time.sleep(0.005)

        reader._read_loop = wait_until_stopped

        self.assertFalse(reader.start())
        self.assertFalse(reader.is_running)
        self.assertFalse(reader.thread.is_alive())


class StreamApiTransactionTests(TestCase):
    def test_stream_actions_do_not_hold_database_transaction_during_io(self):
        callback = resolve(
            f"/api/streams/{uuid.uuid4()}/start/"
        ).func

        self.assertIn('default', callback._non_atomic_requests)

    def test_healthy_runtime_status_clears_stale_stream_error(self):
        stream = StreamSource.objects.create(
            name='OBS',
            url='rtmp://127.0.0.1:1935/live/obs',
            stream_type='rtmp',
            status='error',
            last_error='旧断流错误',
            error_count=5,
        )

        with patch(
            'inspection.stream_api.stream_manager.get_stream_status',
            return_value={
                'is_connected': True,
                'is_running': True,
                'error_message': '',
                'error_count': 0,
            },
        ):
            response = self.client.get(f'/api/streams/{stream.id}/status/')

        self.assertEqual(response.status_code, 200)
        stream.refresh_from_db()
        self.assertEqual(stream.status, 'active')
        self.assertEqual(stream.last_error, '')
        self.assertEqual(stream.error_count, 0)
