const test=require('node:test'),assert=require('node:assert/strict');
const {BeatParticleFilter}=require('../vendor/genre-police/src/beat-particle-filter');
function create(seed=1, options={}){return new BeatParticleFilter({...options,random:()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}});}

test('Plus boundary correction admits a short observed beat without acquiring a periodicity lock',()=>{
 const pf=create(1,{edmTiming:'boundary'}),first=pf.first[25-14];
 pf.frame=99;pf.particles.fill(first+24);
 assert.equal(pf.update(.79,0).trackedBeat,true);
 for(let i=0;i<150;i++)pf.update(i%25===0?.95:.02,0);
 assert.equal(pf.lockPeriod,0);
 for(let i=0;i<150;i++)assert.equal(pf.update(0,0).trackedBeat,false);
});
test('causal PF follows 80–180 BPM with narrow peaks and ignores weaker subdivisions',()=>{
 for(const bpm of [80,120,150,180])for(const seed of [1,2,3]){
 const pf=create(seed),hits=[];const period=60000/bpm;
 for(let frame=0;frame<2000;frame++){const t=frame*20;const phase=t%period;const distance=Math.min(phase,period-phase);const activation=Math.max(.02+.93*Math.exp(-.5*(distance/20)**2),Math.abs(phase-period/2)<15?.3:0);if(pf.update(activation,0).trackedBeat&&t>=5000)hits.push(t);}
 const expected=35000/period;assert.ok(Math.abs(hits.length-expected)<3,`${bpm} seed ${seed}: ${hits.length}/${expected}`);
 for(const t of hits){const phase=t%period;assert.ok(Math.min(phase,period-phase)<=60,`off beat ${bpm} ${t}`);}
 }
});
test('no synthetic beat on silence, reset or an evidence-free tail',()=>{
 const pf=create();for(let i=0;i<200;i++)assert.equal(pf.update(0,0).trackedBeat,false);
 for(let i=0;i<300;i++)pf.update(i%25===0?.95:0,0);
 for(let i=0;i<200;i++)assert.equal(pf.update(0,0).trackedBeat,false);
 pf.reset();assert.equal(pf.serial,0);assert.equal(pf.update(0,0).trackedBeat,false);
});

test('strong observations cannot grow the population over a long session',()=>{
 const pf=create();
 for(let frame=0;frame<10000;frame++){
  pf.update(frame%25<3?.95:.02,0);
  assert.equal(pf.particles.length,1500);
 }
});

test('prediction uses the prior population and requires fresh activation',()=>{
 const pf=create(1,{edmTiming:false});const first=pf.first[25-14];
 pf.frame=99;pf.lastBeat=0;pf.particles.fill(first);
 assert.equal(pf.update(.79,0).trackedBeat,true);
 pf.particles.fill(first+24);pf.lastBeat=0;
 assert.equal(pf.update(.79,0).trackedBeat,false);
 pf.particles.fill(first);pf.lastBeat=0;
 assert.equal(pf.update(0,0).trackedBeat,false);
});

test('EDM timing follows single-frame kicks without half-time collapse across seeds',()=>{
 for(let seed=1;seed<=12;seed++){
  const pf=create(seed),hits=[];
  for(let frame=0;frame<500;frame++){
   const event=pf.update(frame%25===0?.95:.02,0);
   if(event.trackedBeat&&frame>=100)hits.push(frame);
  }
  assert.deepEqual(hits,Array.from({length:16},(_,i)=>100+i*25),`seed ${seed}`);
 }
});

test('locked timing rejects off-grid fills and stops on missing beat evidence',()=>{
 const pf=create();
 for(let frame=0;frame<150;frame++)pf.update(frame%25===0?.95:.02,0);
 for(let frame=150;frame<300;frame++){
  const onBeat=frame%25===0;
  const event=pf.update(onBeat?.95:frame%25===12?.65:.02,0);
  assert.equal(event.trackedBeat,onBeat,`frame ${frame}`);
 }
 for(let frame=0;frame<150;frame++)assert.equal(pf.update(0,0).trackedBeat,false);
 assert.equal(pf.lockPeriod,0);
});

test('tempo change and reset discard the old periodicity lock',()=>{
 const pf=create();
 for(let frame=0;frame<250;frame++)pf.update(frame%25===0?.95:.02,0);
 const hits=[];
 for(let frame=0;frame<300;frame++){
  if(pf.update(frame%20===0?.95:.02,0).trackedBeat&&frame>=100)hits.push(frame);
 }
 assert.deepEqual(hits,Array.from({length:10},(_,i)=>100+i*20));
 pf.reset();assert.equal(pf.lockPeriod,0);assert.equal(pf.update(0,0).trackedBeat,false);
});

test('locked EDM timing recovers isolated weak beats without admitting weak offbeats',()=>{
 const pf=create();
 for(let frame=0;frame<150;frame++)pf.update(frame%25===0?.95:.02,0);
 for(let frame=150;frame<350;frame++){
  const onBeat=frame%25===0;
  const weak=frame%75===0;
  const signal=onBeat?(weak?.32:.95):frame%25===12?.32:.02;
  assert.equal(pf.update(signal,0).trackedBeat,onBeat,`frame ${frame}`);
 }
});

test('weak evidence cannot acquire or perpetually sustain a tempo',()=>{
 const pf=create();
 for(let frame=0;frame<150;frame++)assert.equal(pf.update(frame%25===0?.32:.02,0).trackedBeat,false);
 for(let frame=0;frame<150;frame++)pf.update(frame%25===0?.95:.02,0);
 const hits=[];
 for(let frame=0;frame<200;frame++)if(pf.update(frame%25===0?.32:.02,0).trackedBeat)hits.push(frame);
 assert.deepEqual(hits,[0,25]);
 assert.equal(pf.lockPeriod,0);
});
