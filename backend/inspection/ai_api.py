"""Online multimodal inspection API used by the production SPA.

The development Vite server used to route this request to an auxiliary Node
process.  Production only runs Django, so the endpoint lives here as the
single production implementation.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import requests
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response


logger = logging.getLogger(__name__)

ALLOWED_QUALITIES = {'合格', '存疑', '需复检'}


def _camel_or_snake(data: dict[str, Any], camel: str, snake: str, default: Any = '') -> Any:
    value = data.get(camel)
    if value in (None, ''):
        value = data.get(snake, default)
    return value


def _pure_base64(value: str) -> str:
    value = str(value or '').strip()
    if ',' in value and value.lower().startswith('data:'):
        return value.split(',', 1)[1]
    return value


def _build_system_prompt(config: dict[str, Any], standard: dict[str, Any]) -> str:
    custom_prompt = str(
        standard.get('overrideSystemPrompt')
        or standard.get('override_system_prompt')
        or _camel_or_snake(config, 'systemPrompt', 'system_prompt')
        or '请作为工业视觉检验模型，对当前图片执行严格质检。'
    ).strip()
    name = str(standard.get('name') or '未命名标准').strip()
    criteria = str(standard.get('criteria') or standard.get('requirements') or '').strip()

    return f"""你是工业视觉检验模型。仅依据当前图片和业务标准判定，不得编造未观察到的事实。
图像模糊、信息不足、结果冲突或无法确认时，overallQuality 必须为“需复检”，不得判定“合格”。
只能返回合法 JSON，不得输出 Markdown 或额外说明：
{{"overallQuality":"合格|存疑|需复检","score":0,"reason":"1-3句核心依据","reasonKeywords":[],"defects":[]}}

当前标准：{name}
检测要求：{criteria or '未配置，依据不足时必须需复检'}
补充要求：{custom_prompt}""".strip()


def _extract_json_content(content: Any) -> dict[str, Any]:
    if isinstance(content, dict):
        return content
    if isinstance(content, list):
        content = ''.join(
            str(item.get('text') or '') if isinstance(item, dict) else str(item)
            for item in content
        )
    text = str(content or '').strip()
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    fenced = re.search(r'```(?:json)?\s*([\s\S]*?)```', text, re.IGNORECASE)
    candidate = fenced.group(1).strip() if fenced else None
    if not candidate:
        braces = re.search(r'\{[\s\S]*\}', text)
        candidate = braces.group(0) if braces else ''
    parsed = json.loads(candidate)
    if not isinstance(parsed, dict):
        raise ValueError('AI 响应不是 JSON 对象')
    return parsed


def _normalize_result(raw: dict[str, Any]) -> dict[str, Any]:
    quality = str(raw.get('overallQuality') or '').strip()
    if quality not in ALLOWED_QUALITIES:
        quality = '需复检'

    try:
        score = int(round(float(raw.get('score', 50))))
    except (TypeError, ValueError):
        score = 50
    score = max(0, min(100, score))

    reason = str(raw.get('reason') or '').strip()
    if not reason:
        reason = 'AI 未返回可复核的判定依据。'
        quality = '需复检'

    keywords = raw.get('reasonKeywords', [])
    if isinstance(keywords, str):
        keywords = [item.strip() for item in re.split(r'[,，]', keywords) if item.strip()]
    if not isinstance(keywords, list):
        keywords = []

    defects = raw.get('defects', [])
    if not isinstance(defects, list):
        defects = []

    return {
        'overallQuality': quality,
        'score': score,
        'reason': reason,
        'reasonKeywords': keywords,
        'defects': defects,
    }


@api_view(['POST'])
def ai_analyze(request):
    image = _pure_base64(request.data.get('image', ''))
    config = request.data.get('config') or {}
    standard_data = request.data.get('standard') or {}
    if not image:
        return Response({'error': '缺少待检图片'}, status=status.HTTP_400_BAD_REQUEST)
    if not isinstance(config, dict) or not isinstance(standard_data, dict):
        return Response({'error': '融合分析配置格式无效'}, status=status.HTTP_400_BAD_REQUEST)
    if not standard_data.get('id'):
        return Response({'error': '融合模式必须选择检测标准'}, status=status.HTTP_400_BAD_REQUEST)

    api_url = str(_camel_or_snake(config, 'apiBaseUrl', 'api_base_url')).strip()
    api_key = str(_camel_or_snake(config, 'apiKey', 'api_key')).strip()
    model_name = str(_camel_or_snake(config, 'modelName', 'model_name')).strip()
    if not api_url or not model_name:
        return Response({'error': '在线模型 API 地址或模型名称未配置'}, status=status.HTTP_400_BAD_REQUEST)

    user_content: list[dict[str, Any]] = [
        {'type': 'text', 'text': '请严格按照标准检测这张待检图片。'},
        {'type': 'image_url', 'image_url': {'url': f'data:image/jpeg;base64,{image}'}},
    ]
    standard_image = (
        standard_data.get('standardImage')
        or standard_data.get('standard_image')
        or ''
    )
    send_standard_image = bool(
        standard_data.get('sendStandardImage')
        or standard_data.get('send_standard_image')
    )
    if send_standard_image and standard_image:
        user_content.extend([
            {'type': 'text', 'text': '以下是对比用标准图：'},
            {
                'type': 'image_url',
                'image_url': {'url': f'data:image/jpeg;base64,{_pure_base64(standard_image)}'},
            },
        ])

    payload = {
        'model': model_name,
        'messages': [
            {'role': 'system', 'content': _build_system_prompt(config, standard_data)},
            {'role': 'user', 'content': user_content},
        ],
        'response_format': {'type': 'json_object'},
        'stream': False,
    }
    headers = {'Content-Type': 'application/json'}
    if api_key:
        headers['Authorization'] = f'Bearer {api_key}'

    requested_timeout = config.get('timeout', 120000)
    try:
        timeout_seconds = max(10, min(600, float(requested_timeout) / 1000))
    except (TypeError, ValueError):
        timeout_seconds = 120

    try:
        upstream = requests.post(api_url, json=payload, headers=headers, timeout=timeout_seconds)
        upstream.raise_for_status()
        upstream_data = upstream.json()
        content = upstream_data['choices'][0]['message']['content']
        result = _normalize_result(_extract_json_content(content))
        return Response(result)
    except requests.Timeout:
        return Response({'error': '在线 AI 分析超时'}, status=status.HTTP_504_GATEWAY_TIMEOUT)
    except (requests.RequestException, KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError) as exc:
        logger.warning('在线 AI 分析失败: %s', exc)
        return Response({'error': f'在线 AI 分析失败: {exc}'}, status=status.HTTP_502_BAD_GATEWAY)
