"""Threaded JSON-lines host for the production synchronous Python ACP adapter."""
from concurrent.futures import ThreadPoolExecutor
import json
import sys
import threading
import time
from codingagentlib.python.streaming import ACPServer

lock = threading.Lock()


def send(value):
    with lock:
        print(json.dumps(value), flush=True)


def prompt(identity, text, service):
    service.emit_update(identity, {'sessionUpdate': 'agent_message_chunk', 'content': {'type': 'text', 'text': 'peer: ' + text}})
    if text == 'wait for cancellation':
        until = time.monotonic() + 5
        while not service.sessions[identity]['cancelled'] and time.monotonic() < until:
            time.sleep(.02)
    return {'stopReason': 'end_turn'}


server = ACPServer(prompt_handler=prompt, emit_notification=send)


def handle(line):
    frame = json.loads(line)
    value = server.handle(frame)
    if 'id' in frame:
        send(value)


with ThreadPoolExecutor(max_workers=4) as pool:
    for line in sys.stdin:
        pool.submit(handle, line)
