"use strict";
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {_electron}=require(process.env.AUTOVJ_PLAYWRIGHT||'playwright');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/playwright/video-send');
function receive(route,name,tag,seconds=3){return new Promise((resolve,reject)=>{
 const file=path.join(OUT,`${tag}-${route}.bgra`),p=spawn(path.join(ROOT,'native/build/qa/autovj-video-probe.exe'),[route,name,String(seconds),file],{windowsHide:true});let stdout='',stderr='';
 const timer=setTimeout(()=>{p.kill();reject(new Error('Receiver timed out'));},(seconds+8)*1000);
 p.stdout.on('data',d=>stdout+=d);p.stderr.on('data',d=>stderr+=d);p.on('error',reject);
 p.on('close',code=>{clearTimeout(timer);if(code!==0)return reject(new Error(`${route} probe exited ${code}: ${stdout} ${stderr}`));try{resolve({...JSON.parse(stdout),route,file});}catch(e){reject(e)}});
});}
(async()=>{
 fs.mkdirSync(OUT,{recursive:true});const env={...process.env,AUTOVJ_DATA_DIR:path.join(ROOT,'.qa','video-'+crypto.randomUUID())};delete env.ELECTRON_RUN_AS_NODE;
 const dpi=process.argv.find(a=>a.startsWith('--force-device-scale-factor='));
 const app=await _electron.launch({executablePath:process.env.AUTOVJ_EXECUTABLE||path.join(ROOT,'node_modules/electron/dist/electron.exe'),args:[...(process.env.AUTOVJ_EXECUTABLE?[]:[ROOT]),...(dpi?[dpi]:[])],env});
 const errors=[],reports=[],logs=[];app.process().stderr.on('data',d=>logs.push(String(d)));
 try{
  const p=app.windows().find(w=>w.url().includes('console.html'))||await app.waitForEvent('window',{predicate:w=>w.url().includes('console.html')});
  p.on('pageerror',e=>errors.push(e.message));await p.waitForSelector('#live-toggle');
  if(process.env.AUTOVJ_EXECUTABLE)assert.ok(p.url().includes('app.asar/'));
  await p.waitForFunction(()=>document.querySelector('#preview')?.dataset.ready==='true');
  const source=app.windows().find(w=>w.url().includes('stage.html')),local=app.windows().find(w=>w.url().includes('output.html'));
  const call=(name,value)=>p.evaluate(([n,v])=>window.autovj.call(n,v),[name,value]);
  const settings={name:'AutoVJ QA '+Date.now(),resolution:'1920x1080',fps:60};
  await call('video-settings',settings);await call('settings',{brightness:1,showFps:true,idleFrameLimit:true,frameRateLimit:'30'});
  const senderPid=()=>app.evaluate(()=>process._getActiveHandles().find(h=>h.spawnfile?.includes('autovj-video-output'))?.pid);
  await call('video-route',{route:'spout',enabled:true});const firstPid=await senderPid();await call('video-route',{route:'ndi',enabled:true});
  assert.equal(await senderPid(),firstPid,'Adding NDI must not replace the running Spout host');
  await p.waitForFunction(()=>window.autovj.call('state').then(s=>s.video.sourceFps>50));
  await p.screenshot({path:path.join(OUT,'live.png'),fullPage:true});
  // Two independent native receivers consume actual video, including DOM text.
  const normal=await Promise.all(['spout','ndi'].map(route=>receive(route,settings.name,'normal',5)));reports.push({normal});
  for(const r of normal){assert.equal(r.width,1920);assert.equal(r.height,1080);assert.ok(r.frames>80,JSON.stringify(r));assert.ok(r.bright>1000,JSON.stringify(r));}
  assert.ok(Math.abs(normal[0].bright-normal[1].bright)/normal[0].bright<.2,'Spout/NDI text area differs');
  await p.locator('[data-action=video-config]').click();assert.equal(await p.locator('#video-settings').getAttribute('open'),'');
  assert.equal(await p.locator('#video-name').isDisabled(),true);await p.screenshot({path:path.join(OUT,'settings-active.png'),fullPage:true});
  await p.locator('[data-tab=live]').click();
  for(let i=0;i<3;i++){
   await call('output','fullscreen');await local.waitForFunction(()=>document.querySelector('#output-frame')?.dataset.ready==='true');
   await call('output','hide');await p.waitForTimeout(150);
   assert.equal((await call('state')).outputVisible,false);assert.equal((await call('state')).video.status,'sending');
  }
  const hidden=await receive('spout',settings.name,'hidden',3);assert.ok(hidden.bright>1000);reports.push({hidden});
  await call('blackout',true);await p.waitForTimeout(200);
  const black=await Promise.all(['spout','ndi'].map(route=>receive(route,settings.name,'black',3)));reports.push({black});
  // NDI High Bandwidth is compressed: decoder color conversion can leave a
  // 1–2 level RGB residual at black. Spout must remain bit-exact black.
  for(const r of black){assert.equal(r.bright,0);assert.ok(r.sum<=(r.route==='ndi'?r.width*r.height*6:0),JSON.stringify(r));}
  await call('blackout',false);await call('settings',{textVisible:false});await p.waitForTimeout(350);
  const noText=await receive('spout',settings.name,'no-text',3);reports.push({noText});assert.ok(noText.bright<normal[0].bright*.8,'Text switch missing from transmitted composition');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('stage.html')).webContents.stopPainting());
  await p.waitForFunction(()=>window.autovj.call('state').then(s=>s.video.stalled));
  const interrupted=await receive('spout',settings.name,'interrupted',2);assert.equal(interrupted.sum,0);reports.push({interrupted});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('stage.html')).webContents.startPainting());
  await p.waitForFunction(()=>window.autovj.call('state').then(s=>!s.video.stalled));
  await call('settings',{textVisible:true});await call('lock','house');await p.waitForTimeout(1200);
  const genre=await receive('ndi',settings.name,'genre',3);assert.ok(genre.bright>1000);reports.push({genre});
  // Recreating the renderer must resume sending without requiring a local window.
  await call('restart-output');await p.waitForFunction(()=>window.autovj.call('state').then(s=>!s.video.stalled&&s.video.sourceFps>40));
  const restored=await receive('spout',settings.name,'restored',3);assert.ok(restored.bright>1000);reports.push({restored});
  await p.evaluate(()=>{window.videoStatuses=[];window.autovj.onState(s=>window.videoStatuses.push(s.video.status));});
  const killed=await app.evaluate(()=>{const child=process._getActiveHandles().find(h=>h.spawnfile?.includes('autovj-video-output'));if(!child)return false;child.kill();return true;});
  assert.equal(killed,true);
  await p.waitForFunction(()=>window.videoStatuses.includes('error')&&window.autovj.call('state').then(s=>s.video.status==='sending'&&s.video.sourceFps>40),null,{timeout:15000});
  const recovered=await receive('ndi',settings.name,'sender-recovered',3);assert.ok(recovered.bright>1000);reports.push({recovered});
  const priorPid=await senderPid();await call('video-route',{route:'ndi',enabled:false});assert.equal((await call('state')).video.spout,true);
  assert.equal(await senderPid(),priorPid,'Disabling NDI must not replace the running Spout host');
  await call('video-route',{route:'spout',enabled:false});
  if(process.argv.includes('--formats'))for(const [resolution,fps] of [['1280x720',50],['1920x1200',25],['3840x2160',30]]){
    await call('video-settings',{resolution,fps});await call('video-route',{route:'spout',enabled:true});
    if(resolution==='3840x2160')await call('video-route',{route:'ndi',enabled:true});
    await p.waitForTimeout(2300);const format=(await call('state')).video;
    assert.ok(format.spoutFps>fps-5&&format.spoutFps<fps+5,JSON.stringify(format));
    const r=await receive(resolution==='3840x2160'?'ndi':'spout',settings.name,`format-${resolution}`,3);
    assert.equal(`${r.width}x${r.height}`,resolution);assert.ok(r.bright>1000);reports.push({format,received:r});
    await call('video-route',{route:'ndi',enabled:false});await call('video-route',{route:'spout',enabled:false});
  }
  await call('video-settings',{resolution:'1080x1920',fps:30});await call('video-route',{route:'spout',enabled:true});
  await p.waitForTimeout(2200);const cadence=(await call('state')).video;assert.equal(cadence.settings.fps,30);assert.ok(cadence.spoutFps>26&&cadence.spoutFps<34,JSON.stringify(cadence));reports.push({cadence});
  const portrait=await receive('spout',settings.name,'portrait',3);assert.equal(portrait.width,1080);assert.equal(portrait.height,1920);assert.ok(portrait.bright>1000);reports.push({portrait});
  await call('video-route',{route:'spout',enabled:false});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,reports:reports.map(x=>Object.fromEntries(Object.entries(x).map(([k,v])=>[k,Array.isArray(v)?v.map(({file,...r})=>r):(({file,...r})=>r)(v)])))}));
 }finally{fs.writeFileSync(path.join(OUT,dpi?'report-dpi.json':'report.json'),JSON.stringify({reports,errors,logs},null,2));await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
