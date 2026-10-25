"""Optional Google Identity Services ID-token verification; no application login session."""
import json
import re
import threading
import time
from pathlib import Path

_lock=threading.Lock()
_cert_cache={}

class Unavailable(RuntimeError):pass

def verify(data,public_config):
    if not isinstance(data,dict):raise ValueError('Expected a sign-in request')
    credential=data.get('credential');client_id=data.get('clientId');nonce=data.get('nonce')
    if not isinstance(credential,str) or not 1<=len(credential)<=16000 or not isinstance(client_id,str) or not re.fullmatch(r'[\w.-]+\.apps\.googleusercontent\.com',client_id) or not isinstance(nonce,str) or not re.fullmatch(r'[a-zA-Z0-9_-]{20,200}',nonce):raise ValueError('Invalid Google sign-in request')
    try:configured=json.loads(Path(public_config).read_text()).get('clientId','').strip()
    except (OSError,ValueError,AttributeError,TypeError):configured=''
    if configured and configured!=client_id:raise ValueError('Use the configured Google OAuth client ID')
    try:
        from google.oauth2 import id_token
        from google.auth.transport.requests import Request
        from google.auth.exceptions import GoogleAuthError
    except ImportError as error:raise Unavailable('Google sign-in verification is not installed. Run python3 -m pip install -r server/requirements-google.txt and restart the server.') from error
    request=Request()
    def certificates(url,method='GET',**kwargs):
        # google-auth uses Google's fixed PEM certificate endpoint. Cache only those public keys.
        if url!='https://www.googleapis.com/oauth2/v1/certs' or method.upper()!='GET':raise ValueError('Unexpected Google certificate endpoint')
        with _lock:
            cached=_cert_cache.get(url)
            if cached and cached[0]>time.monotonic():return cached[1]
            response=request(url,method=method,timeout=10,**kwargs)
            if response.status==200:_cert_cache[url]=(time.monotonic()+300,response)
            return response
    try:claims=id_token.verify_oauth2_token(credential,certificates,audience=client_id,clock_skew_in_seconds=30)
    except (ValueError,GoogleAuthError) as error:raise ValueError('Google sign-in could not be verified. Try signing in again.') from error
    if claims.get('nonce')!=nonce or not isinstance(claims.get('sub'),str) or not claims['sub'] or claims.get('email_verified') is not True or not isinstance(claims.get('email'),str):raise ValueError('Google sign-in nonce or verified account is missing')
    if not isinstance(claims.get('exp'),(int,float)) or claims['exp']<=time.time():raise ValueError('Google sign-in has expired')
    return {'sub':claims['sub'],'name':str(claims.get('name') or claims['email'])[:200],'email':claims['email'][:320],'expiresAt':int(claims['exp'])*1000,'clientId':client_id,'verified':True}
