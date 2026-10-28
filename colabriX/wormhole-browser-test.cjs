'use strict';
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const a=process.env.BASE_URL_A||'http://127.0.0.1:8032',b=process.env.BASE_URL_B||'http://127.0.0.1:8033';
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});let p,q;try{
 const errors=[];p=await browser.newPage();q=await browser.newPage();for(const page of [p,q]){page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());page.setDefaultTimeout(30000);}
 await Promise.all([p.goto(a+'/colabriX/'),q.goto(b+'/colabriX/')]);for(const page of [p,q])await page.waitForFunction(()=>window.ColabrixWormhole&&ColabrixApp.ready);
 await p.evaluate(()=>{const d=Colabrix.blank('Master document');d.items=[Colabrix.item('note',{id:'shared-note',text:'Initial note'})];ColabrixApp.apply(d);});
 await p.locator('#collaborate').click();await p.locator('#cw-start').click();await p.waitForFunction(()=>document.querySelector('#cw-code').textContent.startsWith('Pairing code: '));let code=(await p.locator('#cw-code').textContent()).slice('Pairing code: '.length);
 await q.locator('#collaborate').click();await q.locator('#cw-role').selectOption('participant');await q.locator('#cw-code-input').fill(code);await q.locator('#cw-start').click();
 await q.waitForFunction(()=>ColabrixApp.snapshot().name==='Master document');assert.equal(await p.evaluate(()=>ColabrixApp.snapshot().id),await q.evaluate(()=>ColabrixApp.snapshot().id));
 await Promise.all([p.locator('#cw-close').click(),q.locator('#cw-close').click()]);
 await q.evaluate(()=>{const d=ColabrixApp.snapshot();d.name='Participant edit';ColabrixApp.apply(d);});await p.waitForFunction(()=>ColabrixApp.snapshot().name==='Participant edit');
 await p.evaluate(()=>{const d=ColabrixApp.snapshot();d.items[0].text='Master update';ColabrixApp.apply(d);});await q.waitForFunction(()=>ColabrixApp.snapshot().items[0].text==='Master update');
 await q.evaluate(()=>{window.originalDraftFlush=ColabrixApp.flushDraft;ColabrixApp.flushDraft=async()=>{throw Error('Simulated local save failure');};});
 await p.evaluate(()=>{const d=ColabrixApp.snapshot();d.items[0].text='Durable master update';ColabrixApp.apply(d);});await q.waitForFunction(()=>document.querySelector('#cw-status').textContent.includes('Simulated local save failure'));
 const retained=await q.evaluate(async()=>SuiteWormhole.api({op:'status',session:ColabrixWormhole.status().session}));assert.ok(retained.queue.some(v=>v.direction==='in'&&v.status==='queued'),'A local save failure must not acknowledge processing');
 await q.evaluate(()=>{ColabrixApp.flushDraft=window.originalDraftFlush;});await q.waitForFunction(async()=>{const s=await SuiteWormhole.api({op:'status',session:ColabrixWormhole.status().session});return !s.queue.some(v=>v.direction==='in'&&v.status==='queued');});
 const queues=await q.evaluate(async()=>SuiteWormhole.api({op:'status',session:ColabrixWormhole.status().session}));assert.ok(queues.queue.some(v=>v.direction==='out'&&v.status==='delivered'));assert.ok(queues.queue.some(v=>v.direction==='in'&&v.status==='processed'));
 for(const page of [p,q]){await page.locator('#collaborate').click();await page.locator('#cw-stop').click();await page.waitForFunction(()=>document.querySelector('#cw-status').textContent.startsWith('Disconnected.'));await page.locator('#cw-close').click();}
 await q.evaluate(()=>{const d=ColabrixApp.snapshot();d.name='Queued offline edit';ColabrixApp.apply(d);});await q.waitForFunction(async()=>{const s=await SuiteWormhole.api({op:'status',session:ColabrixWormhole.status().session});return s.queue.some(v=>v.direction==='out'&&v.status==='queued');});
 await p.locator('#collaborate').click();await p.locator('#cw-start').click();await p.waitForFunction(old=>document.querySelector('#cw-code').textContent.startsWith('Pairing code: ')&&document.querySelector('#cw-code').textContent!=='Pairing code: '+old,code);code=(await p.locator('#cw-code').textContent()).slice('Pairing code: '.length);
 await q.locator('#collaborate').click();await q.locator('#cw-code-input').fill(code);await q.locator('#cw-start').click();await p.waitForFunction(()=>ColabrixApp.snapshot().name==='Queued offline edit');await q.waitForFunction(()=>ColabrixApp.snapshot().name==='Queued offline edit');
 assert.deepEqual(errors,[]);console.log('PASS real magic-wormhole colabriX: master snapshot, bidirectional changes, durable in/out queues and offline edit delivery after reconnect.');
}finally{for(const page of [p,q])if(page)await page.evaluate(async()=>{const s=window.ColabrixWormhole?.status();if(s)await SuiteWormhole.api({op:'stop',session:s.session});}).catch(()=>{});await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
