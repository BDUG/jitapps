#!/usr/bin/env python3
"""Exercise two real encrypted peers, durable restart recovery and binary transfers.

Run with the Python environment containing server/requirements-wormhole.txt.
For an isolated test, point --relay and --transit at local test relays.
"""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import time
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from server.wormhole_share import Sharing

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--relay',default=None)
    parser.add_argument('--transit',default=None)
    args=parser.parse_args()
    with tempfile.TemporaryDirectory() as a,tempfile.TemporaryDirectory() as b:
        def broker(path):return Sharing(path,relay=args.relay,transit=args.transit)
        x=broker(a);y=broker(b)
        def wait(check):
            end=time.monotonic()+40
            while time.monotonic()<end:
                result=check()
                if result:return result
                time.sleep(.1)
            raise RuntimeError('Pairing/transfer timed out; check relay connectivity and requirements-wormhole.txt')
        def item(session,content):return {'op':'send','session':session,'id':'a'*32,'name':'binary.dat','mime':'application/octet-stream','data':base64.b64encode(content).decode(),'digest':hashlib.sha256(content).hexdigest()}
        try:
            first=x.start({'role':'master','kind':'files'});wait(lambda:x.status(first['id'])['code'])
            content=b'queued before restart\x00\xff';x.dispatch(item(first['id'],content));x.close()
            x=broker(a);s=x.start({'session':first['id'],'role':'master','kind':'files'})
            code=wait(lambda:x.status(s['id'])['code']);t=y.start({'role':'participant','kind':'files','code':code})
            wait(lambda:x.status(s['id'])['state']=='connected' and y.status(t['id'])['state']=='connected')
            incoming=wait(lambda:next((v for v in y.status(t['id'])['queue'] if v['direction']=='in'),None))
            received=y.dispatch({'op':'read','session':t['id'],'id':incoming['id']});assert base64.b64decode(received['data'])==content
            wait(lambda:any(v['direction']=='out' and v['status']=='delivered' for v in x.status(s['id'])['queue']))
            reply=b'reply\x00\xff'*10000;y.dispatch(item(t['id'],reply))
            incoming=wait(lambda:next((v for v in x.status(s['id'])['queue'] if v['direction']=='in'),None))
            received=x.dispatch({'op':'read','session':s['id'],'id':incoming['id']});assert base64.b64decode(received['data'])==reply
            wait(lambda:any(v['direction']=='out' and v['status']=='delivered' for v in y.status(t['id'])['queue']))
            print('PASS real encrypted magic-wormhole: bidirectional binary integrity, durable restart recovery and acknowledged queues.')
        finally:x.close();y.close()
if __name__=='__main__':main()
