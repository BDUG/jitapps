import unittest
from codingagentlib.python.providers import openai_model, anthropic_model, gemini_model, ollama_model, with_retry


class ProviderTests(unittest.TestCase):
    def test_all_provider_adapters_and_retry(self):
        self.assertEqual(
            openai_model(
                endpoint='https://api.example.com/v1/chat/completions',
                model_id='gpt-4o',
                request=lambda u, b, h: {'choices': [{'message': {'content': '{"ok":1}'}}]},
            )({'step': 1}),
            '{"ok":1}',
        )
        self.assertEqual(
            anthropic_model(
                model_id='claude-sonnet',
                request=lambda u, b, h: {'content': [{'type': 'text', 'text': '{"ok":2}'}]},
            )({'step': 1}),
            '{"ok":2}',
        )
        self.assertEqual(
            gemini_model(
                model_id='gemini-2.5-flash',
                request=lambda u, b, h: {'candidates': [{'content': {'parts': [{'text': '{"ok":3}'}]}}]},
            )({'step': 1}),
            '{"ok":3}',
        )
        self.assertEqual(
            ollama_model(
                model_id='qwen2.5-coder',
                request=lambda u, b, h: {'message': {'content': '{"ok":4}'}},
            )({'step': 1}),
            '{"ok":4}',
        )
        with self.assertRaises(ValueError):
            openai_model(endpoint='http://remote.invalid/v1', model_id='m', request=lambda *_: {})

        attempts = [0]

        def flaky(_):
            attempts[0] += 1
            if attempts[0] < 3:
                raise RuntimeError('transient')
            return 'recovered'

        self.assertEqual(with_retry(flaky, max_attempts=3, sleep=lambda _: None)({}), 'recovered')
        self.assertEqual(attempts[0], 3)


if __name__ == '__main__':
    unittest.main()
