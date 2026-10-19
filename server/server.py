#!/usr/bin/env python3
"""Serve every desktop tool, AI provider relay, and reportiX web research."""
import argparse
import json
import os
import sys
import threading
from pathlib import Path
from http.server import ThreadingHTTPServer
sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from server import relay, crawler, google_search, workflow_commands
from server.relay import validate_origin

SLOTS=threading.BoundedSemaphore(3)
class Handler(relay.Handler):
    def send_head(self):
        if hasattr(self.server,'search_store') and Path(self.translate_path(self.path)).resolve()==self.server.search_store.path.resolve():
            self.send_error(404);return None
        return super().send_head()
    def do_GET(self):
        if self.path=='/api/workflow/health':
            if not self.local_admin() or self.headers.get('X-Architex-Request')!='1':self.send_json(403,{'error':'Use the local suite origin'});return
            runner=getattr(self.server,'workflow_commands',None)
            self.send_json(200,{'commandsEnabled':bool(runner and runner.allowed),'commands':sorted(runner.allowed) if runner else []});return
        if self.path=='/api/research/settings':
            if not self.local_admin() or self.headers.get('X-Architex-Request')!='1':self.send_json(403,{'error':'Use the local reportiX search settings UI'});return
            try:self.send_json(200,self.server.search_store.snapshot())
            except (ValueError,OSError):self.send_json(500,{'error':'Google search configuration is unavailable'})
            return
        if self.path=='/api/research/health':self.send_json(200,{'service':'reportix','protocolVersion':1});return
        return super().do_GET()
    def do_POST(self):
        if self.path in {'/api/workflow/command','/api/workflow/cancel'}:
            if not self.local_admin() or self.headers.get('X-Architex-Request')!='1':self.send_json(403,{'error':'Command calls require the local suite origin'});return
            if self.headers.get_content_type()!='application/json':self.send_json(415,{'error':'Use application/json'});return
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=300000:raise ValueError('Command request exceeds 300 KB')
                data=json.loads(self.rfile.read(size))
                if not isinstance(data,dict):raise ValueError('Expected a JSON object')
                runner=self.server.workflow_commands
                result=runner.cancel(data.get('id')) if self.path.endswith('/cancel') else runner.run(data)
                self.send_json(200,result)
            except PermissionError as e:self.send_json(403,{'error':str(e)})
            except (ValueError,UnicodeDecodeError) as e:self.send_json(400,{'error':str(e)})
            except (BrokenPipeError,ConnectionResetError):pass
            except OSError:self.send_json(500,{'error':'Could not launch the configured executable. Check server permissions and working directory.'})
            return
        if self.path not in {'/api/research','/api/research/settings'}:return super().do_POST()
        if not self.local_admin() or self.headers.get('X-Architex-Request')!='1':self.send_json(403,{'error':'Run reportiX on the same local origin as its crawling server'});return
        if self.headers.get_content_type()!='application/json':self.send_json(415,{'error':'Use application/json'});return
        try:
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<=64000:raise ValueError('Research request exceeds 64 KB')
            data=json.loads(self.rfile.read(size))
            if not isinstance(data,dict):raise ValueError('Expected a JSON object')
        except (ValueError,UnicodeDecodeError) as e:self.send_json(400,{'error':str(e)});return
        if self.path=='/api/research/settings':
            try:self.send_json(200,self.server.search_store.save(data))
            except (ValueError,OSError):self.send_json(400,{'error':'Could not save Google settings. Check field values and configuration file permissions.'})
            return
        if not SLOTS.acquire(blocking=False):self.send_json(429,{'error':'Crawler busy. Try again after another research run finishes.'});return
        try:
            try:
                provider=data.get('searchProvider','bing')
                discover=(lambda query:google_search.search(query,self.server.search_store.effective())) if provider=='google' else crawler.search
                self.send_json(200,crawler.research(data,searcher=discover))
            except ValueError as e:self.send_json(400,{'error':str(e)})
            except (BrokenPipeError,ConnectionResetError):pass
            except Exception:self.send_json(502,{'error':'Research failed. Check source availability and server network access.'})
        finally:SLOTS.release()

def main(default_port=8000):
    parser = argparse.ArgumentParser(description=__doc__)
    config_home = Path(os.environ.get('XDG_CONFIG_HOME', str(Path.home()/'.config')))
    parser.add_argument('--port', type=int, default=default_port)
    parser.add_argument('--bind', default='127.0.0.1')
    parser.add_argument('--config', default=str(config_home/'architex-relay/providers.json'), help='Private AI provider configuration file')
    parser.add_argument('--search-config', default=str(config_home/'reportix/search.json'), help='Private Google search configuration file')
    parser.add_argument('--allow-origin', action='append', default=[], help='Exact trusted app origin permitted to use the AI relay; repeat as needed')
    parser.add_argument('--allow-workflow-command', action='append', default=[], metavar='EXECUTABLE', help='Allow this executable for local workflow command steps; repeat to allow more (disabled by default)')
    parser.add_argument('--workflow-cwd', default=str(ROOT), help='Working directory for allowed workflow commands')
    args = parser.parse_args()
    try:
        origins = {validate_origin(value) for value in args.allow_origin}
    except ValueError as error:
        parser.error(str(error))
    server = ThreadingHTTPServer((args.bind, args.port), lambda *a, **kw: Handler(*a, directory=str(ROOT), **kw))
    try:
        server.workflow_commands = workflow_commands.Commands(args.allow_workflow_command,args.workflow_cwd)
    except ValueError as error:
        parser.error(str(error))
    server.allowed_origins = origins
    server.store = relay.relay_config.Store(args.config)
    server.search_store = google_search.Store(args.search_config)
    print(f'Desktop suite, AI relay and web research listening on {args.bind}:{server.server_port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

if __name__ == '__main__':
    main()
