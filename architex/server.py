#!/usr/bin/env python3
"""Compatibility launcher for the unified server/server.py backend."""
import sys
from pathlib import Path
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from server.relay import *
from server.server import *

if __name__ == "__main__":
    main(default_port=8000)
