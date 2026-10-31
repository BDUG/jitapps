"""Stage only the suite's public application assets and freeze its local server."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[2]
DESKTOP=ROOT/'desktop-tauri'
APPS=('mockiX','shelliX','colabriX','designiX','architex','graphiX','textiX','sheetiX','codeiX','appiX','automatextiX','reportiX','presentiX','sketchiX','mindiX','projectiX','vidiX','photiX')
PUBLIC=APPS+('codingagentlib/javascript','shared-suite','shared-ai','shared-agent','assets')
EXTENSIONS={'.html','.js','.mjs','.css','.json','.svg','.png','.jpg','.jpeg','.gif','.webp','.ico','.icns','.woff','.woff2','.ttf','.otf','.wasm','.txt','.md','.xml','.drawio','.yaml','.yml','.rst','.mp4','.webm','.ogg','.mp3','.wav'}

def stage(root,destination):
    root=Path(root).resolve();destination=Path(destination).resolve()
    if destination==root or root.is_relative_to(destination):raise ValueError('Choose a separate staging directory')
    if destination.exists():shutil.rmtree(destination)
    destination.mkdir(parents=True)
    def include(source):
        relative=source.relative_to(root)
        if source.is_symlink() or any(part.startswith('.') or part in {'node_modules','__pycache__','target','backup'} for part in relative.parts):return
        if source.suffix.lower() not in EXTENSIONS or source.name.endswith(('-test.js','-test.cjs','.test.js','.images.json')) or source.name in {'providers.json','search.json'}:return
        target=destination/relative;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,target)
    for name in ('index.html','README.md','LICENSE'):
        if (root/name).is_file():shutil.copyfile(root/name,destination/name)
    for directory in PUBLIC:
        source=root/directory
        if not source.is_dir() or source.is_symlink():raise ValueError('Missing public suite directory: '+directory)
        for folder,dirs,files in os.walk(source,followlinks=False):
            dirs[:]=[name for name in dirs if not name.startswith('.') and name not in {'node_modules','__pycache__','target','backup'} and not (Path(folder)/name).is_symlink()]
            for name in files:include(Path(folder)/name)
    if not all((destination/app/'index.html').is_file() for app in APPS):raise ValueError('Every suite app must have an entry page')
    return destination

def analysis_assets():
    """Trusted optional compiler assets belong to the private sidecar, not HTTP staging."""
    directory=ROOT/'server/code-navigation';assets=[(ROOT/'codingagentlib/protocol.json','codingagentlib'),(directory/'service.cjs','server/code-navigation'),(ROOT/'codingagentlib/python/code-navigation/service.cjs','codingagentlib/python/code-navigation')]
    compiler=directory/'node_modules/typescript'
    if (compiler/'lib/typescript.js').is_file():assets.extend([(compiler/'package.json','server/code-navigation/node_modules/typescript'),(compiler/'lib','server/code-navigation/node_modules/typescript/lib'),(compiler/'LICENSE.txt','server/code-navigation/node_modules/typescript'),(compiler/'ThirdPartyNoticeText.txt','server/code-navigation/node_modules/typescript')])
    return [argument for source,target in assets if source.exists() for argument in ('--add-data',str(source)+':'+target)]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target',required=True)
    parser.add_argument('--stage-only',action='store_true')
    args=parser.parse_args()
    if not args.target or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-' for c in args.target):parser.error('Invalid Rust target triple')
    stage(ROOT,DESKTOP/'src-tauri/resources/suite')
    if args.stage_only:return
    subprocess.run([sys.executable,'-m','PyInstaller','--noconfirm','--clean','--onefile','--name','suite-server','--paths',str(ROOT),'--distpath',str(DESKTOP/'build-bin'),'--workpath',str(DESKTOP/'build-cache'),'--specpath',str(DESKTOP/'build-cache'),'--add-data',str(ROOT/'server/skill_sources/seed.json')+':server/skill_sources',*analysis_assets(),str(DESKTOP/'scripts/backend_entry.py')],check=True,cwd=ROOT)
    suffix='.exe' if os.name=='nt' else ''
    output=DESKTOP/'src-tauri/binaries'/('suite-server-'+args.target+suffix)
    output.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(DESKTOP/'build-bin'/('suite-server'+suffix),output)
    print('Prepared desktop assets and sidecar:',output)

if __name__=='__main__':main()
