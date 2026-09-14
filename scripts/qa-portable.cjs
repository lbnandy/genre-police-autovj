// Attach to the actual self-extracting portable EXE, launched with an isolated
// AUTOVJ_DATA_DIR and a local-only debugging port by the release check.
const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const {chromium}=require(process.env.AUTOVJ_PLAYWRIGHT||'playwright');
const ROOT=path.resolve(__dirname,'..'), OUT=path.join(ROOT,'output/playwright/portable');
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  let browser;
  for(let i=0;i<100;i++) {
    try {browser=await chromium.connectOverCDP('http://127.0.0.1:9354');break;}
    catch(e){if(i===99)throw e;await new Promise(r=>setTimeout(r,500));}
  }
  let page;
  try {
    for(let i=0;i<60;i++) {
      page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('console.html'));
      if(page)break;
      await new Promise(r=>setTimeout(r,250));
    }
    assert.ok(page,'Portable console opens');
    await page.waitForSelector("#live-toggle", {state:"attached"});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const stage=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('stage.html'));
    assert.ok(stage,'Portable output renderer opens');
    stage.on('pageerror',e=>errors.push(e.message));
    assert.ok(page.url().includes('app.asar/'),'Run packaged code');
    const state=await page.evaluate(()=>window.autovj.call('state'));
    assert.equal(state.version,require('../package.json').version);
    assert.equal(state.library.tracks.length,0,'No personal library in the package');
    assert.ok(state.devices.length>0,'Packaged native recognizer enumerates audio devices');
    assert.equal(state.error,'');
    await stage.waitForFunction(()=>document.querySelector('#genre-face').textContent==='STANDBY');
    await page.evaluate(()=>window.autovj.call('settings',{frameRateLimit:'30',fullscreenLayout:'stacked',textVisible:true}));
    await stage.waitForFunction(()=>document.body.dataset.fullscreenLayout==='stacked');
    await page.evaluate(()=>document.fonts.ready);
    await stage.evaluate(()=>document.fonts.ready);
    await stage.waitForFunction(()=>!document.querySelector('#hud').classList.contains('entering'));
    assert.ok(await stage.locator('#genre-face').isVisible(),'Standby title renders');
    const images=await page.locator('.window-controls img').evaluateAll(els=>els.map(e=>({src:e.getAttribute('src'),loaded:e.complete&&e.naturalWidth>0})));
    assert.equal(images.length,3);
    assert.ok(images.every(x=>x.loaded));
    await page.evaluate(()=>window.autovj.call('settings',{performanceMode:'low'}));
    await page.waitForFunction(()=>document.querySelector('#preview').width===960);
    assert.equal((await page.evaluate(()=>window.autovj.call('state'))).settings.performanceMode,'low');
    await page.evaluate(()=>window.autovj.call('settings',{performanceMode:'standard'}));
    await page.waitForFunction(()=>document.querySelector('#preview').dataset.ready==='true');
    // Wait for two complete GPU compositions after the entrance animation.
    await page.evaluate(()=>new Promise(resolve=>{
      let frames=0;
      const onFrame=()=>{if(++frames===2){window.removeEventListener('autovj-video-frame',onFrame);resolve();}};
      window.addEventListener('autovj-video-frame',onFrame);
    }));
    await page.screenshot({path:path.join(OUT,'console.png')});
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({passed:true,version:state.version,codeUrl:page.url(),tracks:state.library.tracks.length,deviceCount:state.devices.length,lowLoad:true,images,errors},null,2));
    console.log('Portable launcher passed: extracted app, native helper, visual engine, fonts/icons, empty library and settings.');
  } finally {
    if(page&&!page.isClosed())try{await page.evaluate(()=>window.autovj.call('window-control','close'));}catch(e){if(!/closed|destroyed/i.test(e.message))throw e;}
    await browser.close();
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
