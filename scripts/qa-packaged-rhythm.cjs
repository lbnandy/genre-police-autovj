"use strict";
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {_electron} = require(process.env.AUTOVJ_PLAYWRIGHT || 'playwright');
const root = path.resolve(__dirname, '..');

(async () => {
  const env = {...process.env, AUTOVJ_DATA_DIR:path.join(root,'.qa','packaged-rhythm-'+crypto.randomUUID())};
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.AUTOVJ_BEATNET_PLUS_MODEL;
  const app = await _electron.launch({executablePath:path.join(root,'dist/win-unpacked/Genre Police AutoVJ.exe'),args:[],env});
  try {
    const page = app.windows().find(w=>w.url().includes('console.html')) || await app.waitForEvent('window',{predicate:w=>w.url().includes('console.html')});
    await page.waitForSelector('#live-toggle');
    const report = await app.evaluate(({app,BrowserWindow})=>{
      const require = process.mainModule.require.bind(process.mainModule);
      const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
      const config=require(path.join(app.getAppPath(),'packages/rhythm-config.cjs')).rhythmConfig(p=>path.join(process.resourcesPath,'app.asar.unpacked',p));
      globalThis.rhythmQA={ready:null,frames:0,errors:[]};
      for(const w of BrowserWindow.getAllWindows()) {
        const send=w.webContents.send.bind(w.webContents);
        w.webContents.send=(channel,...args)=>{
          if(channel==='autovj:rhythm') {
            const event=args[0];
            if(event.type==='ready') globalThis.rhythmQA.ready=event;
            if(event.type==='rhythm') globalThis.rhythmQA.frames++;
            if(event.type==='unavailable') globalThis.rhythmQA.errors.push(event);
          }
          return send(channel,...args);
        };
      }
      return {packaged:app.isPackaged,version:app.getVersion(),...config,sha256:crypto.createHash('sha256').update(fs.readFileSync(config.modelPath)).digest('hex')};
    });
    assert.equal(report.packaged,true);
    assert.equal(report.modelKind,'beatnet-plus');
    assert.equal(report.edmTiming,'boundary');
    assert.equal(report.sha256,require('../packages/rhythm-config.cjs').MODEL_SHA256);
    await page.waitForFunction(async()=>((await window.autovj.call('state')).devices||[]).some(d=>d.loopback));
    await page.evaluate(async()=>{
      const s=await window.autovj.call('state');
      await window.autovj.call('settings',{deviceId:s.devices.find(d=>d.loopback).id,channelStart:0,rhythmSource:'audio',impactMode:'beat',beatStrength:'dynamic'});
      await window.autovj.call('live-start');
    });
    let runtime;
    for(let i=0;i<100;i++) {
      runtime=await app.evaluate(()=>globalThis.rhythmQA);
      if(runtime.errors.length || (runtime.ready && runtime.frames>3)) break;
      await page.waitForTimeout(100);
    }
    assert.deepEqual(runtime.errors,[]);
    assert.match(runtime.ready?.model || '',/BeatNet\+/);
    assert.ok(runtime.frames>3,'Packaged native capture must reach actual model inference');
    const files=['app/main.cjs','app/preload.cjs','renderer/stage.js','renderer/screen-impact.mjs','renderer/impact-level.mjs','renderer/console.js','renderer/console.css','renderer/cover-crop.mjs','renderer/rhythm-clock.mjs','packages/dj-logo.cjs','packages/link-client.cjs','packages/rhythm-worker.cjs','packages/library.cjs','vendor/genre-police/src/rhythm-model-runtime.js','vendor/genre-police/src/beat-particle-filter.js'];
    const packed=await app.evaluate(({app},files)=>{
      const require=process.mainModule.require.bind(process.mainModule),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
      return files.map(p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(app.getAppPath(),p))).digest('hex'));
    },files);
    files.forEach((p,i)=>assert.equal(packed[i],crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex'),p));
    console.log(JSON.stringify({...report,runtime,sourceFilesMatched:files.length},null,2));
    await page.evaluate(()=>window.autovj.call('live-stop'));
  } finally { await app.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
