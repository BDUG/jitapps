"""PyInstaller entry point; stdin is a private lifecycle channel from Tauri."""
import argparse
from pathlib import Path
import sys
import threading
from server import server

def main():
    parser=argparse.ArgumentParser(add_help=False)
    parser.add_argument('--suite-root',required=True)
    options,remaining=parser.parse_known_args()
    root=Path(options.suite_root).resolve()
    if not (root/'index.html').is_file():raise SystemExit('Bundled suite resources are missing')
    server.ROOT=root
    sys.argv=[sys.argv[0],*remaining]
    shutdown=threading.Event()
    def control():
        if sys.stdin is None:
            shutdown.set();return
        for line in sys.stdin:
            if line.strip()=='shutdown':break
        shutdown.set()
    threading.Thread(target=control,daemon=True).start()
    server.main(shutdown_event=shutdown)

if __name__=='__main__':main()
