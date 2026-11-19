/* Portable inert cross-app snapshots; source programs are never executed. */
(function(root){'use strict';
 const copy=v=>JSON.parse(JSON.stringify(v)),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const validId=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(s);
 function validate(value=[]){if(!Array.isArray(value))throw Error('Embedded contents must be an array.');const ids=new Set();return value.map(entry=>{if(!entry||!validId(entry.id)||ids.has(entry.id))throw Error('Embedded content IDs must be unique.');ids.add(entry.id);const item=root.SuiteContentHubCore.unpack(entry.item);if(!/^[A-Za-z][A-Za-z0-9]*$/.test(item.sourceTool)||item.sourceTool==='textiX')throw Error('Choose content from another suite app.');return {id:entry.id,item};});}
 function make(item){return validate([{id:'embedded-'+(root.crypto?.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2)),item}])[0];}
 function html(entry){entry=validate([entry])[0];const {item,id}=entry,v=item.visual,preview=v?'<p><img src="'+v.src+'" alt="'+esc(item.name)+'" width="'+Math.min(600,Math.round(v.width))+'" height="'+Math.max(1,Math.round(v.height*Math.min(1,600/v.width)))+'"></p>':'',text=item.text.slice(0,12000);return '<div data-textix-embed="'+id+'" contenteditable="false"><p><b>'+esc(item.name)+'</b> · '+esc(item.sourceTool)+'</p><p>Embedded snapshot · '+esc(item.publishedAt)+(item.document?' · Native project included':' · Reference only')+'</p>'+preview+'<pre>'+esc(text)+(item.text.length>text.length?'\n[Preview shortened; full content is retained in the embedded snapshot.]':'')+'</pre></div>';}
 function integrate(before,item){const entry=make(item),entries=validate([...(before.embeds||[]),entry]);return {...copy(before),html:before.html+'\n'+html(entry)+'<p><br></p>',embeds:entries};}
 function references(entries){return validate(entries).map(e=>({id:e.id,...root.SuiteContentHubCore.reference(e.item)}));}
 const api={validate,validId,make,html,integrate,references,copy};root.TextixEmbedsCore=api;if(typeof module==='object')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
