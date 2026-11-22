const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const {spawn} = require('node:child_process');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');

(async () => {
  const root = path.resolve(__dirname, '..'), folder = await fs.mkdtemp(path.join(os.tmpdir(), 'suite-inventory-fields-'));
  const server = spawn('python3', ['-u', 'server/server.py', '--port', '0', '--skills-offline', '--disable-agent',
    '--agent-workspace', folder, '--config', path.join(folder, 'providers.json'), '--search-config', path.join(folder, 'search.json')],
    {cwd: root, stdio: ['ignore', 'pipe', 'pipe']});
  let browser, stderr = '';
  server.stderr.on('data', data => {stderr += data;});
  try {
    const base = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(Error('Server did not start: ' + stderr)), 20000);
      server.stdout.on('data', data => {
        output += data; const match = output.match(/listening on (\S+)/);
        if (match) {clearTimeout(timer); resolve('http://' + match[1]);}
      });
      server.once('exit', () => {clearTimeout(timer); reject(Error(stderr));});
    });
    browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox']});
    const context = await browser.newContext({viewport: {width: 1550, height: 1100}});
    const index = await context.newPage(); await index.goto(base);
    const apps = await index.evaluate(() => SuiteApps.map(app => app.id)); await index.close();
    assert.equal(apps.length, 24);
    for (const app of apps.filter(id => id !== 'shelliX')) {
      const page = await context.newPage(), errors = [], forbidden = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => {if (request.method() === 'POST' && /\/api\/(chat|agent)$/.test(request.url())) forbidden.push(request.url());});
      await page.goto(base + '/' + app + '/');
      await page.waitForFunction(() => window.SuiteInventoryUI && window.SuiteToolActions);
      if (['markiX','formiX','cncfiX','mockiX'].includes(app)) {
        await page.evaluate(async () => {
          const A=SuiteWorkspaceAdapter, d=A.snapshot();
          if(A.name==='markiX'){d.syntax='markdown';d.source='# Title\nParagraph \n';}
          if(A.name==='formiX')d.formulas[0].title='';
          if(A.name==='cncfiX'){const item=d.items[0];d.items=[{...item,id:'zeta-test',name:'Zeta'},{...item,id:'alpha-test',name:'Alpha'}];}
          if(A.name==='mockiX'){const screen=d.screens[0],e=screen.elements[0];e.width=Math.min(e.width,screen.width-40);e.height=Math.min(e.height,screen.height-40);e.x=13;e.y=19;e.locked=false;}
          await A.restore(await A.validate(d,A.snapshot()));
        });
        const before=await page.evaluate(()=>JSON.stringify(SuiteWorkspaceAdapter.snapshot()));
        await page.locator('#suite-workspace-open').click(); await page.locator('[data-panel="tools"]').click();
        const action={markiX:'trim-trailing',formiX:'fill-titles',cncfiX:'sort-items',mockiX:'snap-grid'}[app];
        await page.locator('#sc-actions [data-action="'+action+'"]').click();
        await page.locator('#sw-review').waitFor({state:'visible'});
        assert.equal(await page.evaluate(()=>JSON.stringify(SuiteWorkspaceAdapter.snapshot())),before,'preview must not apply');
        await page.locator('#sw-apply').click();
        await page.waitForFunction(()=>document.querySelector('#sw-status').textContent.startsWith('Updated '));
        assert.notEqual(await page.evaluate(()=>JSON.stringify(SuiteWorkspaceAdapter.snapshot())),before);
        assert.ok((await page.evaluate(()=>SuiteWorkspaceStore.list(SuiteWorkspaceAdapter.name))).length>0);
        await page.locator('#sw-close').click();
        console.log('PASS '+app+': native action preview, reviewed application and recovery snapshot');
      }
      const initial = await page.evaluate(async () => {
        const A = SuiteWorkspaceAdapter, before = JSON.stringify(A.snapshot());
        const rows = SuiteCapabilities.inventory(A.name, A.snapshot());
        if (!Array.isArray(rows)) throw Error('Native inventory is not an array');
        if (!SuiteToolActions.actions().length) throw Error('No available tool actions');
        if (JSON.stringify(A.snapshot()) !== before) throw Error('Native inventory changed document');
        return before;
      });
      await page.locator('#suite-workspace-open').click();
      await page.locator('[data-panel="tools"]').click();
      await page.locator('#sc-view').click();
      // Use a deterministic inventory provider to exercise the same field controls in every host.
      await page.evaluate(() => {
        SuiteCapabilities.inventory = () => Array.from({length: 60}, (_, i) => ({id: 'row-' + i,
          size: i === 59 ? null : i, status: i % 2 ? 'draft' : 'ready', text: i === 0 ? '<script>window.bad=true</script>' : 'Record ' + i}));
      });
      await page.locator('#sc-view').click();
      await page.locator('#sc-field').selectOption('size');
      await page.locator('#sc-value').fill('50');
      await page.locator('#sc-operator').selectOption('atLeast');
      assert.match(await page.locator('#sc-count').textContent(), /9 matching/);
      await page.locator('#sc-sort-field').selectOption('size');
      await page.locator('#sc-direction').selectOption('desc');
      await page.locator('#sc-scope').selectOption('filtered');
      assert.deepEqual(await page.evaluate(() => SuiteInventoryUI.exportRows().map(row => row.size)), [58,57,56,55,54,53,52,51,50]);
      const download = page.waitForEvent('download'); await page.locator('#sc-export').click();
      const exported = await download; assert.match(exported.suggestedFilename(), /filtered\.json$/);
      const saved = await exported.path(), contents = JSON.parse(await fs.readFile(saved, 'utf8'));
      assert.equal(contents.items.length, 9);
      await page.locator('#sc-value').fill('bad');
      assert.match(await page.locator('#sc-status').textContent(), /finite number/);
      await page.locator('#sc-reset-view').click();
      assert.match(await page.locator('#sc-count').textContent(), /60 matching/);
      await page.locator('#sc-field').selectOption('size');
      await page.locator('#sc-operator').selectOption('empty');
      assert.match(await page.locator('#sc-count').textContent(), /1 matching/);
      assert.equal(await page.locator('#sc-value').isDisabled(), true);
      await page.locator('#sc-reset-view').click();
      await page.locator('#sc-next').click();
      assert.match(await page.locator('#sc-page').textContent(), /Page 2 of 3/);
      assert.equal(await page.evaluate(() => JSON.stringify(SuiteWorkspaceAdapter.snapshot())), initial);
      assert.equal(await page.evaluate(() => window.bad), undefined);
      assert.deepEqual(errors, [], app + ' page errors'); assert.deepEqual(forbidden, [], app + ' unsolicited execution');
      console.log('PASS ' + app + ': native inventory/actions, field filters, sorting, full filtered export, empty/missing values and document preservation');
      await page.close();
    }
    const shell = await context.newPage(), shellErrors = [];
    shell.on('pageerror', error => shellErrors.push(error.message)); await shell.goto(base + '/shelliX/');
    await shell.waitForSelector('#history-inventory');
    await shell.evaluate(() => {
      window.inventoryAudit = {sessionId: 'test', events: Array.from({length: 35}, (_, i) => [
        {kind: 'action', value: {id: 'call-' + i, tool: 'run_command', args: {command: 'python3', args: ['-c', 'print(' + i + ')']}}},
        {kind: 'observation', value: {id: 'call-' + i, ok: true, result: {exitCode: i % 2}}}
      ]).flat()};
      ShelliXHistory.snapshot = () => JSON.parse(JSON.stringify(window.inventoryAudit));
    });
    await shell.locator('#history-inventory').click();
    await shell.locator('#shi-field').selectOption('exitCode'); await shell.locator('#shi-value').fill('1');
    await shell.locator('#shi-operator').selectOption('equals');
    assert.match(await shell.locator('#shi-status').textContent(), /17 matching/);
    await shell.locator('#shi-format').selectOption('csv');
    const download = shell.waitForEvent('download'); await shell.locator('#shi-export').click();
    assert.match((await download).suggestedFilename(), /commands.filtered.csv$/);
    await shell.evaluate(() => inventoryAudit.events.push({kind: 'user', value: {text: 'new follow-up'}}));
    await shell.locator('#shi-export').click();
    assert.match(await shell.locator('#shi-status').textContent(), /Session history changed/);
    assert.equal(await shell.evaluate(() => inventoryAudit.events.length), 71);
    assert.deepEqual(shellErrors, []);
    console.log('PASS shelliX: read-only receipt inventory, field-filtered CSV and stale-history guard');
    await context.close();
    console.log('PASS all 24 apps: capability access and field-aware inventory workflow');
  } finally {
    if (browser) await browser.close(); server.kill('SIGTERM');
    await new Promise(resolve => {if (server.exitCode !== null) resolve(); else server.once('exit', resolve);});
    await fs.rm(folder, {recursive: true, force: true});
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
