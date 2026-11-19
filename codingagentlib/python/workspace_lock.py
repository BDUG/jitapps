"""Optional cross-process workspace lease for hosts using the coding adapter."""
import os
from pathlib import Path


class WorkspaceLease:
    def __init__(self, workspace):
        root=Path(workspace).resolve(strict=True)
        if not root.is_dir():
            raise ValueError('Workspace must be a directory')
        directory=root/'.suite-agent'
        if directory.is_symlink():
            raise ValueError('Workspace state directory must not be a symlink')
        directory.mkdir(mode=0o700,exist_ok=True)
        self.descriptor=os.open(directory/'sdk-workspace.lock',os.O_CREAT|os.O_RDWR|getattr(os,'O_NOFOLLOW',0),0o600)
        try:
            if os.name=='nt':
                import msvcrt
                os.write(self.descriptor,b'0')
                os.lseek(self.descriptor,0,os.SEEK_SET)
                msvcrt.locking(self.descriptor,msvcrt.LK_NBLCK,1)
            else:
                import fcntl
                fcntl.flock(self.descriptor,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BaseException:
            os.close(self.descriptor)
            self.descriptor=None
            raise

    def close(self):
        if self.descriptor is not None:
            os.close(self.descriptor)
            self.descriptor=None

    def __enter__(self):
        return self

    def __exit__(self,*args):
        self.close()
