const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const net=require('node:net');
const {_electron}=require(process.env.AUTOVJ_PLAYWRIGHT || 'playwright');
const {Library,atomicJson}=require('../packages/library.cjs');
(async()=>{
 const root=path.resolve(__dirname,'..'),bridge=path.join(root,'native/bin/Carabiner.exe');
 if(!bridge||!fs.existsSync(bridge))throw Error('Run npm run prepare:link first');
 const out=path.join(root,'output/playwright/link');fs.mkdirSync(out,{recursive:true});
 const data=path.join(root,'.qa',crypto.randomUUID()),id=crypto.randomUUID();new Library(path.join(data,'libraries',id));
 atomicJson(path.join(data,'app.json'),{activeLibrary:id,language:'zh'});
 const env={...process.env,AUTOVJ_DATA_DIR:data};delete env.ELECTRON_RUN_AS_NODE;
 const simulated=process.env.AUTOVJ_QA_LINK_MOCK==='1';
 let peers=0,server;const sockets=new Set();
 if(simulated){
 server=net.createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));let buffer='';socket.on('data',chunk=>{buffer+=chunk;let i;while((i=buffer.indexOf('\n'))>=0){const command=buffer.slice(0,i);buffer=buffer.slice(i+1);assert.equal(command,'status');socket.write(`status { :peers ${peers} :bpm 120 :beat ${Date.now()/500} }\n`);}});});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(17000,'127.0.0.1',resolve);});
 }
 const startPeer=()=>{if(simulated){peers=1;return {kill:()=>{peers=0;}};}return spawn(bridge,['--daemon','--port=17001'],{windowsHide:true,stdio:'ignore'});};
 const packaged=process.env.AUTOVJ_TEST_EXECUTABLE;
 const app=await _electron.launch({executablePath:packaged||path.join(root,'node_modules/electron/dist/electron.exe'),args:packaged?[]:[root],env});let peer;const errors=[];
 try{
 const p=app.windows().find(p=>p.url().includes('console.html'))||await app.waitForEvent('window',{predicate:p=>p.url().includes('console.html')});
 p.on('pageerror',e=>errors.push(e.message));await p.waitForSelector('#live-toggle');
 const waitState=async(predicate)=>{const until=Date.now()+20000;let state;while(Date.now()<until){state=await p.evaluate(()=>window.autovj.call('state'));if(predicate(state))return state;await new Promise(r=>setTimeout(r,100));}throw Error('State timeout: '+JSON.stringify(state.rhythm));};
 await p.evaluate(()=>window.autovj.call('settings',{rhythmSource:'link',impactMode:'beat'}));
 await waitState(s=>['waiting','connected'].includes(s.rhythm.link.status));
 peer=startPeer();
 await waitState(s=>s.rhythm.link.status==='connected');
 let state=await p.evaluate(()=>window.autovj.call('state'));assert.ok(state.rhythm.link.peers>=1);
 await p.locator('[data-tab=settings]').click();
 for(const language of ['zh','en','ja','ko']){
 await p.evaluate(language=>window.autovj.call('settings',{language}),language);
 await p.waitForFunction(language=>document.documentElement.lang.startsWith(language),language);
 await p.locator('#rhythmSource').waitFor({state:'attached'});
 await p.locator('.rhythm-settings').scrollIntoViewIfNeeded();
 await p.screenshot({path:path.join(out,`settings-${language}.png`)});
 assert.equal(await p.locator('#rhythmModel').count(),0);
 assert.equal(await p.locator('#beat-strength-row').isVisible(),true);
 }
 // Listen using the real native audio host; no audio is recorded or played.
 state=await p.evaluate(()=>window.autovj.call('state'));
 const device=state.devices.find(d=>d.channels>=1);
 if(device){
 await p.evaluate(id=>window.autovj.call('settings',{deviceId:id}),device.id);
 await p.evaluate(()=>window.autovj.call('live-start'));
 state=await p.evaluate(()=>window.autovj.call('state'));assert.equal(state.rhythm.model,'off');
 await p.evaluate(()=>window.autovj.call('settings',{rhythmSource:'audio'}));
 await waitState(s=>s.rhythm.model==='ready');
 await p.evaluate(()=>window.autovj.call('settings',{rhythmSource:'link'}));
 await waitState(s=>s.rhythm.link.status==='connected'&&s.rhythm.model==='off');
 peer.kill();peer=null;
 await waitState(s=>s.rhythm.link.status==='waiting'&&s.rhythm.model==='off');
 await p.evaluate(()=>window.autovj.call('settings',{rhythmSource:'auto'}));
 await waitState(s=>s.rhythm.model==='ready');
 await p.evaluate(()=>window.autovj.call('settings',{impactMode:'music'}));
 await p.locator('#beat-strength-row').waitFor({state:'hidden'});
 peer=startPeer();
 await waitState(s=>s.rhythm.link.status==='connected'&&s.rhythm.model==='off');
 await p.evaluate(()=>window.autovj.call('live-stop'));
 }else console.log('No native input device: model handover not tested');
 await p.evaluate(()=>window.autovj.call('settings',{rhythmSource:'audio',linkOffsetMs:999}));
 state=await p.evaluate(()=>window.autovj.call('state'));assert.equal(state.rhythm.link.status,'off');assert.equal(state.settings.linkOffsetMs,250);
 assert.deepEqual(errors,[]);console.log(`Link QA passed (${simulated?'simulated bridge protocol':'real Carabiner peers'}): forced disconnect, auto fallback/recovery, model handover, four locales, bounded offset.`);
 }finally{peer?.kill();await app.close();for(const socket of sockets)socket.destroy();if(server)await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
