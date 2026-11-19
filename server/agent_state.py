"""Move server agent metadata outside command/build output without deleting legacy data."""
import hashlib
import os
from pathlib import Path
import shutil
import uuid


def location(workspace, config, explicit=None):
    workspace = Path(workspace).expanduser().resolve()
    identity = hashlib.sha256(str(workspace).encode()).hexdigest()[:24]
    destination = Path(explicit).expanduser().absolute() if explicit else Path(config).expanduser().resolve().parent / 'agent-state' / identity
    if any(p.is_symlink() for p in [destination, *destination.parents]):
        raise ValueError('Agent state directory cannot use symlinks')
    legacy = workspace / '.suite-agent'
    if destination == legacy or destination.exists() or not legacy.exists():
        return destination
    if legacy.is_symlink() or any(p.is_symlink() for p in legacy.rglob('*')):
        raise ValueError('Legacy agent state contains symlinks; choose a state directory explicitly')
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    staged = destination.with_name('.migrate-' + uuid.uuid4().hex)
    try:
        shutil.copytree(legacy, staged)
        os.rename(staged, destination)
    finally:
        if staged.exists(): shutil.rmtree(staged)
    return destination
