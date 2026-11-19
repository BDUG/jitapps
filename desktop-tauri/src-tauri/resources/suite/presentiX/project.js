(function(root){'use strict';
const uid=()=>globalThis.crypto?.randomUUID?.()||'px-'+Math.random().toString(36).slice(2),color=(v,d)=>/^#[\da-f]{6}$/i.test(v)?v:d;
function validate(value){
 if(!value||typeof value.name!=='string'||!value.name.trim()||value.name.length>150||!Array.isArray(value.slides)||!value.slides.length||value.slides.length>100)throw Error('Provide a deck name and 1–100 slides.');
 const number=(v,d,min,max)=>{const n=v===undefined?d:Number(v);if(!Number.isFinite(n)||n<min||n>max)throw Error('Invalid element dimensions or formatting.');return n;};
 const width=number(value.width,960,320,3000),height=number(value.height,540,240,3000);let count=0,images=0;const ids=new Set();
 const text=(v,max=10000)=>{if(v===undefined)return '';if(typeof v!=='string'||v.length>max||v.includes('\0'))throw Error('Text is invalid or too long.');return v;};
 const slides=value.slides.map(s=>{
  if(!s||!Array.isArray(s.elements)||s.elements.length>200)throw Error('Use up to 200 elements per slide.');
  const sid=typeof s.id==='string'&&s.id.length<150?s.id:uid();if(ids.has(sid))throw Error('Duplicate slide or element ID.');ids.add(sid);
  const elements=s.elements.map(e=>{
   if(!e||!['text','rect','ellipse','image'].includes(e.type)||++count>2000)throw Error('Unsupported element or too many elements.');
   const id=typeof e.id==='string'&&e.id.length<150?e.id:uid();if(ids.has(id))throw Error('Duplicate slide or element ID.');ids.add(id);
   let src='';if(e.type==='image'){src=e.src;if(typeof src!=='string'||!/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(src)||src.length>4000000)throw Error('Use an embedded PNG, JPEG, GIF or WebP image under 3 MB.');images+=src.length;if(images>16000000)throw Error('Deck images exceed 12 MB.');}
   return {id,type:e.type,x:number(e.x,60,-3000,6000),y:number(e.y,60,-3000,6000),w:number(e.w,400,1,6000),h:number(e.h,100,1,6000),rotation:number(e.rotation,0,-36000,36000),text:text(e.text),fontSize:number(e.fontSize,32,6,300),color:color(e.color,'#30283e'),fill:e.fill==='none'?'none':color(e.fill,e.type==='text'?'none':'#8b6ab7'),align:['left','center','right'].includes(e.align)?e.align:'left',bold:!!e.bold,src};
  });return {id:sid,title:text(s.title,200)||'Untitled slide',background:color(s.background,'#ffffff'),notes:text(s.notes,20000),elements};
 });const out={version:1,name:value.name,width,height,slides};if(JSON.stringify(out).length>20000000)throw Error('Deck exceeds 20 MB.');return out;
}
function element(type,attrs={}){return {id:uid(),type,x:70,y:100,w:400,h:100,text:type==='text'?'Your text':'',fontSize:32,color:'#30283e',fill:type==='text'?'none':'#8b6ab7',align:'left',bold:false,rotation:0,src:'',...attrs};}
function slide(title='New slide',subtitle='Share one clear idea.'){return {id:uid(),title,background:'#ffffff',notes:'',elements:[element('text',{text:title,x:65,y:65,w:830,h:85,fontSize:48,bold:true}),element('text',{text:subtitle,x:70,y:185,w:800,h:230,fontSize:28,color:'#766a87'})]};}
function starter(){return validate({name:'A story worth sharing',width:960,height:540,slides:[slide('A story worth sharing','A clear idea. A compelling presentation.'),slide('The opportunity','Describe the challenge and why it matters.'),slide('What comes next','Make your next steps clear and actionable.')]});}
const schema={type:'object',required:['name','width','height','slides'],properties:{name:{type:'string',maxLength:150},width:{type:'number'},height:{type:'number'},slides:{type:'array',minItems:1,maxItems:100,items:{type:'object',required:['title','background','notes','elements'],properties:{id:{type:'string'},title:{type:'string'},background:{type:'string'},notes:{type:'string'},elements:{type:'array',maxItems:200,items:{type:'object',required:['type','x','y','w','h'],properties:{id:{type:'string'},type:{enum:['text','rect','ellipse','image']},x:{type:'number'},y:{type:'number'},w:{type:'number'},h:{type:'number'},text:{type:'string'},fontSize:{type:'number'},color:{type:'string'},fill:{type:'string'},align:{enum:['left','center','right']},bold:{type:'boolean'},rotation:{type:'number'},src:{type:'string',description:'Embedded raster data URL for image elements; retain existing images, never external URLs.'}}}}}}}}};
root.Presentix={validate,uid,element,slide,starter,schema};if(typeof module!=='undefined')module.exports=root.Presentix;
})(typeof window!=='undefined'?window:globalThis);
