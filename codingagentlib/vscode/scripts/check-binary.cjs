const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
const marker=JSON.parse(fs.readFileSync(path.join(root,'bin/platform.json')));
if(marker.platform!==process.platform||marker.arch!==process.arch)throw Error('Rebuild the native worker for this platform.');
fs.accessSync(path.join(root,'bin/codingagent-worker'+(process.platform==='win32'?'.exe':'')));
