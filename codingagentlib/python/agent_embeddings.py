"""Optional learned local sentence embeddings. No network calls or model downloads."""
import hashlib
import json
from pathlib import Path
import threading

class LocalEmbeddings:
    def __init__(self,folder):
        folder=Path(folder).expanduser().resolve();paths=[folder/'model.onnx',folder/'tokenizer.json',folder/'manifest.json']
        if any(p.is_symlink() or not p.is_file() for p in paths):raise ValueError('Embedding directory needs regular model.onnx, tokenizer.json and manifest.json files')
        manifest=json.loads(paths[2].read_text());actual={}
        for path in paths[:2]:
            value=hashlib.sha256(path.read_bytes()).hexdigest()
            if manifest.get('files',{}).get(path.name,{}).get('sha256')!=value:raise ValueError('Embedding model checksum does not match its manifest')
            actual[path.name]=value
        try:
            import numpy as np
            import onnxruntime as ort
            from tokenizers import Tokenizer
        except ImportError:raise ValueError('Install codingagentlib[embeddings] (or server/requirements-agent.txt in the suite) to enable learned embeddings') from None
        self.np=np;options=ort.SessionOptions();options.intra_op_num_threads=2;options.inter_op_num_threads=1;self.session=ort.InferenceSession(str(paths[0]),sess_options=options,providers=['CPUExecutionProvider']);self.tokenizer=Tokenizer.from_file(str(paths[1]));self.tokenizer.enable_truncation(max_length=256);self.tokenizer.enable_padding();self.lock=threading.Lock();self.dimensions=384;self.model='onnx-minilm:'+actual['model.onnx'][:16]+':'+actual['tokenizer.json'][:16];self.private_paths=set(paths)
    def embed_many(self,texts):
        if not texts:return []
        np=self.np;result=[]
        with self.lock:
            for start in range(0,len(texts),16):
                encoded=self.tokenizer.encode_batch(texts[start:start+16]);inputs={'input_ids':np.array([v.ids for v in encoded],dtype=np.int64),'attention_mask':np.array([v.attention_mask for v in encoded],dtype=np.int64),'token_type_ids':np.array([v.type_ids for v in encoded],dtype=np.int64)};names={v.name for v in self.session.get_inputs()};output=self.session.run(None,{k:v for k,v in inputs.items() if k in names})[0];mask=inputs['attention_mask'][:,:,None];pooled=(output*mask).sum(axis=1)/np.maximum(mask.sum(axis=1),1);pooled=pooled/np.maximum(np.linalg.norm(pooled,axis=1,keepdims=True),1e-12)
                if pooled.ndim!=2 or pooled.shape[1]!=384 or not np.isfinite(pooled).all():raise ValueError('Learned embedding model returned invalid vectors')
                result.extend(pooled.tolist())
        return result
    def embed(self,text):return self.embed_many([text])[0]
    def health(self):return {'enabled':True,'semantic':True,'backend':'local-onnx','model':self.model,'dimensions':self.dimensions,'networkInference':False,'tokenWindow':256}
