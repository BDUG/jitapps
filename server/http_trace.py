"""Per-request, opt-in provider diagnostics; never persisted by the relay."""
import json
import re
import time
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
SECRET=re.compile(r'^(authorization|proxy-authorization|cookie|set-cookie|api[-_]?key|x[-_]?api[-_]?key|x-goog-api-key|access[-_]?token|refresh[-_]?token|client[-_]?secret|password|key|token)$',re.I)
def clean(value):
    if isinstance(value,dict):return {k:'[REDACTED]' if SECRET.match(k) else clean(v) for k,v in value.items()}
    if isinstance(value,list):return [clean(v) for v in value]
    return value

def body(value):
    if isinstance(value,bytes):value=value.decode('utf-8',errors='replace')
    try:return clean(json.loads(value))
    except (ValueError,TypeError):return value

def trace(url,headers,payload):
    parts=urlsplit(url)
    safe=urlunsplit((parts.scheme,parts.netloc.rsplit('@',1)[-1],parts.path,urlencode([(k,'[REDACTED]' if SECRET.match(k) else v) for k,v in parse_qsl(parts.query,keep_blank_values=True)]),''))
    return {'layer':'relay-provider','startedAt':time.time(),'request':{'method':'POST','url':safe,'headers':clean(dict(headers)),'body':body(payload)}}

def response(record,status,headers,payload):
    record['response']={'status':status,'headers':clean(dict(headers)),'body':body(payload)}
    record['elapsedMs']=round((time.time()-record['startedAt'])*1000)
