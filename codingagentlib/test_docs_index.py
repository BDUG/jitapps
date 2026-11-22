"""Prevent source-index verification from accepting stale counts or stray links."""
import unittest

from codingagentlib.scripts.check_docs_index import index_errors


class DocsIndexTests(unittest.TestCase):
    def test_index_scope_and_count(self):
        document = ('### Complete source-file index\n\n'
                    'Inventory: **1 existing nonignored SDK files**\n'
                    '#### Runtime\n[x](x.py)\n'
                    '### Other guide\n[y](y.py)\n')
        self.assertEqual(index_errors(document, {'x.py'}), [])
        errors = index_errors(document, {'x.py', 'y.py'})
        self.assertIn('Missing from Complete source-file index: y.py', errors)
        self.assertTrue(any('count must be 2' in error for error in errors))
        self.assertTrue(index_errors('No index', {'x.py'}))
