"""Optional LLM provider adapters with host-owned HTTP transport and retries."""
import json
import time
from urllib.parse import urlsplit

SYSTEM_PROMPT = 'Return exactly one ModelResponse JSON object matching responseSchema. Tool side effects occur only in the host runtime.'


def _validate_config(endpoint, model_id, api_key, request):
    url = urlsplit(endpoint)
    local = url.scheme == 'http' and url.hostname in ('localhost', '127.0.0.1', '::1')
    if (url.scheme != 'https' and not local) or not url.hostname or url.username or url.password or url.fragment:
        raise ValueError('Invalid provider configuration')
    if not isinstance(model_id, str) or not model_id.strip() or not isinstance(api_key, str) or not callable(request):
        raise ValueError('Invalid provider configuration')


def openai_model(*, endpoint, model_id, request, api_key=''):
    _validate_config(endpoint, model_id, api_key, request)

    def model(payload):
        body = dict(
            model=model_id,
            messages=[dict(role='system', content=SYSTEM_PROMPT), dict(role='user', content=json.dumps(payload))],
            response_format=dict(type='json_object'),
        )
        headers = {'Content-Type': 'application/json', **({'Authorization': 'Bearer ' + api_key} if api_key else {})}
        result = request(endpoint, body, headers)
        content = result['choices'][0]['message']['content']
        if not isinstance(content, str):
            raise ValueError('Provider did not return structured response text')
        return content

    return model


def anthropic_model(*, endpoint='https://api.anthropic.com/v1/messages', model_id, request, api_key='', max_tokens=4096, anthropic_version='2023-06-01'):
    _validate_config(endpoint, model_id, api_key, request)

    def model(payload):
        body = dict(
            model=model_id,
            max_tokens=max_tokens,
            system=SYSTEM_PROMPT,
            messages=[dict(role='user', content=json.dumps(payload))],
        )
        headers = {
            'Content-Type': 'application/json',
            'anthropic-version': anthropic_version,
            **({'x-api-key': api_key} if api_key else {}),
        }
        result = request(endpoint, body, headers)
        blocks = result.get('content') or []
        text = ''.join(b.get('text', '') for b in blocks if isinstance(b, dict) and b.get('type') == 'text')
        if not text:
            raise ValueError('Provider did not return structured response text')
        return text

    return model


def gemini_model(*, endpoint=None, model_id, request, api_key=''):
    url = endpoint or f'https://generativelanguage.googleapis.com/v1beta/models/{model_id}:generateContent'
    _validate_config(url, model_id, api_key, request)

    def model(payload):
        body = dict(
            systemInstruction=dict(parts=[dict(text=SYSTEM_PROMPT)]),
            contents=[dict(role='user', parts=[dict(text=json.dumps(payload))])],
            generationConfig=dict(responseMimeType='application/json'),
        )
        headers = {'Content-Type': 'application/json', **({'x-goog-api-key': api_key} if api_key else {})}
        result = request(url, body, headers)
        parts = result['candidates'][0]['content']['parts']
        text = ''.join(p.get('text', '') for p in parts if isinstance(p, dict))
        if not text:
            raise ValueError('Provider did not return structured response text')
        return text

    return model


def ollama_model(*, endpoint='http://127.0.0.1:11434/api/chat', model_id, request):
    _validate_config(endpoint, model_id, '', request)

    def model(payload):
        body = dict(
            model=model_id,
            stream=False,
            format='json',
            messages=[dict(role='system', content=SYSTEM_PROMPT), dict(role='user', content=json.dumps(payload))],
        )
        result = request(endpoint, body, {'Content-Type': 'application/json'})
        content = (result.get('message') or {}).get('content')
        if not isinstance(content, str):
            raise ValueError('Provider did not return structured response text')
        return content

    return model


def with_retry(model, *, max_attempts=3, base_delay=0.25, sleep=time.sleep):
    """Wrap a model callable with bounded exponential backoff on transient errors."""
    if not callable(model) or type(max_attempts) is not int or not 1 <= max_attempts <= 10:
        raise ValueError('Invalid retry configuration')

    def wrapped(payload):
        last_error = None
        for attempt in range(max_attempts):
            try:
                return model(payload)
            except (ValueError, PermissionError, KeyError, TypeError):
                raise
            except Exception as error:
                last_error = error
                if attempt + 1 >= max_attempts:
                    raise
                sleep(base_delay * (2 ** attempt))
        raise last_error

    return wrapped


def tool_schemas(tools, *, provider='openai'):
    """Convert internal tool specs into OpenAI, Anthropic, or Gemini JSON Schema tool definitions."""
    formatted = []
    for tool in tools or ():
        name = tool['name']
        desc = tool.get('description', '')
        params = tool.get('parameters') or {'type': 'object', 'properties': {}}
        if provider == 'openai':
            formatted.append({'type': 'function', 'function': {'name': name, 'description': desc, 'parameters': params}})
        elif provider == 'anthropic':
            formatted.append({'name': name, 'description': desc, 'input_schema': params})
        elif provider == 'gemini':
            formatted.append({'name': name, 'description': desc, 'parameters': params})
        else:
            raise ValueError(f'Unsupported tool schema provider: {provider}')
    if provider == 'gemini' and formatted:
        return [{'functionDeclarations': formatted}]
    return formatted


_STOP_REASON_MAP = {
    'tool_calls': 'tool_use',
    'tool_use': 'tool_use',
    'stop': 'end_turn',
    'end_turn': 'end_turn',
    'STOP': 'end_turn',
    'length': 'max_tokens',
    'max_tokens': 'max_tokens',
    'MAX_TOKENS': 'max_tokens',
    'content_filter': 'content_filter',
    'SAFETY': 'content_filter',
}


def parse_provider_response(provider, result):
    """Normalize OpenAI, Anthropic, or Gemini Tool-Use responses into {text, reasoning, tool_calls, stop_reason, usage}."""
    text_parts, reasoning_parts, tool_calls = [], [], []
    raw_stop = None
    usage = {'input_tokens': 0, 'output_tokens': 0}

    if provider == 'openai':
        choice = (result.get('choices') or [{}])[0]
        msg = choice.get('message') or {}
        raw_stop = choice.get('finish_reason')
        if isinstance(msg.get('content'), str) and msg['content']:
            text_parts.append(msg['content'])
        for key in ('reasoning_content', 'reasoning'):
            if isinstance(msg.get(key), str) and msg[key]:
                reasoning_parts.append(msg[key])
        for tc in msg.get('tool_calls') or ():
            fn = tc.get('function') or {}
            raw_args = fn.get('arguments', '{}')
            args = json.loads(raw_args) if isinstance(raw_args, str) else (raw_args or {})
            tool_calls.append({'id': tc.get('id') or f'call_{len(tool_calls) + 1}', 'name': fn.get('name', ''), 'arguments': args})
        u = result.get('usage') or {}
        usage = {'input_tokens': int(u.get('prompt_tokens', 0)), 'output_tokens': int(u.get('completion_tokens', 0))}

    elif provider == 'anthropic':
        raw_stop = result.get('stop_reason')
        for block in result.get('content') or ():
            if not isinstance(block, dict):
                continue
            btype = block.get('type')
            if btype == 'text' and block.get('text'):
                text_parts.append(block['text'])
            elif btype == 'thinking' and block.get('thinking'):
                reasoning_parts.append(block['thinking'])
            elif btype == 'tool_use':
                tool_calls.append({'id': block.get('id') or f'toolu_{len(tool_calls) + 1}', 'name': block.get('name', ''), 'arguments': block.get('input') or {}})
        u = result.get('usage') or {}
        usage = {'input_tokens': int(u.get('input_tokens', 0)), 'output_tokens': int(u.get('output_tokens', 0))}

    elif provider == 'gemini':
        cand = (result.get('candidates') or [{}])[0]
        raw_stop = cand.get('finishReason')
        for part in (cand.get('content') or {}).get('parts') or ():
            if not isinstance(part, dict):
                continue
            if part.get('thought') and part.get('text'):
                reasoning_parts.append(part['text'])
            elif 'text' in part and part.get('text'):
                text_parts.append(part['text'])
            elif 'functionCall' in part:
                fc = part['functionCall'] or {}
                tool_calls.append({'id': fc.get('id') or f'gem_{len(tool_calls) + 1}', 'name': fc.get('name', ''), 'arguments': fc.get('args') or {}})
        if tool_calls and raw_stop == 'STOP':
            raw_stop = 'tool_use'
        u = result.get('usageMetadata') or {}
        usage = {'input_tokens': int(u.get('promptTokenCount', 0)), 'output_tokens': int(u.get('candidatesTokenCount', 0))}
    else:
        raise ValueError(f'Unsupported provider: {provider}')

    stop_reason = _STOP_REASON_MAP.get(raw_stop, 'tool_use' if tool_calls else 'end_turn')
    return {
        'provider': provider,
        'text': ''.join(text_parts),
        'reasoning': ''.join(reasoning_parts),
        'tool_calls': tool_calls,
        'stop_reason': stop_reason,
        'raw_stop_reason': raw_stop,
        'usage': usage,
    }


def openai_tool_model(*, endpoint, model_id, request, api_key='', tools=()):
    """OpenAI Chat Completions adapter with native JSON Schema tool-use and reasoning/stop_reason parsing."""
    _validate_config(endpoint, model_id, api_key, request)

    def model(messages, *, system=SYSTEM_PROMPT, tool_choice='auto'):
        body = dict(model=model_id, messages=([dict(role='system', content=system)] if system else []) + list(messages))
        schemas = tool_schemas(tools, provider='openai')
        if schemas:
            body['tools'] = schemas
            body['tool_choice'] = tool_choice
        headers = {'Content-Type': 'application/json', **({'Authorization': 'Bearer ' + api_key} if api_key else {})}
        return parse_provider_response('openai', request(endpoint, body, headers))

    return model


def anthropic_tool_model(*, endpoint='https://api.anthropic.com/v1/messages', model_id, request, api_key='', tools=(), max_tokens=4096, anthropic_version='2023-06-01'):
    """Anthropic Messages adapter with native JSON Schema tool_use and thinking/stop_reason parsing."""
    _validate_config(endpoint, model_id, api_key, request)

    def model(messages, *, system=SYSTEM_PROMPT):
        body = dict(model=model_id, max_tokens=max_tokens, system=system, messages=list(messages))
        schemas = tool_schemas(tools, provider='anthropic')
        if schemas:
            body['tools'] = schemas
        headers = {'Content-Type': 'application/json', 'anthropic-version': anthropic_version, **({'x-api-key': api_key} if api_key else {})}
        return parse_provider_response('anthropic', request(endpoint, body, headers))

    return model


def gemini_tool_model(*, endpoint=None, model_id, request, api_key='', tools=()):
    """Gemini generateContent adapter with native functionDeclarations JSON Schema and thought/finishReason parsing."""
    url = endpoint or f'https://generativelanguage.googleapis.com/v1beta/models/{model_id}:generateContent'
    _validate_config(url, model_id, api_key, request)

    def model(contents, *, system=SYSTEM_PROMPT):
        body = dict(systemInstruction=dict(parts=[dict(text=system)]), contents=list(contents))
        schemas = tool_schemas(tools, provider='gemini')
        if schemas:
            body['tools'] = schemas
        headers = {'Content-Type': 'application/json', **({'x-goog-api-key': api_key} if api_key else {})}
        return parse_provider_response('gemini', request(url, body, headers))

    return model


def tool_use_to_react_model(tool_model):
    """Bridge a native tool-use provider adapter into the ReactAgent ModelResponse JSON contract."""
    def model(payload):
        turn = tool_model([{'role': 'user', 'content': json.dumps(payload)}])
        sid, step = payload.get('sessionId'), payload.get('step')
        plan = turn.get('reasoning') or turn.get('text') or 'Execute next tool step'
        calls = turn.get('tool_calls') or []
        if calls:
            first = calls[0]
            return json.dumps({
                'sessionId': sid,
                'step': step,
                'status': 'act',
                'plan': plan[:500],
                'action': {'tool': first['name'], 'args': first.get('arguments') or {}},
                'toolCalls': calls,
                'stopReason': turn.get('stop_reason'),
                'usage': turn.get('usage'),
            })
        return json.dumps({
            'sessionId': sid,
            'step': step,
            'status': 'done',
            'plan': plan[:500],
            'action': None,
            'summary': turn.get('text') or 'Completed',
            'outcome': 'complete',
            'stopReason': turn.get('stop_reason'),
            'usage': turn.get('usage'),
        })
    return model
