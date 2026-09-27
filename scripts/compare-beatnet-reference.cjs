const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const assert = require('node:assert/strict');
const {BeatParticleFilter} = require('../vendor/genre-police/src/beat-particle-filter');
const [source, audio] = process.argv.slice(2);
const out = path.resolve('output/beat-pf');
fs.mkdirSync(out, {recursive:true});
const cases = [
 ['boundary',Array.from({length:400},(_,i)=>[i*20,i%25<3?.79:.02,0])],
 ['rejuvenation',Array.from({length:400},(_,i)=>[i*20,i%25<3?.95:.02,0])],
 ['silence',Array.from({length:200},(_,i)=>[i*20,0,0])]
];
if(audio) cases.push(['audio',JSON.parse(fs.readFileSync(audio,'utf8'))]);
for (const [name,rows] of cases) for(const initial of [1,2,3]) {
 const input=path.join(out,'reference-input.json');fs.writeFileSync(input,JSON.stringify(rows));
 const reference=JSON.parse(execFileSync('python',[path.join(__dirname,'compare-beatnet-reference.py'),source,input,String(initial)],{maxBuffer:10e6}).toString());
 let seed=initial;const pf=new BeatParticleFilter({edmTiming:false,random:()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}});
 const hits=[];
 rows.forEach((row,i)=>{const result=pf.update(...row.slice(-2));const checksum=pf.particles.reduce((sum,state,j)=>(sum+(j+1)*state)>>>0,0);assert.deepEqual([result.trackedBeat,checksum,pf.particles.length],reference[i],`${name} seed ${initial} frame ${i}`);if(result.trackedBeat)hits.push(row[0]);});
 console.log(JSON.stringify({name,seed:initial,frames:rows.length,hits}));
}
