// Isolated Electron flows: real fingerprint restore, OS-folder dispatch,
// equipment migration, native renderer crash recovery and diagnostic export.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {_electron}=require(process.env.AUTOVJ_PLAYWRIGHT||'playwright');
const {Library,atomicJson}=require('../packages/library.cjs');
const {select}=require('./qa-picker.cjs');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/playwright/release-basics');
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const data=path.join(ROOT,'.qa','release-'+crypto.randomUUID()), libraries=path.join(data,'libraries');
  const a=new Library(path.join(libraries,crypto.randomUUID())), b=new Library(path.join(libraries,crypto.randomUUID()));
  a.data.name='Night Session';a.data.djName='DJ A';a.save();b.data.name='Next DJ';b.data.settings.deviceId='different-device';b.save();
  const ids=['Afterglow','Night Drive'].map(title=>{const id=crypto.randomUUID();a.upsert({id,title,artist:'QA Artist',status:'ready',suggestion:{id:'techno',source:'file'}});return id;});
  const db=new DatabaseSync(a.db);db.exec('CREATE TABLE songs(song_id INTEGER PRIMARY KEY,song_name TEXT,total_hashes INTEGER,fingerprinted INTEGER); CREATE TABLE fingerprints(song_id INTEGER,hash TEXT,offset INTEGER);');
  ids.forEach((id,i)=>{db.prepare('INSERT INTO songs VALUES(?,?,1,1)').run(i+1,id);db.prepare('INSERT INTO fingerprints VALUES(?,?,0)').run(i+1,'hash-'+i);});db.close();
  atomicJson(path.join(data,'app.json'),{activeLibrary:a.data.libraryId,language:'zh'});
  const env={...process.env,AUTOVJ_DATA_DIR:data};delete env.ELECTRON_RUN_AS_NODE;
  const app=await _electron.launch({executablePath:path.join(ROOT,'node_modules/electron/dist/electron.exe'),args:[ROOT],env});
  const errors=[],checks=[];
  try {
    const p=app.windows().find(w=>w.url().includes('console.html'))||await app.waitForEvent('window',{predicate:w=>w.url().includes('console.html')});
    p.on('pageerror',e=>errors.push(e.message));await p.waitForSelector('#live-toggle');
    const waitState=async (check,timeout=15000)=>{const deadline=Date.now()+timeout;while(Date.now()<deadline){const state=await p.evaluate(()=>window.autovj.call('state'));if(check(state))return state;await p.waitForTimeout(100);}throw Error('State did not settle');};
    const shot=async name=>{await p.locator('#toast').waitFor({state:'hidden'});await p.evaluate(()=>document.fonts.ready);await p.screenshot({path:path.join(OUT,name+'.png'),fullPage:true});};
    console.log(await p.locator('.tabs').ariaSnapshot());
    await p.locator('[data-tab=library]').click();
    console.log(await p.locator('.library-bar').ariaSnapshot());
    await p.locator('#library-manage-button').click();
    console.log(await p.locator('#library-manage').ariaSnapshot());
    await shot('01-library-menu');
    await app.evaluate(({shell})=>{global.qaOpenPath=shell.openPath;global.qaFolders=[];shell.openPath=async target=>{global.qaFolders.push(target);return '';};});
    await p.locator('[data-action=reveal]').click();
    await p.waitForTimeout(100);
    assert.deepEqual(await app.evaluate(()=>global.qaFolders),[fs.realpathSync.native(a.root)]);
    await app.evaluate(({shell})=>{shell.openPath=async()=> 'QA OS failure';});
    assert.ok((await p.evaluate(()=>window.autovj.call('reveal-library').catch(e=>e.message))).includes('访问权限'));
    await app.evaluate(({shell})=>{shell.openPath=global.qaOpenPath;});
    // Actually open one fixture directory using Windows, separately from the
    // interception above; the returned result must indicate OS acceptance.
    assert.deepEqual(await p.evaluate(()=>window.autovj.call('reveal-library')),{ok:true});
    checks.push('folder dispatch and OS acceptance');
    await p.locator(`[data-track-select="${ids[0]}"]`).check();
    await p.locator('#remove-selected').click();
    await p.locator('[data-action=confirm-removal]').click();
    await waitState(s=>s.undoRemoval?.count===1&&!s.maintenance);
    await p.locator('#removal-dialog').waitFor({state:'hidden'});
    await p.locator('#undo-removal-note').waitFor();
    await shot('02-undo-removal');
    await p.locator('[data-action=undo-removal]').click();
    await waitState(s=>s.library.tracks.length===2&&!s.undoRemoval&&!s.maintenance);
    const restored=new DatabaseSync(a.db);assert.equal(restored.prepare('SELECT count(*) AS n FROM fingerprints').get().n,2);restored.close();
    checks.push('visible undo restores database');
    const state=await p.evaluate(()=>window.autovj.call('state'));
    const device=state.devices.find(d=>d.channels>0);
    assert.ok(device,'At least one actual endpoint is required for routing QA');
    await p.evaluate(id=>window.autovj.call('settings',{deviceId:id,channelStart:0}),device.id);
    await select(p,'library-select',b.data.libraryId);
    await waitState(s=>s.library.id===b.data.libraryId);
    await p.waitForFunction(id=>document.querySelector('#library-select').value===id,b.data.libraryId);
    const switched=await p.evaluate(()=>window.autovj.call('state'));
    assert.equal(switched.settings.deviceId,device.id);assert.equal(switched.settings.channelStart,0);
    assert.equal(JSON.parse(fs.readFileSync(path.join(data,'app.json'),'utf8')).equipment.deviceId,device.id);
    await select(p,'library-select',a.data.libraryId);
    await waitState(s=>s.library.id===a.data.libraryId);
    await p.waitForFunction(id=>document.querySelector('#library-select').value===id,a.data.libraryId);
    checks.push('equipment persists across library switch');
    await p.locator('[data-tab=live]').click();
    assert.equal(await p.locator('#channels option').count(),state.devices.find(d=>d.id===device.id).channels===2?1:switched.channels.length);
    // Keep synthetic input state consistent across pending real state broadcasts.
    await app.evaluate(({BrowserWindow})=>{
      const wc=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('console.html')).webContents;
      global.qaOriginalConsoleSend=wc.send.bind(wc);
      wc.send=(channel,...args)=>{
        if(channel==='autovj:state'&&global.qaInputHealth){
          const health=global.qaInputHealth,s=args[0];
          args[0]={...s,inputHealth:health,live:{...s.live,running:true,phase:health==='disconnected'?'device-lost':'listening',deviceLost:health==='disconnected',peak:health==='overload'?.99:0,rms:health==='overload'?.4:0}};
        }
        return global.qaOriginalConsoleSend(channel,...args);
      };
    });
    for(const health of ['overload','silent','no-data','disconnected']) {
      await app.evaluate((_,health)=>{global.qaInputHealth=health;},health);
      const s=await p.evaluate(()=>window.autovj.call('state'));s.inputHealth=health;s.live={...s.live,running:true,phase:health==='disconnected'?'device-lost':'listening',deviceLost:health==='disconnected',peak:health==='overload'?.99:0,rms:health==='overload'?.4:0};
      await app.evaluate(({BrowserWindow},s)=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('console.html')).webContents.send('autovj:state',s),s);
      await p.waitForFunction(text=>document.querySelector('#input-hint').textContent.includes(text),{overload:'接近过载',silent:'持续无输入','no-data':'未收到音频',disconnected:'设备已断开'}[health],{timeout:5000}).catch(async e=>{console.log({health,text:await p.locator('#input-hint').textContent()});throw e;});
      await shot('03-input-'+health);
    }
    await app.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('console.html')).webContents.send=global.qaOriginalConsoleSend;global.qaInputHealth=null;});
    checks.push('input warning presentations');
    await p.locator('[data-tab=settings]').click();
    for(const language of ['zh','en','ja','ko']) {
      await p.evaluate(language=>window.autovj.call('settings',{language}),language);
      await p.waitForFunction(language=>document.documentElement.lang===(language==='zh'?'zh-CN':language),language);
      await p.locator('details').filter({has:p.locator('#keepAwake')}).locator('summary').click();
      await shot('04-protection-'+language);
      for(const width of [1024,1920]) {
        await p.setViewportSize({width,height:768});
        assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await p.locator('[data-tab=live]').click();
        const sample=await p.evaluate(()=>window.autovj.call('state'));sample.inputHealth='overload';
        await app.evaluate(({BrowserWindow},sample)=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('console.html')).webContents.send('autovj:state',sample),sample);
        await p.waitForFunction(()=>document.querySelector('#input-hint').classList.contains('warning'));
        const bounds=await p.evaluate(()=>({w:innerWidth,h:innerHeight,scrollW:document.documentElement.scrollWidth,scrollH:document.documentElement.scrollHeight}));
        assert.ok(bounds.scrollW<=bounds.w && bounds.scrollH<=bounds.h+2,JSON.stringify({language,bounds}));
        await p.locator('[data-tab=settings]').click();
      }
      await p.setViewportSize({width:1440,height:940});
      assert.ok(await p.locator('#keepAwake').isChecked());
      assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    }
    await p.evaluate(()=>window.autovj.call('settings',{language:'zh',keepAwake:true}));
    // Observe actual blocker calls during lifecycle changes.
    await app.evaluate(({powerSaveBlocker})=>{
      global.qaPower=[];const start=powerSaveBlocker.start.bind(powerSaveBlocker),stop=powerSaveBlocker.stop.bind(powerSaveBlocker);
      powerSaveBlocker.start=type=>{const id=start(type);global.qaPower.push({action:'start',type,id});return id;};
      powerSaveBlocker.stop=id=>{global.qaPower.push({action:'stop',id});return stop(id);};
    });
    await p.evaluate(id=>window.autovj.call('preview-track',id),ids[0]);
    const displays=(await p.evaluate(()=>window.autovj.call('state'))).displays;
    await p.evaluate(id=>window.autovj.call('settings',{displayId:id}),displays[0].id);
    await p.evaluate(()=>window.autovj.call('output','fullscreen'));
    assert.ok((await app.evaluate(()=>global.qaPower)).some(e=>e.action==='start'&&e.type==='prevent-display-sleep'));
    await p.evaluate(()=>window.autovj.call('blackout',true));
    const oldOutput=await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('stage.html'));return {id:w.id,bounds:w.getBounds()};});
    const oldId=oldOutput.id;
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('stage.html')).webContents.forcefullyCrashRenderer());
    await app.evaluate(async ({BrowserWindow}, oldId)=>{
      const deadline=Date.now()+15000;
      while(Date.now()<deadline){
        const next=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('stage.html'));
        if(next && next.id!==oldId)return;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      throw Error('Renderer was not recreated');
    },oldId);
    await waitState(s=>s.outputVisible&&!s.error,22000);
    const recovered=await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('stage.html'));return{id:w.id,full:w.isFullScreen(),bounds:w.getBounds()};});
    assert.notEqual(recovered.id,oldId);assert.equal(recovered.full,true);assert.deepEqual(recovered.bounds,oldOutput.bounds);assert.equal((await p.evaluate(()=>window.autovj.call('state'))).live.currentId,ids[0]);
    const stage=app.windows().find(w=>w.url().includes('stage.html')&&!w.isClosed());
    await stage.waitForFunction(()=>document.body.classList.contains('blackout')&&document.body.dataset.genre==='techno');
    await p.evaluate(()=>window.autovj.call('blackout',false));
    await stage.waitForFunction(()=>!document.body.classList.contains('blackout'));
    await stage.screenshot({path:path.join(OUT,'05-recovered-output.png')});
    await p.evaluate(()=>window.autovj.call('output','hide'));
    assert.ok((await app.evaluate(()=>global.qaPower)).some(e=>e.action==='stop'));
    checks.push('native renderer crash restores fullscreen, track and blackout; wake blocker releases');
    for(let attempt=0;attempt<3;attempt++) {
      const crashingId=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('stage.html')).id);
      await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('stage.html')).webContents.forcefullyCrashRenderer());
      if(attempt<2) {
        await app.evaluate(async ({BrowserWindow},id)=>{const end=Date.now()+15000;while(Date.now()<end){const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('stage.html'));if(w&&w.id!==id)return;await new Promise(r=>setTimeout(r,100));}throw Error('Missing replacement stage');},crashingId);
        await waitState(s=>!s.error);
      } else await waitState(s=>s.error.includes('连续恢复失败')&&!s.outputVisible);
    }
    const protection=p.locator('details').filter({has:p.locator('#keepAwake')});
    if(!(await protection.evaluate(el=>el.open)))await protection.locator('summary').click();
    await p.locator('[data-action=restart-output]').click();
    await waitState(s=>!s.error);
    assert.equal((await p.evaluate(()=>window.autovj.call('state'))).outputVisible,false);
    checks.push('repeated crashes stop retrying; manual restart preserves hidden output');
    const reportPath=path.join(data,'diagnostics.json');
    await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},reportPath);
    await p.evaluate(()=>window.autovj.call('export-diagnostics'));
    const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));
    assert.ok(report.events.some(e=>e.type==='output-crash'));assert.ok(report.events.some(e=>e.type==='output-recovered'));
    const text=JSON.stringify(report);assert.ok(!text.includes('Afterglow')&&!text.includes('DJ A')&&!text.includes(data));
    assert.deepEqual(errors,[]);
    checks.push('diagnostics export omits track titles, DJ name and local paths');
    fs.writeFileSync(path.join(OUT,'verification.json'),JSON.stringify({passed:true,data,checks,recovered,errors},null,2));
    console.log(JSON.stringify({passed:true,checks,errors}));
  } finally {await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
