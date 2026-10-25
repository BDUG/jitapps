#!/usr/bin/env python3
"""Serve every desktop tool, AI provider relay, and reportiX web research."""
import argparse
import json
import os
import signal
import shutil
import sys
import threading
from pathlib import Path
from http.server import ThreadingHTTPServer
sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from server import relay, crawler, google_search, workflow_commands, agent_runtime, skill_catalog, skill_api, image_provider, google_identity, google_device, server_settings
from server.relay import validate_origin

SLOTS=threading.BoundedSemaphore(3)
class Handler(relay.Handler):
    def end_headers(self):
        if self.path in {'/api/google/verify','/api/google/device'}:self.send_header('Cache-Control','no-store')
        super().end_headers()
    def send_head(self):
        settings=getattr(self.server,'settings',None)
        if settings and (Path(self.translate_path(self.path)).resolve()==settings.path or Path(self.translate_path(self.path)).name.startswith('.server-settings-')):
            self.send_error(404);return None
        device=getattr(self.server,'google_device',None)
        target=Path(self.translate_path(self.path)).resolve()
        if device and (target==device.path.resolve() or target.name.startswith('.google-device-')):
            self.send_error(404);return None
        if Path(self.translate_path(self.path)).resolve()==image_provider.config_path(self.server).resolve():
            self.send_error(404);return None

        if any(p in {'.suite-agent','.suite-skills'} for p in Path(self.translate_path(self.path)).parts):
            self.send_error(404);return None
        catalog=getattr(self.server,'skill_catalog',None)
        if catalog and str(Path(self.translate_path(self.path)).resolve()) in {str(catalog.path.resolve())+suffix for suffix in ('','-wal','-shm','-journal')}:
            self.send_error(404);return None
        runtime=getattr(self.server,'agent_runtime',None)
        if runtime and runtime.state and Path(self.translate_path(self.path)).resolve().is_relative_to(runtime.state.resolve()):
            self.send_error(404);return None
        if hasattr(self.server,'search_store') and Path(self.translate_path(self.path)).resolve()==self.server.search_store.path.resolve():
            self.send_error(404);return None
        return super().send_head()
    def do_GET(self):
        if self.path=='/api/agent/health':
            if not self.local_admin() or self.headers.get('X-Architex-Request')!='1':self.send_json(403,{'error':'Agent runtime requires its same localhost origin'});return
            self.send_json(200,self.server.agent_runtime.health());return
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
        settings = getattr(self.server, 'settings', None)
        if self.path == '/api/admin/server-settings':
            if not self.local_admin() or self.headers.get('X-Architex-Admin') != '1':
                self.send_json(403, {'error':'Server settings require their same localhost origin'});return
            try:
                if self.headers.get_content_type() != 'application/json': raise ValueError('Use application/json')
                size = int(self.headers.get('Content-Length','0'))
                if not 0 < size <= 64000: raise ValueError('Invalid settings request size')
                self.send_json(200, settings.dispatch(json.loads(self.rfile.read(size))))
            except (ValueError, TypeError, UnicodeError) as error: self.send_json(400, {'error':str(error)})
            except OSError: self.send_json(500, {'error':'Cannot save server settings. Check private file access.'})
            return
        tracked = settings and (self.path.startswith('/api/agent') or self.path.startswith('/api/workflow'))
        if tracked:
            with settings.lock: settings.active_requests += 1
        try: return self._do_POST()
        finally:
            if tracked:
                with settings.lock: settings.active_requests -= 1

    def _do_POST(self):
        if self.path=='/api/google/device':
            if not self.local_admin() or self.headers.get('X-Architex-Request')!='1':self.send_json(403,{'error':'Device sign-in setup requires its same localhost origin'});return
            if self.headers.get_content_type()!='application/json':self.send_json(415,{'error':'Use application/json'});return
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=12000:raise ValueError('Device sign-in request is too large')
                self.send_json(200,self.server.google_device.dispatch(json.loads(self.rfile.read(size))))
            except (ValueError,TypeError,UnicodeError) as error:self.send_json(400,{'error':str(error)})
            except (OSError,google_device.ProviderError):self.send_json(502,{'error':'Google device authorization is unavailable. Check server connectivity, TLS trust and private configuration access.'})
            return
        if self.path=='/api/google/verify':
            import urllib.parse
            host=self.headers.get('Host','');origin=self.headers.get('Origin');site=self.headers.get('Sec-Fetch-Site')
            host_name=urllib.parse.urlsplit('http://'+host).hostname
            if self.headers.get('X-Architex-Request')!='1' or site=='cross-site' or origin is not None and origin not in {'http://'+host,'https://'+host} or origin is None and site not in {'same-origin','none'} and host_name not in {'localhost','127.0.0.1','::1'}:
                self.send_json(403,{'error':'Google sign-in verification requires the suite origin'});return
            if self.headers.get_content_type()!='application/json':self.send_json(415,{'error':'Use application/json'});return
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=20000:raise ValueError('Google sign-in request is too large')
                data=json.loads(self.rfile.read(size))
                self.send_json(200,google_identity.verify(data,Path(self.directory)/'shared-suite/google-drive-config.json'))
            except google_identity.Unavailable as error:self.send_json(503,{'error':str(error)})
            except (ValueError,TypeError,UnicodeError) as error:self.send_json(400,{'error':str(error)})
            except (OSError,RuntimeError):self.send_json(502,{'error':'Google account verification is unavailable. Check network access and TLS trust.'})
            return
        if self.path in {'/api/images','/api/admin/images'}:
            admin=self.path=='/api/admin/images'
            host=self.headers.get('Host','');origin=self.headers.get('Origin')
            if admin:
                allowed=self.local_admin() and self.headers.get('X-Architex-Admin')=='1'
            else:
                import urllib.parse
                allowed=urllib.parse.urlsplit('http://'+host).hostname in {'localhost','127.0.0.1','::1'} and self.headers.get('X-Architex-Request')=='1' and (not origin or origin=='http://'+host or self.cors_origin()) and (self.headers.get('Sec-Fetch-Site')!='cross-site' or self.cors_origin())
            if not allowed:self.send_json(403,{'error':'Use the local relay or its configured allowed origin'});return
            try:
                if self.headers.get_content_type()!='application/json':raise ValueError('Use application/json')
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=(100000 if admin else 40000000):raise ValueError('Image request is too large')
                data=json.loads(self.rfile.read(size))
                if not isinstance(data,dict):raise ValueError('Expected image request object')
                result=(image_provider.load(self.server) if data.get('action')=='read' else image_provider.save(self.server,data)) if admin else image_provider.render(self.server,data)
                self.send_json(200,result)
            except (ValueError,UnicodeError) as e:self.send_json(400 if admin else 502,{'error':str(e)})
            except OSError:self.send_json(500,{'error':'Image settings could not be read or saved'})
            return

        if self.path=='/api/skills':
            if not self.local_admin() or self.headers.get('X-Architex-Request')!='1':self.send_json(403,{'error':'Use the skills manager on this server origin'});return
            try:
                if self.headers.get_content_type()!='application/json':raise ValueError('Use application/json')
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=1000000:raise ValueError('Skill request exceeds 1 MB')
                data=json.loads(self.rfile.read(size))
                if not isinstance(data,dict):raise ValueError('Expected a JSON object')
                self.send_json(200,skill_api.dispatch(self.server.skill_catalog,data))
            except (ValueError,KeyError,TypeError,UnicodeError) as error:self.send_json(400,{'error':str(error)})
            except OSError as error:self.send_json(502,{'error':'Skill source or storage unavailable: '+str(error)[:300]})
            return
        if self.path in {'/api/agent','/api/agent/package'}:
            if not self.local_admin() or self.headers.get('X-Architex-Request')!='1':self.send_json(403,{'error':'Agent tools require their same localhost origin'});return
            if self.headers.get_content_type()!='application/json':self.send_json(415,{'error':'Use application/json'});return
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=8000000:raise ValueError('Agent action request exceeds 8 MB')
                data=json.loads(self.rfile.read(size))
                if not isinstance(data,dict):raise ValueError('Expected a JSON object')
                if self.path=='/api/agent/package':
                    runtime=self.server.agent_runtime;package=runtime.package(runtime.get(data.get('session')))
                    with package.open('rb') as archive:
                        self.send_response(200);self.send_header('Content-Type','application/zip');self.send_header('Content-Length',str(os.fstat(archive.fileno()).st_size));self.send_header('Content-Disposition','attachment; filename="agent-result.zip"');self.send_header('Cache-Control','no-store');self.end_headers();shutil.copyfileobj(archive,self.wfile)
                else:self.send_json(200,self.server.agent_runtime.dispatch(data))
            except PermissionError as error:self.send_json(403,{'error':str(error)})
            except (ValueError,KeyError,TypeError,UnicodeError) as error:self.send_json(400,{'error':str(error)})
            except (BrokenPipeError,ConnectionResetError):pass
            except OSError:self.send_json(500,{'error':'Agent filesystem/process operation failed. Check workspace permissions.'})
            return
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

def main(default_port=8000, shutdown_event=None):
    parser = argparse.ArgumentParser(description=__doc__)
    config_home = Path(os.environ.get('XDG_CONFIG_HOME', str(Path.home()/'.config')))
    parser.add_argument('--google-device-config', help='Private device OAuth client configuration (default: google-device.json beside provider config)')
    parser.add_argument('--skills-db', help='Shared skill vector database path (default: private skills directory beside provider config)')
    parser.add_argument('--skills-offline', action='store_true', help='Use bundled/cached skill index without remote refresh')
    parser.add_argument('--port', type=int, default=default_port)
    parser.add_argument('--bind', default='127.0.0.1')
    parser.add_argument('--config', default=str(config_home/'architex-relay/providers.json'), help='Private AI provider configuration file')
    parser.add_argument('--search-config', default=str(config_home/'reportix/search.json'), help='Private Google search configuration file')
    parser.add_argument('--allow-origin', action='append', default=[], help='Exact trusted app origin permitted to use the AI relay; repeat as needed')
    parser.add_argument('--allow-workflow-command', action='append', default=[], metavar='EXECUTABLE', help='Allow this executable for local workflow command steps; repeat to allow more (disabled by default)')
    parser.add_argument('--workflow-cwd', default=str(ROOT), help='Working directory for allowed workflow commands')
    parser.add_argument('--agent-workspace', default=str(ROOT), help='Coding-agent workspace directory (default: suite repository)')
    parser.add_argument('--disable-agent', action='store_true', help='Disable the coding-agent runtime')
    parser.add_argument('--agent-no-commands', action='store_true', help='Disable coding-agent command execution')
    parser.add_argument('--agent-allow-command', action='append', default=None, metavar='EXECUTABLE', help='Override default installed Python, node, npm and git commands; allow this executable; repeat for interpreters/build/test tools. Commands use relay OS permissions, not a sandbox.')
    parser.add_argument('--agent-navigation-dir', default=os.environ.get('SUITE_AGENT_NAVIGATION_DIR'), help='Trusted code-navigation service directory with its installed TypeScript dependency')
    parser.add_argument('--agent-embedding-dir', default=os.environ.get('SUITE_AGENT_EMBEDDING_DIR'), help='Prepared local MiniLM ONNX model directory; enables learned session memory embeddings (optional dependencies required)')
    parser.add_argument('--server-config', help='Private persistent server settings JSON (default: server-settings.json beside provider configuration)')
    preliminary = parser.parse_args()
    settings_path = preliminary.server_config or str(Path(preliminary.config).expanduser().parent/'server-settings.json')
    try:
        saved = server_settings.read(settings_path)
        # Explicit flags replace saved values, including repeatable allowlists.
        explicit = {action.dest for action in parser._actions if any(token.split('=')[0] in action.option_strings for token in sys.argv[1:])}
        parser.set_defaults(**{key:value for key,value in saved.items() if key not in explicit})
        args = parser.parse_args()
        server_settings.normalize({key:getattr(args,key) for key in server_settings.FIELDS})
    except (ValueError, OSError) as error:
        parser.error(str(error))
    try:
        origins = {validate_origin(value) for value in args.allow_origin}
    except ValueError as error:
        parser.error(str(error))
    server = ThreadingHTTPServer((args.bind, args.port), lambda *a, **kw: Handler(*a, directory=str(ROOT), **kw))
    try:
        server.workflow_commands = workflow_commands.Commands(args.allow_workflow_command,args.workflow_cwd)
        agent_commands = args.agent_allow_command if args.agent_allow_command is not None else ([sys.executable] if not getattr(sys,'frozen',False) else [name for name in ('python3','python') if shutil.which(name)]) + [name for name in ('node','npm','git') if shutil.which(name)]
        server.agent_runtime = agent_runtime.Runtime(None if args.disable_agent else args.agent_workspace, [] if args.disable_agent or args.agent_no_commands else agent_commands, embedding_dir=args.agent_embedding_dir,navigation_dir=args.agent_navigation_dir or str(Path(__file__).with_name('code-navigation')))
    except ValueError as error:
        parser.error(str(error))
    server.skill_catalog = skill_catalog.Catalog(args.skills_db or str(Path(args.config).parent/'skills/catalog.sqlite3'),offline=args.skills_offline or os.environ.get('SUITE_SKILLS_OFFLINE')=='1')
    server.agent_runtime.shared_skills = server.skill_catalog
    server.skill_catalog.start()
    server.allowed_origins = origins
    server.store = relay.relay_config.Store(args.config)
    server.google_device = google_device.DeviceLogin(args.google_device_config or Path(args.config).expanduser().parent/'google-device.json')
    server.search_store = google_search.Store(args.search_config)
    server.agent_runtime.private_paths.update({server.store.path.resolve(),server.search_store.path.resolve(),server.skill_catalog.path.resolve(),image_provider.config_path(server).resolve()})
    default_commands = ([sys.executable] if not getattr(sys,'frozen',False) else [name for name in ('python3','python') if shutil.which(name)]) + [name for name in ('node','npm','git') if shutil.which(name)]
    server.settings = server_settings.Settings(server,settings_path,args,default_commands)
    server.agent_runtime.private_paths.add(server.settings.path)
    if threading.current_thread() is threading.main_thread():
        signal.signal(signal.SIGTERM,lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
    if shutdown_event is not None:
        def stop_when_requested():
            shutdown_event.wait()
            server.shutdown()
        threading.Thread(target=stop_when_requested,daemon=True).start()
    print(f'Desktop suite, AI relay and web research listening on {args.bind}:{server.server_port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.skill_catalog.close()
        server.agent_runtime.close()
        server.server_close()

if __name__ == '__main__':
    main()
