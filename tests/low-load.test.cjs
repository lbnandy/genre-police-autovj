const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {PcmWindows}=require('../packages/pcm-windows.cjs');
const {ConsoleState}=require('../packages/console-state.cjs');
const {resampleWindowedSinc}=require('../vendor/genre-police/src/audio-genre-model');

test('streamed PCM windows equal the pinned whole-file resampler, including overlap and tail',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'autovj-pcm-'));
  try{
    for(const n of [1,2000,44100*9+131]){
      const file=path.join(dir,'audio.pcm'),pcm=Buffer.alloc(n*2),samples=new Float32Array(n);
      let random=19;
      for(let i=0;i<n;i++){random=(Math.imul(random,1664525)+1013904223)>>>0;const value=(random%65536)-32768;pcm.writeInt16LE(value,i*2);samples[i]=value/32768;}
      fs.writeFileSync(file,pcm);
      const expected=resampleWindowedSinc(samples,44100,16000),reader=await PcmWindows.open(file);
      try{
        assert.equal(reader.length,expected.length);
        for(const start of [0,15872,31744,47616,0,expected.length-1]){
          const actual=await reader.read(start),target=new Float32Array(32768);
          target.set(expected.subarray(start,start+32768));assert.deepEqual(actual,target,`length ${n}, start ${start}`);
        }
        assert.ok(reader.buffer.byteLength<190000);assert.ok(reader.samples.byteLength<380000);
      }finally{await reader.close();}
    }
    const file=path.join(dir,'invalid');fs.writeFileSync(file,Buffer.alloc(3));await assert.rejects(PcmWindows.open(file),/Invalid/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('live broadcasts do no library-sized work until a revision or library changes',()=>{
  const cache=new ConsoleState();let converted=0;
  const make=id=>({revision:1,data:{libraryId:id,tracks:Array.from({length:10000},(_,i)=>({id:String(i)}))},publicTrack:t=>{converted++;return {...t};},themes:()=>[]});
  const first=make('first'),list=['first'];
  let view=cache.libraryView(first);assert.equal(converted,10000);
  assert.equal(cache.delta({library:view,libraries:list,live:{rms:0}}).library,view);
  for(let i=0;i<1000;i++){
    assert.equal(cache.libraryView(first),view);
    const delta=cache.delta({library:view,libraries:list,live:{rms:i}});
    assert.equal('library' in delta,false);assert.equal('libraries' in delta,false);assert.equal(delta.live.rms,i);
  }
  assert.equal(converted,10000);
  first.revision++;assert.notEqual(cache.libraryView(first),view);assert.equal(converted,20000);
  const second=make('second');view=cache.libraryView(second);assert.equal(view.id,'second');assert.equal(cache.delta({library:view}).library,view);
  cache.resetDelivery();assert.equal(cache.delta({library:view}).library,view);
});

test('low-load adaptive scale has its own floor and switching back restores the standard context',async()=>{
  const {AdaptiveResolution}=await import('../renderer/adaptive-resolution.mjs');
  const c=new AdaptiveResolution();
  assert.equal(c.prepare({context:'techno:low',time:0,active:true,lowPower:true}),.75);
  let time=2000;
  for(let i=0;i<900;i++){time+=34;c.sample({time,interval:34,workMs:2});}
  assert.equal(c.scale,.5);
  assert.equal(c.prepare({context:'techno:standard',time,active:true,lowPower:false}),1);
  assert.equal(c.prepare({context:'techno:low',time,active:true,lowPower:true}),.5);
});

test('preview-only work follows preview cadence without limiting a live output',async()=>{
  const {outputFrameInterval}=await import('../renderer/output-frame-rate.mjs');
  assert.equal(outputFrameInterval({previewFrameRate:15,settings:{frameRateLimit:'60'}}),1000/15);
  assert.equal(outputFrameInterval({previewFrameRate:30,settings:{frameRateLimit:'120'}}),1000/30);
  assert.equal(outputFrameInterval({previewFrameRate:0,settings:{frameRateLimit:'60'}}),1000/60);
  assert.equal(outputFrameInterval({externalOutput:true,previewFrameRate:15,settings:{frameRateLimit:'50'}}),20);
});

test('preview scheduling tolerates jitter, releases every texture and does not accumulate work',async()=>{
  const {TextureDistributor}=require('../packages/texture-distributor.cjs');
  let now=0,frames=0,releases=0;
  const api={importSharedTexture:({allReferencesReleased})=>({release:allReferencesReleased}),sendSharedTexture:async()=>{frames++;}};
  const d=new TextureDistributor(api,()=>now),target={id:'preview',fps:15,ready:true,visible:true,window:{isDestroyed:()=>false,webContents:{id:1,mainFrame:{}}}};
  for(let i=0;i<150;i++){
    now=i*1000/15+(i%2?.2:0);
    d.paint({textureInfo:{},release:()=>releases++},[target],{offer:(t,r)=>r()});await d.drain();
  }
  assert.equal(frames,150);assert.equal(releases,150);assert.equal(d.pending.size,0);
});
