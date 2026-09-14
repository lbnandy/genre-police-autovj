const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {_electron}=require(process.env.AUTOVJ_PLAYWRIGHT||'playwright');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/playwright/packaged-analysis');
(async()=>{
 fs.mkdirSync(OUT,{recursive:true});const env={...process.env,AUTOVJ_DATA_DIR:path.join(ROOT,'.qa','packaged-analysis-'+crypto.randomUUID())};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:path.join(ROOT,'dist/win-unpacked/Genre Police AutoVJ.exe'),args:[],env});
 const logs=[];app.process().stderr.on('data',d=>logs.push(String(d)));
 try{
  const p=app.windows().find(w=>w.url().includes('console.html'))||await app.waitForEvent('window',{predicate:w=>w.url().includes('console.html')});await p.waitForSelector('#live-toggle');
  assert.ok(p.url().includes('app.asar/'));
  const call=(name,input)=>p.evaluate(([n,i])=>window.autovj.call(n,i),[name,input]);
  const files=['alpha','beta'].map(n=>path.join(ROOT,'output/playwright/audio',n+'.wav'));assert.ok(files.every(f=>fs.existsSync(f)),'Run qa-audio.cjs first');
  await app.evaluate(({dialog},files)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:files});},files);
  await call('settings',{online:false,localAI:true,performanceMode:'low'});await call('add-files');await call('analyze');
  const deadline=Date.now()+60000;
  while((await call('state')).analysisBatch?.status!=='complete'){
    if(Date.now()>deadline)throw new Error('Packaged analysis did not complete');
    await p.waitForTimeout(100);
  }
  const s=await call('state');fs.writeFileSync(path.join(OUT,'state.json'),JSON.stringify(s,null,2));assert.equal(s.analysisBatch.succeeded,2,JSON.stringify({batch:s.analysisBatch,job:s.job,queue:s.queue,tracks:s.library.tracks.map(t=>({status:t.status,error:t.error,analysis:t.analysis}))}));assert.equal(s.analysisBatch.failed,0);
  for(const track of s.library.tracks){assert.equal(track.status,'ready');assert.ok(track.analysis.ai.accepted>10);assert.deepEqual(track.analysis.errors,[]);}
  const report={passed:true,version:s.version,packaged:true,tracks:s.library.tracks.map(t=>({title:t.title,accepted:t.analysis.ai.accepted,hashes:t.hashes,genre:t.analysis.ai.id})),batch:s.analysisBatch};
  fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{fs.writeFileSync(path.join(OUT,'stderr.log'),logs.join(''));await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
