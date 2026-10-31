"""Provider configuration and protocol adapters owned exclusively by the relay."""
import json
import os
from pathlib import Path
import tempfile
import threading
import urllib.parse
from server import multimodal

TEMPLATES = {
 'openai': ('OpenAI', 'openai', 'https://api.openai.com/v1/chat/completions', 'gpt-4o-mini'),
 'gemini': ('Google Gemini', 'gemini', 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent', 'gemini-2.5-flash'),
 'litellm': ('LiteLLM', 'openai', 'http://localhost:4000/v1/chat/completions', 'gpt-4o-mini'),
 'edenai': ('Eden AI', 'openai', 'https://api.edenai.run/v3/llm/chat/completions', 'openai/gpt-4o-mini'),
 'openrouter': ('OpenRouter', 'openai', 'https://openrouter.ai/api/v1/chat/completions', 'openai/gpt-4o-mini'),
}
def preset(provider):
    name, protocol, endpoint, model = TEMPLATES[provider]
    return dict(id=provider, provider=provider, name=name, protocol=protocol, endpoint=endpoint, model=model, apiKey='', upstreamProvider='openai', maxTokens=4096, tokenLimitEnabled=True, temperature=0.2,inputModalities=['text'])

def normalize(data, previous=None):
    if not isinstance(data, dict) or data.get('format') not in {'architex-relay-providers','architex-provider-configs'} or data.get('version') != 1:
        raise ValueError('Expected relay provider configuration version 1')
    profiles = data.get('profiles')
    if not isinstance(profiles, list) or not 1 <= len(profiles) <= 30:
        raise ValueError('Configure between 1 and 30 provider profiles')
    result = []
    for raw in profiles:
        if not isinstance(raw,dict) or raw.get('provider') not in TEMPLATES:
            raise ValueError('Unknown provider')
        p = {k: raw.get(k) for k in preset(raw['provider'])}
        p['inputModalities']=raw.get('inputModalities',['text'])
        if not isinstance(p['inputModalities'],list) or not p['inputModalities'] or any(not isinstance(m,str) or m not in {'text','image','audio','file'} for m in p['inputModalities']):raise ValueError('Invalid provider input modalities')
        p['inputModalities']=sorted(set(['text',*p['inputModalities']]))
        p['tokenLimitEnabled']=raw.get('tokenLimitEnabled',True)
        if type(p['tokenLimitEnabled']) is not bool:
            raise ValueError('Token limit enabled must be true or false')
        for field in ['id','name','endpoint','model','protocol','upstreamProvider']:
            if not isinstance(p[field],str) or not p[field].strip() or len(p[field]) > (2000 if field=='endpoint' else 200):
                raise ValueError('Invalid provider '+field)
        if p['protocol'] not in {'openai','gemini','eden-v2'} or not p['upstreamProvider'].replace('-','').replace('_','').isalnum():
            raise ValueError('Invalid provider protocol or upstream')
        if type(p['maxTokens']) is not int or not 1 <= p['maxTokens'] <= 32768 or type(p['temperature']) not in (int,float) or not 0 <= p['temperature'] <= 2:
            raise ValueError('Invalid token limit or temperature')
        old = next((old for old in (previous or {}).get('profiles',[]) if old['id']==p['id']),None)
        # Omission retains a stored key only for the same destination and provider.
        if 'apiKey' not in raw:
            p['apiKey'] = old['apiKey'] if old and all(old[k]==p[k] for k in ['provider','endpoint','protocol']) else ''
        if not isinstance(p['apiKey'],str) or len(p['apiKey'])>10000 or any(c in p['apiKey'] for c in '\r\n\0'):
            raise ValueError('Invalid API key')
        endpoint(p)
        result.append(p)
    ids = {p['id'] for p in result}
    if len(ids)!=len(result) or data.get('activeProfileId') not in ids:
        raise ValueError('Duplicate profile IDs or unknown active profile')
    origins=data.get('allowedOrigins',[])
    if not isinstance(origins,list) or len(origins)>30 or any(not isinstance(o,str) for o in origins):
        raise ValueError('Invalid allowed origins')
    handoff=data.get('agentHandoff',{'mode':'shadow','primaryProfileId':'','continuationProfileId':'','detectorProfileId':''})
    if not isinstance(handoff,dict) or set(handoff)-{'mode','primaryProfileId','continuationProfileId','detectorProfileId'} or handoff.get('mode','shadow') not in {'off','shadow','auto'}:raise ValueError('Invalid agent handoff configuration')
    handoff={key:handoff.get(key,default) for key,default in [('mode','shadow'),('primaryProfileId',''),('continuationProfileId',''),('detectorProfileId','')]}
    for key in ('primaryProfileId','continuationProfileId','detectorProfileId'):
        if not isinstance(handoff[key],str) or handoff[key] and handoff[key] not in ids:raise ValueError('Unknown handoff provider profile')
    if handoff['continuationProfileId'] and handoff['continuationProfileId']==(handoff['primaryProfileId'] or data['activeProfileId']):raise ValueError('Choose distinct primary and continuation profiles')
    collaboration=data.get('agentCollaboration',{})
    if not isinstance(collaboration,dict) or set(collaboration)-{'mode','members','maxConsultations','interval'}:raise ValueError('Invalid agent collaboration configuration')
    collaboration={'mode':collaboration.get('mode','off'),'members':collaboration.get('members',[]),'maxConsultations':collaboration.get('maxConsultations',2),'interval':collaboration.get('interval',5)}
    if not isinstance(collaboration['mode'],str) or collaboration['mode'] not in {'off','adaptive','always'} or type(collaboration['maxConsultations']) is not int or not 1<=collaboration['maxConsultations']<=8 or type(collaboration['interval']) is not int or not 1<=collaboration['interval']<=1000:raise ValueError('Invalid collaboration strategy or consultation budget')
    members=collaboration['members']
    if not isinstance(members,list) or any(not isinstance(member,dict) or set(member)!={'profileId','role'} or not isinstance(member['profileId'],str) or member['profileId'] not in ids or not isinstance(member['role'],str) or member['role'] not in {'solver','critic'} for member in members):raise ValueError('Choose saved solver or critic profiles')
    if len({member['profileId'] for member in members})!=len(members):raise ValueError('Duplicate collaboration profile')
    return dict(format='architex-relay-providers',version=1,activeProfileId=data['activeProfileId'],profiles=result,allowedOrigins=origins,agentHandoff=handoff,agentCollaboration=collaboration)

def endpoint(p):
    value=p['endpoint'].replace('{model}',urllib.parse.quote(p['model'],safe=''))
    if any(c.isspace() or ord(c)<32 or ord(c)==127 for c in value):
        raise ValueError('Provider endpoint must be a plain URL without spaces or control characters')
    u=urllib.parse.urlsplit(value)
    if u.scheme!='https' and not (u.scheme=='http' and u.hostname in {'localhost','127.0.0.1','::1'}):
        raise ValueError('Provider endpoint requires HTTPS or loopback HTTP')
    if not u.hostname or u.username or u.password or u.fragment:
        raise ValueError('Invalid provider endpoint URL')
    return value

def build(p,messages,modalities=None):
    messages=multimodal.messages(messages)
    if modalities is not None and modalities not in (['text'],['text','image'],['text','audio']):raise ValueError('Use text, text+image or text+audio response modalities')
    if p['protocol']=='eden-v2' and (multimodal.binary(messages) or modalities not in (None,['text'])):raise ValueError('Eden v2 text chat does not support multimodal input/output. Choose the OpenAI-compatible Eden v3 protocol or another multimodal provider/model.')
    if not p['apiKey'] and p['provider']!='litellm':
        raise ValueError('Configure an API key in the relay provider settings')
    headers={'Content-Type':'application/json'}
    if p['protocol']=='gemini':
        headers['x-goog-api-key']=p['apiKey']
        body=dict(systemInstruction={'parts':[{'text':'\n\n'.join(multimodal.text(m['content']) for m in messages if m['role']=='system')}]},contents=[{'role':'model' if m['role']=='assistant' else 'user','parts':multimodal.gemini_parts(m['content'])} for m in messages if m['role']!='system'],generationConfig={'temperature':p['temperature'],'maxOutputTokens':p['maxTokens']})
    elif p['protocol']=='eden-v2':
        headers['Authorization']='Bearer '+p['apiKey']
        turns=[m for m in messages if m['role']!='system']
        if not turns or turns[-1]['role']!='user': raise ValueError('Eden v2 requires a final user message')
        model=p['model'].removeprefix(p['upstreamProvider']+'/')
        body=dict(providers=[p['upstreamProvider']],text=multimodal.text(turns[-1]['content']),chatbot_global_action='\n\n'.join(multimodal.text(m['content']) for m in messages if m['role']=='system'),previous_history=[{'role':m['role'],'message':multimodal.text(m['content'])} for m in turns[:-1]],temperature=p['temperature'],max_tokens=p['maxTokens'],settings={p['upstreamProvider']:model})
    else:
        if p['apiKey']: headers['Authorization']='Bearer '+p['apiKey']
        if p['provider']=='openrouter': headers['X-Title']='Architex relay'
        body=dict(model=p['model'],messages=messages,stream=False)
        model_name=p['model'].lower().removeprefix('openai/')
        deployment=urllib.parse.urlsplit(endpoint(p)).path.lower().split('/deployments/')[-1].split('/')[0]
        if model_name.startswith('gpt-5') or deployment.startswith('gpt-5'):
            body['max_completion_tokens']=p['maxTokens']
        else:
            body.update(temperature=p['temperature'],max_tokens=p['maxTokens'])
    if modalities and modalities!=['text']:
        if p['protocol']=='gemini':body['generationConfig']['responseModalities']=['TEXT','IMAGE'] if 'image' in modalities else ['AUDIO']
        elif p['protocol']=='openai':
            body['modalities']=modalities
            if 'audio' in modalities:body['audio']={'voice':'alloy','format':'wav'}
    if not p.get('tokenLimitEnabled',True):
        body.pop('max_tokens',None)
        body.pop('max_completion_tokens',None)
        if p['protocol']=='gemini':
            body['generationConfig'].pop('maxOutputTokens',None)
    return dict(url=endpoint(p),headers=headers,body=body)

class ProviderResponseError(ValueError):
    """A safe diagnostic that contains no upstream body or credential values."""
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def response_text(p, data, allow_media=False):
    def fail(code, message):
        raise ProviderResponseError(code, message)
    if not isinstance(data, dict):
        fail('provider_response_invalid', 'Provider returned an unexpected response shape. Check the endpoint and protocol in relay settings.')
    if data.get('error'):
        fail('provider_error', 'Provider reported an error inside its response. Test the provider in relay settings and check model availability, credentials and quota.')
    text = None
    if p['protocol'] == 'gemini':
        if (data.get('promptFeedback') or {}).get('blockReason'):
            fail('provider_blocked', 'Provider blocked the request. Revise the prompt or supplied app content.')
        candidates = data.get('candidates') or []
        if not isinstance(candidates,list) or candidates and not isinstance(candidates[0],dict):fail('provider_response_invalid','Provider returned invalid candidate data. Check the endpoint and model protocol.')
        candidate = candidates[0] if candidates and isinstance(candidates[0], dict) else {}
        reason = candidate.get('finishReason')
        if reason == 'MAX_TOKENS':
            fail('provider_output_limit', 'Provider reached the output token limit. Increase Max tokens in relay settings or request a smaller app or change.')
        if reason in {'SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII'}:
            fail('provider_blocked', 'Provider blocked the response. Revise the prompt or supplied app content.')
        content=candidate.get('content') or {}
        if not isinstance(content,dict):fail('provider_response_invalid','Provider returned invalid content data. Check the endpoint and model protocol.')
        parts=content.get('parts') or []
        if not isinstance(parts,list):fail('provider_response_invalid','Provider returned invalid content parts. Check the endpoint and model protocol.')
        text = '\n'.join(item['text'] for item in parts if isinstance(item, dict) and isinstance(item.get('text'), str) and not item.get('thought'))
    elif p['protocol'] == 'eden-v2':
        result = data.get(p['upstreamProvider']) or {}
        if not isinstance(result, dict):
            fail('provider_response_invalid', 'Provider returned an unexpected response shape. Check the endpoint and protocol in relay settings.')
        if result.get('status') == 'fail' or result.get('error'):
            fail('provider_error', 'Eden AI reported an upstream model error. Check the upstream provider, model, credentials and quota in relay settings.')
        text = result.get('generated_text')
    else:
        choices = data.get('choices') or []
        if not isinstance(choices,list) or choices and not isinstance(choices[0],dict):fail('provider_response_invalid','Provider returned invalid choice data. Check the endpoint and model protocol.')
        choice = choices[0] if choices and isinstance(choices[0], dict) else {}
        message=choice.get('message') or {}
        if not isinstance(message,dict):fail('provider_response_invalid','Provider returned invalid message data. Check the endpoint and model protocol.')
        if message.get('refusal') or isinstance(message.get('content'),list) and any(isinstance(item,dict) and item.get('type')=='refusal' for item in message['content']):
            fail('provider_blocked', 'Provider declined or filtered the response. Revise the prompt or supplied app content.')
        if choice.get('finish_reason') == 'length':
            fail('provider_output_limit', 'Provider reached the output token limit. Increase Max tokens in relay settings or request a smaller app or change.')
        message = choice.get('message') or {}
        if choice.get('finish_reason') == 'content_filter' or message.get('refusal'):
            fail('provider_blocked', 'Provider declined or filtered the response. Revise the prompt or supplied app content.')
        text = message.get('content')
        if not text and isinstance(message.get('audio'),dict):text=message['audio'].get('transcript')
        if isinstance(text, list):
            if any(isinstance(item,dict) and item.get('type')=='refusal' for item in text):fail('provider_blocked','Provider declined or filtered the response. Revise the prompt or supplied app content.')
            text = '\n'.join(item['text'] for item in text if isinstance(item, dict) and item.get('type') == 'text' and isinstance(item.get('text'), str))
    if (not isinstance(text,str) or not text.strip()) and allow_media:
        return ''
    if not isinstance(text, str) or not text.strip():
        fail('provider_empty_response', 'Provider returned no answer text. Check the model and protocol in relay settings; reasoning models may need a larger Max tokens budget.')
    return text

def response_content(p,data):
    limit=None
    try:text=response_text(p,data,allow_media=True)
    except ProviderResponseError as error:
        if error.code!='provider_output_limit':raise
        limit=error;text=''
    try:media=multimodal.output(p,data)
    except (ValueError,TypeError,AttributeError) as error:raise ProviderResponseError('provider_media_invalid','Provider returned invalid media. Check the model and response modality; no media was loaded.') from error
    if limit:
        if not media:raise limit
        if p['protocol']=='gemini':
            candidate=(data.get('candidates') or [{}])[0];partial='\n'.join(x.get('text','') for x in (candidate.get('content') or {}).get('parts',[]) if isinstance(x,dict) and isinstance(x.get('text'),str) and not x.get('thought'))
        else:
            message=(data.get('choices') or [{}])[0].get('message') or {};partial=message.get('content') or ''
            if isinstance(partial,list):partial='\n'.join(x.get('text','') for x in partial if isinstance(x,dict) and isinstance(x.get('text'),str) and x.get('type')=='text')
        return {'text':'','media':media,'incomplete':True,'partialText':partial if isinstance(partial,str) else '', 'warning':'Provider reached its output limit. Returned media is retained; partial text is not an executable plan or accepted edit.'}
    if not text.strip() and not media:response_text(p,data)
    raw_usage=data.get('usage') if isinstance(data.get('usage'),dict) else data.get('usageMetadata',{})
    if not isinstance(raw_usage,dict):raw_usage={}
    usage={}
    for key,aliases in [('prompt_tokens',('prompt_tokens','input_tokens','promptTokenCount')),('completion_tokens',('completion_tokens','output_tokens','candidatesTokenCount')),('total_tokens',('total_tokens','totalTokenCount'))]:
        value=next((raw_usage[name] for name in aliases if type(raw_usage.get(name)) is int and raw_usage[name]>=0),None)
        if value is not None:usage[key]=value
    return {'text':text,**({'media':media} if media else {}),**({'usage':usage} if usage else {})}

def profile_identity(profile):
    import hashlib
    keys=('id','endpoint','model','protocol','inputModalities','temperature','tokenLimitEnabled','maxTokens','upstreamProvider')
    revision=hashlib.sha256(json.dumps({key:profile.get(key) for key in keys},sort_keys=True).encode()).hexdigest()
    return profile['id']+'@'+revision

class Store:
    def __init__(self,path):
        self.path=Path(path)
        self.lock=threading.RLock()
        self.data=normalize(json.loads(self.path.read_text())) if self.path.exists() else dict(format='architex-relay-providers',version=1,activeProfileId='edenai',profiles=[preset(k) for k in TEMPLATES],allowedOrigins=[])
    def snapshot(self,secrets=False):
        with self.lock: result=json.loads(json.dumps(self.data))
        if not secrets:
            for p in result['profiles']:
                p['hasApiKey']=bool(p.pop('apiKey'))
        return result
    def active(self,profile_id=None):
        with self.lock:
            selected=profile_id if profile_id is not None else self.data['activeProfileId']
            profile=next((p for p in self.data['profiles'] if p['id']==selected),None)
            if profile is None:raise ValueError('Unknown provider profile')
            return dict(profile)
    def handoff(self):
        with self.lock:
            value=self.data.get('agentHandoff',{});roles={}
            for role,key in [('primary','primaryProfileId'),('continuation','continuationProfileId'),('detector','detectorProfileId')]:
                identity=value.get(key) or (self.data['activeProfileId'] if role=='primary' else '')
                profile=next((p for p in self.data['profiles'] if p['id']==identity),None)
                if profile:
                    roles[role]={'id':profile_identity(profile),'profileId':profile['id'],'modalities':profile.get('inputModalities',['text'])}
                else:roles[role]=None
            return {'mode':value.get('mode','shadow'),**roles}

    def collaboration(self):
        with self.lock:
            value=self.data.get('agentCollaboration',{'mode':'off','members':[],'maxConsultations':2,'interval':5})
            def reference(profile):
                return {'id':profile_identity(profile),'profileId':profile['id'],'name':profile['name'],'modalities':profile.get('inputModalities',['text'])}
            profiles={profile['id']:profile for profile in self.data['profiles']}
            return {'mode':value['mode'],'maxConsultations':value['maxConsultations'],'interval':value['interval'],'coordinator':reference(profiles[self.data['activeProfileId']]),'members':[{**reference(profiles[member['profileId']]),'role':member['role']} for member in value['members']]}

    def save(self,data,keep_keys=True):
        with self.lock:
            normalized=normalize(data,self.data if keep_keys else None)
            self.path.parent.mkdir(parents=True,exist_ok=True)
            fd,temp=tempfile.mkstemp(dir=self.path.parent,prefix='.relay-',suffix='.tmp')
            try:
                with os.fdopen(fd,'w') as stream: json.dump(normalized,stream,indent=2)
                os.chmod(temp,0o600)
                os.replace(temp,self.path)
            finally:
                if os.path.exists(temp): os.unlink(temp)
            self.data=normalized
