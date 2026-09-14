// Actual ONNX inference: reuse once per batch, cancel/retry, then release.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {Worker}=require('node:worker_threads');
const {Library}=require('../packages/library.cjs');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/playwright/analysis-pool');
(async()=>{
 fs.mkdirSync(OUT,{recursive:true});const lib=new Library(path.join(ROOT,'.qa','pool-'+crypto.randomUUID()));
 const audio=path.join(ROOT,'output/playwright/audio/alpha.wav');assert.ok(fs.existsSync(audio),'Run qa-audio.cjs first');
 const bootstrap=`const {parentPort}=require('node:worker_threads');const ort=require(${JSON.stringify(path.join(ROOT,'node_modules/onnxruntime-node'))});const create=ort.InferenceSession.create;ort.InferenceSession.create=async function(...args){parentPort.postMessage({type:'qa-model-create'});return create.apply(this,args);};require(${JSON.stringify(path.join(ROOT,'packages/analysis-worker.cjs'))});`;
 const worker=new Worker(bootstrap,{eval:true,workerData:{persistent:true}});let creates=0;
 worker.on('message',m=>{if(m.type==='qa-model-create')creates++;});
 const execute=(cancel=false)=>new Promise((resolve,reject)=>{
   const id=crypto.randomUUID();let requested=false;const timer=setTimeout(()=>reject(new Error('Analysis worker did not settle')),20000);
   const onMessage=m=>{
     if(cancel&&m.type==='progress'&&m.phase==='ai'&&!requested){requested=true;worker.postMessage('cancel');}
     if(m.type==='complete'||m.type==='failed'){clearTimeout(timer);worker.off('message',onMessage);worker.off('error',onError);assert.equal(fs.existsSync(path.join(lib.root,'temp',id+'.pcm')),false);resolve(m);}
   };
   const onError=e=>{clearTimeout(timer);reject(e);};worker.on('message',onMessage);worker.once('error',onError);
   worker.postMessage({type:'analyze',data:{track:{id,filePath:audio,title:'QA',status:'pending'},root:lib.root,exe:path.join(ROOT,'native/bin/autovj-recognizer.exe'),modelRoot:path.join(ROOT,'vendor/genre-police/assets/models'),online:false,localAI:true}});
 });
 try{
   const first=await execute(),second=await execute();assert.equal(first.type,'complete');assert.equal(second.type,'complete');assert.deepEqual(second.track.analysis.ai,first.track.analysis.ai);assert.ok(first.track.analysis.ai.accepted>10);assert.deepEqual(first.track.analysis.errors,[]);
   const cancelled=await execute(true);assert.equal(cancelled.type,'failed');assert.equal(cancelled.cancelled,true);
   const retry=await execute();assert.equal(retry.type,'complete');assert.deepEqual(retry.track.analysis.ai,first.track.analysis.ai);assert.equal(creates,1);
   const exited=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Idle model did not release')),5000);worker.once('exit',code=>{clearTimeout(timer);resolve(code);});});worker.postMessage('close');assert.equal(await exited,0);
   const report={passed:true,modelCreations:creates,completed:3,cancelled:1,acceptedWindows:first.track.analysis.ai.accepted,released:true};fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await worker.terminate();}
})().catch(e=>{console.error(e);process.exitCode=1;});
