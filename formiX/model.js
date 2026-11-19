/* Formula notebooks are data. No TeX programs or imported graphics are executed. */
(function(root){'use strict';
 const copy=v=>JSON.parse(JSON.stringify(v)),id=()=>root.crypto?.randomUUID?.()||'formula-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
 function formula(latex='',title='Untitled formula'){return {id:id(),title,latex,notes:''};}
 const templates=[
  {name:'Quadratic formula',group:'Algebra',latex:String.raw`x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`},
  {name:'Binomial theorem',group:'Algebra',latex:String.raw`(a+b)^n = \sum_{k=0}^{n} \binom{n}{k} a^{n-k}b^k`},
  {name:'Gaussian integral',group:'Calculus',latex:String.raw`\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}`},
  {name:'Derivative',group:'Calculus',latex:String.raw`\frac{d}{dx} f(x) = \lim_{h\to 0} \frac{f(x+h)-f(x)}{h}`},
  {name:'Matrix',group:'Linear algebra',latex:String.raw`A = \begin{pmatrix} a & b \\ c & d \end{pmatrix}`},
  {name:'Aligned derivation',group:'Algebra',latex:String.raw`\begin{aligned} (x+1)^2 &= x^2+2x+1 \\ &= x(x+2)+1 \end{aligned}`},
  {name:'Piecewise function',group:'Functions',latex:String.raw`f(x)=\begin{cases} x^2 & x \ge 0 \\ -x & x < 0 \end{cases}`},
  {name:'Bayes theorem',group:'Probability',latex:String.raw`P(A\mid B)=\frac{P(B\mid A)P(A)}{P(B)}`},
  {name:'Normal distribution',group:'Probability',latex:String.raw`f(x)=\frac{1}{\sigma\sqrt{2\pi}}e^{-\frac{(x-\mu)^2}{2\sigma^2}}`},
  {name:'Fourier transform',group:'Calculus',latex:String.raw`\hat{f}(\xi)=\int_{-\infty}^{\infty} f(x)e^{-2\pi i x\xi}\,dx`},
  {name:'Euler identity',group:'Algebra',latex:String.raw`e^{i\pi}+1=0`},
  {name:'Vector field',group:'Linear algebra',latex:String.raw`\nabla\cdot\mathbf{F}=\frac{\partial F_x}{\partial x}+\frac{\partial F_y}{\partial y}+\frac{\partial F_z}{\partial z}`}
 ];
 const symbols=[['Structures','Fraction',String.raw`\frac{a}{b}`],['Structures','Square root',String.raw`\sqrt{x}`],['Structures','Power','x^{n}'],['Structures','Subscript','a_{n}'],['Structures','Sum',String.raw`\sum_{i=1}^{n} a_i`],['Structures','Integral',String.raw`\int_{a}^{b} f(x)\,dx`],['Structures','Limit',String.raw`\lim_{x\to 0} f(x)`],['Structures','Matrix',String.raw`\begin{pmatrix} a & b \\ c & d \end{pmatrix}`],['Structures','Aligned',String.raw`\begin{aligned} a &= b \\ c &= d \end{aligned}`],['Greek','α',String.raw`\alpha`],['Greek','β',String.raw`\beta`],['Greek','γ',String.raw`\gamma`],['Greek','δ',String.raw`\delta`],['Greek','θ',String.raw`\theta`],['Greek','λ',String.raw`\lambda`],['Greek','μ',String.raw`\mu`],['Greek','π',String.raw`\pi`],['Greek','σ',String.raw`\sigma`],['Greek','φ',String.raw`\phi`],['Greek','ω',String.raw`\omega`],['Operators','≤',String.raw`\leq`],['Operators','≥',String.raw`\geq`],['Operators','≠',String.raw`\neq`],['Operators','≈',String.raw`\approx`],['Operators','×',String.raw`\times`],['Operators','±',String.raw`\pm`],['Operators','∞',String.raw`\infty`],['Operators','∂',String.raw`\partial`],['Operators','∇',String.raw`\nabla`],['Operators','→',String.raw`\to`],['Operators','∈',String.raw`\in`],['Operators','ℝ',String.raw`\mathbb{R}`],['Operators','Text',String.raw`\text{explanation}`]];
 function create(blank=false){const formulas=blank?[formula()]:templates.slice(0,1).concat(templates.slice(2,3),templates.slice(4,5)).map(t=>formula(t.latex,t.name));return {format:'formix-project',version:1,name:blank?'Untitled notebook':'Mathematics notebook',activeId:formulas[0].id,formulas,settings:{fontSize:32,color:'#343b43',transparent:true,padding:24}};}
 function validate(raw){
  if(!raw||raw.format!=='formix-project'||raw.version!==1)throw Error('Choose a formiX version 1 project.');
  const text=(v,n,max)=>{if(typeof v!=='string'||v.length>max)throw Error(n+' must be text up to '+max+' characters.');return v;};
  text(raw.name,'Notebook name',160);if(!raw.name.trim())throw Error('Give the notebook a name.');
  if(!Array.isArray(raw.formulas)||raw.formulas.length<1||raw.formulas.length>200)throw Error('A notebook needs 1–200 formulas.');
  const ids=new Set();for(const f of raw.formulas){if(!f||typeof f.id!=='string'||! /^[\w-]{1,80}$/.test(f.id)||ids.has(f.id))throw Error('Formula IDs must be unique letters, digits, underscores or hyphens (up to 80).');ids.add(f.id);text(f.title,'Formula title',160);text(f.latex,'LaTeX source',20000);text(f.notes,'Notes',4000);}
  if(!ids.has(raw.activeId))throw Error('Select an existing active formula.');
  const s=raw.settings;if(!s||!Number.isInteger(s.fontSize)||s.fontSize<12||s.fontSize>96||!Number.isInteger(s.padding)||s.padding<0||s.padding>120||!/^#[a-f0-9]{6}$/i.test(s.color)||typeof s.transparent!=='boolean')throw Error('Use font size 12–96, padding 0–120, a hex color and a transparency setting.');
  return {format:'formix-project',version:1,name:raw.name,activeId:raw.activeId,formulas:raw.formulas.map(f=>({id:f.id,title:f.title,latex:f.latex,notes:f.notes})),settings:{fontSize:s.fontSize,color:s.color,transparent:s.transparent,padding:s.padding}};
 }
 const escapeTex=s=>s.replace(/[\\{}$&#_%~^]/g,c=>({'\\':String.raw`\textbackslash{}`,'~':String.raw`\textasciitilde{}`,'^':String.raw`\textasciicircum{}`} [c]||'\\'+c));
 function latexDocument(value){const p=validate(value);return ['\\documentclass{article}','\\usepackage{amsmath,amssymb}','\\usepackage[utf8]{inputenc}','\\begin{document}','\\section*{'+escapeTex(p.name)+'}',...p.formulas.flatMap(f=>['','\\subsection*{'+escapeTex(f.title||'Formula')+'}',f.notes?escapeTex(f.notes):'','\\[',f.latex,'\\]']),'','\\end{document}',''].join('\n');}
 function readLatex(text,name='Imported formula'){text=text.replace(/^\uFEFF/,'').trim();let sources;
  if(/\\begin\{document\}/.test(text)){const body=/\\begin\{document\}([\s\S]*?)\\end\{document\}/.exec(text);if(!body)throw Error('The LaTeX document has no matching end.');sources=[...body[1].matchAll(/\\\[([\s\S]*?)\\\]/g)].map(m=>m[1].trim());if(!sources.length)throw Error('Import a formula snippet or a document with \\[ … \\] blocks.');}
  else sources=[text.replace(/^\$\$([\s\S]*)\$\$$/,'$1').replace(/^\$([\s\S]*)\$$/,'$1').replace(/^\\\(([\s\S]*)\\\)$/,'$1').replace(/^\\\[([\s\S]*)\\\]$/,'$1').trim()];
  const p=create(true);p.name=name.slice(0,160)||'Imported formulas';p.formulas=sources.map((s,i)=>formula(s,sources.length===1?name.slice(0,160):'Formula '+(i+1)));p.activeId=p.formulas[0].id;return validate(p);
 }
 const schema={$schema:'https://json-schema.org/draft/2020-12/schema',title:'formiX formula notebook',type:'object',required:['format','version','name','activeId','formulas','settings'],properties:{format:{const:'formix-project'},version:{const:1},name:{type:'string',minLength:1,maxLength:160},activeId:{type:'string'},formulas:{type:'array',minItems:1,maxItems:200,items:{type:'object',required:['id','title','latex','notes'],properties:{id:{type:'string',pattern:'^[A-Za-z0-9_-]{1,80}$',maxLength:80},title:{type:'string',maxLength:160},latex:{type:'string',maxLength:20000},notes:{type:'string',maxLength:4000}}}},settings:{type:'object',required:['fontSize','color','transparent','padding'],properties:{fontSize:{type:'integer',minimum:12,maximum:96},color:{type:'string',pattern:'^#[a-fA-F0-9]{6}$'},transparent:{type:'boolean'},padding:{type:'integer',minimum:0,maximum:120}}}}};
 const api={copy,id,formula,templates,symbols,create,validate,latexDocument,readLatex,schema};root.Formix=api;if(typeof module==='object')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
