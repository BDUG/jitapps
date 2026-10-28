"""Headless coding-agent runtime. No UI, web-server or provider dependencies."""
from .python.agent_runtime import Runtime, TOOLS
from .python.agent import Agent
from .python.embedded import EmbeddedAgent
from .python.integration import ContextRegistry
__version__ = '0.1.0'
__all__ = ['Runtime', 'TOOLS', 'Agent', 'EmbeddedAgent', 'ContextRegistry']
