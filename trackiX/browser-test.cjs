const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto((process.env.BASE_URL || 'http://127.0.0.1:8000') + '/trackiX/');
    await page.waitForSelector('.issue-card');
    const beforeCount = await page.locator('.issue-card').count();
    await page.locator('#add-issue').click();
    assert.equal(await page.locator('.issue-card').count(), beforeCount + 1);
    await page.locator('#view-list').click();
    assert.equal(await page.locator('.issue-table tbody tr').count(), beforeCount + 1);
    assert.deepEqual(errors, []);
    console.log('PASS: trackiX browser board, issue creation, and list view.');
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error(e);
  process.exit(1);
});
