(function(root){'use strict';
 const M=root.Cncfix,R=root.CncfixRender;
 const STORE='cncfix-project-v1',MAX_UNDO=60;
 const $=id=>document.getElementById(id);
 let project=loadInitial(),undo=[],redo=[],zoom=100;

 function loadInitial(){
  try{
   const raw=localStorage.getItem(STORE);
   if(raw)return M.validate(JSON.parse(raw));
  }catch{
   const btn=$('recover');if(btn)btn.hidden=false;
  }
  return M.create(false);
 }

 function persist(){
  try{localStorage.setItem(STORE,JSON.stringify(project));$('save-state').textContent='Saved locally';}
  catch{$('save-state').textContent='Storage full (export JSON)';}
 }

 function commit(mutator,label='Updated'){
  const prev=M.copy(project);
  mutator(project);
  project=M.validate(project);
  undo.push(prev);if(undo.length>MAX_UNDO)undo.shift();
  redo=[];
  persist();
  renderAll();
  $('status').textContent=label;
 }

 function activeItem(){return project.items.find(i=>i.id===project.activeItemId)||project.items[0]||null;}
 function activeCat(){return project.categories.find(c=>c.id===project.activeCategoryId)||project.categories[0];}

 function renderCategories(){
  const list=$('category-list');list.innerHTML='';
  for(const cat of project.categories){
   const count=project.items.filter(i=>i.categoryId===cat.id).length;
   const btn=document.createElement('button');
   btn.textContent=`${cat.name} (${count})`;
   if(cat.id===project.activeCategoryId)btn.setAttribute('aria-current','true');
   btn.onclick=()=>{project.activeCategoryId=cat.id;const first=project.items.find(i=>i.categoryId===cat.id);if(first)project.activeItemId=first.id;renderAll();};
   list.appendChild(btn);
  }
 }

 function renderCatalog(){
  const q=$('catalog-search').value.trim().toLowerCase();
  const list=$('catalog-list');list.innerHTML='';
  const matches=M.CNCF_CATALOG.filter(c=>!q||(c.name+' '+c.category+' '+c.subcategory+' '+c.maturity).toLowerCase().includes(q)).slice(0,12);
  for(const entry of matches){
   const btn=document.createElement('button');
   btn.innerHTML=`<strong>+ ${entry.name}</strong><small>${entry.category} · ${entry.maturity}</small>`;
   btn.onclick=()=>commit(p=>{
    let cat=p.categories.find(c=>c.name===entry.category);
    if(!cat){cat=M.makeCategory(entry.category);p.categories.push(cat);}
    let sub=p.subcategories.find(s=>s.categoryId===cat.id&&s.name===entry.subcategory);
    if(!sub){sub=M.makeSubcategory(cat.id,entry.subcategory);p.subcategories.push(sub);}
    const item=M.makeItem(cat.id,sub.id,entry);
    p.items.push(item);p.activeCategoryId=cat.id;p.activeItemId=item.id;
   },'Added '+entry.name);
   list.appendChild(btn);
  }
 }

 function renderTemplates(){
  const box=$('templates');box.innerHTML='';
  for(const t of M.templates){
   const btn=document.createElement('button');
   btn.innerHTML=`<strong>${t.name}</strong><small>${t.description}</small>`;
   btn.onclick=()=>commit(()=>{project=t.build();},'Loaded '+t.name);
   box.appendChild(btn);
  }
 }

 function renderInspector(){
  $('name').value=project.name;
  $('subtitle').value=project.subtitle||'';
  $('columns').value=project.settings.columns;
  $('card-width').value=project.settings.cardWidth;
  $('show-legend').checked=project.settings.showLegend;
  $('show-maturity').checked=project.settings.showMaturity;
  $('show-oss').checked=project.settings.showOssBadge;
  $('undo').disabled=!undo.length;
  $('redo').disabled=!redo.length;

  const cat=activeCat();
  $('cat-name').value=cat?.name||'';
  $('cat-color').value=cat?.color||'#1e5a8a';
  $('del-cat').disabled=project.categories.length<=1;

  const item=activeItem();
  const catSel=$('item-cat'),subSel=$('item-sub');
  catSel.innerHTML='';subSel.innerHTML='';
  for(const c of project.categories){const o=document.createElement('option');o.value=c.id;o.textContent=c.name;catSel.appendChild(o);}
  const targetCatId=item?.categoryId||cat?.id;
  for(const s of project.subcategories.filter(s=>s.categoryId===targetCatId)){const o=document.createElement('option');o.value=s.id;o.textContent=s.name;subSel.appendChild(o);}
  const hasItem=!!item;
  for(const id of ['item-name','item-cat','item-sub','item-maturity','item-oss','item-homepage','item-repo','item-desc','item-notes','dup-item','del-item'])$(id).disabled=!hasItem;
  if(item){
   $('item-name').value=item.name;
   catSel.value=item.categoryId;
   subSel.value=item.subcategoryId;
   $('item-maturity').value=item.maturity;
   $('item-oss').checked=item.oss!==false;
   $('item-homepage').value=item.homepage||'';
   $('item-repo').value=item.repo||'';
   $('item-desc').value=item.description||'';
   $('item-notes').value=item.notes||'';
  }else{
   $('item-name').value='';$('item-homepage').value='';$('item-repo').value='';$('item-desc').value='';$('item-notes').value='';
  }
 }

 function renderPreview(){
  const preview=$('preview');
  preview.innerHTML=R.renderSvg(project,{maturity:$('filter-maturity').value,search:$('filter-text').value,activeItemId:project.activeItemId});
  preview.style.transform=`scale(${zoom/100})`;
  $('zoom-label').textContent=zoom+'%';
  preview.querySelectorAll('.lx-item').forEach(el=>{
   el.onclick=()=>{
    const id=el.getAttribute('data-item-id');
    const found=project.items.find(i=>i.id===id);
    if(found){project.activeItemId=found.id;project.activeCategoryId=found.categoryId;renderAll();}
   };
  });
 }

 function renderAll(){renderCategories();renderCatalog();renderInspector();renderPreview();}

 function download(filename,content,mime){
  const blob=new Blob([content],{type:mime});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=filename;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 }

 // Wire controls
 $('name').onchange=()=>commit(p=>{p.name=$('name').value.trim()||'Untitled Landscape';});
 $('subtitle').onchange=()=>commit(p=>{p.subtitle=$('subtitle').value;});
 $('columns').onchange=()=>commit(p=>{p.settings.columns=Math.max(1,Math.min(6,parseInt($('columns').value,10)||4));});
 $('card-width').onchange=()=>commit(p=>{p.settings.cardWidth=Math.max(110,Math.min(240,parseInt($('card-width').value,10)||156));});
 $('show-legend').onchange=()=>commit(p=>{p.settings.showLegend=$('show-legend').checked;});
 $('show-maturity').onchange=()=>commit(p=>{p.settings.showMaturity=$('show-maturity').checked;});
 $('show-oss').onchange=()=>commit(p=>{p.settings.showOssBadge=$('show-oss').checked;});
 $('catalog-search').oninput=renderCatalog;
 $('filter-maturity').onchange=renderPreview;
 $('filter-text').oninput=renderPreview;
 $('zoom').oninput=()=>{zoom=parseInt($('zoom').value,10)||100;renderPreview();};
 $('fit').onclick=()=>{
  const svg=$('preview').querySelector('svg');
  const wrap=$('preview-wrap');
  if(!svg)return;
  const w=parseFloat(svg.getAttribute('width'))||800;
  zoom=Math.max(25,Math.min(150,Math.floor(((wrap.clientWidth-48)/w)*100)));
  $('zoom').value=zoom;renderPreview();
 };

 $('undo').onclick=()=>{if(!undo.length)return;redo.push(M.copy(project));project=undo.pop();persist();renderAll();};
 $('redo').onclick=()=>{if(!redo.length)return;undo.push(M.copy(project));project=redo.pop();persist();renderAll();};

 $('new').onclick=()=>commit(()=>{project=M.create(true);},'Created blank landscape');
 $('add-cat').onclick=()=>commit(p=>{
  const cat=M.makeCategory('New Category '+(p.categories.length+1));
  const sub=M.makeSubcategory(cat.id,'General');
  p.categories.push(cat);p.subcategories.push(sub);p.activeCategoryId=cat.id;
 },'Added category');
 $('add-sub').onclick=()=>commit(p=>{
  const cat=activeCat();
  const sub=M.makeSubcategory(cat.id,'Subcategory '+(p.subcategories.filter(s=>s.categoryId===cat.id).length+1));
  p.subcategories.push(sub);
 },'Added subcategory');
 $('add-item').onclick=()=>commit(p=>{
  const cat=activeCat();
  let sub=p.subcategories.find(s=>s.categoryId===cat.id);
  if(!sub){sub=M.makeSubcategory(cat.id,'General');p.subcategories.push(sub);}
  const item=M.makeItem(cat.id,sub.id,{name:'Project '+(p.items.length+1)});
  p.items.push(item);p.activeItemId=item.id;
 },'Added project');

 $('item-name').onchange=()=>commit(p=>{const it=p.items.find(i=>i.id===p.activeItemId);if(it)it.name=$('item-name').value.trim()||it.name;});
 $('item-cat').onchange=()=>commit(p=>{
  const it=p.items.find(i=>i.id===p.activeItemId);if(!it)return;
  it.categoryId=$('item-cat').value;
  let sub=p.subcategories.find(s=>s.categoryId===it.categoryId);
  if(!sub){sub=M.makeSubcategory(it.categoryId,'General');p.subcategories.push(sub);}
  it.subcategoryId=sub.id;p.activeCategoryId=it.categoryId;
 });
 $('item-sub').onchange=()=>commit(p=>{const it=p.items.find(i=>i.id===p.activeItemId);if(it)it.subcategoryId=$('item-sub').value;});
 $('item-maturity').onchange=()=>commit(p=>{const it=p.items.find(i=>i.id===p.activeItemId);if(it)it.maturity=$('item-maturity').value;});
 $('item-oss').onchange=()=>commit(p=>{const it=p.items.find(i=>i.id===p.activeItemId);if(it)it.oss=$('item-oss').checked;});
 $('item-homepage').onchange=()=>commit(p=>{const it=p.items.find(i=>i.id===p.activeItemId);if(it)it.homepage=$('item-homepage').value;});
 $('item-repo').onchange=()=>commit(p=>{const it=p.items.find(i=>i.id===p.activeItemId);if(it)it.repo=$('item-repo').value;});
 $('item-desc').onchange=()=>commit(p=>{const it=p.items.find(i=>i.id===p.activeItemId);if(it)it.description=$('item-desc').value;});
 $('item-notes').onchange=()=>commit(p=>{const it=p.items.find(i=>i.id===p.activeItemId);if(it)it.notes=$('item-notes').value;});
 $('dup-item').onclick=()=>commit(p=>{
  const it=p.items.find(i=>i.id===p.activeItemId);if(!it)return;
  const copy=M.makeItem(it.categoryId,it.subcategoryId,{...it,id:undefined,name:it.name+' copy'});
  p.items.push(copy);p.activeItemId=copy.id;
 },'Duplicated project');
 $('del-item').onclick=()=>commit(p=>{
  const idx=p.items.findIndex(i=>i.id===p.activeItemId);if(idx<0)return;
  p.items.splice(idx,1);p.activeItemId=p.items[Math.max(0,idx-1)]?.id||null;
 },'Deleted project');

 $('cat-name').onchange=()=>commit(p=>{const c=p.categories.find(x=>x.id===p.activeCategoryId);if(c)c.name=$('cat-name').value.trim()||c.name;});
 $('cat-color').onchange=()=>commit(p=>{const c=p.categories.find(x=>x.id===p.activeCategoryId);if(c)c.color=$('cat-color').value;});
 $('del-cat').onclick=()=>commit(p=>{
  if(p.categories.length<=1)return;
  const cid=p.activeCategoryId;
  p.categories=p.categories.filter(c=>c.id!==cid);
  p.subcategories=p.subcategories.filter(s=>s.categoryId!==cid);
  p.items=p.items.filter(i=>i.categoryId!==cid);
  p.activeCategoryId=p.categories[0].id;p.activeItemId=p.items[0]?.id||null;
 },'Deleted category');

 $('import').onclick=()=>$('file').click();
 $('file').onchange=async e=>{
  const file=e.target.files?.[0];if(!file)return;
  const text=await file.text();
  try{
   let loaded;
   if(file.name.endsWith('.svg')||text.trim().startsWith('<svg')){
    const m=/<cncfix-project[^>]*>([\s\S]*?)<\/cncfix-project>/.exec(text);
    if(!m)throw Error('SVG does not contain embedded cncfiX project metadata.');
    const dec=document.createElement('textarea');dec.innerHTML=m[1];
    loaded=M.validate(JSON.parse(dec.value));
   }else if(file.name.endsWith('.yml')||file.name.endsWith('.yaml')||/^\s*landscape\s*:/m.test(text)){
    loaded=M.fromLandscapeYaml(text,file.name.replace(/\.(ya?ml)$/i,''));
   }else{
    loaded=M.validate(JSON.parse(text));
   }
   commit(()=>{project=loaded;},'Opened '+file.name);
   $('error').textContent='';
  }catch(err){$('error').textContent=err.message;}
  e.target.value='';
 };

 $('open-export').onclick=()=>$('export-dialog').showModal();
 $('export-close').onclick=()=>$('export-dialog').close();
 $('doExport').onclick=async ()=>{
  const fmt=$('format').value;
  const slug=(project.name||'landscape').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'landscape';
  if(fmt==='svg')download(slug+'.svg',R.renderSvg(project,{embedProject:true}),'image/svg+xml');
  else if(fmt==='png'){
   const svg=R.renderSvg(project,{embedProject:false});
   const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
   try{
    const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=url;});
    const c=document.createElement('canvas');c.width=img.naturalWidth*2;c.height=img.naturalHeight*2;
    const ctx=c.getContext('2d');ctx.scale(2,2);ctx.drawImage(img,0,0);
    const blob=await new Promise(res=>c.toBlob(res,'image/png'));
    const pngUrl=URL.createObjectURL(blob);const a=document.createElement('a');a.href=pngUrl;a.download=slug+'.png';a.click();
    setTimeout(()=>URL.revokeObjectURL(pngUrl),1000);
   }finally{URL.revokeObjectURL(url);}
  }
  else if(fmt==='yaml')download(slug+'-landscape.yml',M.toLandscapeYaml(project),'text/yaml');
  else download(slug+'.cncfix.json',JSON.stringify(project,null,2),'application/json');
  $('export-dialog').close();
 };
 root.addEventListener('keydown',e=>{
  if(!(e.ctrlKey||e.metaKey))return;
  const tag=e.target?.tagName;
  if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT')return;
  if(e.key.toLowerCase()==='z'&&!e.shiftKey){e.preventDefault();$('undo').click();}
  else if((e.key.toLowerCase()==='z'&&e.shiftKey)||e.key.toLowerCase()==='y'){e.preventDefault();$('redo').click();}
 });
 $('schema').onclick=()=>download('cncfix-project.schema.json',JSON.stringify(M.schema,null,2),'application/json');
 $('recover').onclick=()=>{download('cncfix-recovery.json',localStorage.getItem(STORE)||'{}','application/json');};

 renderTemplates();renderAll();

 root.CncfixApp={
  snapshot:()=>M.copy(project),
  selection:()=>({activeCategoryId:project.activeCategoryId,activeItemId:project.activeItemId,item:activeItem()}),
  validate:raw=>M.validate(raw),
  apply:next=>commit(()=>{project=M.validate(next);},'Applied proposal'),
  restore:prev=>commit(()=>{project=M.validate(prev);},'Restored snapshot'),
  isBusy:()=>false
 };
})(window);
