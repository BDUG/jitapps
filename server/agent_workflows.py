"""Compatibility alias; headless implementation lives in codingagentlib."""
import sys
from codingagentlib.python import agent_workflows as _implementation
sys.modules[__name__] = _implementation
