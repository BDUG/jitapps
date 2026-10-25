"""Google limited-input device authorization. OAuth secrets and device codes never reach the browser."""
import json
import os
from pathlib import Path
import re
import secrets
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

GUIDE='https://developers.google.com/identity/protocols/oauth2/limited-input-device'

class ProviderError(RuntimeError):pass

def request(url,fields=None,access_token=None):
    allowed={'https://oauth2.googleapis.com/device/code','https://oauth2.googleapis.com/token','https://openidconnect.googleapis.com/v1/userinfo'}
    if url not in allowed:raise ValueError('Unsupported Google device endpoint')
    headers={'Accept':'application/json'};body=None
    if fields is not None:body=urllib.parse.urlencode(fields).encode();headers['Content-Type']='application/x-www-form-urlencoded'
    if access_token:headers['Authorization']='Bearer '+access_token
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args,**kwargs):raise ProviderError('Google returned an unexpected redirect')
    try:
        response=urllib.request.build_opener(NoRedirect()).open(urllib.request.Request(url,data=body,headers=headers),timeout=15)
    except urllib.error.HTTPError as error:response=error
    except (OSError,urllib.error.URLError) as error:raise ProviderError('Google could not be reached. Check server connectivity and TLS trust; retry before the code expires.') from error
    try:
        with response:
            raw=response.read(65537)
            if len(raw)>65536:raise ValueError('Oversized Google response')
            value=json.loads(raw)
        if not isinstance(value,dict):raise ValueError('Expected Google JSON')
        if response.status>=400 and not value.get('error'):raise ValueError('Google request failed')
        return value
    except (ValueError,UnicodeError) as error:raise ProviderError('Google returned an unreadable device authorization response') from error

class DeviceLogin:
    def __init__(self,path,transport=request,clock=time.monotonic):
        self.path=Path(path);self.transport=transport;self.clock=clock;self.lock=threading.RLock();self.grants={};self.revision=0
    def config(self):
        if self.path.is_symlink():raise ValueError('Google device configuration cannot be a symlink')
        if not self.path.exists():return {}
        value=json.loads(self.path.read_text())
        if not isinstance(value,dict):raise ValueError('Invalid Google device configuration')
        return value
    def status(self):
        with self.lock:
            value=self.config();return {'configured':bool(value.get('clientId') and value.get('clientSecret')),'clientId':value.get('clientId',''),'hasSecret':bool(value.get('clientSecret')),'scopes':['openid','email','profile'],'guide':GUIDE}
    def configure(self,data):
        with self.lock:
            previous=self.config();client=data.get('clientId');secret=data.get('clientSecret')
            if not isinstance(client,str) or not re.fullmatch(r'[\w.-]+\.apps\.googleusercontent\.com',client):raise ValueError('Enter a TVs and Limited Input devices OAuth client ID')
            if secret=='' and client==previous.get('clientId'):secret=previous.get('clientSecret')
            if not isinstance(secret,str) or not 1<=len(secret)<=4096:raise ValueError('Enter the device OAuth client secret; it is saved only on the server')
            self.path.parent.mkdir(parents=True,exist_ok=True)
            fd,name=tempfile.mkstemp(prefix='.google-device-',dir=self.path.parent)
            try:
                with os.fdopen(fd,'w') as file:json.dump({'clientId':client,'clientSecret':secret},file)
                os.replace(name,self.path)
            finally:
                if os.path.exists(name):os.unlink(name)
            self.grants.clear();self.revision+=1
            return self.status()
    @staticmethod
    def failure(code):
        messages={'invalid_client':'Google rejected the device client. Use a TVs and Limited Input devices client and its matching secret.','unauthorized_client':'Google does not permit the device flow for this client. Check its type and eligibility.','invalid_scope':'Google rejected the requested sign-in scopes.','access_denied':'Google authorization was denied.','expired_token':'This device code expired. Request a new code.','invalid_grant':'The device grant is no longer valid. Request a new code.'}
        return messages.get(code,'Google could not complete device authorization. Request a new code or check the client configuration.')
    def start(self):
        with self.lock:
            cfg=self.config();revision=self.revision;now=self.clock();self.grants={id:g for id,g in self.grants.items() if g['deadline']>now}
            if not cfg.get('clientId') or not cfg.get('clientSecret'):raise ValueError('Configure the device OAuth client ID and secret first')
            if len(self.grants)>=10:raise ValueError('Too many pending device codes. Cancel a code or wait for expiry.')
        value=self.transport('https://oauth2.googleapis.com/device/code',{'client_id':cfg['clientId'],'scope':'openid email profile'})
        if value.get('error'):raise ValueError(self.failure(value['error']))
        uri=value.get('verification_uri') or value.get('verification_url');parsed=urllib.parse.urlsplit(uri or '')
        if parsed.scheme!='https' or parsed.hostname not in {'www.google.com','google.com','accounts.google.com'} or parsed.username or parsed.password or parsed.port not in (None,443):raise ProviderError('Google returned an unexpected verification address')
        code=value.get('device_code');user=value.get('user_code');lifetime=value.get('expires_in');interval=value.get('interval',5)
        if not isinstance(code,str) or not 1<=len(code)<=4096 or not isinstance(user,str) or not re.fullmatch(r'[A-Za-z0-9 -]{1,100}',user) or type(lifetime) is not int or not 1<=lifetime<=3600 or type(interval) is not int or not 1<=interval<=300:raise ProviderError('Google returned invalid device authorization details')
        id=secrets.token_urlsafe(32)
        with self.lock:
            if self.revision!=revision:raise ValueError('Device configuration changed. Request a new code.')
            if len(self.grants)>=10:raise ValueError('Too many pending device codes. Cancel a code or wait for expiry.')
            self.grants[id]={'cfg':cfg,'code':code,'deadline':self.clock()+lifetime,'next':self.clock()+interval,'interval':interval,'busy':False}
        return {'state':'pending','session':id,'userCode':user,'verificationUrl':uri,'expiresIn':lifetime,'interval':interval}
    def cancel(self,id):
        with self.lock:self.grants.pop(id,None)
        return {'state':'cancelled'}
    def poll(self,id):
        with self.lock:
            grant=self.grants.get(id)
            if not grant:raise ValueError('Device sign-in was cancelled, completed or expired. Request a new code.')
            now=self.clock()
            if now>=grant['deadline']:self.grants.pop(id,None);return {'state':'expired','message':self.failure('expired_token')}
            if grant['busy'] or now<grant['next']:return {'state':'pending','interval':max(1,int(grant['next']-now+.999))}
            grant['busy']=True;grant['next']=now+grant['interval'];cfg=grant['cfg']
        try:
            value=self.transport('https://oauth2.googleapis.com/token',{'client_id':cfg['clientId'],'client_secret':cfg['clientSecret'],'device_code':grant['code'],'grant_type':'urn:ietf:params:oauth:grant-type:device_code'})
            with self.lock:
                if self.grants.get(id) is not grant:return {'state':'cancelled'}
                error=value.get('error')
                if error in {'authorization_pending','slow_down'}:
                    if error=='slow_down':grant['interval']+=5
                    grant['next']=self.clock()+grant['interval'];return {'state':'pending','interval':grant['interval']}
                if error:self.grants.pop(id,None);return {'state':'failed','message':self.failure(error)}
            token=value.get('access_token');duration=value.get('expires_in')
            if not isinstance(token,str) or not token or type(duration) is not int or not 1<=duration<=86400:raise ProviderError('Google returned invalid sign-in credentials')
            # Bind identity to the access token returned for this server-owned device grant.
            try:
                identity=self.transport('https://openidconnect.googleapis.com/v1/userinfo',access_token=token)
                if not isinstance(identity.get('sub'),str) or not identity['sub'] or identity.get('email_verified') is not True or not isinstance(identity.get('email'),str):raise ProviderError('Google did not return a verified account')
            except ProviderError:
                with self.lock:self.grants.pop(id,None)
                return {'state':'failed','message':'Google approved the request but account verification failed. Request a new code.'}
            with self.lock:
                if self.grants.get(id) is not grant:return {'state':'cancelled'}
                self.grants.pop(id,None)
            return {'state':'complete','profile':{'sub':identity['sub'],'name':str(identity.get('name') or identity['email'])[:200],'email':identity['email'][:320],'expiresAt':int((time.time()+duration)*1000),'clientId':cfg['clientId'],'verified':True,'method':'device'}}
        finally:
            with self.lock:grant['busy']=False
    def dispatch(self,data):
        if not isinstance(data,dict):raise ValueError('Expected a device sign-in request')
        op=data.get('op','status')
        if op=='status':return self.status()
        if op=='configure':return self.configure(data)
        if op=='start':return self.start()
        id=data.get('session')
        if not isinstance(id,str) or not re.fullmatch(r'[\w-]{30,100}',id):raise ValueError('Invalid device session')
        if op=='poll':return self.poll(id)
        if op=='cancel':return self.cancel(id)
        raise ValueError('Unknown Google device operation')
