const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {exportOptions,dimensions}=require('../packages/export-options.cjs');
const {ExportSpectrum}=require('../packages/export-spectrum.cjs');
const {VideoExport}=require('../packages/video-export.cjs');
const {EventEmitter}=require('node:events');
const {encoderArguments}=require('../packages/export-encoder.cjs');
const {reserveOutput}=require('../packages/export-batch.cjs');

test('three export quality levels scale bitrate by format and share software quality ordering',async()=>{
  const {videoBitrate}=await import('../packages/export-quality.mjs');
  const rates=['compact','standard','high'].map(quality=>videoBitrate({width:1920,height:1080,fps:60,quality}));
  assert.deepEqual(rates,[8000000,12000000,20000000]);
  assert.equal(videoBitrate({width:1080,height:1920,fps:60,quality:'standard'}),12000000);
  assert.equal(videoBitrate({width:1280,height:720,fps:30,quality:'standard'}),5000000);
  assert.ok(videoBitrate({width:1080,height:1080,fps:60,quality:'standard'})<rates[1]);
  assert.equal(exportOptions({quality:'compact'}).quality,'compact');
  assert.equal(exportOptions({quality:'invalid'}).quality,'standard');
  const quantizers=['compact','standard','high'].map(quality=>Number(encoderArguments('libx264',quality).at(-1)));
  assert.deepEqual(quantizers,[24,21,18]);
});

test('batch filenames never replace existing files and sanitize Windows names',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'autovj-batch-'));
  try{
    fs.writeFileSync(path.join(dir,'Song.mp4'),'keep');
    assert.equal(path.basename(reserveOutput(dir,'Song')),'Song (2).mp4');
    assert.equal(path.basename(reserveOutput(dir,'Song')),'Song (3).mp4');
    assert.equal(path.basename(reserveOutput(dir,'CON')),'_CON.mp4');
    assert.equal(path.dirname(reserveOutput(dir,'../../unsafe?')) ,dir);
    assert.equal(fs.readFileSync(path.join(dir,'Song.mp4'),'utf8'),'keep');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('batch continues after missing audio and preserves finished exports on cancellation',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'autovj-batch-')),audio=path.join(dir,'audio.wav');fs.writeFileSync(audio,'audio');
  const requests=[0,1,2,3].map(id=>({file:id===0?'':audio,scene:{track:{id,title:'Track '+id}},options:{}}));
  const job=new VideoExport({onState:()=>{}});let active=0,max=0;
  job.run=async({output,scene})=>{max=Math.max(max,++active);await new Promise(setImmediate);active--;
    if(scene.track.id===2){job.cancel();throw new Error('EXPORT_CANCELLED');}
    fs.writeFileSync(output,'finished');
  };
  try{
    job.startBatch(requests,dir);await job.task;
    assert.equal(max,1);assert.equal(job.state.status,'cancelled');
    assert.deepEqual(job.state.batch.items.map(item=>item.status),['error','complete','cancelled','cancelled']);
    assert.equal(fs.readFileSync(path.join(dir,'Track 1.mp4'),'utf8'),'finished');
    assert.equal(fs.existsSync(path.join(dir,'Track 2.mp4')),false);
    assert.equal(job.task,null);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('GPU capture rejects old surfaces and releases transferred textures',async()=>{
  const contents=new EventEmitter();let accepted=0,releases=0;
  contents.executeJavaScript=async code=>code.includes('accepted()')?accepted:code.includes('.take(')?{bytes:new Uint8Array([1,2,3])}:undefined;
  contents.isDestroyed=()=>false;contents.invalidate=()=>{};
  const sharedTexture={
    importSharedTexture:({textureInfo,allReferencesReleased})=>({textureInfo,release:allReferencesReleased}),
    sendSharedTexture:async({importedSharedTexture})=>{accepted=importedSharedTexture.textureInfo.token;}
  };
  const job=new VideoExport({onState:()=>{},sharedTexture});
  const capture=job.captureGPU(contents,'frame()',2,1,60);
  const paint=token=>contents.emit('paint',{texture:{textureInfo:{token},release:()=>releases++}});
  paint(1);await new Promise(setImmediate);assert.equal(contents.listenerCount('paint'),1);
  paint(2);const result=await capture;assert.deepEqual(await result.chunk,Buffer.from([1,2,3]));
  assert.equal(releases,2);assert.equal(contents.listenerCount('paint'),0);assert.equal(contents.exportCaptureActive,false);
});

test('GPU capture cancellation releases queued and in-flight surfaces',async()=>{
  const contents=new EventEmitter();contents.executeJavaScript=async()=>0;
  contents.isDestroyed=()=>false;contents.invalidate=()=>{};let releases=0,complete;
  const job=new VideoExport({onState:()=>{},sharedTexture:{
    importSharedTexture:({allReferencesReleased})=>({release:allReferencesReleased}),
    sendSharedTexture:()=>new Promise(resolve=>{complete=resolve;})
  }});
  const capture=job.captureGPU(contents,'frame()',1,0,60);
  for(let n=0;n<3;n++)contents.emit('paint',{texture:{textureInfo:{},release:()=>releases++}});
  job.cancel();await assert.rejects(capture,/EXPORT_CANCELLED/);complete();await new Promise(setImmediate);
  assert.equal(releases,3);assert.equal(contents.listenerCount('paint'),0);assert.equal(job.abortCapture,null);
});

test('export probes hardware rather than relying on an encoder listing, with a software fallback',async()=>{
  const job=new VideoExport({onState:()=>{}});let calls=0;
  job.command=async(args,timeout)=>{calls++;assert.ok(args.includes('h264_nvenc'));assert.ok(timeout>0);throw new Error('Driver unavailable');};
  assert.equal(await job.encoder(1920,1080,{fps:60,quality:'high'},false),'libx264');
  assert.equal(calls,1);
  job.command=async()=>{calls++;};
  assert.equal(await job.encoder(1920,1080,{fps:60,quality:'high'},false),'h264_nvenc');
  assert.equal(await job.encoder(1920,1080,{encoding:'software'},false),'libx264');
  assert.equal(await job.encoder(1280,720,{},true),'libx264');
  assert.equal(calls,2);
  job.command=async()=>{job.cancelled=true;throw new Error('Cancelled probe');};
  await assert.rejects(job.encoder(1920,1080,{},false),/EXPORT_CANCELLED/);
});

test('hardware and software encoders use their own quality controls',()=>{
  const gpu=encoderArguments('h264_nvenc','high'),cpu=encoderArguments('libx264','high');
  assert.ok(gpu.includes('-cq'));assert.ok(!gpu.includes('-crf'));
  assert.ok(cpu.includes('-crf'));assert.ok(!cpu.includes('-cq'));
  assert.equal(exportOptions({encoding:'unknown'}).encoding,'auto');
  assert.equal(exportOptions({encoding:'software'}).encoding,'software');
});

test('export accepts only the matching painted frame and strips its synchronization gutter',async()=>{
  const contents=new EventEmitter();contents.executeJavaScript=async()=>{};
  const job=new VideoExport({onState:()=>{}}),width=64,height=8;
  const image=token=>({getSize:()=>({width,height:height+4}),crop:()=>({toBitmap:()=>{
    const b=Buffer.alloc(64*4*4);for(let bit=0;bit<32;bit++)if((token>>>bit)&1)b[(128+bit*2+1)*4]=255;return b;
  }}),toBitmap:()=>Buffer.alloc(width*(height+4)*4,token)});
  const capture=job.capture(contents,'frame()',width,height,3);
  contents.emit('paint',{}, {},image(2));assert.equal(contents.listenerCount('paint'),1);
  contents.emit('paint',{}, {},image(3));
  const pixels=await capture;assert.equal(pixels.length,width*height*4);assert.ok(pixels.every(x=>x===3));
  assert.equal(contents.listenerCount('paint'),0);assert.equal(job.abortCapture,null);
});

test('cancel interrupts an export waiting for its compositor frame',async()=>{
  const contents=new EventEmitter();contents.executeJavaScript=async()=>{};
  const job=new VideoExport({onState:()=>{}}),capture=job.capture(contents,'frame()',64,8,1);
  job.cancel();await assert.rejects(capture,/EXPORT_CANCELLED/);
  assert.equal(contents.listenerCount('paint'),0);assert.equal(contents.listenerCount('destroyed'),0);
});

test('failed frame submission cleans up compositor listeners',async()=>{
  const contents=new EventEmitter();contents.executeJavaScript=async()=>{throw new Error('Renderer unavailable');};
  const job=new VideoExport({onState:()=>{}});
  await assert.rejects(job.capture(contents,'frame()',64,8,1),/Renderer unavailable/);
  assert.equal(contents.listenerCount('paint'),0);assert.equal(job.abortCapture,null);
});
test('export settings copy only supported visual choices, never live input or Link',()=>{
  const current={rhythmSource:'link',deviceId:'private',impactLevel:'ultra',screenImpact:true,brightness:.7};
  const result=exportOptions({fps:999,aspect:'../',brightness:4},current);
  assert.equal(result.fps,30);assert.equal(result.aspect,'landscape');assert.equal(result.brightness,1);
  assert.equal(result.impactLevel,'ultra');assert.equal(result.rhythmSource,undefined);assert.equal(result.deviceId,undefined);
  assert.deepEqual(dimensions(exportOptions({aspect:'portrait',resolution:720})),[720,1280]);
  assert.equal(current.brightness,.7);
});
test('sample-clock spectrum locates tones and pads beginning/end with silence',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'autovj-spectrum-test-')),file=path.join(dir,'tone.f32');
  const samples=Float32Array.from({length:44100},(_,i)=>.25*Math.sin(2*Math.PI*1000*i/44100));
  fs.writeFileSync(file,Buffer.from(samples.buffer));const spectrum=new ExportSpectrum(file);
  try{
    const initial=spectrum.frame(0);assert.equal(initial.signal,false);assert.ok(initial.waveform.every(x=>x===128));
    const tone=spectrum.frame(500);assert.equal(tone.signal,true);
    const peak=tone.frequency.indexOf(Math.max(...tone.frequency));assert.ok(Math.abs(peak*44100/2048-1000)<44);
    const ended=spectrum.frame(2000);assert.equal(ended.signal,false);
  }finally{spectrum.close();fs.rmSync(dir,{recursive:true,force:true});}
});


test('export speed excludes warm-up, follows a slowdown and bounds its history',()=>{
  const {ExportSpeed}=require('../packages/export-speed.cjs'),speed=new ExportSpeed();
  assert.equal(speed.sample(9000,0,1000).recentRenderFps,null);
  speed.start(10000);
  for(let i=1;i<=25;i++)speed.sample(10000+i*200,i*6,1000);
  let state;
  for(let i=1;i<=25;i++)state=speed.sample(15000+i*200,150+i*4,1000);
  assert.equal(state.renderFps,25);
  assert.equal(state.recentRenderFps,20);
  assert.equal(state.remainingSeconds,37.5);
  for(let i=1;i<=10000;i++)speed.sample(20000+i*200,250+i*4,50000);
  assert.ok(speed.samples.length<=27);
});
