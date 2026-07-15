import json
from unittest.mock import Mock, patch

from django.test import TestCase

from inspection import ollama_api


class OllamaProxySecurityTests(TestCase):
    def test_status_rejects_unapproved_remote_host_without_requesting_it(self):
        with patch('inspection.ollama_api.requests.get') as mocked_get:
            response = self.client.get(
                '/api/ollama/status/',
                {'ollama_host': 'http://unapproved.internal:11434'},
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['status'], 'forbidden')
        mocked_get.assert_not_called()

    def test_chat_rejects_unapproved_remote_host_without_requesting_it(self):
        with patch('inspection.ollama_api.requests.post') as mocked_post:
            response = self.client.post(
                '/api/ollama/chat/',
                data=json.dumps({'model': 'test', 'ollama_host': 'http://unapproved.internal:11434'}),
                content_type='application/json',
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error'], 'Ollama 服务地址未获授权')
        mocked_post.assert_not_called()

    def test_status_forwards_only_an_explicitly_allowed_origin(self):
        upstream = Mock(status_code=200)
        upstream.json.return_value = {'models': [{'name': 'gemma4:e2b-it-qat'}]}

        with patch.object(ollama_api, 'OLLAMA_ALLOWED_HOSTS', frozenset({'http://remote-ollama.local:11434'})), \
             patch('inspection.ollama_api.requests.get', return_value=upstream) as mocked_get:
            response = self.client.get(
                '/api/ollama/status/',
                {'ollama_host': 'http://REMOTE-OLLAMA.local:11434/'},
            )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['success'])
        mocked_get.assert_called_once_with(
            'http://remote-ollama.local:11434/api/tags',
            timeout=5,
            allow_redirects=False,
        )

    def test_host_normalization_rejects_paths_and_credentials(self):
        with self.assertRaises(ValueError):
            ollama_api.normalize_ollama_host('http://user:secret@remote-ollama.local:11434')
        with self.assertRaises(ValueError):
            ollama_api.normalize_ollama_host('http://remote-ollama.local:11434/api/chat')

    def test_chat_forces_immediate_model_unload(self):
        upstream = Mock(status_code=200)
        upstream.json.return_value = {'message': {'content': '{}'}}

        with patch('inspection.ollama_api.requests.post', return_value=upstream) as mocked_post:
            response = self.client.post(
                '/api/ollama/chat/',
                data=json.dumps({
                    'model': 'test',
                    'keep_alive': '2h',
                    'options': {'keep_alive': '2h', 'temperature': 0.1},
                }),
                content_type='application/json',
            )

        self.assertEqual(response.status_code, 200)
        forwarded = mocked_post.call_args.kwargs['json']
        self.assertEqual(forwarded['keep_alive'], 0)
        self.assertNotIn('keep_alive', forwarded['options'])
