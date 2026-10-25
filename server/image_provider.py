"""Server-owned OpenAI-compatible image generation/editing adapter."""
import base64
import binascii
import json
import os
from pathlib import Path
import ssl
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import uuid

DEFAULT={'generationEndpoint':'https://api.openai.com/v1/images/generations','editEndpoint':'https://api.openai.com/v1/images/edits','model':'gpt-image-1','apiKey':''}

def config_path(server):
    return server.store.path.with_name(server.store.path.stem+'.images.json')

def load(server,secrets=False):
    path=config_path(server)
    value=json.loads(path.read_text()) if path.exists() else dict(DEFAULT)
    if not secrets:
        value['hasApiKey']=bool(value.pop('apiKey',''))
    return value

def normalize(value,old):
    if not isinstance(value,dict):raise ValueError('Expected image provider settings')
    result={k:value.get(k,DEFAULT[k]) for k in DEFAULT if k!='apiKey'}
    for key in ('generationEndpoint','editEndpoint'):
        url=result[key]
        if not isinstance(url,str) or len(url)>2000 or any(c.isspace() or ord(c)<32 for c in url):raise ValueError('Invalid image endpoint')
        parsed=urllib.parse.urlsplit(url)
        if (parsed.scheme!='https' and not(parsed.scheme=='http' and parsed.hostname in {'localhost','127.0.0.1','::1'})) or not parsed.hostname or parsed.username or parsed.password or parsed.fragment:raise ValueError('Image endpoints require HTTPS or loopback HTTP without URL credentials')
    if not isinstance(result['model'],str) or not result['model'].strip() or len(result['model'])>200:raise ValueError('Enter an image model')
    result['apiKey']=value.get('apiKey',old.get('apiKey','') if all(result[k]==old.get(k) for k in ('generationEndpoint','editEndpoint')) else '')
    if not isinstance(result['apiKey'],str) or len(result['apiKey'])>10000 or any(c in result['apiKey'] for c in '\r\n\0'):raise ValueError('Invalid image API key')
    return result

def save(server,value):
    result=normalize(value,load(server,True));path=config_path(server);path.parent.mkdir(parents=True,exist_ok=True)
    fd,name=tempfile.mkstemp(dir=path.parent,prefix='.images-',suffix='.tmp')
    try:
        os.chmod(name,0o600)
        with os.fdopen(fd,'w') as f:json.dump(result,f,indent=2)
        os.replace(name,path)
    finally:
        if os.path.exists(name):os.unlink(name)
    return load(server)

def png(value):
    if not isinstance(value,str) or not value.startswith('data:image/png;base64,'):raise ValueError('Image inputs must be PNG data URLs')
    try:raw=base64.b64decode(value.split(',',1)[1],validate=True)
    except (ValueError,binascii.Error):raise ValueError('Invalid PNG encoding')
    if not raw.startswith(b'\x89PNG\r\n\x1a\n') or len(raw)<24:raise ValueError('Invalid PNG image')
    w=int.from_bytes(raw[16:20],'big');h=int.from_bytes(raw[20:24],'big')
    if not 1<=w<=8192 or not 1<=h<=8192 or w*h>33554432:raise ValueError('Image dimensions exceed editing limits')
    return raw,(w,h)

def build(config,data):
    if not isinstance(data,dict) or data.get('operation') not in {'generate','edit'}:raise ValueError('Choose generation or image editing')
    prompt=data.get('prompt')
    if not isinstance(prompt,str) or not prompt.strip() or len(prompt)>12000:raise ValueError('Enter an image prompt of at most 12000 characters')
    fields={'model':config['model'],'prompt':prompt,'n':1}
    if data.get('transparent') is True:fields['background']='transparent'
    headers={}
    if config.get('apiKey'):headers['Authorization']='Bearer '+config['apiKey']
    if data['operation']=='generate':
        headers['Content-Type']='application/json'
        return config['generationEndpoint'],headers,json.dumps(fields).encode()
    image,dimensions=png(data.get('image'));mask,mask_dimensions=png(data.get('mask'))
    if dimensions!=mask_dimensions:raise ValueError('Image and mask dimensions must match')
    files=[('image[]','image.png',image),('mask','mask.png',mask)]
    if data.get('reference'):
        reference,_=png(data['reference']);files.append(('image[]','reference.png',reference))
    boundary='photix-'+uuid.uuid4().hex;chunks=[]
    for key,value in fields.items():chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode())
    for key,name,body in files:chunks.extend([f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"; filename="{name}"\r\nContent-Type: image/png\r\n\r\n'.encode(),body,b'\r\n'])
    chunks.append(f'--{boundary}--\r\n'.encode());headers['Content-Type']='multipart/form-data; boundary='+boundary
    return config['editEndpoint'],headers,b''.join(chunks)

def render(server,data):
    from .relay import NoRedirect
    config=load(server,True);url,headers,body=build(config,data)
    opener=urllib.request.build_opener(NoRedirect(),urllib.request.HTTPSHandler(context=ssl.create_default_context()))
    try:
        with opener.open(urllib.request.Request(url,data=body,headers=headers,method='POST'),timeout=180) as response:
            raw=response.read(50*1024*1024+1)
        if len(raw)>50*1024*1024:raise ValueError('Provider image exceeds 50 MB')
        result=json.loads(raw);encoded=result['data'][0]['b64_json'];image='data:image/png;base64,'+encoded
        png(image)
        return {'image':image}
    except urllib.error.HTTPError as e:raise ValueError(f'Image provider returned HTTP {e.code}. Check the image endpoint, image model, key, quota and mask support in relay settings.')
    except (urllib.error.URLError,TimeoutError,OSError):raise ValueError('Image provider connection failed. Check relay network access, TLS trust and image endpoint.')
    except (KeyError,IndexError,TypeError,json.JSONDecodeError):raise ValueError('Image provider must return data[0].b64_json with a PNG image. URL-only and chat responses are unsupported.')
