"use strict";
const {contextBridge,sharedTexture}=require('electron');
// Export is a self-contained renderer: it has no live input or console actions.
const noop=()=>{};
contextBridge.exposeInMainWorld('autovj',{
  onScene:noop,onPCM:noop,onLink:noop,onRhythm:noop,onRenderActive:noop,onOutputResume:noop,
  stageReady:noop,stagePainted:noop,stageError:noop,ackPCM:noop,reportPerformance:noop,hideOutput:noop,call:async()=>{}
});
let encoder,settings,failure,accepted=0,cropCanvas,cropContext;
const pending=new Map(),packets=new Map();
function fail(error){
  failure=error.message||String(error);
  for(const entry of pending.values())entry.reject?.(new Error(failure));
  pending.clear();
}
sharedTexture.setSharedTextureReceiver(async({importedSharedTexture:texture},target)=>{
  let source,cropped;
  try{
    accepted=0;if(!encoder||failure)return;
    source=texture.getVideoFrame();
    const stamp=new Uint8Array(64*4*4);
    await source.copyTo(stamp,{rect:{x:0,y:settings.height,width:64,height:4},format:'RGBA'});
    let token=0;for(let bit=0;bit<32;bit++)if(stamp[(2*64+bit*2+1)*4]>128)token=(token|(1<<bit))>>>0;
    if(token!==target.frameId)return;
    // Some hardware encoders retain coded pixels outside VideoFrame.visibleRect.
    // Crop into an exact-size GPU canvas so the synchronization gutter can never
    // become part of the encoded image, even on those drivers.
    cropContext.drawImage(source,0,0,settings.width,settings.height,0,0,settings.width,settings.height);
    cropped=new VideoFrame(cropCanvas,{timestamp:target.timestamp,duration:Math.round(1e6/settings.fps)});
    pending.set(target.timestamp,{frameId:target.frameId});accepted=target.frameId;
    encoder.encode(cropped,{keyFrame:target.index%(settings.fps*2)===0});
  }catch(e){fail(e);}
  finally{cropped?.close();source?.close();texture.release();}
});
contextBridge.exposeInMainWorld('exportEncoder',{
  async initialize(options){
    settings=options;failure=null;accepted=0;packets.clear();pending.clear();
    cropCanvas=new OffscreenCanvas(options.width,options.height);cropContext=cropCanvas.getContext('2d',{alpha:false});
    // Request hardware acceleration, then test a real frame before exporting.
    const config={codec:'avc1.640033',width:options.width,height:options.height,framerate:options.fps,
      bitrate:options.bitrate,bitrateMode:'variable',
      hardwareAcceleration:'prefer-hardware',latencyMode:'realtime',avc:{format:'annexb'}};
    const support=await VideoEncoder.isConfigSupported(config);
    if(!support.supported)return false;
    encoder=new VideoEncoder({output:chunk=>{
      const bytes=new Uint8Array(chunk.byteLength);chunk.copyTo(bytes);
      const entry=pending.get(chunk.timestamp);pending.delete(chunk.timestamp);
      if(!entry){fail(new Error('Unexpected encoded timestamp'));return;}
      const packet={frameId:entry.frameId,bytes};
      if(entry.resolve)entry.resolve(packet);else packets.set(entry.frameId,packet);
    },error:fail});
    let probe,timer;
    try{
      encoder.configure(config);
      const canvas=new OffscreenCanvas(options.width,options.height);
      canvas.getContext('2d').fillRect(0,0,options.width,options.height);
      probe=new VideoFrame(canvas,{timestamp:0});pending.set(0,{frameId:-1});
      encoder.encode(probe,{keyFrame:true});
      await Promise.race([encoder.flush(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Encoder initialization timed out')),5000);})]);
      if(failure||!packets.has(-1))throw new Error(failure||'Encoder produced no frame');
      packets.delete(-1);return true;
    }catch(e){if(encoder.state!=='closed')encoder.close();encoder=null;pending.clear();packets.clear();return false;}
    finally{clearTimeout(timer);probe?.close();}
  },
  accepted(){if(failure)throw new Error(failure);return accepted;},
  take(frameId){
    if(failure)throw new Error(failure);
    if(packets.has(frameId)){const next=packets.get(frameId);packets.delete(frameId);return next;}
    const entry=[...pending.values()].find(e=>e.frameId===frameId);
    if(!entry)throw new Error('Missing encoded frame');
    return new Promise((resolve,reject)=>Object.assign(entry,{resolve,reject}));
  },
  async finish(){if(failure)throw new Error(failure);await encoder.flush();encoder.close();encoder=null;}
});
