"""Exercise the actual frozen server, or the source entry point, over HTTP."""
import argparse
import json
import os
from pathlib import Path
import queue
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request

ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser();parser.add_argument('--binary');args=parser.parse_args()
with tempfile.TemporaryDirectory() as folder:
    data=Path(folder)
    (data/'workspace').mkdir()
    command=[args.binary] if args.binary else [sys.executable,str(ROOT/'desktop-tauri/scripts/backend_entry.py')]
    command+=['--suite-root',str(ROOT/'desktop-tauri/src-tauri/resources/suite'),'--port','0','--config',str(data/'providers.json'),'--search-config',str(data/'search.json'),'--skills-db',str(data/'skills/catalog.sqlite3'),'--skills-offline','--disable-agent','--agent-workspace',str(data/'workspace')]
    env={**os.environ,'PYTHONPATH':str(ROOT),'PYTHONUNBUFFERED':'1'}
    process=subprocess.Popen(command,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=env)
    lines=queue.Queue()
    threading.Thread(target=lambda:[lines.put(line) for line in process.stdout],daemon=True).start()
    try:
        deadline=time.monotonic()+45;base=None
        while time.monotonic()<deadline:
            try:line=lines.get(timeout=.2)
            except queue.Empty:
                if process.poll() is not None:raise AssertionError('Sidecar exited: '+process.stderr.read())
                continue
            if line.startswith('Desktop suite, AI relay and web research listening on '):base='http://'+line.strip().split(' on ')[1];break
        assert base,'Sidecar readiness timed out'
        for route in ['/',*[app+'/' for app in ('shelliX','colabriX','designiX','architex','graphiX','textiX','sheetiX','codeiX','appiX','automatextiX','reportiX','presentiX','sketchiX','mindiX','projectiX','vidiX','photiX')],'/api/health','/relay']:
            with urllib.request.urlopen(base+'/'+route.lstrip('/'),timeout=10) as response:assert response.status==200,route
        req=urllib.request.Request(base+'/api/skills',data=b'{"op":"status"}',headers={'Content-Type':'application/json','X-Architex-Request':'1'})
        with urllib.request.urlopen(req,timeout=10) as response:assert response.status==200
        collision=subprocess.run(command+['--port',base.rsplit(':',1)[1]],input='',capture_output=True,text=True,env=env,timeout=15)
        assert collision.returncode!=0 and 'listening on' not in collision.stdout,'Occupied port must fail without a readiness marker'
        process.stdin.write('shutdown\n');process.stdin.flush()
        assert process.wait(timeout=10)==0,'Sidecar failed to shut down gracefully'
        assert (data/'skills/catalog.sqlite3').is_file(),'Private skill database was not created'
        print('PASS: sidecar serves desktop/all 17 apps/relay/skills and exits cleanly on private stdin control.')
    finally:
        if process.poll() is None:process.kill();process.wait(timeout=5)
