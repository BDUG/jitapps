const {spawnSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),manifest=path.join(root,'../rust/Cargo.toml');
const result=spawnSync(process.env.CARGO||'cargo',['build','--locked','--release','--target-dir',path.join(root,'../rust/target'),'--manifest-path',manifest,'--bin','codingagent-worker'],{stdio:'inherit'});
if(result.error)throw result.error;if(result.status)process.exit(result.status);
const suffix=process.platform==='win32'?'.exe':'';
fs.mkdirSync(path.join(root,'bin'),{recursive:true});fs.copyFileSync(path.join(root,'../rust/target/release/codingagent-worker'+suffix),path.join(root,'bin/codingagent-worker'+suffix));
fs.chmodSync(path.join(root,'bin/codingagent-worker'+suffix),0o755);
fs.writeFileSync(path.join(root,'bin/platform.json'),JSON.stringify({platform:process.platform,arch:process.arch},null,2)+'\n');
console.log('Bundled native worker for '+process.platform+'-'+process.arch);

fs.copyFileSync(path.join(root,'../javascript/handoff.js'),path.join(root,'src/handoff.cjs'));
