"use strict";
const {spawn}=require('node:child_process');
const {createInterface}=require('node:readline');
const {EventEmitter}=require('node:events');

const SIZES=Object.freeze({
  '1280x720':[1280,720], '1920x1080':[1920,1080], '2560x1440':[2560,1440],
  '3840x2160':[3840,2160], '1080x1920':[1080,1920], '1920x1200':[1920,1200],
});
function videoSettings(input={}) {
  return {name:typeof input.name==='string' ? input.name.replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,64).replace(/[\uD800-\uDBFF]$/u,'')||'Genre Police AutoVJ' : 'Genre Police AutoVJ',
    resolution:Object.hasOwn(SIZES,input.resolution)?input.resolution:'1920x1080',
    fps:[25,30,50,60].includes(Number(input.fps))?Number(input.fps):60};
}
class VideoSender extends EventEmitter {
  constructor(exe){super();this.exe=exe;this.child=null;this.frame=null;this.sequence=0;this.blackout=false;this.state=this.empty();}
  empty(){return {status:'off',spout:false,ndi:false,spoutFps:0,ndiFps:0,sourceFps:0,ndiReceivers:0,dropped:0,stalled:false,error:'',spoutError:'',ndiError:''};}
  update(values){Object.assign(this.state,values);this.emit('state',this.state);}
  async start(settings,routes,force=false) {
    const next=videoSettings(settings);
    if(!force && this.child && this.state.status==='sending' && (routes.spout||routes.ndi) && ['name','resolution','fps'].every(key=>this.state[key]===next[key])){
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{this.routeRequest=null;this.update({status:'error',error:'Video route update timed out'});this.child?.kill();reject(new Error(this.state.error));},8000);
        this.routeRequest={resolve,reject,timer};this.child.stdin.write(`R ${routes.spout?1:0} ${routes.ndi?1:0}\n`);
      });
    }
    await this.stop();
    if(!routes.spout&&!routes.ndi)return;
    const s=videoSettings(settings),[width,height]=SIZES[s.resolution];
    this.width=width;this.height=height;
    this.state={...this.empty(),...routes,status:'starting',...s,width,height};this.emit('state',this.state);
    const child=spawn(this.exe,[String(process.pid),String(width),String(height),String(s.fps),routes.spout?'1':'0',routes.ndi?'1':'0',s.name],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    this.child=child;let stopping=false,done=false;
    this.closed=new Promise(resolve=>{child.once('close',(code)=>{
      done=true;clearTimeout(this.frame?.timer);this.frame?.release();this.frame=null;
      if(this.routeRequest){clearTimeout(this.routeRequest.timer);this.routeRequest.reject(new Error('Video sender closed during route update'));this.routeRequest=null;}
      if(this.child===child){this.child=null;if(!stopping)this.update({status:'error',spoutFps:0,ndiFps:0,error:this.state.error||`Video sender exited (${code})`});}
      resolve();
    });});
    this.stopChild=()=>{stopping=true;if(!done){child.stdin.end('Q\n');setTimeout(()=>{if(!done)child.kill();},1200).unref();}};
    child.stdin.on('error',()=>{});child.stderr.on('data',()=>{});
    const lines=createInterface({input:child.stdout});
    return new Promise((resolve,reject)=>{
      let ready=false;
      const timeout=setTimeout(()=>fail('Video sender startup timed out'),8000);
      const fail=message=>{if(this.child!==child)return;this.update({status:'error',error:message});child.kill();if(!ready){clearTimeout(timeout);reject(new Error(message));}};
      child.on('error',e=>{fail(e.message);});
      child.once('close',()=>{clearTimeout(timeout);if(!ready)reject(new Error(this.state.error||'Video sender closed before initialization'));});
      lines.on('line',line=>{
        if(this.child!==child||line.length>4096)return;
        let m;try{m=JSON.parse(line);}catch{return;}
        if(m.type==='ack'){
          if(this.frame?.id===m.id){clearTimeout(this.frame.timer);this.frame.release();this.frame=null;}
        } else if(m.type==='ready'){
          ready=true;clearTimeout(timeout);delete m.type;this.update({...m,status:'sending'});this.setBlackout(this.blackout);resolve(this.state);
        } else if(m.type==='routes'){
          delete m.type;this.update(m);if(this.routeRequest){clearTimeout(this.routeRequest.timer);this.routeRequest.resolve(this.state);this.routeRequest=null;}
        } else if(m.type==='stats') {delete m.type;this.update(m);}
        else if(m.type==='error')fail(m.message||'Video output failed');
      });
    });
  }
  offer(info,release) {
    if(!this.child||this.state.status!=='sending'||this.frame||!info.handle?.ntHandle){
      if(this.frame)this.state.dropped++;release();return;
    }
    const id=++this.sequence,child=this.child;
    const handle=info.handle.ntHandle.readBigUInt64LE().toString(16);
    const timer=setTimeout(()=>{if(this.child===child){this.update({status:'error',error:'Video GPU transfer timed out'});child.kill();}},2500);
    this.frame={id,release,timer};child.stdin.write(`F ${id} ${handle}\n`);
  }
  setBlackout(value){this.blackout=Boolean(value);if(this.child?.stdin.writable)this.child.stdin.write(`B ${this.blackout?1:0}\n`);}
  async stop(){if(this.child){this.stopChild();await this.closed;}this.state=this.empty();this.emit('state',this.state);}
}
module.exports={SIZES,videoSettings,VideoSender};
