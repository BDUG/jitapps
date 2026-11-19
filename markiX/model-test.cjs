const {test}=require('node:test'),assert=require('node:assert/strict'),M=require('./model.js');
test('exact source survives parsing including unknown constructs and CRLF',()=>{
 for(const [syntax,source]of [['markdown','# A\r\n\r\nText **bold**.\r\n\r\n<div onclick="bad()">raw</div>\r\n\r\n- Item\r\n  - Nested\r\n\r\n```js\r\nalert(1)\r\n```\r\n'],['rst','Title\r\n=====\r\n\r\n.. custom:: data\r\n   :flag: yes\r\n\r\n   Keep this body.\r\n\r\n:role:`x`\r\n\r\n- First\r\n  - Nested\r\n']]){
  const blocks=M.parse(source,syntax);assert.equal(blocks.map(b=>b.raw).join(''),source);assert.ok(blocks.some(b=>b.type==='raw'));const text=blocks.findIndex(b=>b.type==='heading');blocks[text].raw=M.serialize({...blocks[text],text:'Changed'},syntax);const edited=blocks.map(b=>b.raw).join('');assert.ok(edited.endsWith(source.slice(source.indexOf('\r\n\r\n')+2)));assert.ok(edited.includes(syntax==='rst'?'.. custom:: data\r\n':'<div onclick="bad()">raw</div>\r\n'));
 }
});
test('supported blocks have readable visual markup and cross-format roundtrips',()=>{
 const source='# Guide\n\nText with **bold**, *italic*, `code` and [docs](https://example.com).\n\n- First\n- Second\n\n```js\nconst a=1;\n```\n\n| Name | Detail |\n| --- | --- |\n| A | B |\n';
 const blocks=M.parse(source,'markdown');assert.deepEqual(blocks.filter(b=>b.type!=='space').map(b=>b.type),['heading','paragraph','list','code','table']);const rst=M.convert(source,'markdown','rst'),back=M.convert(rst,'rst','markdown');assert.ok(rst.includes('.. list-table::'));assert.ok(rst.includes('``code``'));assert.equal(M.parse(rst,'rst').some(b=>b.type==='raw'),false);assert.equal(back,source);assert.ok(M.html(blocks,'markdown').includes('<strong>bold</strong>'));
});
test('HTML, script URLs and arbitrary directives stay inert',()=>{
 assert.equal(M.safeURL('javascript:alert(1)'), '');assert.equal(M.safeURL('java\nscript:bad'), '');assert.equal(M.safeURL('data:text/html,bad'),'');assert.equal(M.safeURL('https://example.com'),'https://example.com');
 const html=M.html(M.parse('<script>alert(1)</script>\n\n[unsafe](javascript:bad)\n','markdown'),'markdown');assert.ok(html.includes('&lt;script&gt;'));assert.doesNotMatch(html,/<script|href="javascript:/);assert.ok(M.inline('`<img onerror=x>`','markdown').includes('&lt;img'));
 assert.throws(()=>M.convert('.. include:: /private.txt\n','rst','markdown'),/source-only/);assert.throws(()=>M.convert('> Quote\n','markdown','rst'),/source-only/);
});
test('code fences grow to preserve embedded fences and native projects validate atomically',()=>{
 const b={type:'code',language:'text',text:'example\n```\ninside'};const source=M.serialize(b,'markdown');assert.ok(source.startsWith('````text'));assert.equal(M.parse(source,'markdown')[0].text,b.text);const p=M.create();assert.deepEqual(M.validate(p),p);assert.throws(()=>M.validate({...p,syntax:'html'}));assert.throws(()=>M.validate({...p,name:''}));assert.throws(()=>M.validate({...p,source:3}));assert.throws(()=>M.validate({...p,source:'x'.repeat(M.MAX+1)}));
});

test('RST options remain source-only and ordered list starting numbers survive edits',()=>{const source='.. code-block:: python\n   :linenos:\n\n   print(1)\n\n';assert.equal(M.parse(source,'rst')[0].type,'raw');assert.equal(M.parse(source,'rst').map(b=>b.raw).join(''),source);const list=M.parse('7. First\n8. Second\n','markdown')[0];assert.equal(list.start,7);assert.ok(M.html([list],'markdown').includes('start="7"'));assert.equal(M.serialize({...list,items:['Changed','Second']},'markdown'),'7. Changed\n8. Second\n');});

test('nested inline links render and RST section styles follow document order',()=>{assert.ok(M.inline('**[Docs](https://example.com)**','markdown').includes('<strong><a href="https://example.com">Docs</a></strong>'));const blocks=M.parse('Title\n-----\n\nSection\n=======\n','rst');assert.equal(blocks[0].level,1);assert.equal(blocks[2].level,2);assert.equal(M.serialize({...blocks[0],text:'Edited'},'rst'),'Edited\n------\n');const overline=M.parse('*****\nTitle\n*****\n','rst')[0];assert.equal(M.serialize({...overline,text:'New'},'rst'),'***\nNew\n***\n');});
