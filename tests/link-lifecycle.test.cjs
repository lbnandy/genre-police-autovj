const test=require('node:test'),assert=require('node:assert/strict'),net=require('node:net');
const {spawn}=require('node:child_process');
const {LinkClient}=require('../packages/link-client.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(fn){for(let i=0;i<200;i++){if(fn())return;await sleep(10);}throw Error('timed out');}
async function port(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
test('owned bridge is relaunched after repeated crashes without toggling source',async()=>{
 let launches=0;
 const client=new LinkClient({port:await port(),retryMs:20,maxRetryMs:100,timeoutMs:150,spawnProcess:(_exe,args)=>{
  launches++;const p=Number(args[1].split('=')[1]);
  return spawn(process.execPath,['-e',`require('net').createServer(s=>s.on('data',()=>s.write('status { :peers 0 :bpm 120 :beat 1 }\\n'))).listen(${p},'127.0.0.1')`],{windowsHide:true,stdio:'ignore'});
 }});
 try{client.start('fixture');await wait(()=>client.state.status==='waiting');for(let i=0;i<3;i++){const old=client.child.pid;client.child.kill();await wait(()=>client.child?.pid!==old&&client.state.status==='waiting');}
 assert.equal(launches,4);const count=launches;await sleep(250);assert.equal(launches,count);
 }finally{client.stop();}
});
test('zero peers stays healthy and external bridge reconnects without ownership',async()=>{
 let peers=0;const sockets=new Set();const server=net.createServer(s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));s.on('data',()=>s.write(`status { :peers ${peers} :bpm 120 :beat 1 }\n`));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const client=new LinkClient({port:server.address().port,retryMs:20});
 try{client.start();for(let i=0;i<6;i++){await wait(()=>client.state.peers===0&&client.state.status==='waiting');peers=1;await wait(()=>client.state.peers===1);peers=0;}
 await wait(()=>client.state.status==='waiting');const epoch=client.state.epoch;for(const s of sockets)s.destroy();await wait(()=>client.state.epoch>epoch&&client.state.status==='waiting');assert.equal(client.child,undefined);
 }finally{client.stop();for(const s of sockets)s.destroy();await new Promise(r=>server.close(r));}
});
