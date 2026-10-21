'use strict';
const $=s=>document.querySelector(s),V=Vidix,clone=V.clone,canvas=$('#canvas'),ctx=canvas.getContext('2d');
let project=V.starter(),assets=[],cache=new Map(),selected=project.clips[1].id,time=1.5,history=[],future=[],playing=false,busy=false,cancelled=false,epoch=0;
const vectorImages=new Map();
const id=()=>globalThis.crypto?.randomUUID?.()||'clip-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),clip=()=>project.clips.find(c=>c.id===selected);
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('visible'),5000);}
function snapshot(){return {project:clone(project),assets:clone(assets)};}
function checkpoint(){history.push(snapshot());if(history.length>30)history.shift();future=[];}
function save(){try{localStorage.setItem('vidix-project',JSON.stringify(snapshot()));$('#saveStatus').textContent='● Saved locally';}catch{$('#saveStatus').textContent='Export project to keep media';}}
function transaction(fn){if(busy)return false;const before=clone(project);try{fn();const next=V.validate(project,assets);project=before;if(JSON.stringify(next)===JSON.stringify(before)){render();return true;}checkpoint();project=next;save();render();return true;}catch(e){project=before;toast(e.message);return false;}}
function applyProject(value){if(busy)throw Error('Finish the current import or export first.');const next=V.validate(value,assets);checkpoint();playing=false;project=next;selected=project.clips[0]?.id;time=Math.min(time,project.duration);save();render();}
function metadata(){return assets.map(({src,...a})=>a);}
function dataURL(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Could not read the file.'));reader.readAsDataURL(blob);});}
function loadEvent(el,event){return new Promise((resolve,reject)=>{const done=()=>{clean();resolve();},fail=()=>{clean();reject(Error('The browser could not decode this media format.'));},timer=setTimeout(fail,15000),clean=()=>{clearTimeout(timer);el.removeEventListener(event,done);el.removeEventListener('error',fail);};el.addEventListener(event,done,{once:true});el.addEventListener('error',fail,{once:true});});}
function gifFrames(bytes){
 const reader=new GifReader(bytes),w=reader.width,h=reader.height,count=reader.numFrames();
 if(!count||count>300||w*h*count>30000000)throw Error('GIF exceeds 300 frames or 30 million decoded pixels.');
 const rgba=new Uint8ClampedArray(w*h*4),frames=[];let elapsed=0,previous=null,restore=null;
 for(let i=0;i<count;i++){
  if(previous?.disposal===2){for(let y=previous.y;y<previous.y+previous.height;y++)for(let x=previous.x;x<previous.x+previous.width;x++)rgba.fill(0,(y*w+x)*4,(y*w+x)*4+4);}
  if(previous?.disposal===3&&restore)rgba.set(restore);
  const info=reader.frameInfo(i);restore=info.disposal===3?rgba.slice():null;reader.decodeAndBlitFrameRGBA(i,rgba);
  const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').putImageData(new ImageData(rgba.slice(),w,h),0,0);
  frames.push({time:elapsed,image:c});elapsed+=Math.max(.02,info.delay/100);previous=info;
 }
 return {frames,duration:elapsed,width:w,height:h};
}
async function prepare(asset){
 const old=cache.get(asset.src);if(old?.src===asset.src)return old;
 let resource;
 if(asset.kind==='video'){
  const video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='auto';const loaded=loadEvent(video,'loadeddata');video.src=asset.src;await loaded;
  if(!Number.isFinite(video.duration)){const end=loadEvent(video,'seeked');video.currentTime=1e8;await end;const beginning=loadEvent(video,'seeked');video.currentTime=0;await beginning;}
  if(!Number.isFinite(video.duration)||video.duration<=0)throw Error('Video duration is unavailable. Try MP4 or a finalized WebM file.');
  resource={element:video,width:video.videoWidth,height:video.videoHeight,duration:video.duration};
 }else if(asset.kind==='gif')resource=gifFrames(Uint8Array.from(atob(asset.src.split(',')[1]),c=>c.charCodeAt(0)));
 else{const image=new Image();image.src=asset.src;await image.decode();if(image.naturalWidth*image.naturalHeight>20000000)throw Error('Images are limited to 20 megapixels.');resource={element:image,width:image.naturalWidth,height:image.naturalHeight,duration:0};}
 if(resource.width*resource.height>20000000)throw Error('Media dimensions exceed 20 megapixels.');
 resource.src=asset.src;cache.set(asset.src,resource);return resource;
}
async function seek(video,t){if(Math.abs(video.currentTime-t)<.005&&video.readyState>=2)return;const ready=loadEvent(video,'seeked');video.currentTime=Math.max(0,Math.min(t,video.duration-.001));await ready;}
function frameFor(resource,c,t){if(resource.frames){const at=t%resource.duration;return resource.frames.findLast(f=>f.time<=at)?.image||resource.frames[0].image;}return resource.element;}
async function paint(t,exact=false){
 const ticket=++epoch,visible=project.clips.map(c=>V.at(c,t)).filter(Boolean);
 ctx.fillStyle=project.background;ctx.globalAlpha=1;ctx.fillRect(0,0,canvas.width,canvas.height);
 for(const c of visible){if(c.type==='media'){const r=cache.get(assets.find(a=>a.id===c.assetId)?.src);if(r?.element instanceof HTMLVideoElement)await seek(r.element,c.mediaTime);if(ticket!==epoch&&!exact)return;}ctx.save();ctx.globalAlpha=c.alpha;ctx.fillStyle=c.color;
  if(c.type==='vector'){const f=V.drawing(c,t,project.fps);if(f){let image=vectorImages.get(f.svg);if(!image){image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(f.svg);vectorImages.set(f.svg,image);}if(!image.complete)await image.decode();if(ticket!==epoch&&!exact){ctx.restore();return;}ctx.drawImage(image,c.x,c.y,c.w,c.h);}}
  else if(c.type==='rect')ctx.fillRect(c.x,c.y,c.w,c.h);
  else if(c.type==='ellipse'){ctx.beginPath();ctx.ellipse(c.x+c.w/2,c.y+c.h/2,c.w/2,c.h/2,0,0,Math.PI*2);ctx.fill();}
  else if(c.type==='text'){ctx.font=c.fontSize+'px Arial';ctx.textBaseline='top';c.text.split('\n').forEach((line,i)=>ctx.fillText(line,c.x,c.y+i*c.fontSize*1.2,c.w));}
  else{const r=cache.get(assets.find(a=>a.id===c.assetId)?.src);if(r){const factor=Math.min(c.w/r.width,c.h/r.height),w=r.width*factor,h=r.height*factor;ctx.drawImage(frameFor(r,c,c.mediaTime),c.x+(c.w-w)/2,c.y+(c.h-h)/2,w,h);}}
  ctx.restore();
 }
 $('#time').textContent=t.toFixed(2)+' / '+project.duration.toFixed(2)+' s';$('#scrub').value=t;window.VidixFrames?.update();
}
function properties(){const c=clip();$('#clipProperties').hidden=!c;if(!c)return;for(const key of ['label','text','start','trim','speed','x','y','toX','toY','w','h','fontSize','color','opacity','fade'])$('#'+key).value=c[key];$('#clipDuration').value=c.duration;for(const input of $('#clipProperties').querySelectorAll('input,textarea'))input.disabled=c.locked;$('#up').disabled=$('#down').disabled=$('#front').disabled=$('#back').disabled=c.locked;$('#text').disabled=c.locked||c.type!=='text';$('#trim').disabled=$('#speed').disabled=c.locked||c.type!=='media';}
function render(){
 time=Math.min(time,project.duration);
 canvas.width=project.width;canvas.height=project.height;$('#name').value=project.name;
 for(const key of ['width','height','duration','fps','background'])$('#'+key).value=project[key];$('#scrub').max=project.duration;
 $('#undo').disabled=!history.length||busy;$('#redo').disabled=!future.length||busy;
 $('#duplicate').disabled=!clip()||busy;$('#delete').disabled=!clip()||clip().locked||busy;$('#timeline').replaceChildren();const zoom=Number($('#zoom').value);
 for(const c of project.clips){const row=document.createElement('div');row.className='track';row.style.width=(project.duration*zoom)+'px';const button=document.createElement('button');button.className='clip'+(c.id===selected?' selected':'');button.textContent=c.label;button.title=c.label+' · '+c.start+'–'+(c.start+c.duration)+' s';button.dataset.clip=c.id;button.style.left=c.start*zoom+'px';button.style.width=Math.max(30,c.duration*zoom)+'px';button.onclick=()=>{selected=c.id;render();};
  let drag;button.onpointerdown=e=>{if(busy||c.locked)return;selected=c.id;drag={x:e.clientX,start:c.start};button.setPointerCapture(e.pointerId);};button.onpointerup=e=>{if(!drag)return;const delta=(e.clientX-drag.x)/zoom,original=drag;drag=null;if(Math.abs(delta)>.03)transaction(()=>{c.start=Math.max(0,Math.min(project.duration-c.duration,Math.round((original.start+delta)*10)/10));});else{selected=c.id;render();}};
  row.append(button);$('#timeline').append(row);
 }
 $('#media').replaceChildren();for(const asset of assets){const row=document.createElement('div'),name=document.createElement('strong'),info=document.createElement('small'),add=document.createElement('button'),remove=document.createElement('button');name.textContent=asset.name;info.textContent=asset.kind+' · '+asset.width+' × '+asset.height;add.textContent='＋ Add clip';remove.textContent='Remove';add.onclick=()=>addClip('media',asset);remove.onclick=()=>{if(busy)return;if(project.clips.some(c=>c.assetId===asset.id)){toast('Remove the asset’s timeline clips first.');return;}checkpoint();assets=assets.filter(a=>a.id!==asset.id);save();render();};row.append(name,info,add,remove);$('#media').append(row);}
 window.VidixFrames?.render();properties();paint(time).catch(e=>toast(e.message));
}
function addClip(type,asset){transaction(()=>{const d=asset?.kind==='video'?Math.min(3,asset.duration,project.duration):Math.min(3,project.duration),w=asset?Math.min(project.width,asset.width):type==='text'?project.width*.75:200,h=asset?w*asset.height/asset.width:type==='text'?80:150;const c={id:id(),type,assetId:asset?.id||'',label:asset?.name||('New '+type),text:type==='text'?'Your story here':'',start:0,duration:d,x:60,y:60,toX:60,toY:60,w,h,color:'#c8a4d5',fontSize:48};project.clips.push(c);selected=c.id;});}
for(const [button,type]of [['addText','text'],['addRect','rect'],['addEllipse','ellipse']])$('#'+button).onclick=()=>addClip(type);
for(const key of ['name','width','height','duration','fps','background'])$('#'+key).onchange=e=>transaction(()=>{project[key]=['name','background'].includes(key)?e.target.value:Number(e.target.value);});
for(const key of ['label','text','start','trim','speed','x','y','toX','toY','w','h','fontSize','color','opacity','fade'])$('#'+key).onchange=e=>transaction(()=>{if(clip()&&!clip().locked)clip()[key]=['label','text','color'].includes(key)?e.target.value:Number(e.target.value);});
$('#clipDuration').onchange=e=>transaction(()=>{if(clip()&&!clip().locked)clip().duration=Number(e.target.value);});
$('#delete').onclick=()=>{if(clip()?.locked)return;transaction(()=>{project.clips=project.clips.filter(c=>c.id!==selected);selected=project.clips[0]?.id;});};
$('#duplicate').onclick=()=>transaction(()=>{const c=clone(clip());c.id=id();c.label+=' copy';project.clips.push(c);selected=c.id;});
for(const [button,delta]of [['up',-1],['down',1]])$('#'+button).onclick=()=>{if(clip()?.locked)return;transaction(()=>{const i=project.clips.findIndex(c=>c.id===selected),j=i+delta;if(i>=0&&j>=0&&j<project.clips.length)[project.clips[i],project.clips[j]]=[project.clips[j],project.clips[i]];});};
function restore(s){project=s.project;assets=s.assets;selected=project.clips[0]?.id;playing=false;time=0;save();render();}
$('#undo').onclick=()=>{if(!busy&&history.length){future.push(snapshot());restore(history.pop());}};$('#redo').onclick=()=>{if(!busy&&future.length){history.push(snapshot());restore(future.pop());}};
$('#zoom').oninput=()=>render();$('#scrub').oninput=()=>{if(busy)return;playing=false;time=Number($('#scrub').value);paint(time).catch(e=>toast(e.message));};
$('#play').onclick=async()=>{if(busy)return;if(playing){playing=false;$('#play').textContent='▶ Play';return;}playing=true;$('#play').textContent='Pause';const base=performance.now(),start=time>=project.duration-.01?0:time;async function frame(now){if(!playing){$('#play').textContent='▶ Play';return;}time=Math.min(project.duration,start+(now-base)/1000);try{await paint(time);}catch(e){toast(e.message);playing=false;}if(time>=project.duration)playing=false;if(playing)requestAnimationFrame(frame);else $('#play').textContent='▶ Play';}requestAnimationFrame(frame);};
$('#stop').onclick=()=>{if(busy)return;playing=false;time=0;paint(0);$('#play').textContent='▶ Play';};
$('#new').onclick=()=>{if(busy||!confirm('Start a new project? Undo restores the current one.'))return;checkpoint();project=V.starter();assets=[];time=0;playing=false;selected=project.clips[0].id;save();render();};
$('#importMedia').onclick=()=>$('#mediaFiles').click();$('#mediaFiles').onchange=async event=>{
 if(busy)return;busy=true;playing=false;const staged=[];
 try{if(assets.length+event.target.files.length>100)throw Error('Media libraries support at most 100 assets.');let total=assets.reduce((n,a)=>n+a.src.length,0);for(const file of event.target.files){
  if(file.size>20000000)throw Error('Each media file must be under 20 MB.');
  const svg=file.type==='image/svg+xml'||/\.svg$/i.test(file.name),gif=file.type==='image/gif'||/\.gif$/i.test(file.name),video=file.type.startsWith('video/')||/\.(mp4|webm|ogv|ogg|mov|m4v)$/i.test(file.name);
  if(!svg&&!gif&&!video&&!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Choose video, GIF, SVG, PNG, JPEG or WebP media.');
  const ext=file.name.split('.').pop().toLowerCase();let source=video?new Blob([file],{type:file.type.startsWith('video/')?file.type.split(';')[0]:({webm:'video/webm',ogv:'video/ogg',ogg:'video/ogg',mov:'video/quicktime'}[ext]||'video/mp4')}):gif?new Blob([file],{type:'image/gif'}):file;if(svg){const text=await file.text(),doc=new DOMParser().parseFromString(text,'image/svg+xml');if(doc.querySelector('parsererror')||doc.documentElement.localName!=='svg'||doc.documentElement.namespaceURI!=='http://www.w3.org/2000/svg')throw Error('Invalid SVG image.');source=new Blob([text],{type:'image/svg+xml'});}
  const asset={id:id(),name:file.name.slice(0,200),kind:video?'video':gif?'gif':svg?'svg':'image',src:await dataURL(source)};total+=asset.src.length;if(total>45000000)throw Error('Combined embedded media must stay under 34 MB.');
  const resource=await prepare(asset);Object.assign(asset,{width:resource.width,height:resource.height,duration:resource.duration});staged.push(asset);
 }
 checkpoint();assets.push(...staged);save();$('#status').textContent='Imported '+staged.length+' asset(s). Use Add clip to place them on the timeline.';
 }catch(e){toast(e.message);}finally{busy=false;event.target.value='';render();}
};
async function readBundle(value){if(!value||!Array.isArray(value.assets)||value.assets.length>100)throw Error('Provide a vidiX project with its assets.');const ids=new Set();let size=0;const next=[];for(const a of value.assets){if(!a||typeof a.id!=='string'||!a.id||ids.has(a.id)||!['video','gif','svg','image'].includes(a.kind)||typeof a.src!=='string'||!/^data:(image\/(png|jpeg|webp|gif|svg\+xml)|video\/[a-z0-9.+-]+);base64,[A-Za-z0-9+/=]+$/.test(a.src))throw Error('Invalid embedded media asset.');const mime=a.src.slice(5,a.src.indexOf(';')),kind=mime.startsWith('video/')?'video':mime==='image/gif'?'gif':mime==='image/svg+xml'?'svg':'image';if(a.kind!==kind)throw Error('Media kind does not match its embedded format.');ids.add(a.id);size+=a.src.length;if(size>45000000)throw Error('Project media is too large.');const r=await prepare(a);next.push({id:a.id,name:String(a.name||'Media').slice(0,200),kind:a.kind,src:a.src,width:r.width,height:r.height,duration:r.duration});}return {project:V.validate(value.project,next),assets:next};}
$('#open').onclick=()=>$('#file').click();$('#file').onchange=async e=>{if(busy)return;const file=e.target.files[0];if(!file)return;busy=true;playing=false;try{if(file.size>50000000)throw Error('Project files must be under 50 MB.');const bundle=await readBundle(JSON.parse(await file.text()));checkpoint();restore(bundle);toast('Project opened. Undo restores the previous timeline.');}catch(error){toast(error.message);}finally{busy=false;e.target.value='';render();}};
function download(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;SuiteDiskUI.download(a);setTimeout(()=>URL.revokeObjectURL(url),30000);}
const filename=()=>project.name.replace(/[^\w .-]/g,'_')||'motion';$('#save').onclick=()=>download(new Blob([JSON.stringify(snapshot(),null,2)],{type:'application/json'}),filename()+'.vidix.json');
$('#askAI').onclick=()=>$('#sai-launch').click();
const escapeXML=value=>String(value).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
async function animatedSVG(){
 const elements=[];
 for(const c of project.clips){
  if(c.hidden)continue;
  const end=c.start+c.duration,fade=Math.min(c.fade,c.duration/2),points=[0,c.start,Math.min(end,c.start+fade),Math.max(c.start,end-fade),end,project.duration];
  if(!fade){points.push(Math.max(0,c.start-.0001),Math.max(0,end-.0001));}
  const times=[...new Set(points)].sort((a,b)=>a-b),values=times.map(t=>{if(t<c.start||t>=end)return 0;return c.opacity*(fade?Math.min(1,(t-c.start)/fade,(end-t)/fade):1);});
  const motionTimes=[...new Set([0,c.start,end,project.duration])].sort((a,b)=>a-b),positions=motionTimes.map(t=>{const p=Math.max(0,Math.min(1,(t-c.start)/c.duration));return (c.x+(c.toX-c.x)*p)+' '+(c.y+(c.toY-c.y)*p);});
  const animation='<animate attributeName="opacity" dur="'+project.duration+'s" repeatCount="indefinite" values="'+values.join(';')+'" keyTimes="'+times.map(t=>t/project.duration).join(';')+'"/><animateTransform attributeName="transform" type="translate" dur="'+project.duration+'s" repeatCount="indefinite" values="'+positions.join(';')+'" keyTimes="'+motionTimes.map(t=>t/project.duration).join(';')+'"/>';
  let content='';
  if(c.type==='vector'){content=c.frames.map((f,i)=>{const begin=f.frame/project.fps,next=c.frames[i+1]?.frame/project.fps??c.duration,svg=V.drawing(c,c.start+begin,project.fps).svg;return '<image width="'+c.w+'" height="'+c.h+'" href="data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(svg)))+'" visibility="hidden"><set attributeName="visibility" to="visible" begin="cycle.begin+'+(c.start+begin)+'s" dur="'+(next-begin)+'s"/></image>';}).join('');}
  else if(c.type==='rect')content='<rect width="'+c.w+'" height="'+c.h+'" fill="'+c.color+'"/>';
  else if(c.type==='ellipse')content='<ellipse cx="'+c.w/2+'" cy="'+c.h/2+'" rx="'+c.w/2+'" ry="'+c.h/2+'" fill="'+c.color+'"/>';
  else if(c.type==='text')content='<text font-family="Arial,sans-serif" font-size="'+c.fontSize+'" fill="'+c.color+'">'+c.text.split('\n').map((line,i)=>'<tspan x="0" y="'+(c.fontSize+i*c.fontSize*1.2)+'">'+escapeXML(line)+'</tspan>').join('')+'</text>';
  else{
   const r=cache.get(assets.find(a=>a.id===c.assetId)?.src);if(!r)throw Error('Media asset is not loaded.');if(r.element instanceof HTMLVideoElement)await seek(r.element,c.trim);
   const poster=document.createElement('canvas');poster.width=Math.min(1920,r.width);poster.height=Math.max(1,Math.round(poster.width*r.height/r.width));poster.getContext('2d').drawImage(frameFor(r,c,c.trim),0,0,poster.width,poster.height);
   content='<image href="'+poster.toDataURL('image/png')+'" width="'+c.w+'" height="'+c.h+'" preserveAspectRatio="xMidYMid meet"/>';
  }
  elements.push('<g opacity="0" transform="translate('+c.x+' '+c.y+')">'+animation+content+'</g>');
 }
 return new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="'+project.width+'" height="'+project.height+'" viewBox="0 0 '+project.width+' '+project.height+'"><defs><rect id="cycle-clock"><animate id="cycle" attributeName="opacity" values="0;0" dur="'+project.duration+'s" begin="0s;cycle.end"/></rect></defs><title>'+escapeXML(project.name)+'</title><desc>Animated vidiX timeline. Video and GIF layers are embedded poster frames; layer movement and fades remain animated.</desc><rect width="100%" height="100%" fill="'+project.background+'"/>'+elements.join('')+'</svg>'],{type:'image/svg+xml'});
}
const yieldFrame=()=>new Promise(resolve=>setTimeout(resolve,0));
async function gifExport(){
 const count=Math.ceil(project.duration*project.fps);if(count>300)throw Error('GIF export supports 300 frames. Reduce duration or frame rate.');
 const {GIFEncoder,quantize,applyPalette}=await import('./vendor/gifenc.js'),gif=GIFEncoder(),small=document.createElement('canvas'),factor=Math.min(1,640/project.width,640/project.height);small.width=Math.round(project.width*factor);small.height=Math.round(project.height*factor);const context=small.getContext('2d',{willReadFrequently:true});
 for(let i=0;i<count;i++){if(cancelled)throw Error('Export canceled.');await paint(i/project.fps,true);context.drawImage(canvas,0,0,small.width,small.height);const rgba=context.getImageData(0,0,small.width,small.height).data,palette=quantize(rgba,256),index=applyPalette(rgba,palette);gif.writeFrame(index,small.width,small.height,{palette,delay:Math.round(1000/project.fps),repeat:0});$('#status').textContent='Encoding GIF · '+(i+1)+' / '+count+' frames';await yieldFrame();}
 gif.finish();return new Blob([gif.bytes()],{type:'image/gif'});
}
async function videoExport(format){
 if(!window.MediaRecorder||!canvas.captureStream)throw Error('This browser does not support video recording. Use GIF or animated SVG.');
 const choices=format==='mp4'?['video/mp4;codecs=avc1.42E01E','video/mp4']:['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];const mimeType=choices.find(type=>MediaRecorder.isTypeSupported(type));if(!mimeType)throw Error(format.toUpperCase()+' recording is not supported by this browser. Choose WebM, GIF or SVG.');
 await paint(0,true);const stream=canvas.captureStream(project.fps),chunks=[];let recorder;try{recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:4000000});}catch(error){stream.getTracks().forEach(track=>track.stop());throw error;}let failure,startedRecording=false;
 recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onerror=e=>{failure=e.error||Error('Video recording failed.');};const stopped=new Promise(resolve=>{recorder.onstop=resolve;});
 try{recorder.start(500);startedRecording=true;const started=performance.now(),count=Math.ceil(project.duration*project.fps);for(let i=0;i<count;i++){if(cancelled)throw Error('Export canceled.');if(failure)throw failure;await paint(i/project.fps,true);$('#status').textContent='Recording silent '+format.toUpperCase()+' · '+Math.round((i+1)/count*100)+'%';await new Promise(resolve=>setTimeout(resolve,Math.max(0,started+(i+1)*1000/project.fps-performance.now())));}if(failure)throw failure;}
 finally{if(recorder.state!=='inactive')recorder.stop();if(startedRecording)await stopped;stream.getTracks().forEach(track=>track.stop());}
 if(!chunks.length)throw Error('The browser produced an empty video.');return new Blob(chunks,{type:mimeType});
}
$('#cancel').onclick=()=>{cancelled=true;$('#status').textContent='Canceling export…';};
$('#export').onclick=async()=>{
 if(busy)return;busy=true;playing=false;cancelled=false;$('#cancel').hidden=false;const format=$('#exportFormat').value;
 const controls=[...document.querySelectorAll('header button,header input,header select,main button,main input,main textarea')];const disabled=controls.map(control=>control.disabled);controls.forEach(control=>{if(control.id!=='cancel')control.disabled=true;});
 try{
  let blob;if(format==='gif')blob=await gifExport();else if(format==='svg')blob=await animatedSVG();else if(format==='png'){await paint(time,true);blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));}else blob=await videoExport(format);
  if(cancelled)throw Error('Export canceled.');download(blob,filename()+'.'+format);$('#status').textContent='Export ready · '+format.toUpperCase()+(format==='svg'?' · video/GIF layers use poster frames':'');
 }catch(e){$('#status').textContent=e.message;toast(e.message);}finally{busy=false;$('#cancel').hidden=true;controls.forEach((control,i)=>{control.disabled=disabled[i];});render();}
};
(async()=>{try{const saved=localStorage.getItem('vidix-project');if(saved){busy=true;const bundle=await readBundle(JSON.parse(saved));project=bundle.project;assets=bundle.assets;selected=project.clips[0]?.id;}}catch(e){toast('Saved project could not be restored: '+e.message);}finally{busy=false;render();}})();
