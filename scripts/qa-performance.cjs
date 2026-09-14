const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const {_electron} = require(process.env.AUTOVJ_PLAYWRIGHT || 'playwright');
const {select} = require('./qa-picker.cjs');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, 'output/playwright/performance');
(async () => {
  fs.mkdirSync(OUT, {recursive:true});
  const env = {...process.env, AUTOVJ_DATA_DIR:path.join(ROOT, '.qa', 'performance-' + crypto.randomUUID())};
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = () => _electron.launch({executablePath:path.join(ROOT, 'node_modules/electron/dist/electron.exe'), args:[ROOT, '--lang=en-US'], env});
  let app = await launch();
  const errors = [], fontReport = [], rates = [], layouts = [];
  try {
    let p = app.windows().find(w => w.url().includes('console.html')) || await app.waitForEvent('window', {predicate:w => w.url().includes('console.html')});
    await p.waitForSelector("#layout-button", {state:"attached"});
    const stage = app.windows().find(w => w.url().includes('stage.html'));
    for (const page of app.windows()) page.on('pageerror', e => errors.push(e.message));
    await p.evaluate(() => document.fonts.ready);
    const cdp = await p.context().newCDPSession(p);
    await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
    for (const [selector, font] of [['.brand-title','Orbitron'],['.brand-sub','Orbitron'],['[data-tab=live]','DM Sans']]) {
      const {root} = await cdp.send('DOM.getDocument');
      const {nodeId} = await cdp.send('DOM.querySelector', {nodeId:root.nodeId, selector});
      const result = await cdp.send('CSS.getPlatformFontsForNode', {nodeId});
      assert.ok(result.fonts.some(f => f.familyName.includes(font)), JSON.stringify(result));
      fontReport.push({selector,...result});
    }
    const icon = p.locator('#window-maximize img');
    assert.equal(await icon.getAttribute('data-symbol'), 'crop_square');
    assert.equal((await icon.boundingBox()).width, 16);
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT,'assets/material-symbols/sources.json'), 'utf8').replace(/^\uFEFF/,''));
    for (const source of manifest.files) {
      const bytes = fs.readFileSync(path.join(ROOT,'assets/material-symbols', source.name + '.svg'));
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), source.sha256);
    }
    await p.locator('[data-tab=settings]').click();
    await p.locator('.performance-details summary').click();
    await p.locator('#showFps').check();
    await p.locator('#idleFrameLimit').uncheck();
    // Measure a presented stage, not an initially hidden capture window. Keep
    // it unobscured while changing the console's settings during this QA run.
    await p.evaluate(() => window.autovj.call('output', 'window'));
    await app.evaluate(({BrowserWindow, screen}) => {
      const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('stage.html'));
      const area = screen.getPrimaryDisplay().workArea;
      w.setBounds({x: area.x + area.width - 500, y: area.y + 70, width: 480, height: 270});
      w.setAlwaysOnTop(true); w.show();
    });
    await p.evaluate(() => {window.fpsSamples=[]; window.autovj.onPerformance(x => window.fpsSamples.push(x.fps));});
    for (const cap of ['30', '60']) {
      await select(p, 'frameRateLimit', cap);
      await p.evaluate(() => window.fpsSamples=[]);
      await p.waitForFunction(() => window.fpsSamples.length >= 3, null, {timeout:10000});
      const samples = await p.evaluate(() => window.fpsSamples.slice(-2));
      assert.ok(samples.every(n => n > 0 && n <= Number(cap) + 3), JSON.stringify({cap,samples}));
      rates.push({cap,samples});
    }
    assert.ok(rates[1].samples.every(n => n > 40), 'Visible output must render faster than the 30 FPS cap: ' + JSON.stringify(rates));
    await select(p, 'frameRateLimit', '120');
    await p.locator('#idleFrameLimit').check();
    await p.evaluate(() => window.fpsSamples=[]);
    await p.waitForFunction(() => window.fpsSamples.length >= 3);
    const idle = await p.evaluate(() => window.fpsSamples.slice(-2));
    assert.ok(idle.every(n => n > 0 && n <= 33), JSON.stringify(idle));
    rates.push({cap:'120 / stopped standby',samples:idle});
    for (const cap of ['display','90','60']) {
      await select(p, 'frameRateLimit', cap);
      await p.waitForFunction(cap => document.querySelector('#frameRateLimit').value === cap, cap);
      assert.equal((await p.evaluate(() => window.autovj.call('state'))).settings.frameRateLimit, cap);
    }
    await p.locator('[data-tab=live]').click();
    await p.waitForSelector('#fps-readout');
    assert.match(await p.locator('#fps-readout').innerText(), /\d+ FPS/);
    assert.equal(await stage.locator('#fps-readout').count(), 0);
    for (const [width,height] of [[860,620],[1920,1080],[2560,1440],[3440,1440]]) {
      await app.evaluate(({BrowserWindow},size) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('console.html')).setSize(...size),[width,height]);
      for (const lang of ['en','zh','ja','ko']) {
        await p.evaluate(lang => window.autovj.call('settings',{language:lang}),lang);
        await p.waitForFunction(lang => document.documentElement.lang === (lang==='zh'?'zh-CN':lang),lang);
        const measure = await p.evaluate(() => {
          const box = selector => {const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};};
          return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,main:box('main'),hero:box('.hero-grid'),brand:box('.brand'),title:box('.brand-title'),firstTab:box('[data-tab=live]'),shortcuts:box('.shortcuts'),label:box('.shortcut-label'),firstKey:box('.shortcut'),controls:[...document.querySelectorAll('#page-live .control-card .select-picker')].map(e=>{const r=e.getBoundingClientRect();return{x:r.x,right:r.right};})};
        });
        assert.equal(measure.overflow,false,JSON.stringify(measure));
        assert.ok(measure.hero.x<=24&&measure.main.right-measure.hero.right<=24,JSON.stringify(measure));
        assert.ok(measure.title.right<=measure.firstTab.x,JSON.stringify(measure));
        if(measure.firstKey.y===measure.label.y) assert.ok(measure.firstKey.x-measure.label.right>=9,JSON.stringify(measure));
        assert.ok(measure.controls.every(x=>x.x>=0&&x.right<=width),JSON.stringify(measure));
        layouts.push({width,height,lang,...measure});
        if(lang==='zh') {
          await p.mouse.move(0,400);await p.waitForTimeout(250);
          await p.screenshot({path:path.join(OUT,`live-${width}x${height}.png`)});
        }
      }
    }
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('console.html')).setSize(1440,940));
    await p.evaluate(()=>window.autovj.call('settings',{language:'zh'}));
    await p.waitForFunction(()=>document.documentElement.lang==='zh-CN');
    await p.locator('[data-tab=settings]').click();
    await p.locator('.performance-details summary').click();
    await p.locator('#frameRateLimit-button').click();
    await p.mouse.move(0,200);
    await p.screenshot({path:path.join(OUT,'settings-frame-rate.png')});
    await p.keyboard.press('Escape');
    await app.close(); app = await launch();
    p = app.windows().find(w => w.url().includes('console.html')) || await app.waitForEvent('window',{predicate:w=>w.url().includes('console.html')});
    await p.waitForSelector("#layout-button", {state:"attached"});
    const state = await p.evaluate(()=>window.autovj.call('state'));
    assert.equal(state.settings.frameRateLimit,'60');
    assert.equal(state.settings.idleFrameLimit,true);
    assert.equal(state.settings.showFps,true);
    assert.equal(state.version,require('../package.json').version);
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({passed:true,rates,fontReport,layouts,errors},null,2));
    console.log('Performance and brand QA passed: real FPS telemetry, caps, persistence, font faces, Google SVG hashes, 4 languages at 860 / 1080p / 1440p / ultrawide.');
  } finally {await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
