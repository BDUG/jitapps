"""Headless coding-agent runtime. No UI, web-server or provider dependencies."""
from .python.agent_runtime import Runtime, TOOLS
from .python.agent import Agent
from .python.react import ReactAgent
from .python.agent_pyenv import PythonEnvironments
from .python.agent_harness import ScriptLibrary
from .python.agent_memory_manager import MemoryManager
from .python.agent_memory_architectures import UnifiedMemorySuite, StructMemStore, EggentEpisodicGraph, AMemNetwork, MagmaMultiGraph, GamMemoryEngine
from .python.decision_model import build_decision_request, consult_decision_model, normalize_decision
from .python.tree_search import TreeSearchAgent
from .python.codeact import CodeActAgent, CodeActREPL
from .python.pipelines import AgentlessPipeline
from .python.state_machine import StateGraph, END, PlannerExecutorAgent
from .python.hybrid_agent import HybridPlanReflexionAgent
from .python.multi_agent import MultiAgentOrchestrator, ReflexionLoop
from .python.project_knowledge import ProjectKnowledge
from .python.tool_library import ToolLibrary
from .python.mosaic import create_model_mosaic
from .python.graph_query import query_graph
from .python.mcp_transports import ShellMCP, RPCTransport, HttpMCPTransport
from .python.a2a import A2AServer, A2AClient, agent_card, a2a_delegation_tool
from .python.streaming import ACPServer, SSEStreamBridge, ag_ui_events, format_sse
from .python.otel_genai import GenAITracer, ReactOtelObserver, TraceContext
from .python.embedded import EmbeddedAgent
from .python.integration import ContextRegistry
from .python.handoff import ModelHandoff
from .python.contracts_data import ModelRequest, ModelResponse, ToolDefinition, ToolResult, AgentEvent, AgentError
from .python.adapters import from_embedded
from .python.core import create_agent, CoreAgent, MemorySessionStore, capabilities, replay
__version__ = '0.1.0'
__all__ = ['create_model_mosaic','query_graph','ProjectKnowledge','ToolLibrary','PythonEnvironments','ScriptLibrary','MemoryManager','UnifiedMemorySuite','StructMemStore','EggentEpisodicGraph','AMemNetwork','MagmaMultiGraph','GamMemoryEngine','ReactAgent','TreeSearchAgent','CodeActAgent','CodeActREPL','AgentlessPipeline','StateGraph','END','PlannerExecutorAgent','HybridPlanReflexionAgent','MultiAgentOrchestrator','ReflexionLoop','build_decision_request','consult_decision_model','normalize_decision','ShellMCP','RPCTransport','HttpMCPTransport','A2AServer','A2AClient','agent_card','a2a_delegation_tool','ACPServer','SSEStreamBridge','ag_ui_events','format_sse','GenAITracer','ReactOtelObserver','TraceContext','ModelRequest', 'ModelResponse', 'ToolDefinition', 'ToolResult', 'AgentEvent', 'AgentError', 'from_embedded', 'create_agent', 'CoreAgent', 'MemorySessionStore', 'capabilities', 'replay', 'Runtime', 'TOOLS', 'Agent', 'EmbeddedAgent', 'ContextRegistry', 'ModelHandoff']
