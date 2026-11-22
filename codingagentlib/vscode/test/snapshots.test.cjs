'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const Snapshots=require('../src/snapshots.cjs');

test('snapshots capture, list, rollback added/modified/deleted files, and delete cleanly',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'rabbithole-snap-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 await fs.mkdir(path.join(dir,'src'),{recursive:true});
 await fs.writeFile(path.join(dir,'a.txt'),'original A');
 await fs.writeFile(path.join(dir,'src/b.txt'),'original B');

 const snap=await Snapshots.createSnapshot(dir,{label:'Before edits',sessionId:'s1'});
 assert.equal(snap.fileCount,2);
 const listed=await Snapshots.listSnapshots(dir);
 assert.equal(listed.length,1);
 assert.equal(listed[0].id,snap.id);

 // Mutate workspace: modify a.txt, delete src/b.txt, add extra.txt
 await fs.writeFile(path.join(dir,'a.txt'),'modified A');
 await fs.rm(path.join(dir,'src/b.txt'));
 await fs.writeFile(path.join(dir,'extra.txt'),'added later');

 await Snapshots.restoreSnapshot(dir,snap.id);
 assert.equal(await fs.readFile(path.join(dir,'a.txt'),'utf8'),'original A');
 assert.equal(await fs.readFile(path.join(dir,'src/b.txt'),'utf8'),'original B');
 await assert.rejects(fs.access(path.join(dir,'extra.txt')));

 await Snapshots.deleteSnapshot(dir,snap.id);
 assert.equal((await Snapshots.listSnapshots(dir)).length,0);
});
