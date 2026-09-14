"use strict";
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {_electron}=require(process.env.AUTOVJ_PLAYWRIGHT||'playwright');
const {Library,atomicJson}=require('../packages/library.cjs');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/playwright/analysis-status');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function makeAudio(file,seed){
  const rate=44100,seconds=12,n=rate*seconds,buf=Buffer.alloc(44+n*2);
  buf.write('RIFF');buf.writeUInt32LE(buf.length-8,4);buf.write('WAVEfmt ',8);buf.writeUInt32LE(16,16);buf.writeUInt16LE(1,20);buf.writeUInt16LE(1,22);buf.writeUInt32LE(rate,24);buf.writeUInt32LE(rate*2,28);buf.writeUInt16LE(2,32);buf.writeUInt16LE(16,34);buf.write('data',36);buf.writeUInt32LE(n*2,40);
  let randomState=seed+1;
  const rand=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296;};
  const notes=Array.from({length:seconds*4},()=>[110+rand()*1400,250+rand()*2800,rand()*6.28]);
  for(let i=0;i<n;i++){
    const t=i/rate,note=notes[Math.floor(t*4)],beat=t%.5;
    const kick=Math.sin(2*Math.PI*(52*beat+25*(1-Math.exp(-beat*22))))*Math.exp(-beat*16);
    const sample=kick*.3+(Math.sin(t*2*Math.PI*note[0]+note[2])*.22+Math.sin(t*2*Math.PI*note[1])*.14)*(.45+.55*Math.exp(-(t%.25)*8))+(rand()-.5)*.07*Math.exp(-(t%.125)*24);
    buf.writeInt16LE(Math.round(Math.max(-.95,Math.min(.95,sample))*32767),44+i*2);
  }
  fs.writeFileSync(file,buf);
}
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});const data=path.join(ROOT,'.qa','analysis-status-'+crypto.randomUUID());
  const lib=new Library(path.join(data,'libraries',crypto.randomUUID()));lib.data.settings.online=false;lib.data.settings.localAI=false;lib.save();
  const ids=[];for(let i=0;i<6;i++){const id=crypto.randomUUID(),file=path.join(data,`track-${i}.wav`);makeAudio(file,i);ids.push(id);lib.upsert({id,title:`Afterlife ${i} (Original Mix)`,artist:'QA Artist',filePath:file,status:'pending'});}
  atomicJson(path.join(data,'app.json'),{activeLibrary:lib.data.libraryId,language:'zh'});
  const env={...process.env,AUTOVJ_DATA_DIR:data};delete env.ELECTRON_RUN_AS_NODE;
  const app=await _electron.launch({executablePath:path.join(ROOT,'node_modules/electron/dist/electron.exe'),args:[ROOT],env});
  const errors=[],measurements=[];
  try{
    const p=app.windows().find(w=>w.url().includes('console.html'))||await app.waitForEvent('window',{predicate:w=>w.url().includes('console.html')});
    p.on('pageerror',e=>errors.push(e.message));await p.waitForSelector('#live-toggle');await p.locator('[data-tab=library]').click();
    await p.locator('#select-all').check();
    // Resize/device broadcasts must not replace a simulated active job with
    // the fixture's real idle state halfway through a presentation assertion.
    await app.evaluate(({BrowserWindow})=>{
      const wc=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('console.html')).webContents;
      global.qaSend=wc.send.bind(wc);
      wc.send=(channel,...args)=>{if(channel==='autovj:state'&&global.qaPresentation)args[0]=global.qaPresentation;return global.qaSend(channel,...args);};
    });
    const geometry=()=>p.evaluate(()=>{const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {top:r.top,height:r.height,left:r.left,width:r.width}};return {tracks:rect('#tracks'),footer:rect('.table-footer'),toolbar:rect('.toolbar'),analysisButton:rect('.analysis-control'),scroll:document.documentElement.scrollHeight,width:document.documentElement.scrollWidth,viewport:innerWidth};});
    for(const language of ['zh','en','ja','ko']){
      await app.evaluate(()=>{global.qaPresentation=null;});
      await p.evaluate(language=>window.autovj.call('settings',{language}),language);await p.waitForFunction(language=>document.documentElement.lang===(language==='zh'?'zh-CN':language),language);await p.evaluate(()=>document.fonts.ready);
      for(const [width,height] of [[1024,768],[1920,1080],[2560,1440]]){
        await p.setViewportSize({width,height});const base=await p.evaluate(()=>window.autovj.call('state'));const baseline=await geometry();
        const states=[
          {name:'metadata',job:{id:ids[0],title:'Afterlife (Original Mix)',phase:'metadata',fraction:0},queue:5},
          {name:'ai',job:{id:ids[0],title:'Afterlife (Original Mix)',phase:'ai',fraction:.42},queue:5},
          {name:'handoff',job:null,queue:5},
          {name:'long-title',job:{id:ids[1],title:'長い曲名 · 긴 노래 제목 · 超长曲目名称 '.repeat(20),phase:'fingerprint',fraction:0},queue:4},
          {name:'stopping',job:{id:ids[1],title:'Afterlife (Original Mix)',phase:'cancelling',fraction:.8},queue:0},
          {name:'finished',job:null,queue:0},
          {name:'maintenance',maintenance:'updating',job:null,queue:0},
          {name:'listening',live:{...base.live,running:true,phase:'listening'},job:null,queue:0},
          {name:'undo',undoRemoval:{count:2},job:null,queue:0},
          {name:'idle',job:null,queue:0},
        ];
        let cancelNode;
        for(const item of states){
          const processed=['handoff','long-title','stopping'].includes(item.name)?1:item.name==='finished'?6:0;
          const analysisBatch=(item.job||item.queue||item.name==='finished')?{id:'presentation',libraryId:base.library.id,total:6,processed,succeeded:processed,failed:0,status:item.name==='stopping'?'cancelling':item.name==='finished'?'complete':'running'}:null;
          const s={...base,...item,analysisBatch};delete s.name;
          await app.evaluate(({BrowserWindow},s)=>{global.qaPresentation=s;BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('console.html')).webContents.send('autovj:state',s);},s);
          await p.waitForTimeout(30);
          const g=await geometry();assert.deepEqual(g,baseline,JSON.stringify({language,width,state:item.name,g,baseline}));
          if(item.name==='metadata'||item.name==='long-title') {
            const aligned=await p.evaluate(()=>{
              const baselineOf=id=>{const span=document.getElementById(id),marker=document.createElement('i');marker.style.cssText='display:inline-block;width:0;height:0;vertical-align:baseline';span.prepend(marker);const top=marker.getBoundingClientRect().top;marker.remove();return top;};
              return {detail:baselineOf('job-detail'),count:baselineOf('job-count')};
            });
            assert.ok(Math.abs(aligned.detail-aligned.count)<.75,'Phase text and batch count do not share a baseline');
          }
          if(item.name==='metadata'){assert.equal(await p.locator('#analyze-button').isVisible(),false);assert.equal(await p.locator('#cancel-analysis').isVisible(),true);await p.locator('#cancel-analysis').focus();cancelNode=await p.locator('#cancel-analysis').elementHandle();assert.equal(await p.locator('#job-progress').getAttribute('aria-valuenow'),'0');}
          if(item.name==='ai'||item.name==='handoff'||item.name==='long-title')assert.ok(await cancelNode.evaluate(el=>el.isConnected&&document.activeElement===el),'Progress update replaced the focused cancel button');
          if(item.name==='ai'){assert.equal(await p.locator('#job-progress').getAttribute('aria-valuenow'),'0');assert.ok((await p.locator('#job-detail').textContent()).includes('42%'));}
          if(item.name==='handoff'){assert.ok(await p.locator('#job').isVisible());assert.ok(await p.locator('#cancel-analysis').isEnabled());}
          if(item.name==='stopping')assert.ok(await p.locator('#cancel-analysis').isDisabled());
          if(item.name==='idle'){assert.equal(await p.locator('#analyze-button').isVisible(),true);assert.equal(await p.locator('#cancel-analysis').isVisible(),false);}
          if(item.job||item.queue)assert.equal(await p.locator('#library-busy').isVisible(),false);
          const clipped=await p.locator('.table-footer').evaluate(el=>[...el.querySelectorAll('button')].filter(b=>b.getClientRects().length).some(b=>{const a=el.getBoundingClientRect(),r=b.getBoundingClientRect();return r.left<a.left||r.right>a.right||r.top<a.top||r.bottom>a.bottom;}));assert.equal(clipped,false);
          measurements.push({language,width,height,state:item.name,...g});
          if(language==='zh'&&width===1920&&['metadata','handoff','idle'].includes(item.name))await p.screenshot({path:path.join(OUT,item.name+'.png'),fullPage:true});
        }
      }
    }
    await app.evaluate(()=>{global.qaPresentation=null;});
    await p.evaluate(()=>window.autovj.call('settings',{language:'zh'}));
    await p.waitForFunction(()=>document.documentElement.lang==='zh-CN');await p.evaluate(()=>document.fonts.ready);
    await p.setViewportSize({width:1440,height:960});
    const motion=await require('./qa-analysis-motion.cjs')({page:p,ids,output:OUT,base:await p.evaluate(()=>window.autovj.call('state')),send:s=>app.evaluate(({BrowserWindow},s)=>{global.qaPresentation=s;BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('console.html')).webContents.send('autovj:state',s);},s)});
    // Real sequential workers, online/model disabled only in this fixture.
    await app.evaluate(({BrowserWindow})=>{global.qaPresentation=null;BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('console.html')).webContents.send=global.qaSend;});
    const baseline=await geometry(),jobs=new Set(),counts=new Set();let gapSeen=false,complete=false,lastProcessed=0;
    await p.locator('#analyze-button').click();
    for(let i=0;i<400;i++){
      const s=await p.evaluate(()=>window.autovj.call('state'));if(s.job)jobs.add(s.job.id);if(!s.job&&s.queue)gapSeen=true;
      assert.equal(s.analysisBatch.total,6);assert.ok(s.analysisBatch.processed>=lastProcessed);lastProcessed=s.analysisBatch.processed;counts.add(lastProcessed);
      const g=await geometry();assert.deepEqual(g,baseline,'Real analysis moved the table');
      if(jobs.size&&!s.job&&!s.queue){assert.ok(s.library.tracks.every(t=>t.status==='ready'));complete=true;break;}await wait(25);
    }
    assert.ok(complete,'Analysis did not complete');assert.equal(jobs.size,6);assert.ok(gapSeen,'Expected the real inter-track queue gap');assert.equal(lastProcessed,6);assert.ok(counts.size>=6);
    const finalBatch=(await p.evaluate(()=>window.autovj.call('state'))).analysisBatch;assert.deepEqual({processed:finalBatch.processed,succeeded:finalBatch.succeeded,failed:finalBatch.failed,status:finalBatch.status},{processed:6,succeeded:6,failed:0,status:'complete'});
    // Cancel through the same visible persistent button.
    await p.locator('#analyze-button').click();await p.locator('#cancel-analysis').waitFor();
    const duplicate=await p.evaluate(()=>window.autovj.call('analyze').then(()=>false,()=>true));assert.ok(duplicate,'Active batch should not change its denominator');
    await p.locator('#cancel-analysis').click();
    for(let i=0;i<100;i++){const s=await p.evaluate(()=>window.autovj.call('state'));if(!s.job&&!s.queue){complete=true;break;}complete=false;await wait(30);}assert.ok(complete,'Cancel did not settle');
    const stopped=(await p.evaluate(()=>window.autovj.call('state'))).analysisBatch;assert.equal(stopped.total,6);assert.ok(stopped.processed<6);assert.equal(stopped.status,'cancelled');
    await p.reload();await p.waitForSelector('#live-toggle');await p.locator('[data-tab=library]').click();await p.waitForSelector('#job');assert.equal(await p.locator('#job-progress').getAttribute('aria-valuemax'),'6');assert.equal(await p.locator('#job-progress').getAttribute('aria-valuenow'),String(stopped.processed));
    // A failed worker is processed, but must never be reported as succeeded.
    const brokenId=crypto.randomUUID(),brokenFile=path.join(data,'broken.wav');fs.writeFileSync(brokenFile,'Not an audio file');
    new Library(lib.root).upsert({id:brokenId,title:'Broken audio',artist:'QA',filePath:brokenFile,status:'pending'});
    await p.evaluate(id=>window.autovj.call('library',id),lib.data.libraryId);
    await p.waitForSelector(`[data-track-select="${brokenId}"]`);await p.locator(`[data-track-select="${brokenId}"]`).check();await p.locator('#analyze-button').click();
    let failedBatch;
    for(let i=0;i<200;i++){const s=await p.evaluate(()=>window.autovj.call('state'));if(s.analysisBatch?.status==='complete'&&s.analysisBatch.total===1){failedBatch=s.analysisBatch;break;}await wait(30);}
    assert.ok(failedBatch,'Failed worker did not settle');assert.deepEqual({processed:failedBatch.processed,succeeded:failedBatch.succeeded,failed:failedBatch.failed},{processed:1,succeeded:0,failed:1});
    await p.waitForFunction(()=>document.querySelector('#job-detail').textContent.includes('失败 1 首'));
    await p.evaluate(()=>window.autovj.call('new-library','Second QA library'));
    await p.waitForFunction(()=>document.querySelector('#job').hidden);assert.equal((await p.evaluate(()=>window.autovj.call('state'))).analysisBatch,null);
    assert.deepEqual(errors,[]);fs.writeFileSync(path.join(OUT,'verification.json'),JSON.stringify({passed:true,measurements,motion,realWorkers:jobs.size,gapSeen,cancel:true,reload:true,failedWorker:true,libraryIsolation:true,errors},null,2));console.log(JSON.stringify({passed:true,states:measurements.length,motion,realWorkers:jobs.size,gapSeen,cancel:true,reload:true,failedWorker:true,libraryIsolation:true,errors}));
  }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
