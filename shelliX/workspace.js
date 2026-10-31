/* Shell workspace navigation delegates to the existing shell controls; opening never runs commands. */
(function(){'use strict';
const bar=document.querySelector('#suite-tools');if(!bar)return;
document.querySelector('header').after(bar);
const button=document.createElement('button');button.type='button';button.id='suite-workspace-open';button.textContent='Workspace';button.title='Shell workspace commands (Ctrl/Cmd+K)';button.setAttribute('aria-haspopup','dialog');
const hub=document.querySelector('#suite-content-hub-open');bar.append(button);if(hub)bar.append(hub);
const modal=document.createElement('dialog');modal.id='shell-workspace';modal.className='sd-dialog';modal.setAttribute('aria-labelledby','shell-workspace-title');
modal.innerHTML='<div class="sd-heading"><div><div class="sd-eyebrow">SHELL WORKSPACE</div><h2 id="shell-workspace-title">Workspace</h2></div><button type="button" id="shell-workspace-close" aria-label="Close workspace">×</button></div><p id="shell-workspace-runtime"></p><label>Find a workspace action<input id="shell-workspace-search" type="search" placeholder="Sessions, commands, snippets…"></label><div id="shell-workspace-actions"></div><p id="shell-workspace-status" role="status"></p>';
document.body.append(modal);const q=id=>document.getElementById(id);
const actions=[['Working directory','cwd','focus'],['Sessions & execution settings','sessions','focus'],['Write a shell command','shell-command','focus'],['Ask the shell agent','prompt','focus'],['Reusable command snippets','ss-query','focus'],['Search command history','history-query','focus'],['Refresh runtime','refresh','click'],['Download current session','export','click']];
function render(){const query=q('shell-workspace-search').value.toLowerCase(),list=q('shell-workspace-actions');list.replaceChildren();for(const [name,id,mode] of actions){if(!name.toLowerCase().includes(query))continue;const target=q(id);if(!target)continue;const item=document.createElement('button');item.type='button';item.textContent=name;item.disabled=target.disabled;item.onclick=()=>{if(target.disabled){render();return;}modal.close();if(mode==='click')target.click();else{if(id==='prompt')window.ShelliXTerminal?.mode('agent',false);if(id==='shell-command')window.ShelliXTerminal?.mode('shell',false);for(let parent=target.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;target.scrollIntoView({block:'center'});target.focus();}};list.append(item);}q('shell-workspace-status').textContent=list.children.length?'Opening an editor or setting does not execute a command.':'No matching workspace actions.';}
function open(){q('shell-workspace-runtime').textContent=q('workspace').textContent;q('shell-workspace-search').value='';render();if(!modal.open)modal.showModal();q('shell-workspace-search').focus();}
button.onclick=open;q('shell-workspace-close').onclick=()=>modal.close();q('shell-workspace-search').oninput=render;
modal.addEventListener('keydown',event=>event.stopPropagation());
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'&&!event.altKey){if(document.querySelector('dialog[open]'))return;event.preventDefault();open();}});
window.ShelliXWorkspace={open};
})();
