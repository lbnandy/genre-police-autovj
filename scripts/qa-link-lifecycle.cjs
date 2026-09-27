'use strict';
const {spawn}=require('node:child_process'),path=require('node:path'),assert=require('node:assert/strict'),fs=require('node:fs');
const {LinkClient}=require('../packages/link-client.cjs');
const root=path.resolve(__dirname,'..'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const client=new LinkClient({port:17012});let peer;
const wait=async(fn,label,ms=12000)=>{const end=Date.now()+ms;while(Date.now()<end){if(fn())return;await sleep(40);}throw Error(label+': '+JSON.stringify(client.state));};
const newPeer=()=>{peer=spawn(path.join(root,'.qa/link-peer-build/Release/link-peer.exe'),[],{windowsHide:true,stdio:['pipe','ignore','inherit']});};
const quitPeer=async()=>{if(!peer)return;const p=peer;peer=null;const ended=new Promise(r=>p.once('exit',r));p.stdin.end('quit\n');await ended;};
(async()=>{const results=[];try{
 client.start(path.join(root,'native/bin/Carabiner.exe'));await wait(()=>client.state.status==='waiting'||client.state.status==='connected','bridge startup');
 await sleep(2500);const baseline=client.state.peers,pid=client.child.pid;newPeer();
 for(let i=0;i<8;i++){
  peer.stdin.write('on\n');await wait(()=>client.state.peers===baseline+1,'peer enable '+i);
  peer.stdin.write('off\n');await wait(()=>client.state.peers===baseline,'peer disable '+i);
 }
 results.push({test:'8 enable/disable cycles',baseline,pid});
 for(let i=0;i<3;i++){
  await quitPeer();newPeer();peer.stdin.write('on\n');await wait(()=>client.state.peers===baseline+1,'peer restart '+i);
  await quitPeer();await wait(()=>client.state.peers===baseline,'peer exit '+i);
 }
 results.push({test:'3 external process restarts',pass:true});
 const oldPid=client.child.pid;client.child.kill();await wait(()=>client.child&&client.child.pid!==oldPid&&['waiting','connected'].includes(client.state.status),'crash recovery');
 results.push({test:'owned bridge crash recovery',oldPid,newPid:client.child.pid});
 const stablePid=client.child.pid;await sleep(Number(process.env.LINK_SOAK_MS||120000));
 newPeer();peer.stdin.write('on\n');await wait(()=>client.state.peers===baseline+1,'late join');assert.equal(client.child.pid,stablePid);
 results.push({test:'late join without recycling healthy bridge',idleMs:Number(process.env.LINK_SOAK_MS||120000),pid:stablePid});
 fs.mkdirSync(path.join(root,'output/link-tests'),{recursive:true});fs.writeFileSync(path.join(root,'output/link-tests/lifecycle.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
 }finally{await quitPeer();client.stop();}})().catch(e=>{console.error(e);process.exitCode=1;});
