"""Compatibility import; implementation lives in server/google_search.py."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from server import google_search as _implementation
sys.modules[__name__] = _implementation
