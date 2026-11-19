"""Deterministic stdio peer used by JS, Python and Rust transport regressions."""
import json
import sys
import time

mode = sys.argv[1] if len(sys.argv) > 1 else 'normal'
waiting = None


def emit(frame):
    print(json.dumps(frame, ensure_ascii=False), flush=True)


def response(identity, value):
    emit(dict(jsonrpc='2.0', id=identity, result=value))


for line in sys.stdin:
    frame = json.loads(line)
    if frame.get('method') == 'initialize':
        emit(dict(jsonrpc='2.0', method='notifications/message', params=dict(level='info', data='Starting')))
        response(frame['id'], dict(protocolVersion='2025-03-26', capabilities=dict(tools={})))
    elif frame.get('method') == 'notifications/initialized':
        continue
    elif 'error' in frame:
        assert frame['id'] == waiting and frame['error']['code'] == -32601
        response(waiting, dict(tools=[]))
        waiting = None
    elif frame.get('method') == 'tools/list':
        identity = frame['id']
        if mode == 'normal':
            emit(dict(jsonrpc='2.0', method='notifications/progress', params=dict(progress=1, total=2)))
            # Both sides may independently use the same request ID.
            waiting = identity
            emit(dict(jsonrpc='2.0', id=identity, method='roots/list', params={}))
        elif mode == 'missing-result':
            emit(dict(jsonrpc='2.0', id=identity))
        elif mode == 'both-results':
            emit(dict(jsonrpc='2.0', id=identity, result={}, error=dict(code=-1, message='Bad')))
        elif mode == 'wrong-id':
            response(identity + 1, {})
        elif mode == 'invalid-notification':
            emit(dict(jsonrpc='1.0', method='notifications/progress', params={}))
        elif mode == 'invalid-error':
            emit(dict(jsonrpc='2.0', id=identity, error=dict(code='bad', message='Bad')))
        elif mode == 'tool-error':
            emit(dict(jsonrpc='2.0', id=identity, error=dict(code=-32602, message='Rejected arguments')))
        elif mode == 'unicode-overflow':
            response(identity, 'é' * 4000001)
        elif mode == 'notification-timeout':
            for _ in range(100):
                emit(dict(jsonrpc='2.0', method='notifications/progress', params=dict(progress=0)))
                time.sleep(.01)
        elif mode == 'reverse':
            waiting = identity
        elif mode == 'numeric-id':
            response(float(identity), dict(tools=[]))
        else:
            raise ValueError('Unknown test mode')
    elif frame.get('method') == 'ping':
        response(frame['id'], dict(alive=True))
        if mode == 'reverse' and waiting is not None:
            response(waiting, dict(tools=[]))
            waiting = None
