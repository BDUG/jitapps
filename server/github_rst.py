"""Read-only GitHub RST scanner. Pinned commits, bounded responses, no checkout."""
import base64
import json
from pathlib import PurePosixPath
import re
import time
import urllib.error
import urllib.parse
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None


def request_json(path,token=''):
    request=urllib.request.Request('https://api.github.com'+path,headers={
        'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',
        'User-Agent':'rstiX-repository-scanner',**({'Authorization':'Bearer '+token} if token else {})})
    try:
        with urllib.request.build_opener(NoRedirect).open(request,timeout=20) as response:
            raw=response.read(16000001)
            if len(raw)>16000000:raise ValueError('GitHub response exceeds 16 MB')
            return json.loads(raw)
    except urllib.error.HTTPError as error:
        suffix=' Check repository access or GitHub API rate limits.' if error.code in (401,403,404,429) else ''
        raise ValueError('GitHub API returned HTTP '+str(error.code)+'.'+suffix) from None
    except (urllib.error.URLError,TimeoutError):raise ValueError('GitHub connection failed or timed out') from None


def scan(data,request=None,cancelled=lambda:False):
    repos=data.get('repositories');token=data.get('token','')
    if not isinstance(repos,list) or not 1<=len(repos)<=8:raise ValueError('Choose 1–8 repositories')
    if not isinstance(token,str) or len(token)>1000 or any(c.isspace() for c in token):raise ValueError('Invalid GitHub access token')
    start=time.monotonic();calls=0;total=0;count=0;results=[];identities=set()
    def get(path):
        nonlocal calls
        if cancelled():raise ValueError('Repository scan cancelled')
        if calls>=700 or time.monotonic()-start>120:raise ValueError('Repository scan budget exceeded; select fewer repositories')
        calls+=1
        value=(request or (lambda path:request_json(path,token)))(path)
        if not isinstance(value,dict):raise ValueError('Malformed GitHub response')
        return value
    for entry in repos:
        if not isinstance(entry,dict):raise ValueError('Repository must have repository and optional ref fields')
        repo=entry.get('repository','');ref=entry.get('ref','')
        if not isinstance(repo,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,100}/[A-Za-z0-9_.-]{1,100}',repo) or repo.split('/')[1] in ('.','..'):raise ValueError('Use GitHub owner/repository names')
        if not isinstance(ref,str) or len(ref)>200 or any(ord(c)<32 for c in ref):raise ValueError('Invalid branch, tag or commit')
        if repo.lower() in identities:raise ValueError('Select each repository once')
        identities.add(repo.lower());base='/repos/'+repo
        if not ref:ref=get(base).get('default_branch')
        if not isinstance(ref,str) or not ref:raise ValueError('Repository has no default branch')
        commit=get(base+'/commits/'+urllib.parse.quote(ref,safe=''));sha=commit.get('sha');tree_sha=commit.get('commit',{}).get('tree',{}).get('sha')
        if not isinstance(sha,str) or not re.fullmatch('[0-9a-f]{40}',sha) or not isinstance(tree_sha,str) or not re.fullmatch('[0-9a-f]{40}',tree_sha):raise ValueError('Invalid pinned GitHub commit')
        tree=get(base+'/git/trees/'+tree_sha+'?recursive=1');entries=tree.get('tree')
        if not isinstance(entries,list):raise ValueError('Missing GitHub tree')
        if tree.get('truncated'):
            entries=[];queue=[('',tree_sha)];directories=0
            while queue:
                prefix,identity=queue.pop(0);directories+=1
                if directories>4096:raise ValueError('Repository has too many directories')
                branch=get(base+'/git/trees/'+identity)
                if branch.get('truncated') or not isinstance(branch.get('tree'),list):raise ValueError('Cannot enumerate complete GitHub tree')
                for item in branch['tree']:
                    path=prefix+item['path']
                    if item.get('type')=='tree':queue.append((path+'/',item['sha']))
                    else:entries.append({**item,'path':path})
        files=[];exports=[]
        for item in sorted(entries,key=lambda item:item.get('path','')):
            path=item.get('path','')
            if item.get('type')!='blob' or item.get('mode')!='100644' and item.get('mode')!='100755' or not (path.lower().endswith('.rst') or PurePosixPath(path).name.lower()=='needs.json'):continue
            if not path or len(path)>350 or path.startswith('/') or '\\' in path or any(p in ('.','..') for p in path.split('/')):raise ValueError('Unsafe repository source path')
            count+=1
            if count>500 or not isinstance(item.get('size'),int) or item['size']>1000000:raise ValueError('Scan exceeds 500 documents or 1 MB per document')
            identity=item.get('sha')
            if not isinstance(identity,str) or not re.fullmatch('[0-9a-f]{40}',identity):raise ValueError('Invalid GitHub blob identity')
            blob=get(base+'/git/blobs/'+identity)
            if blob.get('encoding')!='base64' or not isinstance(blob.get('content'),str):raise ValueError('Unsupported GitHub blob encoding')
            raw=base64.b64decode(''.join(blob['content'].split()),validate=True);total+=len(raw)
            if len(raw)>1000000 or total>10000000:raise ValueError('Scan exceeds 10 MB total or 1 MB per document')
            content=raw.decode('utf-8-sig')
            if '\0' in content:raise ValueError('Binary document is not supported')
            row=dict(path=path,content=content,blob=identity)
            (files if path.lower().endswith('.rst') else exports).append(row)
        results.append(dict(repository=repo,ref=ref,commit=sha,files=files,needsExports=exports,complete=True))
    return dict(format='rstix/github-scan-v1',version=1,repositories=results,complete=True,documents=count,bytes=total,requests=calls)
