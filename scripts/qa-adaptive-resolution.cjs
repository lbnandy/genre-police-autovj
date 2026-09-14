// Real Electron settings/IPC/rendering, with scheduling delays confined to this
// isolated test app. This checks adaptation wiring, not GPU benchmark gains.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {_electron} = require(process.env.AUTOVJ_PLAYWRIGHT || 'playwright');
const {select} = require('./qa-picker.cjs');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, 'output/playwright/adaptive-resolution');
(async () => {
  fs.mkdirSync(OUT, {recursive:true});
  const env = {...process.env, AUTOVJ_DATA_DIR:path.join(ROOT, '.qa', 'adaptive-' + crypto.randomUUID())};
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({executablePath:path.join(ROOT, 'node_modules/electron/dist/electron.exe'), args:[ROOT], env});
  const errors = [], languages = [];
  try {
    const p = app.windows().find(w => w.url().includes('console.html')) || await app.waitForEvent('window', {predicate:w => w.url().includes('console.html')});
    await p.waitForSelector('#live-toggle');
    const stage = app.windows().find(w => w.url().includes('stage.html'));
    for (const w of [p,stage]) w.on('pageerror', e => errors.push(e.message));
    assert.equal((await p.evaluate(() => window.autovj.call('state'))).settings.renderScale, 'auto');
    await p.locator('[data-tab=settings]').click();
    await select(p, 'renderScale', '0.5');
    await p.waitForFunction(() => window.autovj.call('state').then(s => s.settings.renderScale === .5));
    await select(p, 'renderScale', 'auto');
    await p.waitForFunction(() => window.autovj.call('state').then(s => s.settings.renderScale === 'auto'));
    for (const language of ['zh','en','ja','ko']) {
      await p.evaluate(language => window.autovj.call('settings', {language}), language);
      await p.waitForFunction(language => document.documentElement.lang === (language === 'zh' ? 'zh-CN' : language), language);
      assert.equal(await p.locator('#renderScale').inputValue(), 'auto');
      const text = await p.locator('#renderScale-button').innerText();
      assert.ok(text.trim().length > 0);
      languages.push({language, text});
      await p.screenshot({path:path.join(OUT, 'settings-' + language + '.png')});
    }
    await p.evaluate(() => window.autovj.call('settings', {language:'zh', renderScale:1, idleFrameLimit:false, showFps:false, frameRateLimit:'60'}));
    await p.evaluate(() => window.autovj.call('output', 'window'));
    const setOutputBounds = () => app.evaluate(({BrowserWindow,screen}) => {
      const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('stage.html'));
      const area = screen.getPrimaryDisplay().workArea;
      w.setBounds({x:area.x+40,y:area.y+70,width:960,height:540});
      w.setAlwaysOnTop(true); w.show();
    });
    await setOutputBounds();
    await p.evaluate(() => window.autovj.call('lock', 'unknown'));
    await stage.waitForFunction(() => document.body.dataset.standby !== 'true' && !document.hidden);
    await stage.evaluate(() => document.fonts.ready);
    await stage.waitForTimeout(1300);
    const measure = () => stage.evaluate(() => {
      const canvas = document.querySelector('#visualizer'), rect = canvas.getBoundingClientRect();
      return {width:canvas.width, height:canvas.height, cssWidth:rect.width, cssHeight:rect.height,
        text:['#genre-face','#title'].map(selector => {
          const el = document.querySelector(selector), css = getComputedStyle(el);
          return {selector, text:el.textContent, font:css.font, width:css.width, height:css.height};
        })};
    });
    const native = await measure();
    await stage.screenshot({path:path.join(OUT, 'output-native.png')});
    await p.evaluate(() => window.autovj.call('settings', {renderScale:'auto'}));
    await stage.evaluate(() => {
      const nativeRaf = window.requestAnimationFrame.bind(window);
      window.qaSlowFrames = true;
      window.requestAnimationFrame = callback => nativeRaf(time => {
        if (window.qaSlowFrames) setTimeout(() => callback(performance.now()), 40);
        else callback(time);
      });
    });
    await stage.waitForFunction(width => document.querySelector('#visualizer').width < width * .95, native.width, {timeout:22000});
    const adapted = await measure();
    assert.ok(adapted.width >= native.width * .75 && adapted.width <= native.width * .905, JSON.stringify({native,adapted}));
    assert.equal(adapted.cssWidth, native.cssWidth);
    assert.equal(adapted.cssHeight, native.cssHeight);
    assert.deepEqual(adapted.text, native.text, 'Canvas quality must not scale typography');
    await stage.screenshot({path:path.join(OUT, 'output-adaptive.png')});
    // Blackout and hidden-output intervals must not push a learned scale lower.
    await p.evaluate(() => window.autovj.call('blackout', true));
    await stage.waitForTimeout(5500);
    assert.equal((await measure()).width, adapted.width);
    await p.evaluate(() => window.autovj.call('blackout', false));
    await p.evaluate(() => window.autovj.call('output', 'hide'));
    await stage.waitForTimeout(5500);
    assert.equal((await measure()).width, adapted.width);
    await stage.evaluate(() => {window.qaSlowFrames = false;});
    await p.evaluate(() => window.autovj.call('output', 'window'));
    await setOutputBounds();
    await p.evaluate(() => window.autovj.call('settings', {renderScale:1}));
    await stage.waitForFunction(width => document.querySelector('#visualizer').width === width, native.width);
    await p.evaluate(() => window.autovj.call('settings', {renderScale:.5}));
    await stage.waitForFunction(width => Math.abs(document.querySelector('#visualizer').width - width * .5) <= 1, native.width);
    assert.deepEqual((await measure()).text, native.text);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({passed:true, native, adapted, languages, errors}, null, 2));
    console.log(JSON.stringify({passed:true,nativeWidth:native.width,adaptedWidth:adapted.width,languages:languages.length,errors}));
  } finally {await app.close();}
})().catch(e => {console.error(e);process.exitCode=1;});
