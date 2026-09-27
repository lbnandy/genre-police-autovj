const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {LocalRhythmModel:Old}=require('../vendor/genre-police/src/rhythm-model-runtime');
const Plus=Old;
const {BeatParticleFilter}=require('../vendor/genre-police/src/beat-particle-filter');
const out=path.resolve('output/beatnet-plus');
const modes=[['old',Old,'vendor/genre-police/assets/models/beatnet-model-1.onnx'],['plus-generic',Plus,'output/beatnet-plus/generic_weights.onnx'],['plus-main',Plus,'output/beatnet-plus/generic_main_weights.onnx']];
(async()=>{const report=[];
for(const file of process.argv.slice(2)){
 const raw=execFileSync('ffmpeg',['-v','error','-i',file,'-t','40','-ar','22050','-ac','1','-f','f32le','pipe:1'],{maxBuffer:10e6});const pcm=new Float32Array(raw.buffer,raw.byteOffset,raw.byteLength/4);
 for(const [name,Type,modelPath] of modes){let now=0;const rows=[],times=[];const model=new Type({modelPath:path.resolve(modelPath),modelKind:name==='old'?'beatnet':'beatnet-plus',edmTiming:name==='old',now:()=>now,onEvent:e=>{if(e.type==='unavailable')throw Error(e.reason);}});
 if(!await model.initialize())throw Error('initialization failed');
 const update=model.beatTracker.update.bind(model.beatTracker);model.beatTracker.update=(b,d)=>{rows.push([now,b,d]);return update(b,d);};
 try{for(let i=0;i+441<=pcm.length;i+=441){now=i/22.05;const start=performance.now();model.ingest(pcm.subarray(i,i+441));while(model.processing||model.queue.length)await new Promise(r=>setImmediate(r));times.push(performance.now()-start);}}finally{await model.close();}
 times.sort((a,b)=>a-b);const decoders=[];
 for(const edmTiming of [false,true])for(const seed0 of [1,2,3]){let seed=seed0;const pf=new BeatParticleFilter({edmTiming,random:()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}});const hits=rows.filter(r=>pf.update(...r.slice(-2)).trackedBeat).map(r=>r[0]);const gaps=hits.slice(1).map((x,i)=>x-hits[i]).sort((a,b)=>a-b);decoders.push({edmTiming,seed:seed0,count:hits.length,medianIntervalMs:gaps[Math.floor(gaps.length/2)],hits});}
 const item={file:path.basename(file),name,medianMs:times[Math.floor(times.length*.5)],p95Ms:times[Math.floor(times.length*.95)],decoders};report.push(item);
 fs.writeFileSync(path.join(out,path.basename(file)+'.'+name+'.json'),JSON.stringify(rows));console.log(JSON.stringify({...item,decoders:decoders.map(({hits,...rest})=>rest)}));
 }
}
fs.writeFileSync(path.join(out,'comparison.json'),JSON.stringify(report,null,2));})().catch(e=>{console.error(e);process.exitCode=1;});
