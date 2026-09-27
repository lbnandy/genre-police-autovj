'use strict';
const net = require('node:net');
const {spawn} = require('node:child_process');
const {EventEmitter} = require('node:events');
const {performance} = require('node:perf_hooks');
const clock = () => performance.timeOrigin + performance.now();
// Read-only Carabiner protocol: never change session tempo or transport.
function parseStatus(line) {
  if (!/^status\s+\{[^{}]*\}\s*$/.test(line)) return null;
  const number = key => {const m=line.match(new RegExp(':'+key+'\\s+(-?\\d+(?:\\.\\d+)?)'));return m?Number(m[1]):NaN;};
  const peers=number('peers'),bpm=number('bpm'),beat=number('beat');
  if (!Number.isInteger(peers)||peers<0||peers>10000||!Number.isFinite(beat)||bpm<20||bpm>999||!Number.isFinite(bpm)) return null;
  return {peers,bpm,beat};
}
class LinkClient extends EventEmitter {
  constructor({port=17000,now=clock,spawnProcess=spawn,retryMs=500,maxRetryMs=8000,timeoutMs=2000}={}) {
    super();Object.assign(this,{port,now,spawnProcess,retryMs,maxRetryMs,timeoutMs});
    this.state={status:'off',peers:0,bpm:0,epoch:0};this.enabled=false;this.failures=0;
  }
  publish(state) {this.state={...this.state,...state};this.emit('state',this.state);}
  start(executable='') {
    if(this.enabled && this.executable===executable)return;
    if(this.executable && this.executable!==executable)this.stop();
    else this.disconnect();
    this.enabled=true;this.executable=executable;this.failures=0;
    this.publish({status:'connecting',peers:0,bpm:0});this.connect();
  }
  scheduleRetry() {
    if(!this.enabled || this.retry)return;
    const delay=Math.min(this.maxRetryMs,this.retryMs*2**Math.min(this.failures++,4));
    this.retry=setTimeout(()=>{this.retry=null;this.connect();},delay);
  }
  launch() {
    if(!this.enabled || !this.executable || this.child)return;
    const child=this.child=this.spawnProcess(this.executable,['--daemon',`--port=${this.port}`],{windowsHide:true,stdio:'ignore'});
    const ended=()=>{
      if(this.child!==child)return;
      this.child=null;
      if(!this.enabled)return;
      this.publish({status:'unavailable',peers:0,bpm:0});
      this.socket?.destroy();this.scheduleRetry();
    };
    child.once('error',ended);child.once('exit',ended);
  }
  connect() {
    if(!this.enabled || this.socket)return;
    let buffer='',pending=false,received=false,connected=false,lastValid=this.now();
    const socket=this.socket=net.createConnection({host:'127.0.0.1',port:this.port});
    socket.setNoDelay(true);socket.setEncoding('utf8');
    const watchdog=setInterval(()=>{
      if(this.now()-lastValid<this.timeoutMs)return;
      // Only replace an unresponsive helper owned by this client. Zero peers is healthy.
      if(this.child && connected)this.child.kill();
      socket.destroy();
    },Math.min(250,this.timeoutMs));
    let poll;
    const request=()=>{if(!socket.destroyed&&!pending){pending=true;socket.write('status\n');}};
    socket.on('connect',()=>{
      if(this.socket!==socket||!this.enabled){socket.destroy();return;}
      connected=true;poll=setInterval(request,40);request();
    });
    socket.on('data',data=>{
      if(this.socket!==socket||!this.enabled)return;
      buffer+=data;if(buffer.length>16384){socket.destroy();return;}
      let newline;
      while((newline=buffer.indexOf('\n'))>=0){
        const line=buffer.slice(0,newline).trim();buffer=buffer.slice(newline+1);
        const sample=parseStatus(line);if(!sample)continue;
        const now=this.now();pending=false;lastValid=now;this.failures=0;
        const epoch=this.state.epoch+(received?0:1);received=true;
        this.publish({status:sample.peers?'connected':'waiting',...sample,at:now,epoch});
      }
    });
    socket.on('error',()=>{});
    socket.on('close',()=>{
      clearInterval(poll);clearInterval(watchdog);
      if(this.socket!==socket)return;
      this.socket=null;
      if(!this.enabled)return;
      this.publish({status:'unavailable',peers:0,bpm:0});
      this.launch();this.scheduleRetry();
    });
  }
  // A source change stops TCP use. The owned Link participant lives for this app
  // session, independently of peer count and audio playback; stop() ends ownership.
  disconnect() {
    this.enabled=false;clearTimeout(this.retry);this.retry=null;
    const socket=this.socket;this.socket=null;socket?.destroy();
    this.publish({status:'off',peers:0,bpm:0});
  }
  stop() {
    this.disconnect();const child=this.child;this.child=null;child?.kill();
  }
}
module.exports={LinkClient,parseStatus};
