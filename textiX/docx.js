/* Browser-only Word interchange. Dependencies and licenses are in vendor/. */
(function(){'use strict';
const D=window.docx;
function color(value){const m=String(value||'').match(/^#([\da-f]{6})$/i);if(m)return m[1];const rgb=String(value||'').match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);return rgb?rgb.slice(1).map(n=>Math.min(255,+n).toString(16).padStart(2,'0')).join(''):undefined;}
function style(node,inherited={}){
 const s={...inherited},tag=node.localName,c=node.style;
 if(['b','strong'].includes(tag)||['bold','700','800','900'].includes(c.fontWeight))s.bold=true;
 if(['i','em'].includes(tag)||c.fontStyle==='italic')s.italics=true;
 if(tag==='u'||c.textDecoration.includes('underline'))s.underline={};
 if(['s','strike','del'].includes(tag)||c.textDecoration.includes('line-through'))s.strike=true;
 if(tag==='sub')s.subScript=true;if(tag==='sup')s.superScript=true;
 if(tag==='code'||tag==='pre')s.font='Courier New';
 if(c.fontFamily||node.getAttribute('face'))s.font=(c.fontFamily||node.getAttribute('face')).split(',')[0].replace(/["']/g,'');
 const rgb=color(c.color||node.getAttribute('color'));if(rgb)s.color=rgb;
 if(c.backgroundColor&&color(c.backgroundColor))s.shading={fill:color(c.backgroundColor)};
 const size=parseFloat(c.fontSize);if(size)s.size=Math.round(size*(c.fontSize.endsWith('pt')?2:1.5));
 if(tag==='font'&&node.getAttribute('size'))s.size=({1:16,2:20,3:24,4:28,5:36,6:48,7:72})[node.getAttribute('size')]||24;
 return s;
}
async function write(html,name){
 const root=document.createElement('div');root.innerHTML=html;const notes=new Set();let listIndex=0;const numbering=[];
 async function runs(parent,inherited={}){
  const out=[];
  for(const node of parent.childNodes){
   if(node.nodeType===3){if(node.textContent)out.push(new D.TextRun({...inherited,text:node.textContent}));continue;}
   if(node.nodeType!==1)continue;
   const s=style(node,inherited),tag=node.localName;
   if(tag==='br'){out.push(new D.TextRun({break:1}));continue;}
   if(tag==='img'){
    const match=/^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(node.src);if(!match)continue;
    const img=new Image();img.src=node.src;await img.decode();let src=node.src,type=match[1]==='jpeg'?'jpg':match[1];
    if(type==='webp'){const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;c.getContext('2d').drawImage(img,0,0);src=c.toDataURL('image/png');type='png';}
    const width=Math.min(600,Number(node.getAttribute('width'))||img.naturalWidth),height=width*img.naturalHeight/img.naturalWidth;
    out.push(new D.ImageRun({type,data:Uint8Array.from(atob(src.split(',')[1]),c=>c.charCodeAt(0)),transformation:{width,height},altText:{title:node.alt||'',description:node.alt||'',name:node.alt||'Image'}}));continue;
   }
   if(tag==='a'){const children=await runs(node,s);if(/^(https?:|mailto:|tel:)/i.test(node.getAttribute('href')||''))out.push(new D.ExternalHyperlink({link:node.getAttribute('href'),children}));else out.push(...children);continue;}
   if(['ul','ol','table'].includes(tag))continue;
   out.push(...await runs(node,s));
  }
  return out;
 }
 function paragraphOptions(node,extra={}){
  const tag=node.localName,options={...extra};if(/^h[1-6]$/.test(tag))options.heading=D.HeadingLevel['HEADING_'+tag[1]];
  const align=node.style?.textAlign;if(['left','right','center','justify'].includes(align))options.alignment=align==='justify'?D.AlignmentType.JUSTIFIED:align;
  if(tag==='blockquote')options.indent={left:720};
  return options;
 }
 async function blocks(parent,level=0){
  const out=[];let pending=[];
  const flush=()=>{if(pending.length){out.push(new D.Paragraph({children:pending}));pending=[];}};
  for(const node of parent.childNodes){
   if(node.nodeType===3){if(node.textContent.trim())pending.push(new D.TextRun(node.textContent));continue;}if(node.nodeType!==1)continue;
   const tag=node.localName;
   if(tag==='table'){
    flush();const rows=[];
    for(const row of node.rows){const cells=[];for(const cell of row.cells){if(cell.rowSpan>1)notes.add('Merged table rows are flattened.');const children=await blocks(cell);cells.push(new D.TableCell({children:children.length?children:[new D.Paragraph('')],columnSpan:cell.colSpan>1?cell.colSpan:undefined}));}if(cells.length)rows.push(new D.TableRow({children:cells}));}
    if(rows.length)out.push(new D.Table({rows,width:{size:100,type:D.WidthType.PERCENTAGE}}));continue;
   }
   if(tag==='ul'||tag==='ol'){
    flush();const reference='list-'+(++listIndex);numbering.push({reference,levels:Array.from({length:9},(_,i)=>({level:i,format:tag==='ol'?D.LevelFormat.DECIMAL:D.LevelFormat.BULLET,text:tag==='ol'?'%'+(i+1)+'.':'•',alignment:D.AlignmentType.LEFT,start:Number(node.getAttribute('start'))||1,style:{paragraph:{indent:{left:720*(i+1),hanging:360}}}}))});
    for(const li of [...node.children].filter(n=>n.localName==='li')){out.push(new D.Paragraph({children:await runs(li),numbering:{reference,level:Math.min(level,8)}}));for(const nested of li.children)if(['ul','ol'].includes(nested.localName)){const holder=document.createElement('div');holder.append(nested.cloneNode(true));out.push(...await blocks(holder,level+1));}}
    continue;
   }
   if(node.classList.contains('page-break')||node.style.breakAfter==='page'){flush();out.push(new D.Paragraph({children:[new D.PageBreak()]}));continue;}
   if(tag==='hr'){flush();out.push(new D.Paragraph({border:{bottom:{color:'AAAAAA',space:1,style:D.BorderStyle.SINGLE,size:6}}}));continue;}
   if(['p','div','blockquote','pre','h1','h2','h3','h4','h5','h6'].includes(tag)){
    flush();if(tag==='div'&&node.querySelector('p,div,table,ul,ol,h1,h2,h3'))out.push(...await blocks(node,level));else out.push(new D.Paragraph({...paragraphOptions(node),children:await runs(node,style(node))}));continue;
   }
   const wrapper=document.createElement('span');wrapper.append(node.cloneNode(true));pending.push(...await runs(wrapper));
  }
  flush();return out;
 }
 const children=await blocks(root),documentFile=new D.Document({title:name,creator:'textiX',numbering:{config:numbering},sections:[{children:children.length?children:[new D.Paragraph('')]}]});
 return {blob:await D.Packer.toBlob(documentFile),warnings:[...notes]};
}
async function read(file){
 const arrayBuffer=await file.arrayBuffer(),zip=await JSZip.loadAsync(arrayBuffer);let size=0,count=0;
 for(const entry of Object.values(zip.files)){size+=entry._data?.uncompressedSize||0;if(++count>3000||size>30000000)throw Error('DOCX expands beyond the 30 MB / 3000-entry import limit.');}
 if(!zip.file('word/document.xml'))throw Error('This is not a Word DOCX document.');
 const result=await mammoth.convertToHtml({arrayBuffer},{externalFileAccess:false,styleMap:["u => u","strike => s","br[type='page'] => div.page-break:fresh > br","p[style-name='Quote'] => blockquote:fresh"]});
 return {html:result.value,warnings:result.messages.map(m=>m.message)};
}
window.TextixDocx={write,read};
})();
