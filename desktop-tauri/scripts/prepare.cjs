const {spawnSync}=require('node:child_process'),path=require('node:path');
function checked(command,args){const result=spawnSync(command,args,{stdio:'inherit',cwd:path.resolve(__dirname,'..')});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);}
const python=process.env.PYTHON||(process.platform==='win32'?'python':'python3');let target=process.env.TAURI_ENV_TARGET_TRIPLE;
if(!target){const result=spawnSync('rustc',['-vV'],{encoding:'utf8'});target=result.stdout?.match(/^host: (.+)$/m)?.[1];if(!target)throw Error('Install the Rust toolchain before preparing the Tauri desktop.');}
checked(python,[path.join(__dirname,'prepare.py'),'--target',target]);
