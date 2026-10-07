"use strict";
const fs=require('node:fs');
const {parentPort,workerData}=require('node:worker_threads');
const {LocalRhythmModel}=require('../vendor/genre-police/src/rhythm-model-runtime.js');
// Run every hop sequentially with a sample clock. Unlike live ingestion this
// never drops backlog or resets recurrent state when inference takes longer.
(async()=>{
  let seed=0x4750564a;
  Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const events=[];let time=0,failure=null;
  const model=new LocalRhythmModel({...workerData.model,now:()=>time,onEvent:e=>{
    if(e.type==='unavailable')failure=new Error(e.reason);
    if(e.type==='rhythm')events.push({...e,time});
  }});
  const file=fs.openSync(workerData.pcm,'r'),bytes=Buffer.alloc(441*4);
  try {
    if(!await model.initialize())throw failure||new Error('Beat analysis unavailable');
    const count=Math.ceil(fs.fstatSync(file).size/bytes.length);
    for(let i=0;i<count;i++){
      bytes.fill(0);fs.readSync(file,bytes,0,bytes.length,i*bytes.length);
      time=(i+1)*20;
      model.queue.push(Float32Array.from(new Float32Array(bytes.buffer,bytes.byteOffset,441)));
      await model.drain();
      if(failure)throw failure;
      if(i%50===0)parentPort.postMessage({type:'progress',value:(i+1)/count});
    }
    parentPort.postMessage({type:'complete',events});
  } finally {fs.closeSync(file);await model.close();}
})().catch(e=>parentPort.postMessage({type:'error',message:e.message}));
