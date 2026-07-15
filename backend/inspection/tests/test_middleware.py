from unittest.mock import patch

from django.test import RequestFactory, SimpleTestCase
from django.utils import timezone

from inspection.middleware import DataConsistencyMiddleware


class DataConsistencyMiddlewareTests(SimpleTestCase):
    def setUp(self):
        self.middleware = DataConsistencyMiddleware(lambda request: None)
        self.request = RequestFactory().get('/api/ocr/status/')

    @patch('inspection.middleware.cache.get')
    @patch('inspection.middleware.connection')
    def test_missing_connection_stays_lazy(self, mock_connection, mock_cache_get):
        mock_cache_get.return_value = timezone.now()
        mock_connection.connection = None

        self.middleware.process_request(self.request)

        mock_connection.ensure_connection.assert_not_called()
        mock_connection.close.assert_not_called()

    @patch('inspection.middleware.cache.get')
    @patch('inspection.middleware.connection')
    def test_unusable_existing_connection_is_closed(self, mock_connection, mock_cache_get):
        mock_cache_get.return_value = timezone.now()
        mock_connection.connection = object()
        mock_connection.is_usable.return_value = False

        self.middleware.process_request(self.request)

        mock_connection.close.assert_called_once_with()
        mock_connection.ensure_connection.assert_not_called()
