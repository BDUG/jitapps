import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from .python.core import create_agent
from .python.sqlite_store import SQLiteSessionStore
from .python.coding import Runtime as CodingRuntime

ROOT=Path(__file__).parent


class PackageTests(unittest.TestCase):
    def test_coding_adapter_locks_workspace_until_close(self):
        with tempfile.TemporaryDirectory() as temporary:
            first=CodingRuntime(temporary)
            try:
                with self.assertRaises(OSError):
                    CodingRuntime(temporary)
            finally:
                first.close()
            with CodingRuntime(temporary) as restored:
                self.assertTrue(restored.health()['enabled'])

    def test_generated_contracts_are_current(self):
        subprocess.run([sys.executable,str(ROOT/'scripts/generate_contracts.py'),'--check'],check=True)

    def test_optional_packages_work_without_coding_runtime(self):
        with tempfile.TemporaryDirectory() as temporary:
            destination=Path(temporary)
            subprocess.run([sys.executable,str(ROOT/'scripts/package_sdk.py'),'--out',temporary],check=True)
            environment={**os.environ,'PYTHONPATH':os.pathsep.join(str(destination/name) for name in ('codingagentcore','codingagentextensions','codingagentprotocols','codingagentstore','codingagentproviders','codingagentmemory','codingagenttools'))}
            code="""
import sys
from codingagentcore import create_agent
from codingagentextensions import delegation_tool, ShellMCP, RPCTransport, HttpMCPTransport, create_model_mosaic
from codingagentprotocols import A2AServer, A2AClient, agent_card, SSEStreamBridge, GenAITracer
from codingagentstore import SQLiteSessionStore
from codingagentproviders import openai_model, tool_schemas
from codingagentmemory import ProjectKnowledge, Memory, query_graph
from codingagenttools import ToolLibrary
assert agent_card(name='Isolated')['name']=='Isolated'
assert len(GenAITracer().export_otlp_json()['resourceSpans'])==1
a=create_agent(model=lambda r:dict(sessionId=r['sessionId'],step=r['step'],status='done',plan='Complete',action=None,summary='Isolated package'))
assert a.run('No workspace required')['status']=='complete'
assert 'codingagentlib' not in sys.modules
"""
            subprocess.run([sys.executable,'-S','-c',code],cwd=temporary,env=environment,check=True)
            javascript="""
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const core=require('./agent-core');
fs.mkdirSync('node_modules/@tlal',{recursive:true});for(const name of ['agent-core','agent-extensions','agent-memory','agent-protocols'])fs.symlinkSync(path.resolve(name),'node_modules/@tlal/'+name,'dir');
const {createModelMosaic}=require('@tlal/agent-extensions'),{ProjectGraphMemory}=require('@tlal/agent-memory'),{a2a,streaming,otelGenai}=require('@tlal/agent-protocols');
assert.equal(a2a.agentCard({name:'Isolated'}).name,'Isolated');
assert.equal(new streaming.SSEStreamBridge().fmt,'ag-ui');
assert.equal(new otelGenai.GenAITracer().exportOtlpJson().resourceSpans.length,1);
assert.equal(typeof require('./agent-ui-bindings').Controller,'function');
assert.equal(typeof require('./agent-ui-bindings').Worker,'function');
const agent=core.createAgent({model:r=>({sessionId:r.sessionId,step:r.step,status:'done',plan:'Complete',action:null,summary:'Isolated package'})});
agent.run('No workspace').then(r=>{assert.equal(r.status,'complete');}).catch(e=>{console.error(e);process.exitCode=1;});
(async()=>{const memory=new ProjectGraphMemory();const graph=await memory.refresh('isolated',[{path:'needs.rst',content:'.. req:: Source\\n   :id: REQ_ONE\\n'}]);assert.ok(graph.nodes.some(n=>n.properties.needId==='REQ_ONE'));const model=createModelMosaic({models:{fixed:()=>({})},routes:{default:'fixed'}});assert.equal(model.inspect().calls,0);})().catch(e=>{console.error(e);process.exitCode=1;});
"""
            subprocess.run(['node','-e',javascript],cwd=temporary,check=True)
            # npm tarballs are built locally, without contacting a registry.
            subprocess.run(['npm','pack','--ignore-scripts','--json','--cache',str(destination/'npm-cache')],cwd=destination/'agent-core',stdout=subprocess.PIPE,check=True)

    def test_sqlite_store_durable_resume_isolation_and_leases(self):
        with tempfile.TemporaryDirectory() as temporary:
            path=Path(temporary)/'sessions.sqlite3'
            first,second=SQLiteSessionStore(path),SQLiteSessionStore(path)
            self.addCleanup(first.close)
            self.addCleanup(second.close)
            self.assertTrue(first.acquire('tenant','id','owner'))
            self.assertFalse(second.acquire('tenant','id','other'))
            first.save('tenant','id',dict(private=True),0)
            self.assertIsNone(second.load('foreign','id'))
            with self.assertRaisesRegex(ValueError,'revision'):
                first.save('tenant','id',{},0)
            second.release('tenant','id','other')
            self.assertFalse(second.acquire('tenant','id','other'))
            first.release('tenant','id','owner')
            agent=create_agent(model=lambda r:dict(sessionId=r['sessionId'],step=r['step'],status='ask',plan='Ask',action=None,question='Continue?'),session_store=first)
            result=agent.run('Persist')
            resumed=create_agent(model=lambda r:dict(sessionId=r['sessionId'],step=r['step'],status='done',plan='Complete',action=None,summary='Resumed'),session_store=second)
            self.assertEqual(resumed.resume(result['sessionId'])['status'],'complete')
