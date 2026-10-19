import json, pathlib, socket, sys, unittest, urllib.error, urllib.request
from unittest.mock import patch
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent))
import crawler
PUBLIC=[(socket.AF_INET,socket.SOCK_STREAM,6,'',('93.184.216.34',443))]
class Tests(unittest.TestCase):
 def test_public_guard(self):
  for url in ['http://127.0.0.1/x','http://10.0.0.1/','http://[::1]/','file:///etc/passwd','http://localhost/x','https://user:pass@example.com/','https://example.com:9000/']:
   with self.assertRaises(ValueError):crawler.public_url(url)
  with patch('crawler.socket.getaddrinfo',return_value=PUBLIC):self.assertEqual(crawler.public_url('https://example.org/x#part'),'https://example.org/x')
  with patch('crawler.socket.getaddrinfo',return_value=[(2,1,6,'',('192.168.1.1',443))]):
   with self.assertRaises(ValueError):crawler.public_url('https://example.org/')
 def test_extraction(self):
  p=crawler.Page('https://example.org/article');p.feed('<title>A report</title><nav>Skip</nav><script>bad()</script><main><h1>Research</h1><p>Facts &amp; figures.</p><a href="/study">Study</a></main>');self.assertEqual(''.join(p.title),'A report');self.assertNotIn('Skip',p.content());self.assertNotIn('bad()',p.content());self.assertIn('Facts & figures.',p.content());self.assertEqual(p.links,['https://example.org/study'])
 def test_search(self):
  def fetch(url):
   self.assertIn('format=rss',url);return '<rss><channel><item><title>Study</title><link>https://example.org/study</link><description>Useful</description></item></channel></rss>',url,'application/rss+xml'
  self.assertEqual(crawler.search('climate report',fetch)[0]['title'],'Study')
 def test_research_and_robots(self):
  def fetch(url):
   if url.endswith('/robots.txt'):return 'User-agent: *\nDisallow: /private',url,'text/plain'
   return '<title>Evidence</title><main><p>'+('Research data about energy. '*10)+'</p><a href="/energy-study">More</a></main>',url,'text/html'
  with patch('crawler.socket.getaddrinfo',return_value=PUBLIC),patch('crawler.time.sleep'):
   r=crawler.research({'query':'Energy research','urls':['https://example.org/report','https://example.org/private'],'search':False,'maxSources':2,'followLinks':True},fetcher=fetch)
  self.assertEqual(len(r['sources']),2);self.assertEqual(r['sources'][0]['id'],'S1');self.assertTrue(any('Disallowed' in e['error'] for e in r['errors']));self.assertIn('https://example.org/energy-study',[s['url'] for s in r['sources']]);self.assertIn('retrievedAt',r['sources'][0])
 def test_search_failure_and_private(self):
  r=crawler.research({'query':'A valid query','urls':['http://127.0.0.1/'],'search':True},searcher=lambda q:(_ for _ in ()).throw(ValueError('Network denied')))
  self.assertFalse(r['sources']);self.assertIn('unavailable',r['warnings'][0]);self.assertIn('Private',r['errors'][0]['error'])
 def test_redirect_guard(self):
  with self.assertRaises(ValueError):crawler.Redirect().redirect_request(urllib.request.Request('https://example.org/'),None,302,'Found',{},'http://127.0.0.1/')
if __name__=='__main__':unittest.main()
