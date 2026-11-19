/* Parse static flowchart data without loading or running Mermaid. */
(function(root){'use strict';
const escaped=(text,index)=>{let count=0;while(index>0&&text[--index]==='\\')count++;return count%2===1;};
function label(value){
 value=value.trim();if(value.startsWith('"')){if(!value.endsWith('"'))throw Error('Unclosed quoted label.');try{value=JSON.parse(value.replace(/\r?\n/g,'\\n'));}catch{throw Error('Invalid quoted label. Escape embedded double quotes.');}}
 if(value.startsWith('`')&&value.endsWith('`'))value=value.slice(1,-1).replace(/\*\*(.*?)\*\*/g,'$1');
 return value.replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/?(?:b|i|strong|em)>/gi,'').replace(/&#x([0-9a-f]+);|&#(\d+);|#(\d+);|(?:#|&)(quot|amp|lt|gt);/gi,(whole,hex,decimal,mermaid,named)=>{if(named)return {quot:'"',amp:'&',lt:'<',gt:'>'}[named.toLowerCase()];const code=parseInt(hex||decimal||mermaid,hex?16:10);return code>0&&code<=0x10ffff?String.fromCodePoint(code):whole;});
}
function parse(input){
 if(typeof input!=='string')throw Error('Mermaid input must be text.');
 let text=input.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n'),payload=null,title='',direction='LR';const warnings=[];
 const warn=message=>{if(!warnings.includes(message))warnings.push(message);};
 const fences=[...text.matchAll(/^\s*```mermaid[^\S\n]*\n([\s\S]*?)^\s*```[^\S\n]*$/gim)];
 if(fences.length>1)throw Error('The file contains multiple Mermaid diagrams. Import one diagram at a time.');
 if(fences.length===1)text=fences[0][1];else if(text.trim().startsWith('```'))throw Error('Use a Mermaid code block or a .mmd file.');
 if(text.trimStart().startsWith('---\n')){const front=text.match(/^\s*---\n([\s\S]*?)\n---(?:\n|$)/);if(!front)throw Error('Unclosed Mermaid front matter.');const found=front[1].match(/^title:\s*(.+)$/m);if(found)title=label(found[1]);if(front[1].split('\n').some(line=>line.trim()&&!/^title:/.test(line)))warn('Front-matter configuration was not applied.');text=text.slice(front[0].length);}
 text=text.split('\n').map(line=>{const value=line.trim();if(value.startsWith('%% architex-mermaid: ')){if(payload)throw Error('Duplicate Architex Mermaid metadata.');try{payload=JSON.parse(value.slice('%% architex-mermaid: '.length));}catch{throw Error('Invalid Architex Mermaid metadata JSON.');}return '';}if(value.startsWith('%%{')){if(!value.endsWith('}%%'))throw Error('Use a single-line Mermaid configuration directive.');warn('Mermaid configuration directives were ignored.');return '';}return line;}).join('\n');
 // Split only outside labels/shapes, retaining source line numbers for errors.
 const statements=[];let quoted=false,depth=0,start=0,line=1,startLine=1;
 for(let i=0;i<=text.length;i++){const c=text[i];if(c==='"'&&!escaped(text,i))quoted=!quoted;
  if(!quoted&&depth===0&&c==='%'&&text[i+1]==='%'){let end=text.indexOf('\n',i);if(end<0)end=text.length;text=text.slice(0,i)+' '.repeat(end-i)+text.slice(end);}
  if(!quoted){if('[({'.includes(c||'\0'))depth++;if('])}'.includes(c||'\0'))depth--;}
  if(depth<0)throw Error('Mermaid line '+line+': unexpected closing shape delimiter.');
  if(i===text.length||!quoted&&depth===0&&(c==='\n'||c===';')){const raw=text.slice(start,i).trim();if(raw)statements.push({raw,line:startLine});start=i+1;startLine=line+(c==='\n'?1:0);}
  if(c==='\n')line++;
 }
 if(quoted||depth!==0)throw Error('Mermaid line '+startLine+': unbalanced label or shape delimiters.');
 const nodes=new Map(),groups=new Map(),edges=[],stack=[],classes=new Map(),assignments=[],colors=new Map();let header=false;
 const current=()=>stack.at(-1)||null;
 function register(id,name,declared,parent=current()){
  if(groups.has(id))return id;
  if(!nodes.has(id))nodes.set(id,{id,name:declared?name:id,declared,parent});else{const node=nodes.get(id);if(declared){if(node.declared&&node.name!==name)throw Error('Conflicting labels for node '+id);node.name=name;node.declared=true;}if(declared&&parent&&node.parent&&node.parent!==parent)throw Error('Node '+id+' belongs to multiple subgraphs.');if(declared&&parent)node.parent=parent;}
  return id;
 }
 function colorFrom(style){const found=style.match(/(?:^|,)\s*(?:fill|stroke)\s*:\s*(#[0-9a-f]{6}|#[0-9a-f]{3})(?=\s*(?:,|$))/i);if(!found)return null;const value=found[1];return value.length===4?'#'+[...value.slice(1)].map(c=>c+c).join(''):value;}
 for(const statement of statements){let raw=statement.raw;
  try{
   if(!header){const match=raw.match(/^(?:flowchart|graph)\s+(LR|RL|TB|TD|BT)\b\s*/);if(!match)throw Error('Start with flowchart LR (or graph LR/TB/TD/RL/BT).');header=true;direction=match[1];raw=raw.slice(match[0].length);if(!raw)continue;}
   if(/^direction\s+(LR|RL|TB|TD|BT)$/.test(raw)){if(!stack.length)direction=raw.split(/\s+/)[1];else warn('Subgraph layout directions were normalized to the Architex view.');continue;}
   if(raw==='end'){if(!stack.length)throw Error('Unexpected subgraph end.');stack.pop();continue;}
   if(raw.startsWith('subgraph ')){const declaration=raw.slice(9).trim(),match=declaration.match(/^([\p{L}\p{N}_][\p{L}\p{N}_.-]*)\s*\[([\s\S]*)\]$/u);let id,name;
    if(match){id=match[1];name=label(match[2]);}else if(/^[\p{L}\p{N}_][\p{L}\p{N}_.-]*$/u.test(declaration)){id=declaration;name=declaration;}else{id='mermaid-group-'+groups.size;while(groups.has(id)||nodes.has(id))id+='-';name=label(declaration);}
    if(groups.has(id)||nodes.get(id)?.declared)throw Error('Duplicate subgraph ID '+id);nodes.delete(id);groups.set(id,{id,name,declared:true,parent:current(),group:true});stack.push(id);continue;
   }
   if(/^classDef\s/.test(raw)){const match=raw.match(/^classDef\s+([\w,-]+)\s+(.+)$/);if(!match)throw Error('Invalid classDef.');for(const name of match[1].split(','))classes.set(name,colorFrom(match[2]));warn('Node colors were retained where supported; other Mermaid styling was normalized.');continue;}
   if(/^class\s/.test(raw)){const match=raw.match(/^class\s+([\p{L}\p{N}_.,-]+)\s+([\w-]+)$/u);if(!match)throw Error('Invalid class assignment.');assignments.push([match[1].split(','),match[2]]);continue;}
   if(/^style\s/.test(raw)){const match=raw.match(/^style\s+([\p{L}\p{N}_.-]+)\s+(.+)$/u);if(!match)throw Error('Invalid node style.');colors.set(match[1],colorFrom(match[2]));warn('Node colors were retained where supported; other Mermaid styling was normalized.');continue;}
   if(/^linkStyle\s/.test(raw)){warn('Link styling was normalized to Architex connections.');continue;}
   if(/^click\b/.test(raw))throw Error('Click handlers are not supported in architecture imports.');
   let offset=0;const space=()=>{while(/\s/.test(raw[offset]||'\0'))offset++;};
   function quotedText(){const begin=offset++;while(offset<raw.length&&(raw[offset]!=='"'||escaped(raw,offset)))offset++;if(offset>=raw.length)throw Error('Unclosed quoted label.');return raw.slice(begin,++offset);}
   function node(){space();const match=raw.slice(offset).match(/^[\p{L}\p{N}_](?:[\p{L}\p{N}_.]|-(?![-.=>]))*/u);if(!match)throw Error('Expected a node ID near '+raw.slice(offset));const id=match[0];offset+=id.length;space();let name=null;
    const shape=[['(((',')))'],['[[',']]'],['([','])'],['[(',')]'],['{{','}}'],['((', '))'],['[/','/]'],['[\\','\\]'],['[',']'],['(',')'],['{','}']].find(([open])=>raw.startsWith(open,offset));
    if(shape){offset+=shape[0].length;space();if(raw[offset]==='"'){name=label(quotedText());space();if(!raw.startsWith(shape[1],offset))throw Error('Expected closing shape '+shape[1]);offset+=shape[1].length;}else{let end=raw.indexOf(shape[1],offset);let close=shape[1];if(shape[0]==='[/'||shape[0]==='[\\'){const other=close==='/]'?'\\]':'/]',otherEnd=raw.indexOf(other,offset);if(otherEnd>=0&&(end<0||otherEnd<end)){end=otherEnd;close=other;}}if(end<0)throw Error('Unclosed node shape.');name=label(raw.slice(offset,end));offset=end+close.length;}}
    if(raw.startsWith('@{',offset))throw Error('Mermaid @{shape: ...} objects are not supported; use bracket node shapes.');
    register(id,name,name!==null);if(raw.startsWith(':::',offset)){offset+=3;const cls=raw.slice(offset).match(/^[\w-]+/);if(!cls)throw Error('Expected a class name.');assignments.push([[id],cls[0]]);offset+=cls[0].length;}space();return id;
   }
   function nodeSet(){const result=[node()];while(raw[offset]==='&'){offset++;result.push(node());}return result;}
   function arrow(){space();let edgeId=null;const identified=raw.slice(offset).match(/^([\w-]+)@(?=[<.=\-])/);if(identified){edgeId=identified[1];offset+=identified[0].length;}
    let match=raw.slice(offset).match(/^(?:<[-=]+>|<[-=]+|[-=]+>|-\.[.\-]*>)/),token,edgeLabel='';
    if(match){token=match[0];offset+=token.length;}else{const opening=raw.slice(offset).match(/^(--|==|-\.)\s*/);if(!opening)throw Error('Expected a directed arrow near '+raw.slice(offset));offset+=opening[0].length;const begin=offset;let quote=false,end=-1,closing=null;
     for(let i=offset;i<raw.length;i++){if(raw[i]==='"'&&!escaped(raw,i))quote=!quote;const found=!quote&&raw.slice(i).match(opening[1]==='=='?/^={2,}>/:opening[1]==='-.'?/^\.->/:/^-{2,}>/);if(found){end=i;closing=found[0];break;}}if(end<0)throw Error('Unclosed labeled arrow. Use A -- label --> B.');edgeLabel=label(raw.slice(begin,end));token=closing;offset=end+closing.length;}
    space();if(raw[offset]==='|'){offset++;space();if(raw[offset]==='"'){edgeLabel=label(quotedText());space();if(raw[offset++]!=='|')throw Error('Unclosed edge label.');}else{const end=raw.indexOf('|',offset);if(end<0)throw Error('Unclosed edge label.');edgeLabel=label(raw.slice(offset,end));offset=end+1;}space();}
    return {label:edgeLabel,reverse:token.startsWith('<'),both:token.startsWith('<')&&token.endsWith('>'),edgeId};
   }
   let sources=nodeSet();while(offset<raw.length){const link=arrow(),targets=nodeSet();for(const source of sources)for(const target of targets){edges.push({source:link.reverse?target:source,target:link.reverse?source:target,label:link.label,...(link.edgeId?{id:link.edgeId}:{})});if(link.both)edges.push({source,target,label:link.label});}sources=targets;}
  }catch(error){throw Error('Mermaid line '+statement.line+': '+error.message);}
 }
 if(stack.length)throw Error('Unclosed Mermaid subgraph '+stack.at(-1)+'.');if(!header||!nodes.size&&!groups.size&&!payload)throw Error('The Mermaid flowchart contains no nodes.');
 if(classes.get('default'))for(const node of [...nodes.values(),...groups.values()])node.color=classes.get('default');
 for(const [ids,cls]of assignments){if(!classes.has(cls)){warn('Unknown Mermaid classes were ignored.');continue;}for(const id of ids){const target=nodes.get(id)||groups.get(id);if(!target)throw Error('Class assignment references unknown node '+id);if(classes.get(cls))target.color=classes.get(cls);}}
 for(const [id,color]of colors){const target=nodes.get(id)||groups.get(id);if(!target)throw Error('Style references unknown node '+id);if(color)target.color=color;}
 return {nodes,groups,edges,payload,title,direction,warnings};
}
const api={parse};root.ArchitexMermaidParser=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
