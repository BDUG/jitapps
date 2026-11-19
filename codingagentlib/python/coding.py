"""Optional coding boundary; exclusive workspace ownership is the safe default."""
from .workspace_lock import WorkspaceLease
from .agent import Agent as LegacyAgent
from .agent_runtime import Runtime as LegacyRuntime, TOOLS


class _Exclusive:
    def __init__(self,workspace,commands=(),**options):
        self._workspace_lease=WorkspaceLease(workspace)
        try:
            super().__init__(workspace,commands,**options)
        except BaseException:
            self._workspace_lease.close()
            raise

    def close(self):
        try:
            super().close()
        finally:
            self._workspace_lease.close()

    def __enter__(self):
        return self

    def __exit__(self,*args):
        self.close()


class Agent(_Exclusive,LegacyAgent):
    pass


class Runtime(_Exclusive,LegacyRuntime):
    pass


__all__=['Agent','Runtime','TOOLS','WorkspaceLease']
