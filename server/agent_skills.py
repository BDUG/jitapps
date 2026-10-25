"""Compatibility alias; headless implementation lives in codingagentlib."""
import sys
from codingagentlib.python import agent_skills as _implementation
sys.modules[__name__] = _implementation
