/* Small, HTML-free Markdown renderer for untrusted provider output. */
(function(root){
'use strict';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function inline(text){let html='',offset=0;const pattern=/`([^`]+)`|\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|\*([^*]+)\*/g;for(const m of text.matchAll(pattern)){html+=escape(text.slice(offset,m.index));if(m[1])html+='<code>'+escape(m[1])+'</code>';else if(m[2])html+='<strong>'+escape(m[2])+'</strong>';else if(m[3]){let safe=false;try{safe=['http:','https:'].includes(new URL(m[4]).protocol);}catch{}html+=safe?'<a href="'+escape(m[4])+'" target="_blank" rel="noopener noreferrer">'+escape(m[3])+'</a>':escape(m[0]);}else html+='<em>'+escape(m[5])+'</em>';offset=m.index+m[0].length;}return html+escape(text.slice(offset));}
const cells=line=>line.trim().replace(/^\||\|$/g,'').split('|').map(s=>s.trim());
function markdown(text){const lines=String(text).replace(/\r\n?/g,'\n').split('\n');let html='',i=0;
const special=line=>/^\s*$|^\s*```|^#{1,6}\s|^\s*[-*+]\s|^\s*\d+\.\s|^>\s?/.test(line);
while(i<lines.length){const line=lines[i];if(!line.trim()){i++;continue;}const fence=line.match(/^\s*```([^\s`]*)\s*$/);if(fence){const language=fence[1],code=[];i++;while(i<lines.length&&!/^\s*```\s*$/.test(lines[i]))code.push(lines[i++]);if(i<lines.length)i++;const block='<div class="chat-code"><div class="chat-code-heading"><span>'+escape(language||'text')+'</span><button type="button" data-copy-code>Copy code</button></div><pre><code>'+escape(code.join('\n'))+'</code></pre></div>';html+=language==='architex-proposal'?'<details class="chat-raw-proposal"><summary>Proposal data</summary>'+block+'</details>':block;continue;}
const heading=line.match(/^(#{1,6})\s+(.+)$/);if(heading){const level=Math.min(6,heading[1].length+2);html+='<h'+level+'>'+inline(heading[2])+'</h'+level+'>';i++;continue;}
if(i+1<lines.length&&line.includes('|')&&/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i+1])){const head=cells(line);html+='<div class="chat-table"><table><thead><tr>'+head.map(c=>'<th>'+inline(c)+'</th>').join('')+'</tr></thead><tbody>';i+=2;while(i<lines.length&&lines[i].includes('|')&&lines[i].trim()){const row=cells(lines[i++]);html+='<tr>'+head.map((_,j)=>'<td>'+inline(row[j]||'')+'</td>').join('')+'</tr>';}html+='</tbody></table></div>';continue;}
const list=line.match(/^\s*(?:([-*+])|(\d+)\.)\s+(.+)$/);if(list){const ordered=!!list[2],tag=ordered?'ol':'ul';html+='<'+tag+(ordered?' start="'+Math.min(1000000,Number(list[2]))+'"':'')+'>';while(i<lines.length){const item=lines[i].match(ordered?/^\s*\d+\.\s+(.+)$/:/^\s*[-*+]\s+(.+)$/);if(!item)break;html+='<li>'+inline(item[1])+'</li>';i++;}html+='</'+tag+'>';continue;}
if(/^>\s?/.test(line)){const quote=[];while(i<lines.length&&/^>\s?/.test(lines[i]))quote.push(inline(lines[i++].replace(/^>\s?/,'')));html+='<blockquote>'+quote.join('<br>')+'</blockquote>';continue;}
const paragraph=[inline(line)];i++;while(i<lines.length&&!special(lines[i])&&!(i+1<lines.length&&lines[i].includes('|')&&/^\s*\|?\s*:?-{3,}/.test(lines[i+1])))paragraph.push(inline(lines[i++]));html+='<p>'+paragraph.join('<br>')+'</p>';
}return html;}
const api={markdown};root.ArchitexChatFormat=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
