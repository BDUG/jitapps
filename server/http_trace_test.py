import unittest
from server import http_trace
class TraceTests(unittest.TestCase):
    def test_payloads_and_credentials(self):
        value=http_trace.trace('https://user:password@example.com/chat?api-version=2026&key=secret',{'Authorization':'Bearer secret','X-goog-api-key':'secret','Content-Type':'application/json'},b'{"messages":[{"content":"hello"}],"apiKey":"secret"}')
        http_trace.response(value,429,{'Set-Cookie':'secret','Retry-After':'3'},b'{"error":"quota","access_token":"secret"}')
        self.assertNotIn('secret',str(value));self.assertNotIn('user:password',str(value));self.assertIn('api-version=2026',value['request']['url'])
        self.assertEqual(value['request']['body']['messages'][0]['content'],'hello');self.assertEqual(value['response']['status'],429);self.assertEqual(value['response']['headers']['Retry-After'],'3')
    def test_invalid_response_retained(self):
        self.assertEqual(http_trace.body(b'not json'),'not json')
