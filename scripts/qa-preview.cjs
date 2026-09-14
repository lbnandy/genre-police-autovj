"use strict";
// Measure decoded monitor frames separately from stage rendering, using an
// isolated library and the actual Electron capture/IPC/image pipeline.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const {_electron} = require(process.env.AUTOVJ_PLAYWRIGHT || 'playwright');
const {select} = require('./qa-picker.cjs');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, 'output/playwright/live-audit');
(async () => {
  fs.mkdirSync(OUT, {recursive:true});
  const env = {...process.env, AUTOVJ_DATA_DIR:path.join(ROOT, '.qa', 'preview-' + crypto.randomUUID())};
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({executablePath:path.join(ROOT, 'node_modules/electron/dist/electron.exe'), args:[ROOT, '--lang=zh-CN'], env});
  const errors = [], fonts = [], rates = [], layouts = [];
  try {
    const p = app.windows().find(w => w.url().includes('console.html')) || await app.waitForEvent('window', {predicate:w => w.url().includes('console.html')});
    await p.waitForSelector("#layout-button", {state:"attached"});
    const stage = app.windows().find(w => w.url().includes('stage.html'));
    for (const w of [p,stage]) w.on('pageerror',e => errors.push(e.message));
    await p.evaluate(() => window.autovj.call('settings',{showFps:true,idleFrameLimit:false,frameRateLimit:'60',fullscreenLayout:'stacked'}));
    await p.waitForFunction(() => document.querySelector('#preview').naturalWidth > 0);
    await p.evaluate(() => {
      window.previewTimes = []; window.previewImages = new Set(); window.outputRates = [];
      document.addEventListener('load', e => {
        if(e.target.id !== 'preview') return;
        window.previewTimes.push(performance.now()); window.previewImages.add(e.target.src);
      }, true);
      window.autovj.onPerformance(s => window.outputRates.push(s.fps));
    });
    const measure = async name => {
      await p.evaluate(() => {window.previewTimes=[];window.previewImages.clear();window.outputRates=[];});
      await p.waitForTimeout(5000);
      const r = await p.evaluate(() => {
        const t = window.previewTimes;
        return {previewFps:(t.length-1)*1000/(t.at(-1)-t[0]),uniqueFrames:window.previewImages.size,outputRates:window.outputRates.slice(-3),format:document.querySelector('#preview').src.slice(0,23)};
      });
      assert.ok(r.previewFps >= 10 && r.previewFps <= 17, JSON.stringify({name,...r}));
      assert.ok(r.uniqueFrames > 30, 'Preview must animate, not repeat a still frame');
      assert.equal(r.format, 'data:image/jpeg;base64,');
      rates.push({name,...r});
    };
    await measure('hidden output / console monitor');
    const cdp = await p.context().newCDPSession(p);
    await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
    async function font(selector, expected) {
      await p.evaluate(() => document.fonts.ready);
      const {root} = await cdp.send('DOM.getDocument');
      const {nodeId} = await cdp.send('DOM.querySelector', {nodeId:root.nodeId,selector});
      const result = await cdp.send('CSS.getPlatformFontsForNode',{nodeId});
      assert.ok(result.fonts.some(f => f.familyName.includes(expected) && f.isCustomFont), JSON.stringify({selector,...result}));
      fonts.push({selector,...result});
    }
    await font('.brand-title','Orbitron');
    await p.locator('[data-tab=settings]').click();
    await font('.about-card h2','Orbitron');
    await font('.about-card .app-version','Orbitron');
    assert.equal(await p.locator('.app-version').count(), 1);
    assert.equal(await p.locator('footer .app-version').count(), 0);
    assert.equal(await p.evaluate(() => [...document.styleSheets].some(s => [...s.cssRules].some(r => r.href?.includes('chakra-petch')))), false);
    await app.evaluate(({shell}) => {
      global.qaOpenedRepositories = [];
      global.qaOriginalOpenExternal = shell.openExternal;
      shell.openExternal = async url => { global.qaOpenedRepositories.push(url); };
    });
    await p.locator('[data-repository="genre-police"]').click();
    await p.locator('[data-repository="vjvision"]').focus();
    await p.keyboard.press('Enter');
    assert.deepEqual(await app.evaluate(() => global.qaOpenedRepositories), [
      'https://github.com/lbnandy/genre-police-visualizer',
      'https://github.com/ichiryu0021/VJVision',
    ]);
    assert.ok(p.url().endsWith('/console.html'), 'Repository links must keep the console open');
    await app.evaluate(({shell}) => { shell.openExternal = global.qaOriginalOpenExternal; });
    await p.screenshot({path:path.join(OUT,'about-brand.png')});
    await p.locator('[data-tab=live]').click();
    await font('#brightness-value','DM Sans');
    await font('#cue-theme','DM Sans');
    // Flow step 1: stopped monitoring and the complete live control surface.
    console.log((await p.locator('#page-live').ariaSnapshot()).slice(0,2200));
    await p.screenshot({path:path.join(OUT,'02-after-live.png')});
    await p.evaluate(() => window.autovj.call('output','window'));
    await app.evaluate(({BrowserWindow,screen}) => {
      const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('stage.html'));
      const area = screen.getPrimaryDisplay().workArea;
      w.setBounds({x:area.x+area.width-980,y:area.y+70,width:960,height:540});
      w.setAlwaysOnTop(true);w.show();
    });
    await measure('visible output / console monitor');
    assert.ok(rates.at(-1).outputRates.every(fps => fps > 45 && fps < 64), 'Visible output keeps the independent 60 FPS cap');
    console.log(await p.locator('.tabs').ariaSnapshot());
    await p.locator('[data-tab=library]').click();
    await p.locator('#page-library').waitFor({state:'visible'});
    await p.waitForTimeout(500);
    await p.evaluate(() => {window.previewTimes=[];window.outputRates=[];});
    await p.waitForTimeout(1600);
    const inactive = await p.evaluate(() => ({frames:window.previewTimes.length,outputRates:window.outputRates}));
    assert.ok(inactive.frames <= 1, 'No monitor sampling on an inactive tab');
    assert.ok(inactive.outputRates.every(fps => fps > 45), 'Leaving Live does not pause audience output');
    await font('.summary b','DM Sans');
    await p.locator('[data-tab=live]').click();
    await p.waitForFunction(() => window.previewTimes.length > 3);
    // Flow step 2: manually change a visual, then return to automatic mode.
    console.log(await p.locator('.cue').ariaSnapshot());
    await select(p,'lock-theme','techno');
    await stage.waitForFunction(() => document.body.dataset.genre === 'techno');
    await p.waitForTimeout(1300);
    await p.screenshot({path:path.join(OUT,'03-manual-control.png')});
    assert.equal((await p.evaluate(() => window.autovj.call('state'))).live.lockedTheme,'techno');
    // Flow step 3: blackout has a persistent, perceivable pressed state.
    console.log(await p.locator('#blackout-button').ariaSnapshot());
    await p.locator('#blackout-button').click();
    await stage.waitForFunction(() => document.body.classList.contains('blackout'));
    await p.waitForFunction(() => document.querySelector('#blackout-button').getAttribute('aria-pressed') === 'true');
    assert.equal(await p.locator('#blackout-button').getAttribute('aria-pressed'),'true');
    await p.waitForTimeout(400);
    await p.screenshot({path:path.join(OUT,'04-blackout.png')});
    await p.locator('#blackout-button').click();
    await p.locator('#auto-button').click();
    await stage.waitForFunction(() => document.body.dataset.standby === 'true');
    await p.evaluate(() => window.autovj.call('output','hide'));
    for (const [width,height] of [[860,620],[1024,768],[1366,768],[1920,1080],[2560,1440]]) {
      await app.evaluate(({BrowserWindow},size) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('console.html')).setSize(...size),[width,height]);
      for (const language of ['zh','en','ja','ko']) {
        await p.evaluate(language => window.autovj.call('settings',{language}),language);
        await p.waitForFunction(language => document.documentElement.lang === (language === 'zh' ? 'zh-CN' : language),language);
        const r = await p.evaluate(() => {
          const cue = document.querySelector('.cue').getBoundingClientRect();
          const controls = ['#lock-theme-button','#auto-button'].map(selector => {
            const r = document.querySelector(selector).getBoundingClientRect();return {selector,left:r.left,right:r.right,top:r.top,bottom:r.bottom};
          });
          return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,cue:{left:cue.left,right:cue.right,top:cue.top,bottom:cue.bottom},controls};
        });
        assert.ok(r.scrollWidth <= width,JSON.stringify(r));
        if (width >= 1024) assert.ok(r.scrollHeight <= height+2,JSON.stringify(r));
        assert.ok(r.controls.every(c => c.left >= r.cue.left && c.right <= r.cue.right && c.bottom <= r.cue.bottom),JSON.stringify(r));
        layouts.push({language,...r});
      }
    }
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({passed:true,rates,inactive,fonts,layouts,errors},null,2));
    console.log('Preview and live audit passed: decoded preview rate, independent output, paused hidden monitor, font files, manual/blackout controls and responsive layouts.');
  } finally {await app.close();}
})().catch(e => {console.error(e);process.exitCode=1;});
