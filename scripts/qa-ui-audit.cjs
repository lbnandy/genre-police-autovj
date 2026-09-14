"use strict";
// The real Electron console, isolated fixture data, and keyboard/empty/error
// states. Simulated recognition events verify presentation, not audio accuracy.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const {_electron} = require(process.env.AUTOVJ_PLAYWRIGHT || 'playwright');
const {Library, atomicJson} = require('../packages/library.cjs');
const {select} = require('./qa-picker.cjs');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, 'output/playwright/design-audit-2026-09-14');
(async () => {
  fs.mkdirSync(OUT, {recursive:true});
  const data = path.join(ROOT, '.qa', 'ui-audit-' + crypto.randomUUID());
  const lib = new Library(path.join(data, 'libraries', crypto.randomUUID()));
  const emptyLib = new Library(path.join(data, 'libraries', crypto.randomUUID()));
  lib.data.name = 'Night Session'; lib.data.djName = 'LBN'; lib.save();
  const titles = ['Afterglow (Original Mix)', 'Night Drive', 'Disco Lights', 'Incoming Track', 'Late Arrival'];
  const ids = titles.map(() => crypto.randomUUID());
  titles.forEach((title, i) => lib.upsert({id:ids[i],title,artist:'Audit Artist',durationMs:265000,status:i===4?'pending':'ready',fileTags:['Drum & Bass'],suggestion:{id:'drum-bass',source:'file',uncertain:i===0,conflict:i===0},analysis:{ai:{id:i===0?'house':'drum-bass',confidence:.4,accepted:200},online:{status:'no-match'}}}));
  atomicJson(path.join(data, 'app.json'), {activeLibrary:lib.data.libraryId,language:'zh'});
  const env={...process.env,AUTOVJ_DATA_DIR:data}; delete env.ELECTRON_RUN_AS_NODE;
  const app=await _electron.launch({executablePath:path.join(ROOT,'node_modules/electron/dist/electron.exe'),args:[ROOT],env});
  const errors=[], measurements=[];
  try {
    const p=app.windows().find(w=>w.url().includes('console.html')) || await app.waitForEvent('window',{predicate:w=>w.url().includes('console.html')});
    p.on('pageerror',e=>errors.push(e.message));
    await p.waitForSelector('#live-toggle');
    await p.waitForFunction(()=>document.querySelector('#preview').dataset.ready==='true');
    await p.setViewportSize({width:1440,height:960});
    const shot=async name=>{await p.evaluate(()=>document.fonts.ready);await p.screenshot({path:path.join(OUT,name+'.png'),fullPage:true});};
    await shot('after-1-live');
    await p.locator('[data-tab=library]').click();
    assert.equal(await p.locator('#selection-actions').isVisible(),false);
    assert.deepEqual(await p.locator('.summary b').allTextContents(),['3','1','1']);
    await select(p,'filter','ready');assert.equal(await p.locator('tbody tr').count(),3);
    await select(p,'filter','review');assert.equal(await p.locator('tbody tr').count(),1);
    await select(p,'filter','pending');assert.equal(await p.locator('tbody tr').count(),1);
    await select(p,'filter','all');
    await p.locator('#library-manage-button').focus(); await p.keyboard.press('Enter');
    await p.locator('#library-manage').waitFor({state:'visible'});
    await shot('after-2-library-menu');
    await p.keyboard.press('Escape');
    assert.equal(await p.locator('#library-manage').isVisible(),false);
    await p.locator('#library-manage-button').click(); await p.locator('[data-action=rename-library]').click();
    assert.equal(await p.locator('#library-name').inputValue(),'Night Session');
    await p.locator('#library-name').fill('   '); await p.locator('#rename-dialog [type=submit]').click();
    assert.equal(await p.locator('#rename-error').isVisible(),true);
    await p.locator('#library-name').fill('Night Session');
    await shot('after-5-rename'); await p.keyboard.press('Escape');
    await p.locator('#search').fill('no such title');
    assert.equal(await p.locator('[data-action=clear-filters]').isVisible(),true);
    await shot('after-3-empty-search');
    // A filtered nonempty library and a truly empty library both produce [].
    // Their empty-state copy and recovery action must still refresh on switch.
    await select(p,'library-select',emptyLib.data.libraryId);
    await p.waitForFunction(()=>document.querySelector('.empty h2')?.textContent==='曲库为空');
    assert.equal(await p.locator('[data-action=clear-filters]').isVisible(),false);
    await select(p,'library-select',lib.data.libraryId);
    await p.locator('[data-action=clear-filters]').waitFor({state:'visible'});
    await p.locator('[data-action=clear-filters]').click();
    assert.equal(await p.locator('tbody tr').count(),5);
    await p.locator(`[data-track-select="${ids[0]}"]`).check();
    await p.locator('#search').fill('Night Drive');
    await p.locator('#remove-selected').click();
    assert.ok((await p.locator('.removal-tracks').textContent()).includes('Afterglow'));
    await shot('after-6-remove'); await p.keyboard.press('Escape');
    await p.locator('#search').fill(''); await p.locator('[data-action=clear-selection]').click();
    await p.locator(`#tracks [data-edit="${ids[0]}"]`).click();
    assert.equal(await p.locator('.editor-evidence').getAttribute('open'),'');
    assert.ok(await p.locator('#editor').getAttribute('aria-labelledby'));
    await shot('after-4-editor'); await p.keyboard.press('Escape');
    await p.locator(`[data-edit="${ids[1]}"]`).click();
    assert.equal(await p.locator('.editor-evidence').getAttribute('open'),null);
    await p.locator('.editor-evidence summary').focus(); await p.keyboard.press('Enter');
    assert.equal(await p.locator('.evidence').isVisible(),true);
    await p.keyboard.press('Escape');
    await p.locator('[data-tab=settings]').click(); await shot('after-7-settings');
    await p.locator('[data-action=new-preset]').click(); await p.locator('[data-action=save-preset]').click();
    assert.equal(await p.locator('#preset-error').isVisible(),true);
    assert.equal(await p.locator('#preset-name').getAttribute('aria-invalid'),'true');
    await shot('after-8-preset-error');
    await p.locator('#preset-name').fill('Night colours');
    assert.equal(await p.locator('#preset-error').isVisible(),false);
    await p.locator('[data-action=save-preset]').click();
    await p.locator('#preset-dialog').waitFor({state:'hidden'});
    assert.ok((await p.evaluate(()=>window.autovj.call('state'))).library.themes.some(t=>t.label==='Night colours'));
    await p.locator('#text-visible').uncheck();
    await p.waitForFunction(()=>document.querySelector('#show-dj-name').disabled);
    assert.equal(await p.locator('#english-condensed').isDisabled(),true);
    await p.locator('#text-visible').check();
    await p.waitForFunction(()=>!document.querySelector('#show-dj-name').disabled);
    // Four languages, narrow desktop, 1080p and 2K. Settings may scroll vertically.
    for(const language of ['zh','en','ja','ko']) {
      await p.evaluate(language=>window.autovj.call('settings',{language}),language);
      await p.waitForFunction(language=>document.documentElement.lang===(language==='zh'?'zh-CN':language),language);
      for(const [width,height] of [[1024,768],[1920,1080],[2560,1440]]) {
        await p.setViewportSize({width,height});
        for(const tab of ['live','library','settings']) {
          await p.locator(`[data-tab=${tab}]`).click();
          const g=await p.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight}));
          assert.ok(g.scrollWidth<=g.width,JSON.stringify({language,tab,...g}));
          if(tab==='live')assert.ok(g.scrollHeight<=g.height+2,JSON.stringify({language,tab,...g}));
          measurements.push({language,tab,...g});
        }
      }
      await p.setViewportSize({width:1440,height:960});
      await shot('after-settings-'+language);
    }
    await p.evaluate(()=>window.autovj.call('settings',{language:'zh'}));
    await p.waitForFunction(()=>document.documentElement.lang==='zh-CN');
    await p.locator('[data-tab=live]').click();
    const state=await p.evaluate(()=>window.autovj.call('state'));
    state.live={...state.live,running:true,phase:'confirmed',currentId:ids[0],current:state.library.tracks[0],currentCharge:6,candidateId:ids[1],candidate:state.library.tracks[1],candidateCharge:8};
    await app.evaluate(({BrowserWindow},s)=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('console.html')).webContents.send('autovj:state',s),state);
    await p.waitForFunction(()=>document.querySelector('#current-charge').textContent==='6 / 10');
    await shot('after-9-recognition');
    await p.locator('[data-tab=library]').click();
    assert.equal(await p.locator('#library-busy').isVisible(),true);
    assert.equal(await p.locator('[data-action=files]').isDisabled(),true);
    assert.equal(await p.locator('[data-action=folder]').isDisabled(),true);
    await shot('after-10-listening-library');
    await p.locator(`#tracks [data-edit="${ids[0]}"]`).click();
    assert.equal(await p.locator('[data-action=preview-track]').isDisabled(),true);
    assert.equal(await p.locator('[data-action=reanalyze]').isDisabled(),true);
    assert.equal(await p.locator('[data-action=relink-track]').isDisabled(),true);
    assert.equal(await p.locator('[data-action=save-track]').isEnabled(),true);
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(OUT,'verification.json'),JSON.stringify({errors,measurements},null,2));
    console.log('UI audit checks passed: four languages, 36 viewport/page states, menus, errors, disclosure, text dependencies, filtered removal and recognition presentation.');
  } finally {await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
