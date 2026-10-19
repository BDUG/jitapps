"""Exercise the canonical CLI with both backend capabilities on one port."""
import json
import pathlib
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent

class UnifiedServerTest(unittest.TestCase):
    def test_canonical_cli(self):
        with tempfile.TemporaryDirectory(dir=ROOT/'server') as directory:
            folder = pathlib.Path(directory)
            providers = folder/'providers.json'
            search = folder/'search.json'
            process = subprocess.Popen([sys.executable, str(ROOT/'server/server.py'), '--port', '0', '--config', str(providers), '--search-config', str(search), '--allow-origin', 'https://trusted.example'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            try:
                line = process.stdout.readline()
                self.assertIn('listening on', line)
                base = 'http://'+line.strip().split()[-1]
                def get(path, headers=None):
                    with urllib.request.urlopen(urllib.request.Request(base+path, headers=headers or {}), timeout=5) as response:
                        return response.read(), response.headers
                data, headers = get('/api/health', {'Origin':'https://trusted.example'})
                self.assertTrue(json.loads(data)['chatRelay'])
                self.assertEqual(headers['Access-Control-Allow-Origin'], 'https://trusted.example')
                self.assertEqual(json.loads(get('/api/research/health')[0])['service'], 'reportix')
                self.assertFalse(json.loads(get('/api/workflow/health', {'X-Architex-Request':'1'})[0])['commandsEnabled'])
                self.assertIn('profiles', json.loads(get('/api/admin/config', {'X-Architex-Admin':'1'})[0]))
                self.assertIn('configured', json.loads(get('/api/research/settings', {'X-Architex-Request':'1'})[0]))
                for tool in ['architex','graphiX','textiX','sheetiX','codeiX','automatextiX','reportiX','appiX','presentiX','sketchiX','mindiX','projectiX']:
                    self.assertIn(b'<html', get('/'+tool+'/')[0].lower())
                for editor in ['sketch','shape']:
                    self.assertIn(b'artwork.js', get('/sketchiX/'+editor+'.html')[0])
                self.assertIn(b'Agentic Desktop', get('/')[0])
                self.assertIn(b'projectiX', get('/shared-suite/apps.js')[0])
                self.assertIn(b'<svg', get('/assets/icons/projectiX.svg')[0])
                self.assertIn(b'<html', get('/relay')[0].lower())
                for file in [providers, search]:
                    file.write_text('{"secret":"must-not-be-served"}')
                    with self.assertRaises(urllib.error.HTTPError) as error:
                        get('/'+str(file.relative_to(ROOT)))
                    self.assertEqual(error.exception.code, 404)
            finally:
                process.terminate()
                process.communicate(timeout=5)

if __name__ == '__main__':
    unittest.main()
