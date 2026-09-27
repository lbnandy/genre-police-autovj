const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { _electron } = require(process.env.AUTOVJ_PLAYWRIGHT || 'playwright');
const { Library, atomicJson } = require('../packages/library.cjs');
(async () => {
  const root = path.resolve(__dirname, '..');
  const data = path.join(root, '.qa', crypto.randomUUID());
  const out = path.join(root, 'output/playwright/console-ui');
  fs.mkdirSync(out, { recursive: true });
  const id = crypto.randomUUID();
  const library = new Library(path.join(data, 'libraries', id));
  library.data.tracks = Array.from({ length: 8 }, (_, i) => ({
    id: crypto.randomUUID(), title: `Night Drive ${i + 1} (Extended Mix)`,
    artist: 'Example Artist', status: 'ready', confirmed: true,
    durationMs: 240000, genreId: 'synthwave', visualId: 'synthwave',
  }));
  library.save();
  atomicJson(path.join(data, 'app.json'), { activeLibrary: id, language: 'zh' });
  const env = { ...process.env, AUTOVJ_DATA_DIR: data };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ executablePath: path.join(root, 'node_modules/electron/dist/electron.exe'), args: [root], env });
  try {
    const page = app.windows().find(p => p.url().includes('console.html')) || await app.waitForEvent('window', { predicate: p => p.url().includes('console.html') });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.waitForSelector('#live-toggle');
    for (const width of [1440, 1024]) {
      await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('console.html')).setSize(width, 800), width);
      for (const language of ['zh', 'en', 'ja', 'ko']) {
        await page.evaluate(language => window.autovj.call('settings', { language }), language);
        await page.waitForFunction(language => document.documentElement.lang.startsWith(language), language);
        for (const tab of ['library', 'settings', 'live']) {
          await page.locator(`[data-tab=${tab}]`).click();
          if (tab === 'library') await page.locator('.dj-profile').evaluate(el => el.open = true);
          const overflow = await page.evaluate(() => {
            const main = document.querySelector('main');
            return main.scrollWidth > main.clientWidth + 1;
          });
          assert.equal(overflow, false, `${width}/${language}/${tab} overflow`);
          await page.screenshot({ path: path.join(out, `${width}-${language}-${tab}.png`) });
        }
        await page.locator('[data-tab=settings]').click();
        await page.evaluate(() => window.autovj.call('settings', { impactMode: 'beat', rhythmSource: 'audio', textVisible: false }));
        await page.waitForFunction(() => !document.querySelector('#beat-strength-row').hidden && document.querySelector('#link-settings').hidden && document.querySelector('#heading-mode').disabled);
        await page.evaluate(() => window.autovj.call('settings', { impactMode: 'music', rhythmSource: 'auto', textVisible: true }));
      }
    }
    await page.locator('[data-tab=live]').click();
    await page.locator('#screen-impact-button').click();
    await page.waitForFunction(() => document.querySelector('#screen-impact-button').getAttribute('aria-pressed') === 'true');
    await page.keyboard.press('x');
    await page.waitForFunction(() => document.querySelector('#screen-impact-button').getAttribute('aria-pressed') === 'false');
    await page.locator('[data-tab=library]').click();
    await page.locator('#dj-name').fill('');
    await page.locator('#dj-name').press('x');
    assert.equal(await page.locator('#screen-impact-button').getAttribute('aria-pressed'), 'false');
    const stage = app.windows().find(p => p.url().includes('stage.html'));
    stage.on('pageerror', e => errors.push(e.message));
    await page.evaluate(() => window.autovj.call('output', 'window'));
    for (const layout of ['split', 'stacked']) {
      await page.evaluate(fullscreenLayout => window.autovj.call('settings', {fullscreenLayout}), layout);
      await stage.waitForFunction(layout => document.body.dataset.fullscreenLayout === layout, layout);
      await stage.waitForTimeout(800); // Let the existing layout transition settle.
    await stage.waitForFunction(() => document.querySelector('#screen-impact-layer').style.transform === 'none');
    const brandBefore = await stage.locator('.jurisdiction').boundingBox();
    // Controlled impulse checks the real compositor without playing test audio.
    await stage.evaluate(async () => {
      const {ScreenImpact} = await import('./screen-impact.mjs');
      const {impactProfile} = await import('./impact-level.mjs');
      window.restoreImpact = ScreenImpact.prototype.update;
      ScreenImpact.prototype.update = (_metrics,_now,_enabled,_mode,level) => ({...impactProfile(level),age:12});
    });
    await stage.waitForFunction(() => document.querySelector('#screen-impact-layer').style.filter.includes('screen-rgb'));
    for (const [level,rgb] of [['low',1],['medium',3],['high',8],['extreme',16],['ultra',24]]) {
      await page.evaluate(impactLevel=>window.autovj.call('settings',{impactLevel}),level);
      await stage.waitForFunction(rgb=>Number(document.querySelector('#screen-rgb-red').getAttribute('dx'))===rgb,rgb);
      assert.equal(await stage.locator('#screen-rgb-blue').getAttribute('dx'),(-rgb).toFixed(2));
      await stage.screenshot({path:path.join(out,`screen-impact-${layout}-${level}.png`)});
    }
    const brandAfter = await stage.locator('.jurisdiction').boundingBox();
    for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(brandBefore[key] - brandAfter[key]) < 1, `Brand ${key} moved during screen impact ${layout}: ${JSON.stringify(brandBefore)} -> ${JSON.stringify(brandAfter)}`);
    await stage.screenshot({path: path.join(out, 'screen-impact-peak.png')});
    await stage.evaluate(async () => {
      const {ScreenImpact} = await import('./screen-impact.mjs');
      ScreenImpact.prototype.update = window.restoreImpact;
      delete window.restoreImpact;
    });
    await stage.waitForFunction(() => document.querySelector('#screen-impact-layer').style.transform === 'none');
    }
    assert.deepEqual(errors, []);
    console.log('Console UI QA passed: 4 languages, 2 widths, 3 tabs, dependent controls, no page errors.');
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
