"""Build reviewable optional SDK source packages; never contacts a registry."""
import argparse
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]


def javascript(root, name, files, entry, dependencies=None):
    destination = root/name
    destination.mkdir(parents=True,exist_ok=True)
    for relative in files:
        shutil.copy2(ROOT/'javascript'/relative,destination/relative)
    (destination/'index.js').write_text(entry+'\n')
    (destination/'package.json').write_text(json.dumps(dict(name='@tlal/'+name,version='1.0.0',main='index.js',license='MIT',engines=dict(node='>=18'),**(dict(peerDependencies=dependencies) if dependencies else {})),indent=2)+'\n')
    shutil.copy2(ROOT/'LICENSE',destination/'LICENSE')


def python(root, name, modules, entry, dependencies=()):
    destination = root/name
    package = destination/name
    package.mkdir(parents=True,exist_ok=True)
    for relative in modules:
        shutil.copy2(ROOT/'python'/relative,package/relative)
    (package/'__init__.py').write_text(entry+'\n')
    (destination/'pyproject.toml').write_text('[build-system]\nrequires = ["setuptools>=68"]\nbuild-backend = "setuptools.build_meta"\n\n[project]\nname = '+json.dumps(name)+'\nversion = "1.0.0"\nrequires-python = ">=3.10"\nlicense = {text="MIT"}\ndependencies = '+json.dumps(list(dependencies))+'\n')
    shutil.copy2(ROOT/'LICENSE',destination/'LICENSE')


def build(output):
    output.mkdir(parents=True,exist_ok=True)
    javascript(output,'agent-core',['core.js','adapters.js','contracts.js','contracts-data.js','contracts.d.ts','core.d.ts'],"module.exports={...require('./core.js'),...require('./adapters.js'),contracts:require('./contracts.js')};")
    javascript(output,'agent-extensions',['extensions.js','mcp-transports.js','executable.js','mosaic.js','mosaic.d.ts','state-machine.js','tree-search.js','beyond-react.js'],"module.exports={...require('./extensions.js'),...require('./mcp-transports.js'),...require('./mosaic.js'),...require('./state-machine.js'),...require('./tree-search.js'),beyondReact:require('./beyond-react.js')};",{'@tlal/agent-core':'^1.0.0'})
    (output/'agent-core/index.d.ts').write_text("export * from './core';\n")
    manifest=output/'agent-core/package.json'
    metadata=json.loads(manifest.read_text()); metadata['types']='index.d.ts'; manifest.write_text(json.dumps(metadata,indent=2)+'\n')
    path=output/'agent-extensions/extensions.js'
    path.write_text(path.read_text().replace("require('./core.js')","require('@tlal/agent-core')").replace("require('./contracts.js')","require('@tlal/agent-core').contracts"))
    javascript(output,'agent-memory',['graph-memory.js','graph-memory.d.ts'],"module.exports=require('./graph-memory.js');")
    shutil.copy2(ROOT.parent/'architex/sphinx-rst.js',output/'agent-memory/sphinx-rst.js')
    (output/'agent-memory/index.d.ts').write_text("export * from './graph-memory';\n")
    metadata=json.loads((output/'agent-memory/package.json').read_text());metadata['types']='index.d.ts';(output/'agent-memory/package.json').write_text(json.dumps(metadata,indent=2)+'\n')
    javascript(output,'agent-store-node',['node-store.js'],"module.exports=require('./node-store.js');")
    javascript(output,'agent-provider-openai',['providers.js','providers.d.ts'],"module.exports=require('./providers.js');")
    javascript(output,'agent-coding',[],"const {LocalRuntime:LegacyRuntime}=require('@tlal/codingagentlib'); class LocalRuntime extends LegacyRuntime {constructor(options){super({...options,exclusiveWorkspace:true});}} module.exports={LocalRuntime};",{'@tlal/codingagentlib':'>=0.1.0'})
    python(output,'codingagentcore',['core.py','adapters.py','contracts.py','contracts_data.py'],'from .core import create_agent, CoreAgent, MemorySessionStore, capabilities, replay\nfrom .adapters import from_embedded')
    python(output,'codingagentextensions',['extensions.py','mcp_transports.py','mosaic.py'],'from .extensions import mcp_tools, expose_mcp, delegation_tool\nfrom .mcp_transports import ShellMCP, RPCTransport\nfrom .mosaic import create_model_mosaic',['codingagentcore>=1,<2'])
    path=output/'codingagentextensions/codingagentextensions/extensions.py'
    path.write_text(path.read_text().replace('from .core import','from codingagentcore.core import').replace('from .contracts import','from codingagentcore.contracts import'))
    python(output,'codingagentmemory',['project_knowledge.py','agent_memory.py','agent_memory_manager.py','agent_memory_architectures.py','graph_query.py','source_imports.py'],'from .project_knowledge import ProjectKnowledge\nfrom .agent_memory import Memory\nfrom .agent_memory_manager import MemoryManager\nfrom .agent_memory_architectures import UnifiedMemorySuite, StructMemStore, EggentEpisodicGraph, AMemNetwork, MagmaMultiGraph, GamMemoryEngine\nfrom .graph_query import query_graph')
    python(output,'codingagenttools',['tool_library.py','agent_pyenv.py','agent_harness.py'],'from .tool_library import ToolLibrary\nfrom .agent_pyenv import PythonEnvironments\nfrom .agent_harness import ScriptLibrary, AGENT_IO',['codingagentcore>=1,<2','codingagentmemory>=1,<2'])
    for mod in ('tool_library.py','agent_harness.py'):
        path=output/('codingagenttools/codingagenttools/'+mod)
        path.write_text(path.read_text().replace('from .contracts import','from codingagentcore.contracts import').replace('from .agent_memory import','from codingagentmemory.agent_memory import'))
    python(output,'codingagentstore',['sqlite_store.py'],'from .sqlite_store import SQLiteSessionStore')
    python(output,'codingagentproviders',['providers.py'],'from .providers import openai_model, anthropic_model, gemini_model, ollama_model, with_retry')
    python(output,'codingagentcoding',['workspace_lock.py','decision_model.py','react.py','tree_search.py','codeact.py','pipelines.py','state_machine.py','multi_agent.py'],'from codingagentlib.python.coding import Agent, Runtime, WorkspaceLease\nfrom codingagentlib import ReactAgent, TreeSearchAgent, CodeActAgent, CodeActREPL, AgentlessPipeline, StateGraph, END, PlannerExecutorAgent, MultiAgentOrchestrator, ReflexionLoop, consult_decision_model',['codingagentlib>=0.1'])
    # UI remains optional: it binds to an injected Worker/Controller and never
    # becomes a dependency of the portable core.
    ui=output/'agent-ui-bindings'
    ui.mkdir(exist_ok=True)
    for relative in ['controller.cjs','worker.cjs','executable.cjs','loop-guard.cjs','verification.cjs','action-review.cjs']:
        shutil.copy2(ROOT/'vscode/src'/relative,ui/relative)
    (ui/'index.js').write_text("module.exports={...require('./controller.cjs'),...require('./worker.cjs')};\n")
    (ui/'package.json').write_text(json.dumps(dict(name='@tlal/agent-ui-bindings',version='1.0.0',main='index.js',license='MIT'))+'\n')
    shutil.copy2(ROOT/'LICENSE',ui/'LICENSE')
    (output/'MANIFEST.json').write_text(json.dumps(dict(protocol='codingagentlib/sdk-v1',packages=sorted(['agent-core','agent-extensions','agent-memory','agent-store-node','agent-provider-openai','agent-coding','agent-ui-bindings','codingagentcore','codingagentextensions','codingagentstore','codingagentproviders','codingagentcoding','codingagentmemory','codingagenttools']),published=False),indent=2)+'\n')


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--out',required=True,type=Path)
    args=parser.parse_args()
    build(args.out.resolve())
