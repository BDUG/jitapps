(function(){'use strict';const script=document.currentScript,base=new URL('../',script.src),apps=window.SuiteApps||[],app=apps.find(a=>location.pathname.startsWith(new URL(a.id+'/',base).pathname)),D=SuiteDisk;
const el=(tag,attrs={},text)=>{const n=document.createElement(tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;};let destination='computer',folder='',mode='browse',pending=null,selected=new Set(),refreshId=0,diskReading=false,downloading=false,deleting=false,pickerInput=null,localInput=null;
try{destination=localStorage.getItem('suite-export-destination-'+(app?.id||'desktop'))||'computer';}catch{}
if(!['computer','disk'].includes(destination))destination='computer';
const bar=el('div',{id:'suite-tools','aria-label':'Suite navigation and files'}),home=el('a',{href:base.href,title:'Desktop','aria-label':'Desktop'},'▦'),open=el('button',{type:'button',id:'suite-disk-open'},'Virtual disk'),target=el('select',{id:'suite-export-target','aria-label':'Export destination'});for(const [value,text]of [['computer','Computer'],['disk','Virtual disk']]){const option=el('option',{value},text);target.append(option);}target.value=destination;target.onchange=()=>{destination=target.value;try{localStorage.setItem('suite-export-destination-'+(app?.id||'desktop'),destination);}catch{}};const share=el('button',{type:'button',id:'suite-share-pcs'},'Share between PCs');let wormholeLoading;async function wormhole(){if(!window.SuiteWormhole){if(!wormholeLoading)wormholeLoading=new Promise((resolve,reject)=>{const tag=document.createElement('script');tag.src=new URL('shared-suite/wormhole.js',base).href;tag.onload=resolve;tag.onerror=()=>{wormholeLoading=null;tag.remove();reject(Error('Could not load PC sharing.'));};document.head.append(tag);});await wormholeLoading;}return window.SuiteWormhole;}share.onclick=()=>wormhole().then(value=>value.files()).catch(error=>{share.textContent=error.message;});bar.append(home,open,share);document.body.append(bar);document.querySelector('.desktop-header-links')?.append(share);if(app){const exportButton=document.querySelector('#doExport')||document.querySelector('#export')||document.querySelector('#exportSvg');if(exportButton){const options=el('span',{class:'suite-export-options',role:'group','aria-label':'Export options'});const label=el('label',{},'Destination ');label.append(target);exportButton.before(options);options.append(label);const sync=()=>options.hidden=exportButton.hidden;new MutationObserver(sync).observe(exportButton,{attributes:true,attributeFilter:['hidden']});sync();}}
if(app){const brand=document.querySelector('.brand,.logo');if(brand){const img=el('img',{src:new URL('assets/icons/'+app.id+'.svg?v=tlal-mockix-20261031',base).href,alt:'',class:'suite-app-icon'});brand.prepend(img);}}
const dialog=el('dialog',{id:'suite-disk-dialog',class:'sd-dialog','aria-labelledby':'sd-title'});dialog.innerHTML=`<div class="sd-heading"><div><div class="sd-eyebrow">SHARED WORKSPACE</div><h2 id="sd-title">Virtual disk</h2></div><button type="button" id="sd-close" aria-label="Close virtual disk">×</button></div><p class="sd-note">Shared by all suite apps on this browser and address. Download important files for backup.</p><div class="sd-toolbar"><button type="button" id="sd-up">↑ Up</button><form id="sd-location-form"><input id="sd-location" aria-label="Disk folder" placeholder="Root folder"><button>Go</button></form><button type="button" id="sd-mkdir">New folder</button><button type="button" id="sd-upload">Upload files</button><button type="button" id="sd-upload-folder">Upload folder</button><input id="sd-upload-files" type="file" multiple hidden><input id="sd-upload-directory" type="file" webkitdirectory multiple hidden></div><details id="sd-backup"><summary>Disk ZIP backup · all folders</summary><p>Export the entire disk or review a ZIP before restoring. Backups preserve binary files and empty folders.</p><div class="sd-toolbar"><button type="button" id="sd-backup-export">Export disk ZIP</button><button type="button" id="sd-backup-import">Import disk ZIP</button><button type="button" id="sd-backup-selected">Import selected ZIP</button><input id="sd-backup-file" type="file" accept=".zip,application/zip" hidden></div><div id="sd-backup-preview" hidden><p id="sd-backup-summary"></p><label>Restore policy<select id="sd-backup-policy"><option value="keep">Keep existing files (merge)</option><option value="overwrite">Overwrite matching files (merge)</option><option value="replace">Replace entire disk</option></select></label><p>File/folder type conflicts require renaming or replacing the disk. Restore is atomic; changed disks require a fresh preview.</p><div class="sd-toolbar"><button type="button" class="sd-primary" id="sd-backup-apply">Apply disk restore</button><button type="button" id="sd-backup-cancel">Discard restore</button></div></div></details><div id="sd-import-controls"><label>Import into<select id="sd-import-target"></select></label><label id="sd-scope-label" hidden>Architecture model<select id="sd-scope"><option value="metamodel">Meta model</option><option value="instances">Instance model</option><option value="both">Both models</option></select></label><p id="sd-format-hint"></p></div><div id="sd-list" role="group" aria-label="Virtual disk contents"></div><form id="sd-save-form"><label>File name / relative path<input id="sd-filename" required maxlength="512"></label><button class="sd-primary">Save to virtual disk</button></form><div id="sd-actions"><button type="button" id="sd-import" class="sd-primary">Import selected</button><button type="button" id="sd-import-folder">Import this folder</button><button type="button" id="sd-download">Download selected</button><button type="button" id="sd-delete">Delete selected</button></div><p id="sd-status" role="status" aria-live="polite"></p>`;document.body.append(dialog);const q=s=>dialog.querySelector(s);dialog.addEventListener('keydown',e=>e.stopPropagation());bar.addEventListener('keydown',e=>e.stopPropagation());
function status(text,error=false){q('#sd-status').textContent=text;q('#sd-status').classList.toggle('sd-error',error);}
async function action(fn){try{await fn();}catch(e){status(e.message,true);}}
function supported(entry,input){if(!input?.accept)return true;const ext='.'+entry.path.split('.').pop().toLowerCase(),type=entry.type||'';return input.accept.toLowerCase().split(',').some(a=>{a=a.trim();return a===ext||a===type||a.endsWith('/*')&&type.startsWith(a.slice(0,-1));});}
function chosenInput(){return app&&document.getElementById(q('#sd-import-target').value);}
function updateActions(){selectionCount.textContent=selected.size+' selected in this folder';const input=chosenInput(),isFolder=input?.hasAttribute('webkitdirectory');q('#sd-import').disabled=!input||!selected.size||isFolder||!input.multiple&&selected.size!==1;q('#sd-import-folder').hidden=!isFolder;q('#sd-download').disabled=downloading||!selected.size;q('#sd-delete').disabled=deleting||!selected.size;if(diskReading)for(const id of ['#sd-import','#sd-import-folder','#sd-download','#sd-delete'])q(id).disabled=true;}
function readers(){
 const inputs=[...document.querySelectorAll('input[type="file"]')].filter(input=>!dialog.contains(input));
 return inputs.map((input,index)=>{
  if(!input.id)input.id='suite-reader-'+index;
  const registered=app?.imports.find(([id])=>id===input.id)?.[1];
  const label=input.dataset.diskLabel||registered||input.getAttribute('aria-label')||input.labels?.[0]?.textContent.trim()||input.id;
  return [input.id,label];
 });
}
function importControls(){const select=q('#sd-import-target');select.replaceChildren();for(const [id,label]of readers()){if(!document.getElementById(id))continue;select.append(el('option',{value:id},document.getElementById(id).dataset.diskLabel||label));}q('#sd-import-controls').hidden=!app||mode==='save';q('#sd-import').hidden=!app||mode==='save';q('#sd-import-folder').hidden=true;if(pickerInput)select.value=pickerInput.id;q('#sd-scope-label').hidden=app?.id!=='architex'||!window.ArchitexIO||!!pickerInput;if(app?.id==='architex'&&window.ArchitexIO)q('#sd-scope').value=window.ArchitexIO?.getMode()||'metamodel';select.onchange=()=>{selected.clear();renderEntries();};}
let diskEntries = [],
  diskOffset = 0,
  listingFolder = null;
const diskPageSize = 100;
const diskPages = el("div", { class: "sd-toolbar" }),
  diskRange = el("span", { role: "status", id: "sd-page-range" });
const diskPrevious = el(
    "button",
    { type: "button", id: "sd-page-prev" },
    "Previous items",
  ),
  diskNext = el("button", { type: "button", id: "sd-page-next" }, "Next items");
diskPages.append(diskPrevious, diskRange, diskNext);
diskPages.hidden = true;
q("#sd-list").before(diskPages);
const diskLoading = el(
  "p",
  { id: "sd-loading", role: "status" },
  "Loading folder…",
);
diskLoading.hidden = true;
q("#sd-list").before(diskLoading);
const selectionCount = el("p", { id: "sd-selection-count", role: "status" });
q("#sd-actions").before(selectionCount);
diskPrevious.onclick = () => {
  diskOffset = Math.max(0, diskOffset - diskPageSize);
  renderEntries();
  q("#sd-list").scrollTop = 0;
};
diskNext.onclick = () => {
  diskOffset += diskPageSize;
  renderEntries();
  q("#sd-list").scrollTop = 0;
};
const diskSearch = el("input", {
  id: "sd-search",
  type: "search",
  "aria-label": "Search current virtual disk folder",
  placeholder: "Search this folder by name, type or app…",
});
const selectMatching = el(
    "button",
    { id: "sd-select-matching", type: "button" },
    "Select matching items",
  ),
  clearSelected = el(
    "button",
    { id: "sd-clear-selection", type: "button" },
    "Clear selection",
  ),
  diskMatchCount = el("span", { id: "sd-match-count", role: "status" }),
  diskFilters = el("div", { class: "sd-toolbar" });
const diskSort = el("select", {
  id: "sd-sort",
  "aria-label": "Sort virtual disk items",
});
for (const [value, label] of [
  ["name", "Name A–Z"],
  ["name-desc", "Name Z–A"],
  ["newest", "Recently modified"],
  ["largest", "Largest files"],
  ["type", "File type"],
])
  diskSort.append(el("option", { value }, label));
try {
  const saved = localStorage.getItem("suite-disk-sort");
  if ([...diskSort.options].some((option) => option.value === saved))
    diskSort.value = saved;
} catch {}
diskFilters.append(
  diskSearch,
  diskSort,
  selectMatching,
  clearSelected,
  diskMatchCount,
);
diskPages.before(diskFilters);
const diskMetadata = new WeakMap(),
  compareNames = new Intl.Collator(undefined, { numeric: true }).compare;
function entryMetadata(entry) {
  let value = diskMetadata.get(entry);
  if (!value) {
    const name = entry.path.split("/").pop(),
      type = entry.type || name.split(".").pop() || "";
    value = {
      name,
      type,
      text: [name, entry.kind, entry.type, entry.app]
        .join(" ")
        .normalize("NFKC")
        .toLocaleLowerCase(),
    };
    diskMetadata.set(entry, value);
  }
  return value;
}
let diskFilterCache = null;
function matchingEntries() {
  const query = diskSearch.value.trim().normalize("NFKC").toLocaleLowerCase(),
    sort = diskSort.value;
  if (
    !diskFilterCache ||
    diskFilterCache.entries !== diskEntries ||
    diskFilterCache.query !== query ||
    diskFilterCache.sort !== sort
  ) {
    const terms = query.split(/\s+/).filter(Boolean),
      rows = diskEntries.filter((entry) =>
        terms.every((term) => entryMetadata(entry).text.includes(term)),
      );
    rows.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      const left = entryMetadata(a),
        right = entryMetadata(b),
        name = compareNames(left.name, right.name);
      if (sort === "name-desc") return -name;
      if (sort === "newest")
        return (b.modified || 0) - (a.modified || 0) || name;
      if (sort === "largest" && a.kind === "file")
        return (b.size || 0) - (a.size || 0) || name;
      if (sort === "type") return compareNames(left.type, right.type) || name;
      return name;
    });
    diskFilterCache = { entries: diskEntries, query, sort, rows };
  }
  return diskFilterCache.rows;
}
diskSort.onchange = () => {
  diskOffset = 0;
  try {
    localStorage.setItem("suite-disk-sort", diskSort.value);
  } catch {}
  renderEntries();
};
function syncDiskSelection() {
  for (const row of q("#sd-list").querySelectorAll(".sd-row")) {
    const path = row.querySelector("[data-path]").dataset.path;
    row.querySelector("input").checked = selected.has(path);
    row.classList.toggle("sd-selected",selected.has(path));
  }
  clearSelected.disabled = !selected.size;
  updateActions();
}
diskSearch.oninput = () => {
  diskOffset = 0;
  renderEntries();
};
selectMatching.onclick = () => {
  for (const entry of matchingEntries()) selected.add(entry.path);
  syncDiskSelection();
};
clearSelected.onclick = () => {
  selected.clear();
  syncDiskSelection();
};
const diskHelp=el('p',{class:'sd-keyboard-help'},'Keyboard: Ctrl/⌘+F searches this folder. Use arrow keys to browse; Ctrl/⌘+A selects all matches from a file row. Alt+↑ opens the parent folder.');
q('#sd-list').before(diskHelp);
dialog.addEventListener('keydown',event=>{
 if((event.ctrlKey||event.metaKey)&&!event.altKey&&event.key.toLowerCase()==='f'){
  event.preventDefault();diskSearch.focus();diskSearch.select();return;
 }
 if(event.altKey&&event.key==='ArrowUp'){
  event.preventDefault();if(!q('#sd-up').disabled)q('#sd-up').click();return;
 }
 if(event.target===diskSearch&&event.key==='ArrowDown'){
  const first=q('#sd-list').querySelector('.sd-entry');if(first){event.preventDefault();first.focus();}return;
 }
 const row=event.target.closest?.('.sd-row');
 if(!row||!q('#sd-list').contains(row)||diskReading)return;
 if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='a'&&(event.target.matches('.sd-entry')||event.target.matches('input[type="checkbox"]'))){event.preventDefault();selectMatching.click();return;}
 if(event.ctrlKey||event.metaKey||event.altKey||!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
 const rows=[...q('#sd-list').querySelectorAll('.sd-row')],index=rows.indexOf(row),next=event.key==='Home'?0:event.key==='End'?rows.length-1:Math.max(0,Math.min(rows.length-1,index+(event.key==='ArrowDown'?1:-1)));
 event.preventDefault();rows[next]?.querySelector(event.target.matches('input[type="checkbox"]')?'input[type="checkbox"]':'.sd-entry')?.focus();
});
function renderEntries() {
  const entries = matchingEntries();
  diskOffset = Math.min(
    diskOffset,
    Math.max(0, Math.ceil(entries.length / diskPageSize) - 1) * diskPageSize,
  );
  selectMatching.disabled = !entries.length;
  clearSelected.disabled = !selected.size;
  diskMatchCount.textContent =
    entries.length + " of " + diskEntries.length + " items in this folder";
  q("#sd-location").value = folder;
  q("#sd-up").disabled = !folder;
  const input = chosenInput();
  q("#sd-format-hint").textContent =
    app && mode !== "save"
      ? input?.hasAttribute("webkitdirectory")
        ? "Import the current folder with its complete subfolder structure."
        : "Supported: " + (input?.accept || "files supported by this importer")
      : "";
  const list = q("#sd-list");
  list.replaceChildren();
  if (!entries.length)
    list.append(
      el(
        "p",
        { class: "sd-empty" },
        diskEntries.length
          ? "No items match this search. Clear the search to show the folder."
          : "This folder is empty. Export from an app or upload files to get started.",
      ),
    );
  for (const entry of entries.slice(diskOffset, diskOffset + diskPageSize)) {
    const row = el("div", {
        class:
          "sd-row" +
          (entry.kind === "file" &&
          mode !== "save" &&
          input &&
          !supported(entry, input)
            ? " sd-unsupported"
            : ""),
      }),
      check = el("input", {
        type: "checkbox",
        "aria-label": "Select " + entry.path,
      });
    check.checked = selected.has(entry.path);
    row.classList.toggle("sd-selected",check.checked);
    check.onchange = () => {
      if (check.checked) selected.add(entry.path);
      else selected.delete(entry.path);
      syncDiskSelection();
    };
    const name = el(
      "button",
      { type: "button", class: "sd-entry", "data-path": entry.path },
      (entry.kind === "folder" ? "▰  " : "▱  ") + entry.path.split("/").pop(),
    );
    name.onclick = () => {
      if (entry.kind === "folder") {
        folder = entry.path;
        selected.clear();
        action(async()=>{await refresh();q("#sd-location").focus();});
      } else if (mode === "save") {
        q("#sd-filename").value = entry.path.split("/").pop();
      } else {
        check.checked = !check.checked;
        check.onchange();
      }
    };
    const detail = el(
      "span",
      { class: "sd-detail" },
      entry.kind === "folder"
        ? "Folder"
        : (entry.size < 1024
            ? entry.size + " B"
            : (entry.size / 1024).toFixed(1) + " KB") +
            " · " +
            (apps.find((a) => a.id === entry.app)?.name || "Uploaded file"),
    );
    row.append(check, name, detail);
    list.append(row);
  }
  updateActions();
  diskOffset = Math.min(
    diskOffset,
    Math.max(0, Math.ceil(entries.length / diskPageSize) - 1) * diskPageSize,
  );
  diskPrevious.disabled = diskOffset === 0;
  diskNext.disabled = diskOffset + diskPageSize >= entries.length;
  diskRange.textContent = entries.length
    ? diskOffset +
      1 +
      "–" +
      Math.min(diskOffset + diskPageSize, entries.length) +
      " of " +
      entries.length +
      " items"
    : "No items";
  diskPages.hidden = entries.length <= diskPageSize;
}
async function refresh() {
  const id = ++refreshId;
  diskReading = true;
  diskFilters.inert = true;
  diskPages.inert = true;
  q("#sd-list").inert = true;
  updateActions();
  q("#sd-list").setAttribute("aria-busy", "true");
  diskLoading.hidden = false;
  try {
    const entries = await D.list(folder);
    if (id !== refreshId) return;
    if (listingFolder !== folder) {
      diskOffset = 0;
      listingFolder = folder;
      diskSearch.value = "";
    }
    diskEntries = entries;
    diskOffset = Math.min(
      diskOffset,
      Math.max(0, Math.ceil(entries.length / diskPageSize) - 1) * diskPageSize,
    );
    const paths = new Set(entries.map((entry) => entry.path));
    for (const path of selected) if (!paths.has(path)) selected.delete(path);
    renderEntries();
  } finally {
    if (id === refreshId) {
      q("#sd-list").setAttribute("aria-busy", "false");
      diskLoading.hidden = true;
      diskReading = false;
      diskFilters.inert = false;
      diskPages.inert = false;
      q("#sd-list").inert = false;
      updateActions();
    }
  }
}
async function show(nextMode='browse',file=null,input=null){pickerInput=input;mode=nextMode;pending=file;q('#sd-backup').hidden=mode==='save';selected.clear();status('');q('#sd-title').textContent=mode==='save'?'Save to virtual disk':'Virtual disk';q('#sd-save-form').hidden=mode!=='save';q('#sd-upload').hidden=mode==='save';q('#sd-upload-folder').hidden=mode==='save';q('#sd-mkdir').hidden=false;importControls();if(file)q('#sd-filename').value=file.name;if(!dialog.open)dialog.showModal();await action(refresh);if(mode==='save')q('#sd-filename').focus();}
function close(){dialog.close();pending=null;}q('#sd-close').onclick=close;dialog.addEventListener('cancel',()=>{pending=null;});open.onclick=()=>show();q('#sd-up').onclick=()=>{folder=folder.split('/').slice(0,-1).join('/');selected.clear();action(refresh);};q('#sd-location-form').onsubmit=e=>{e.preventDefault();action(async()=>{const next=q('#sd-location').value;D.path(next,true);if(next&&(await D.get(next))?.kind!=='folder')throw Error('Folder does not exist.');folder=next;selected.clear();await refresh();});};q('#sd-mkdir').onclick=()=>action(async()=>{const name=prompt('New folder name (or relative path):');if(!name)return;await D.mkdir((folder?folder+'/':'')+name);await refresh();status('Folder created.');});
function computerDownload(blob,name){const url=URL.createObjectURL(blob),a=el('a',{href:url,download:name});a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
async function writeFile(path,blob,owner){const existing=await D.get(path);if(existing?.kind==='folder')throw Error('A folder already has that name.');if(existing&&!confirm('Replace “'+path+'” on the virtual disk?'))return false;await D.write(path,blob,{overwrite:!!existing,revision:existing?.revision,app:owner});return true;}
q('#sd-save-form').onsubmit=e=>{e.preventDefault();action(async()=>{if(!pending)throw Error('No export is waiting.');const p=(folder?folder+'/':'')+q('#sd-filename').value;if(await writeFile(p,pending.blob,app?.id)){pending=null;q('#sd-save-form').hidden=true;mode='browse';importControls();await refresh();status('Saved '+p+' to the shared virtual disk.');}});};
q('#sd-upload-folder').onclick=()=>q('#sd-upload-directory').click();q('#sd-upload-directory').onchange=()=>action(async()=>{let count=0;try{for(const file of q('#sd-upload-directory').files)if(await writeFile((folder?folder+'/':'')+file.webkitRelativePath,file,''))count++;await refresh();status('Uploaded '+count+' file(s) with their folder structure.');}finally{q('#sd-upload-directory').value='';}});
q('#sd-upload').onclick=()=>q('#sd-upload-files').click();q('#sd-upload-files').onchange=()=>action(async()=>{const files=[...q('#sd-upload-files').files];let count=0;try{for(const file of files)if(await writeFile((folder?folder+'/':'')+file.name,file,''))count++;await refresh();status('Uploaded '+count+' file(s).');}finally{q('#sd-upload-files').value='';}});
let zipLoading;async function zipLibrary(){if(window.JSZip)return window.JSZip;if(!zipLoading)zipLoading=new Promise((resolve,reject)=>{const tag=document.createElement('script');tag.src=new URL('architex/vendor/jszip.min.js',base).href;tag.onload=()=>resolve(window.JSZip);tag.onerror=()=>{zipLoading=null;reject(Error('Could not load the ZIP library.'));};document.head.append(tag);});return zipLoading;}
let archiveLoading,diskRestore=null,archiveWorking=false;async function archiveLibrary(){if(window.SuiteDiskZip)return window.SuiteDiskZip;if(!archiveLoading)archiveLoading=new Promise((resolve,reject)=>{const tag=document.createElement('script');tag.src=new URL('shared-suite/disk-zip.js?v=disk-zip-20261024',base).href;tag.onload=()=>resolve(window.SuiteDiskZip);tag.onerror=()=>{archiveLoading=null;reject(Error('Could not load disk ZIP support.'));};document.head.append(tag);});return archiveLoading;}
async function archiveAction(fn){if(archiveWorking)return;archiveWorking=true;for(const id of ['#sd-backup-export','#sd-backup-import','#sd-backup-selected','#sd-backup-apply'])q(id).disabled=true;try{await fn();}catch(e){status(e.message,true);}finally{archiveWorking=false;for(const id of ['#sd-backup-export','#sd-backup-import','#sd-backup-selected','#sd-backup-apply'])q(id).disabled=false;}}
function discardRestore(){diskRestore=null;q('#sd-backup-preview').hidden=true;}q('#sd-backup-cancel').onclick=discardRestore;
async function prepareRestore(file){discardRestore();const before=await D.all(),snapshot=D.fingerprint(before),Archive=await archiveLibrary();if(file.size>Archive.MAX)throw Error('Disk ZIP exceeds 200 MiB.');status('Reading disk ZIP…');const entries=await Archive.unpack(await zipLibrary(),await file.arrayBuffer());if(D.fingerprint(await D.all())!==snapshot)throw Error('Virtual disk changed during ZIP reading. Import again.');const files=entries.filter(e=>e.kind==='file'),existing=new Map(before.map(e=>[e.path,e])),conflicts=entries.filter(e=>existing.has(e.path));diskRestore={entries,snapshot};q('#sd-backup-policy').value='keep';q('#sd-backup-summary').textContent=files.length+' file(s), '+entries.filter(e=>e.kind==='folder').length+' folder(s), '+(files.reduce((n,e)=>n+e.blob.size,0)/1024).toFixed(1)+' KiB. '+conflicts.length+' existing path(s) match. Current disk: '+before.filter(e=>e.kind==='file').length+' file(s).';q('#sd-backup-preview').hidden=false;status('ZIP validated. Choose a restore policy, then apply. The disk is unchanged.');}
q('#sd-backup-export').onclick=()=>archiveAction(async()=>{status('Preparing whole-disk ZIP…');const entries=await D.all(),Archive=await archiveLibrary(),bytes=await Archive.pack(await zipLibrary(),entries);computerDownload(new Blob([bytes],{type:'application/zip'}),'tlal-virtual-disk.zip');status('Exported the entire virtual disk to ZIP.');});q('#sd-backup-import').onclick=()=>q('#sd-backup-file').click();q('#sd-backup-file').onchange=()=>archiveAction(async()=>{try{const file=q('#sd-backup-file').files[0];if(file)await prepareRestore(file);}finally{q('#sd-backup-file').value='';}});q('#sd-backup-selected').onclick=()=>archiveAction(async()=>{if(selected.size!==1)throw Error('Select one ZIP file on the disk.');const entry=await D.get([...selected][0]);if(entry?.kind!=='file'||!entry.path.toLowerCase().endsWith('.zip'))throw Error('Select a ZIP file.');await prepareRestore(entry.blob);});q('#sd-backup-apply').onclick=()=>archiveAction(async()=>{if(!diskRestore)throw Error('Import a ZIP to preview first.');const policy=q('#sd-backup-policy').value;if(policy==='replace'&&!confirm('Replace the entire virtual disk with this ZIP? Files not in the backup will be deleted.'))return;const result=await D.importEntries(diskRestore.entries,{policy,expectedSnapshot:diskRestore.snapshot});discardRestore();folder='';selected.clear();await refresh();status('Disk restored: '+result.filesWritten+' file(s) written, '+result.filesSkipped+' kept, '+result.foldersAdded+' folder(s) added.');});
async function downloadSelected(){
 if(downloading)return;
 downloading=true;const paths=[...selected],button=q('#sd-download');
 button.textContent='Preparing download…';updateActions();status('Reading selected files and folders…');
 try{
  const entries=await D.readSelection(paths);
  if(entries.length===1&&entries[0].kind==='file')computerDownload(entries[0].blob,entries[0].path.split('/').pop());
  else{
   const Zip=await zipLibrary(),zip=new Zip();
   for(const entry of entries)if(entry.kind==='folder')zip.folder(entry.path);else zip.file(entry.path,entry.blob);
   const archive=await zip.generateAsync({type:'blob'},progress=>status('Preparing download · '+Math.floor(progress.percent)+'%'));
   computerDownload(archive,'virtual-disk.zip');
  }
  status('Downloaded selected files and folders.');
 }finally{downloading=false;button.textContent='Download selected';updateActions();}
}
q('#sd-download').onclick=()=>action(downloadSelected);
async function deleteSelected(){
 if(deleting||!selected.size)return;
 const paths=[...selected];
 if(!confirm('Delete '+paths.length+' selected item(s), including any files inside selected folders?'))return;
 deleting=true;const button=q('#sd-delete');button.textContent='Deleting…';updateActions();
 status('Deleting selected files and folders…');
 try{
  const result=await D.removeMany(paths);
  for(const path of paths)selected.delete(path);
  await refresh();status('Deleted '+result.removed+' file(s) and folder(s).');
 }finally{deleting=false;button.textContent='Delete selected';updateActions();}
}
q('#sd-delete').onclick=()=>action(deleteSelected);

async function importFiles(entries,relative=false){const input=chosenInput();if(!input)throw Error('Choose an import target.');if(!entries.length)throw Error('Choose at least one file.');if(!input.multiple&&entries.length!==1)throw Error('This importer accepts one file at a time.');if(entries.some(e=>!supported(e,input)))throw Error('One or more selected files are unsupported by this importer.');const transfer=new DataTransfer();for(const entry of entries){const prefix=folder?folder+'/':'',relativePath=relative?(folder.split('/').pop()||'disk')+'/'+entry.path.slice(prefix.length):'';transfer.items.add(D.asFile(entry,relativePath));}if(!pickerInput&&window.openIO&&app?.id==='architex'&&['file','rstFolder'].includes(input.id)){const scope=q('#sd-scope').value;window.openIO('import');document.getElementById('exchangeModel').value=scope;document.getElementById('exchangeModel').dispatchEvent(new Event('change'));document.getElementById('clearInstances').checked=false;}input.files=transfer.files;close();if(input.onchange)await input.onchange({target:input});else input.dispatchEvent(new Event('change',{bubbles:true}));}
q('#sd-import').onclick=()=>action(async()=>{const entries=[];for(const p of selected){const entry=await D.get(p);if(entry?.kind!=='file')throw Error('Open a folder to select its files, or use a folder importer.');entries.push(entry);}await importFiles(entries);});q('#sd-import-folder').onclick=()=>action(async()=>{const prefix=folder?folder+'/':'';await importFiles((await D.all()).filter(e=>e.kind==='file'&&e.path.startsWith(prefix)),true);});
window.addEventListener('suite-disk-change',()=>{if(dialog.open)action(refresh);});
const source=el('dialog',{id:'suite-load-source','aria-labelledby':'suite-load-title'});
source.innerHTML='<h2 id="suite-load-title">Load content</h2><p>Choose where to load your files from.</p><div class="sd-source-actions"><button type="button" id="suite-load-local">Local disk</button><button type="button" id="suite-load-virtual">Virtual disk</button><button type="button" id="suite-load-cancel">Cancel</button></div>';
document.body.append(source);let sourceInput=null;
source.addEventListener('keydown',e=>e.stopPropagation());
source.querySelector('#suite-load-cancel').onclick=()=>{source.close();sourceInput=null;};
source.addEventListener('cancel',()=>{sourceInput=null;});
source.querySelector('#suite-load-local').onclick=()=>{const input=sourceInput;source.close();sourceInput=null;if(!input?.isConnected)return;localInput=input;try{input.click();}finally{localInput=null;}};
source.querySelector('#suite-load-virtual').onclick=()=>{const input=sourceInput;source.close();sourceInput=null;if(input?.isConnected)show('browse',null,input);};
document.addEventListener('click',event=>{
 const input=event.target;
 if(!(input instanceof HTMLInputElement)||input.type!=='file'||input.disabled||dialog.contains(input)||input===localInput)return;
 event.preventDefault();event.stopImmediatePropagation();sourceInput=input;
 if(!source.open)source.showModal();
},true);
// Suite-wide task dashboard uses existing app notebooks and never runs their tasks.
const tasksButton=el('button',{type:'button',id:'suite-tasks-open',title:'Tasks across all apps (Alt+Shift+T)'},'Tasks');bar.append(tasksButton);document.querySelector('.desktop-header-links')?.append(tasksButton);let tasksLoading;
async function tasks(){if(!window.SuiteTaskBoard){if(!tasksLoading)tasksLoading=(async()=>{for(const name of ['notebook-core.js','task-board-core.js','task-board.js']){if(name==='notebook-core.js'&&window.SuiteNotebookCore)continue;await new Promise((resolve,reject)=>{const tag=document.createElement('script');tag.src=new URL('shared-suite/'+name+'?v=worklists-20261031',base).href;tag.onload=resolve;tag.onerror=()=>{tag.remove();reject(Error('Could not load task dashboard'));};document.head.append(tag);});}})().catch(error=>{tasksLoading=null;throw error;});await tasksLoading;}SuiteTaskBoard.open();}
tasksButton.onclick=()=>tasks().catch(error=>{tasksButton.title=error.message;tasksButton.textContent='Retry tasks';});document.addEventListener('keydown',event=>{if(event.altKey&&event.shiftKey&&!event.ctrlKey&&!event.metaKey&&event.code==='KeyT'&&!document.querySelector('dialog[open]')){event.preventDefault();event.stopImmediatePropagation();tasksButton.click();}},true);
if(app){const reviewButton=el('button',{type:'button',id:'suite-review-open',title:'Review current work'},'Review');bar.append(reviewButton);let reviewLoading;reviewButton.onclick=()=>{if(!reviewLoading)reviewLoading=(async()=>{for(const [name,globalName]of [['notebook-core.js','SuiteNotebookCore'],['quality.js','SuiteQuality'],['review-core.js','SuiteReviewCore'],['review.js','SuiteReview']]){if(window[globalName])continue;await new Promise((resolve,reject)=>{const tag=document.createElement('script');tag.src=new URL('shared-suite/'+name+'?v=review-followup-20261031',base).href;tag.onload=resolve;tag.onerror=()=>{tag.remove();reject(Error('Could not load work review'));};document.head.append(tag);});}})().catch(error=>{reviewLoading=null;throw error;});reviewLoading.then(()=>SuiteReview.open()).catch(error=>{reviewButton.title=error.message;reviewButton.textContent='Retry review';});};}
// Shared navigation and display controls load independently of document editors.
window.SuiteHubReady=(async()=>{for(const name of ['hub-core.js','hub.js'])await new Promise((resolve,reject)=>{const tag=document.createElement('script');tag.src=new URL('shared-suite/'+name+'?v=tlal-mockix-20261031',base).href;tag.onload=resolve;tag.onerror=()=>reject(Error('Could not load suite navigation'));document.head.append(tag);});})();window.SuiteHubReady.catch(error=>console.warn(error.message));
window.SuiteDiskUI={open:show,getDestination:()=>destination,setDestination:value=>{if(!['computer','disk'].includes(value))throw Error('Choose Computer or Virtual disk.');destination=value;target.value=value;try{localStorage.setItem('suite-export-destination-'+(app?.id||'desktop'),value);}catch{}},download:async anchor=>{if(destination!=='disk'){anchor.click();return;}try{const response=await fetch(anchor.href);if(!response.ok)throw Error('Could not read the exported file.');const blob=await response.blob();await show('save',{blob,name:anchor.download||'export'});}catch(e){await show();status('Export was not saved: '+e.message,true);}},computerDownload};
})();
