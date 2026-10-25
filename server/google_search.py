"""Google Programmable Search configuration and server-side JSON API client."""
import json, os, tempfile, threading
from pathlib import Path
import urllib.error, urllib.parse, urllib.request

class Store:
    def __init__(self,path):self.path=Path(path).expanduser();self.lock=threading.RLock()
    def read(self):
        if not self.path.exists():return {}
        with self.path.open(encoding='utf-8') as file:data=json.load(file)
        if not isinstance(data,dict):raise ValueError('Invalid Google search configuration file')
        return data
    def effective(self):
        with self.lock:
            data=self.read()
            return {'apiKey':os.environ.get('REPORTIX_GOOGLE_API_KEY') or data.get('apiKey',''),'engineId':os.environ.get('REPORTIX_GOOGLE_ENGINE_ID') or data.get('engineId','')}
    def snapshot(self):
        data=self.effective()
        return {'engineId':data['engineId'],'keyConfigured':bool(data['apiKey']),'configured':bool(data['apiKey'] and data['engineId']),'keyFromEnvironment':bool(os.environ.get('REPORTIX_GOOGLE_API_KEY')),'engineFromEnvironment':bool(os.environ.get('REPORTIX_GOOGLE_ENGINE_ID'))}
    def save(self,value):
        if not isinstance(value,dict) or set(value)-{'apiKey','engineId','clearKey'}:raise ValueError('Use apiKey, engineId and optional clearKey')
        for k in ['apiKey','engineId']:
            if k in value and (not isinstance(value[k],str) or len(value[k])>1000 or any(c.isspace() for c in value[k])):raise ValueError('Invalid Google '+k)
        with self.lock:
            data=self.read()
            if value.get('clearKey') is True:data.pop('apiKey',None)
            elif value.get('apiKey'):data['apiKey']=value['apiKey']
            if 'engineId' in value:data['engineId']=value['engineId']
            self.path.parent.mkdir(parents=True,exist_ok=True)
            descriptor,name=tempfile.mkstemp(prefix='.reportix-search-',dir=str(self.path.parent))
            try:
                with os.fdopen(descriptor,'w',encoding='utf-8') as file:json.dump(data,file)
                os.chmod(name,0o600);os.replace(name,self.path)
            finally:
                if os.path.exists(name):os.unlink(name)
            return self.snapshot()

def search(query,config,opener=None):
    key=config.get('apiKey','');engine=config.get('engineId','')
    if not key or not engine:raise ValueError('Google search requires an API key and Programmable Search engine ID. Configure them in Search settings.')
    url='https://customsearch.googleapis.com/customsearch/v1?'+urllib.parse.urlencode({'key':key,'cx':engine,'q':query,'num':10})
    request=urllib.request.Request(url,headers={'Accept':'application/json','User-Agent':'reportiX/1.0'})
    try:
        with (opener or urllib.request.urlopen)(request,timeout=12) as response:
            raw=response.read(1_000_001)
        if len(raw)>1_000_000:raise ValueError('Google search response exceeds 1 MB')
        data=json.loads(raw)
    except urllib.error.HTTPError as error:
        raise ValueError('Google search failed (HTTP '+str(error.code)+'). Check API access, key restrictions, engine ID, billing/quota and network permissions.') from None
    except (urllib.error.URLError,TimeoutError,OSError):raise ValueError('Google search is unreachable. Check network access and TLS trust for customsearch.googleapis.com.') from None
    except (UnicodeDecodeError,json.JSONDecodeError):raise ValueError('Google returned unreadable search JSON') from None
    if not isinstance(data,dict) or 'error' in data:raise ValueError('Google search returned an API error. Check configuration and quota.')
    results=[]
    items=data.get('items',[])
    if not isinstance(items,list):raise ValueError('Google returned invalid search results')
    for item in items[:10]:
        if not isinstance(item,dict):continue
        link=item.get('link','')
        if not isinstance(link,str) or len(link)>3000 or urllib.parse.urlsplit(link).scheme not in {'https','http'}:continue
        results.append({'url':link,'title':str(item.get('title',link))[:500],'snippet':str(item.get('snippet',''))[:500]})
    return results
