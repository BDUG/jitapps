#!/usr/bin/env python3
"""Explicitly download the pinned Apache-2.0 MiniLM ONNX model; never on server startup."""
import argparse
import hashlib
import json
from pathlib import Path
import urllib.request

REVISION='751bff37182d3f1213fa05d7196b954e230abad9'
BASE=f'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/{REVISION}/'
FILES={'model.onnx':('onnx/model_quantized.onnx','afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1'),'tokenizer.json':('tokenizer.json','da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0')}
def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',default='server/models/minilm');args=parser.parse_args();folder=Path(args.output).resolve();folder.mkdir(parents=True,exist_ok=True)
    manifest={'model':'Xenova/all-MiniLM-L6-v2','revision':REVISION,'license':'Apache-2.0','dimensions':384,'files':{}}
    for name,(source,expected) in FILES.items():
        destination=folder/name
        if destination.is_symlink():raise ValueError('Refuse a symlink model destination')
        data=urllib.request.urlopen(BASE+source,timeout=120).read(30000001)
        if len(data)>30000000:raise ValueError('Model download exceeds the size bound')
        digest=hashlib.sha256(data).hexdigest()
        if expected and digest!=expected:raise ValueError('Downloaded model checksum does not match the pinned model')
        temporary=folder/(name+'.download');temporary.write_bytes(data);temporary.replace(destination);manifest['files'][name]={'sha256':digest,'bytes':len(data)};print(name,digest)
    (folder/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print('Prepared local model at',folder)
if __name__=='__main__':main()
