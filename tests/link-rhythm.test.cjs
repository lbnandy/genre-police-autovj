const test=require('node:test'),assert=require('node:assert/strict'),net=require('node:net');
const {LinkClient,parseStatus}=require('../packages/link-client.cjs');
test('Link parser rejects malformed/out of range data',()=>{
 assert.deepEqual(parseStatus('status { :peers 2 :bpm 128.5 :start 99 :beat -0.25 }'),{peers:2,bpm:128.5,beat:-.25});
 for(const line of ['status { :peers 1 :bpm 0 :beat 2 }','status { :peers -1 :bpm 120 :beat 2 }','status { :peers 1 :bpm NaN :beat 2 }','status { :peers 1 :bpm 120 :beat Infinity }','other { :peers 1 :bpm 120 :beat 2 }'])assert.equal(parseStatus(line),null);
});
test('Link joins a local bridge read-only and falls back on disconnect',async()=>{
 const commands=[],sockets=new Set();const server=net.createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));let buf='';socket.on('data',chunk=>{buf+=chunk;let pos;while((pos=buf.indexOf('\n'))>=0){commands.push(buf.slice(0,pos));buf=buf.slice(pos+1);socket.write('status { :peers 1 :bpm 125 :beat ');socket.write('42.5 }\n');}});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const client=new LinkClient({port:server.address().port});
 try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Link timeout')),3000);client.on('state',s=>{if(s.status==='connected'){clearTimeout(timer);resolve();}});client.start();});assert.equal(client.state.bpm,125);assert.ok(commands.every(c=>c==='status'));
 const closed=new Promise(resolve=>client.on('state',s=>{if(s.status==='unavailable')resolve();}));for(const s of sockets)s.destroy();await closed;assert.equal(client.state.peers,0);
 }finally{client.stop();for(const s of sockets)s.destroy();await new Promise(resolve=>server.close(resolve));}
});
test('Link clock uses beat boundaries, equal beat-only strength, silence gate and offset',async()=>{
 const {RhythmClock}=await import('../renderer/rhythm-clock.mjs');const c=new RhythmClock();
 const settings={rhythmSource:'link',impactMode:'beat',beatStrength:'fixed'},m={rhythmNow:true,impact:.3,drive:.2};
 c.setLink({status:'connected',peers:1,bpm:120,beat:.9,at:1000});
 assert.equal(c.update(m,settings,1000,true,true).rhythmNow,false);
 let r=c.update(m,settings,1060,true,true);assert.equal(r.rhythmNow,true);assert.equal(r.rhythmStrength,.78);
 assert.equal(c.update(m,settings,1070,true,true).rhythmNow,false);
 r=c.update(m,settings,1400,true,false);assert.equal(r.rhythmPulse,0);
 c.setLink({status:'connected',peers:1,bpm:120,beat:.9,at:2000});
 c.update(m,{...settings,linkOffsetMs:100},2000,true,true);
 assert.equal(c.update(m,{...settings,linkOffsetMs:100},2060,true,true).rhythmNow,false);
 assert.equal(c.update(m,{...settings,linkOffsetMs:100},2160,true,true).rhythmNow,true);
 c.setLink({status:'connected',peers:1,bpm:120,beat:25,at:2200});assert.equal(c.update(m,{...settings,linkOffsetMs:100},2200,true,true).rhythmNow,false);
});
test('audio beat mode consumes model peaks once, never substitutes DSP',async()=>{
 const {RhythmClock}=await import('../renderer/rhythm-clock.mjs');const c=new RhythmClock(),s={rhythmSource:'audio',impactMode:'beat'};
 c.update({rhythmNow:true},s,1000,true,true);
 c.setModel({type:'rhythm',trackedBeat:true,trackedSerial:1},1020);c.setModel({type:'rhythm',trackedBeat:false,trackedSerial:1},1030);
 assert.equal(c.update({},s,1040,true,true).rhythmNow,true);
 assert.equal(c.update({rhythmNow:true},s,1050,true,true).rhythmNow,false);
 c.setModel({type:'unavailable'},1100);
 assert.equal(c.update({rhythmNow:true},s,1100,true,true).rhythmNow,false);
});
test('auto selects peers, forced audio ignores them, forced Link never falls back',async()=>{
 const {RhythmClock}=await import('../renderer/rhythm-clock.mjs');const c=new RhythmClock();
 assert.equal(c.source({},1000),'audio');
 c.setLink({status:'connected',peers:1,at:1000,bpm:120,beat:1});
 assert.equal(c.source({},1000),'link');assert.equal(c.source({rhythmSource:'audio'},1000),'audio');
 assert.equal(c.source({},1700),'audio');assert.equal(c.source({rhythmSource:'link'},1700),'none');
 c.setModel({type:'rhythm',trackedBeat:true,trackedSerial:1},1700);
 const r=c.update({rhythmNow:true,impact:1},{rhythmSource:'link',impactMode:'beat'},1700,true,true);
 assert.equal(r.rhythmNow,false);assert.equal(r.impact,0);
});
test('music response retains off-beat DSP events for every source',async()=>{
 const {RhythmClock}=await import('../renderer/rhythm-clock.mjs');
 for(const rhythmSource of ['audio','auto','link']){
 const c=new RhythmClock(),m={rhythmNow:true,rhythmStrength:.7,impact:.8,onsetNow:true};
 c.setLink({status:'connected',peers:1,bpm:120,beat:.1,at:1000});
 const r=c.update(m,{rhythmSource,impactMode:'music'},1000,true,true);
 for(const key of Object.keys(m))assert.equal(r[key],m[key]);
 c.setLink({status:'waiting',peers:0,at:1100});
 assert.equal(c.update(m,{rhythmSource,impactMode:'music'},1100,true,true).rhythmNow,true);
 }
});
test('dynamic beats always trigger with positive strength; fixed beats are equal',async()=>{
 const {RhythmClock}=await import('../renderer/rhythm-clock.mjs');
 for(const beatStrength of ['fixed','dynamic']){
 const c=new RhythmClock(),s={rhythmSource:'audio',impactMode:'beat',beatStrength};c.update({},s,1000,true,true);
 const strengths=[];
 for(let serial=1;serial<=3;serial++){
 const at=1000+serial*100;c.setModel({type:'rhythm',trackedBeat:true,trackedSerial:serial},at);
 const r=c.update({bassPulse:(serial-1)/2,drive:(serial-1)/2},s,at,true,true);assert.equal(r.rhythmNow,true);assert.ok(r.rhythmStrength>0);strengths.push(r.rhythmStrength);
 assert.equal(c.update({rhythmNow:true,impact:1},s,at+10,true,true).rhythmNow,false);
 }
 assert.deepEqual(strengths,beatStrength==='fixed'?[.78,.78,.78]:[.5,.5+.5*Math.sqrt(.5),1]);
 }
});
test('mode/source changes discard old peaks and tails; worker restart can restart serials',async()=>{
 const {RhythmClock}=await import('../renderer/rhythm-clock.mjs');const c=new RhythmClock(),s={rhythmSource:'audio',impactMode:'beat'};
 c.update({},s,1000,true,true);c.setModel({type:'rhythm',trackedBeat:true,trackedSerial:9},1020);
 assert.equal(c.update({},s,1020,true,true).impact,.5);
 let r=c.update({impact:1},{...s,beatStrength:'dynamic'},1030,true,true);assert.equal(r.impact,0);assert.equal(r.rhythmNow,false);
 c.setModel({type:'disabled'},1040);c.setModel({type:'rhythm',trackedBeat:true,trackedSerial:1},1060);
 assert.equal(c.update({},{...s,beatStrength:'dynamic'},1060,true,true).rhythmNow,true);
});
test('Link phase jitter cannot fire the same beat twice and reconnect only anchors',async()=>{
 const {RhythmClock}=await import('../renderer/rhythm-clock.mjs');const c=new RhythmClock(),s={rhythmSource:'auto',impactMode:'beat'};
 const step=(beat,at,peers=1)=>{c.setLink({status:peers?'connected':'waiting',peers,bpm:120,beat,at});return c.update({rhythmNow:true},s,at,true,true);};
 assert.equal(step(.9,1000).rhythmNow,false);assert.equal(step(1.02,1060).rhythmNow,true);
 assert.equal(step(.99,1070).rhythmNow,false);assert.equal(step(1.02,1080).rhythmNow,false);
 assert.equal(step(1.2,1100,0).impact,0);assert.equal(step(1.5,1120).rhythmNow,false);
 assert.equal(step(20,1500).rhythmNow,false);
});
test('a reconnected bridge re-anchors even if its source label and beat sequence are unchanged',async()=>{
 const {RhythmClock}=await import('../renderer/rhythm-clock.mjs');const c=new RhythmClock(),s={rhythmSource:'link',impactMode:'beat'};
 c.setLink({status:'connected',peers:1,bpm:120,beat:.9,at:1000,epoch:1});c.update({},s,1000,true,true);
 c.setLink({status:'connected',peers:1,bpm:120,beat:1.02,at:1060,epoch:2});
 assert.equal(c.update({},s,1060,true,true).rhythmNow,false);
});


test('audio beat mode ignores legacy activation peaks without a tracked beat',async()=>{
 const {RhythmClock}=await import('../renderer/rhythm-clock.mjs');const c=new RhythmClock();const s={rhythmSource:'audio',impactMode:'beat'};
 c.update({},s,1000,true,true);c.setModel({type:'rhythm',peak:true,serial:1,trackedBeat:false,trackedSerial:0},1020);
 assert.equal(c.update({impact:1,onsetNow:true},s,1020,true,true).beatNow,false);
});
