"""Bounded public-web discovery and text extraction for reportiX."""
from __future__ import annotations
import datetime, ipaddress, json, re, socket, time
from html.parser import HTMLParser
import urllib.error, urllib.parse, urllib.request, urllib.robotparser
import xml.etree.ElementTree as ET
USER_AGENT = 'reportiX/1.0 (+local research crawler)'
MAX_BYTES = 1_000_000

def public_url(value):
    if not isinstance(value, str) or len(value) > 3000: raise ValueError('Invalid public URL')
    p = urllib.parse.urlsplit(value.strip())
    if p.scheme not in {'http','https'} or not p.hostname or p.username or p.password or p.port not in {None,80,443}: raise ValueError('Use a public HTTP(S) URL without credentials or custom ports')
    host = p.hostname.rstrip('.').lower()
    if host == 'localhost' or host.endswith(('.local','.localhost','.internal')): raise ValueError('Private hosts are not crawlable')
    try: addresses = [ipaddress.ip_address(host)]
    except ValueError:
        try: addresses = [ipaddress.ip_address(row[4][0]) for row in socket.getaddrinfo(host,p.port or (443 if p.scheme=='https' else 80),type=socket.SOCK_STREAM)]
        except OSError as e: raise ValueError('Could not resolve public host') from e
    if not addresses or any(not a.is_global for a in addresses): raise ValueError('Private, loopback and reserved addresses are not crawlable')
    return urllib.parse.urlunsplit((p.scheme,p.netloc,p.path or '/',p.query,''))

class Redirect(urllib.request.HTTPRedirectHandler):
    def __init__(self, check=None):
        super().__init__();self.check=check
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        target=public_url(urllib.parse.urljoin(req.full_url,newurl))
        if self.check:self.check(target)
        return super().redirect_request(req,fp,code,msg,headers,target)

def fetch(url, timeout=8, redirect_check=None):
    url=public_url(url)
    req=urllib.request.Request(url,headers={'User-Agent':USER_AGENT,'Accept':'text/html, text/plain, application/rss+xml, application/xml;q=0.9','Accept-Encoding':'identity'})
    opener=urllib.request.build_opener(Redirect(redirect_check))
    with opener.open(req,timeout=timeout) as response:
        mime=response.headers.get_content_type()
        if mime not in {'text/html','text/plain','application/xhtml+xml','application/rss+xml','application/xml','text/xml'}: raise ValueError('Unsupported page type: '+mime)
        if response.headers.get('Content-Encoding','identity')!='identity': raise ValueError('Compressed response not supported')
        chunks=[];size=0;deadline=time.monotonic()+12
        while True:
            if time.monotonic()>deadline:raise ValueError('Page download time budget exceeded')
            part=response.read1(65536) if hasattr(response,'read1') else response.read(65536)
            if not part:break
            size+=len(part)
            if size>MAX_BYTES:raise ValueError('Page exceeds 1 MB')
            chunks.append(part)
        data=b''.join(chunks)
        text=data.decode(response.headers.get_content_charset() or 'utf-8',errors='replace')
        return text,response.geturl(),mime

class Page(HTMLParser):
    def __init__(self,url):
        super().__init__(convert_charrefs=True);self.url=url;self.parts=[];self.title=[];self.links=[];self.hidden=0;self.in_title=False;self.description=''
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag in {'script','style','nav','footer','header','aside','noscript','svg','form'}: self.hidden+=1
        if tag=='title': self.in_title=True
        if tag=='meta' and a.get('name','').lower()=='description': self.description=a.get('content','')[:500]
        if tag=='a' and not self.hidden and a.get('href'):
            link=urllib.parse.urljoin(self.url,a['href'])
            if urllib.parse.urlsplit(link).scheme in {'http','https'} and link not in self.links: self.links.append(link)
        if tag in {'p','div','article','main','section','h1','h2','h3','li','br','tr'}: self.parts.append('\n')
    def handle_endtag(self,tag):
        if tag in {'script','style','nav','footer','header','aside','noscript','svg','form'}: self.hidden=max(0,self.hidden-1)
        if tag=='title': self.in_title=False
        if tag in {'p','div','article','h1','h2','h3','li','tr'}: self.parts.append('\n')
    def handle_data(self,data):
        if self.in_title:self.title.append(data)
        elif not self.hidden:self.parts.append(data+' ')
    def content(self):
        return '\n'.join(re.sub(r'\s+',' ',line).strip() for line in ''.join(self.parts).splitlines() if line.strip())

def search(query,fetcher=fetch):
    endpoint='https://www.bing.com/search?'+urllib.parse.urlencode({'format':'rss','q':query})
    text,_,_=fetcher(endpoint)
    try: tree=ET.fromstring(text)
    except ET.ParseError as e: raise ValueError('Search provider returned no readable RSS results') from e
    results=[]
    for item in tree.findall('.//item')[:15]:
        url=item.findtext('link','')
        if urllib.parse.urlsplit(url).scheme in {'http','https'}: results.append({'url':url,'title':item.findtext('title',''),'snippet':item.findtext('description','')[:500]})
    return results

def robots_allowed(url,cache,fetcher=fetch):
    p=urllib.parse.urlsplit(url);origin=f'{p.scheme}://{p.netloc}'
    if origin not in cache:
        try:
            text,final,_=fetcher(origin+'/robots.txt')
            if urllib.parse.urlsplit(final).netloc!=p.netloc: raise ValueError('Cross-host robots redirect')
            rules=urllib.robotparser.RobotFileParser();rules.parse(text.splitlines());cache[origin]=rules
        except urllib.error.HTTPError as e:
            if e.code in {404,410}:cache[origin]=None
            else:cache[origin]='Could not read robots.txt (HTTP '+str(e.code)+')'
        except Exception as e:cache[origin]='Could not read robots.txt: '+str(e)
    rules=cache[origin]
    if isinstance(rules,str):raise ValueError(rules)
    if rules and not rules.can_fetch('reportiX',url):raise ValueError('Disallowed by robots.txt')

def research(data,fetcher=fetch,searcher=None):
    if not isinstance(data,dict) or not isinstance(data.get('query'),str) or not 2<=len(data['query'].strip())<=1000:raise ValueError('Enter a research query between 2 and 1,000 characters')
    urls=data.get('urls',[]);limit=data.get('maxSources',6)
    if not isinstance(urls,list) or len(urls)>12 or any(not isinstance(u,str) or len(u)>3000 for u in urls):raise ValueError('Use up to 12 source URLs')
    if not isinstance(limit,int) or isinstance(limit,bool) or not 1<=limit<=12:raise ValueError('Use 1–12 sources')
    provider=data.get('searchProvider','bing')
    if provider not in {'google','bing'}:raise ValueError('Choose Google or Bing web search')
    query=data['query'].strip();result={'query':query,'searchProvider':provider,'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sources':[],'discovered':[],'errors':[],'warnings':[]};queue=[(u,0) for u in urls if u.strip()];start=time.monotonic();robots={};seen=set();hosts={}
    if data.get('search',True):
        try:
            hits=(searcher(query) if searcher else search(query,fetcher));result['discovered']=hits;queue.extend((h['url'],0) for h in hits)
            if not hits:result['warnings'].append('Web search returned no results. Add source URLs to continue.')
        except Exception as e:result['warnings'].append('Web discovery unavailable: '+str(e)+'. Add source URLs or allow the search endpoint.')
    attempts=0
    while queue and len(result['sources'])<limit and attempts<24:
        if time.monotonic()-start>65:result['warnings'].append('Crawl time budget reached.');break
        raw,depth=queue.pop(0)
        try:
            normalized=urllib.parse.urlunsplit(urllib.parse.urlsplit(raw)._replace(fragment=''))
            if normalized in seen:continue
            seen.add(normalized);attempts+=1;url=public_url(normalized);robots_allowed(url,robots,fetcher)
            host=urllib.parse.urlsplit(url).netloc
            if hosts.get(host,0):time.sleep(.35)
            text,final,mime=(fetch(url,redirect_check=lambda dest:robots_allowed(dest,robots,fetcher)) if fetcher is fetch else fetcher(url));public_url(final)
            if mime in {'text/html','application/xhtml+xml'}:
                parser=Page(final);parser.feed(text);content=parser.content();title=' '.join(parser.title).strip() or final;description=parser.description;links=parser.links
            elif mime=='text/plain':content=text;title=urllib.parse.urlsplit(final).path.rsplit('/',1)[-1] or final;description='';links=[]
            else:raise ValueError('Source must be an HTML or plain-text page')
            if len(content.strip())<80:raise ValueError('Too little readable page text (JavaScript-only, blocked or empty page)')
            hosts[host]=hosts.get(host,0)+1
            source={'id':'S'+str(len(result['sources'])+1),'url':final,'requestedUrl':url,'title':title[:300],'description':description,'text':content[:18000],'characters':len(content),'truncated':len(content)>18000,'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()};result['sources'].append(source)
            if data.get('followLinks') is True and depth==0:
                query_words=set(re.findall(r'\w{4,}',query.lower()));candidates=[link for link in links if urllib.parse.urlsplit(link).netloc==urllib.parse.urlsplit(final).netloc]
                candidates.sort(key=lambda u:-sum(w in u.lower() for w in query_words));queue.extend((u,1) for u in candidates[:2])
        except Exception as e:result['errors'].append({'url':raw[:3000],'error':str(e)[:400]})
    return result
