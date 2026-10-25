"""Validated provider-neutral media parts; inline bytes never become text prompts."""
import base64
import binascii
import re
import io
import wave
import urllib.parse

IMAGE_TYPES={'image/png','image/jpeg','image/webp','image/gif'}
AUDIO={'wav':'audio/wav','mp3':'audio/mpeg','ogg':'audio/ogg','pcm16':'audio/L16','flac':'audio/flac','aac':'audio/aac','opus':'audio/ogg'}

def encoded(value):
    if not isinstance(value,str) or not value:raise ValueError('Media needs nonempty base64 data')
    try:base64.b64decode(value,validate=True)
    except (binascii.Error,ValueError):raise ValueError('Media contains invalid base64 data') from None
    return value

def inline(value,allowed=None):
    if not isinstance(value,str):raise ValueError('Use an inline base64 media data URL')
    match=re.fullmatch(r'data:([\w.+-]+/[\w.+-]+);base64,([A-Za-z0-9+/=]+)',value)
    if not match or allowed is not None and match[1] not in allowed:raise ValueError('Unsupported inline media type')
    encoded(match[2]);return match[1],match[2]

def name(value):return re.sub(r'[\x00-\x1f/\\]','_',str(value or 'media'))

def messages(value):
    if not isinstance(value,list) or not value:raise ValueError('Expected conversation messages with role and content')
    result=[]
    for message in value:
        if not isinstance(message,dict) or set(message)!={'role','content'} or message['role'] not in {'system','user','assistant'}:raise ValueError('Expected conversation messages with role and content')
        content=message['content']
        if isinstance(content,str):result.append(dict(message));continue
        if not isinstance(content,list) or not content or message['role']=='system':raise ValueError('Multimodal content must be a nonempty user/assistant content-part array; system messages remain text')
        parts=[]
        for part in content:
            if not isinstance(part,dict):raise ValueError('Invalid multimodal content part')
            kind=part.get('type')
            if kind=='text' and set(part)=={'type','text'} and isinstance(part['text'],str):parts.append(dict(part))
            elif kind=='image_url' and set(part)=={'type','image_url'} and isinstance(part['image_url'],dict) and set(part['image_url'])<= {'url','detail'}:
                image=part['image_url'];inline(image.get('url'),IMAGE_TYPES)
                if image.get('detail','auto') not in {'auto','low','high'}:raise ValueError('Invalid image detail')
                parts.append({'type':kind,'image_url':dict(image)})
            elif kind=='input_audio' and set(part)=={'type','input_audio'} and isinstance(part['input_audio'],dict) and set(part['input_audio'])=={'data','format'}:
                audio=part['input_audio']
                if audio['format'] not in {'wav','mp3'}:raise ValueError('Audio input must be WAV or MP3')
                encoded(audio['data']);parts.append({'type':kind,'input_audio':dict(audio)})
            elif kind=='file' and set(part)=={'type','file'} and isinstance(part['file'],dict) and set(part['file'])=={'filename','file_data'}:
                file=part['file'];inline(file['file_data'],{'application/pdf'})
                if not isinstance(file['filename'],str) or not file['filename']:raise ValueError('PDF needs a file name')
                parts.append({'type':kind,'file':{'filename':name(file['filename']),'file_data':file['file_data']}})
            else:raise ValueError('Unsupported multimodal content part. Use text, inline PNG/JPEG/WebP/GIF, WAV/MP3 audio, or PDF.')
        result.append({'role':message['role'],'content':parts})
    return result

def text(content):return content if isinstance(content,str) else '\n'.join(p['text'] for p in content if p.get('type')=='text')
def binary(messages):return any(isinstance(m['content'],list) and any(p['type']!='text' for p in m['content']) for m in messages)
def gemini_parts(content):
    if isinstance(content,str):return [{'text':content}]
    result=[]
    for p in content:
        if p['type']=='text':result.append({'text':p['text']});continue
        if p['type']=='image_url':mime,data=inline(p['image_url']['url'])
        elif p['type']=='file':mime,data=inline(p['file']['file_data'])
        else:mime,data=AUDIO[p['input_audio']['format']],p['input_audio']['data']
        result.append({'inlineData':{'mimeType':mime,'data':data}})
    return result

def media_item(value,index=0):
    if not isinstance(value,dict):raise ValueError('Invalid provider media')
    mime=value.get('mimeType','application/octet-stream')
    if not isinstance(mime,str) or not re.fullmatch(r'[\w.+-]+/[\w.+-]+',mime):raise ValueError('Invalid provider media type')
    source=value.get('dataUrl')
    if source is not None:
        actual,_=inline(source)
        if actual!=mime:raise ValueError('Provider media MIME types differ')
    else:
        source=value.get('url');u=urllib.parse.urlsplit(source) if isinstance(source,str) else None
        if not u or u.scheme!='https' or not u.hostname or u.username or u.password or any(ord(c)<33 for c in source):raise ValueError('Provider media needs inline data or an HTTPS URL without credentials')
    kind='image' if mime.startswith('image/') else 'audio' if mime.startswith('audio/') else 'video' if mime.startswith('video/') else 'file'
    extension={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','image/svg+xml':'svg','application/pdf':'pdf','audio/wav':'wav','audio/mpeg':'mp3','audio/ogg':'ogg','video/mp4':'mp4','video/webm':'webm'}.get(mime,'bin')
    return {'kind':kind,'mimeType':mime,'name':name(value.get('name') or f'response-{index+1}.{extension}'),**({'dataUrl':source} if 'dataUrl' in value else {'url':source})}

def playable(mime,data):
    if not isinstance(mime,str):raise ValueError('Missing media MIME type')
    pieces=[piece.strip() for piece in mime.split(';')];base=pieces[0]
    if base.lower() in {'audio/l16','audio/pcm','audio/pcm16'}:
        params={}
        for parameter in pieces[1:]:
            if '=' not in parameter:raise ValueError('Invalid PCM parameters')
            key,value=parameter.split('=',1);params[key.strip().lower()]=value.strip().strip('"')
        if params.get('codec','pcm').lower() not in {'pcm','pcm16','linear16'}:raise ValueError('Unsupported PCM codec')
        rate=int(params.get('rate','24000'));channels=int(params.get('channels','1'))
        if not 8000<=rate<=192000 or not 1<=channels<=8:raise ValueError('Invalid PCM rate/channels')
        raw=base64.b64decode(encoded(data),validate=True)
        if len(raw)%(channels*2):raise ValueError('Incomplete PCM samples')
        stream=io.BytesIO()
        with wave.open(stream,'wb') as out:out.setnchannels(channels);out.setsampwidth(2);out.setframerate(rate);out.writeframes(raw)
        return 'audio/wav',base64.b64encode(stream.getvalue()).decode('ascii')
    return base,data

def output(profile,data):
    """Collect actual provider output media; no remote fetch or executable markup."""
    result=[]
    def add(mime,encoded_data=None,url=None,filename=None):
        if encoded_data is not None:
            mime,encoded_data=playable(mime,encoded_data)
            result.append(media_item({'mimeType':mime,'dataUrl':f'data:{mime};base64,{encoded(encoded_data)}','name':filename},len(result)))
        elif url:
            if url.startswith('data:'):mime,_=inline(url);result.append(media_item({'mimeType':mime,'dataUrl':url,'name':filename},len(result)))
            else:result.append(media_item({'mimeType':mime,'url':url,'name':filename},len(result)))
        else:raise ValueError('Provider media is missing data')
    if profile['protocol']=='gemini':
        candidates=data.get('candidates') or [];candidate=candidates[0] if candidates and isinstance(candidates[0],dict) else {}
        for p in (candidate.get('content') or {}).get('parts') or []:
            if not isinstance(p,dict) or p.get('thought'):continue
            content=p.get('inlineData') or p.get('inline_data')
            if isinstance(content,dict):add(content.get('mimeType') or content.get('mime_type'),content.get('data'))
    elif profile['protocol']!='eden-v2':
        choices=data.get('choices') or [];message=(choices[0].get('message') or {}) if choices and isinstance(choices[0],dict) else {}
        parts=message.get('content') if isinstance(message.get('content'),list) else []
        for p in [*parts,*(message.get('images') or [])]:
            if not isinstance(p,dict):continue
            image=p.get('image_url')
            if isinstance(image,dict):add('image/png',url=image.get('url'))
            if p.get('type')=='file' and isinstance(p.get('file'),dict):
                f=p['file'];add('application/octet-stream',url=f.get('file_data') or f.get('url'),filename=f.get('filename'))
            if p.get('type') in {'audio','output_audio'} and isinstance(p.get('audio'),dict):
                a=p['audio'];add(AUDIO.get(a.get('format','wav'),'audio/wav'),a.get('data'))
        audio=message.get('audio')
        if isinstance(audio,dict) and audio.get('data'):add(AUDIO.get(audio.get('format','wav'),'audio/wav'),audio['data'])
    unique={}
    for item in result:unique.setdefault(item.get('dataUrl') or item.get('url'),item)
    return list(unique.values())
