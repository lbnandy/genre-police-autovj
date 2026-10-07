"use strict";
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawn}=require('node:child_process');
const {Worker}=require('node:worker_threads');
const {pathToFileURL}=require('node:url');
const {dimensions}=require('./export-options.cjs');
const {ExportSpectrum}=require('./export-spectrum.cjs');
const {rhythmConfig}=require('./rhythm-config.cjs');
const {encoderArguments}=require('./export-encoder.cjs');
const {reserveOutput}=require('./export-batch.cjs');
const {ExportSpeed}=require('./export-speed.cjs');

class VideoExport {
  constructor({root,resource,createWindow,onState,sharedTexture}){
    Object.assign(this,{root,resource,createWindow,onState,sharedTexture});
    this.state={status:'idle'};this.task=null;this.cancelled=false;this.previewFile=null;this.cache=null;this.percent=0;
  }
  update(next){
    if(next.status==='running'&&next.phase==='decode')this.percent=0;
    if(this.state.status==='running'&&!next.status&&next.progress!==null&&next.progress!==undefined){
      const ranges={analysis:[0,.25],'prepare-preview':[.25,.05],render:[.3,.69]};
      const [base,span]=ranges[next.phase]||[0,1];
      this.percent=Math.max(this.percent,base+span*next.progress);
      next={...next,progress:this.percent};
    }
    if(next.phase==='finalize'&&!next.status)next={...next,progress:.99};
    if(this.batch){
      if(next.status==='complete')next={...next,status:'running'};
      next={...next,batch:{...this.batch,items:this.batch.items.map(item=>({...item}))}};
    }
    this.state={...this.state,...next};this.onState(this.state);
  }
  check(){if(this.cancelled)throw new Error('EXPORT_CANCELLED');}
  cancel(){this.cancelled=true;this.abortCapture?.();this.child?.kill();void this.worker?.terminate();}
  capture(contents,render,width,height,frameId){
    this.check();
    return new Promise((resolve,reject)=>{
      let settled=false;
      const cleanup=()=>{settled=true;clearTimeout(timer);contents.removeListener('paint',paint);contents.removeListener('destroyed',closed);this.abortCapture=null;};
      const fail=e=>{if(settled)return;cleanup();reject(e);};
      const paint=(_event,_dirty,image)=>{
        const size=image.getSize();
        // Fractional Windows display scaling may round the hidden window up
        // by a physical pixel. Preserve the requested viewport and crop it.
        if(size.width<width||size.height<height+4)return;
        const stamp=image.crop({x:0,y:height,width:64,height:4}).toBitmap();
        // The compositor may deliver queued surfaces after JS has advanced.
        // A frame token in a cropped-off gutter identifies the actual surface.
        let token=0;for(let bit=0;bit<32;bit++)if(stamp[(2*64+bit*2+1)*4]>128)token=(token|(1<<bit))>>>0;
        if(token!==frameId)return;
        const pixels=size.width===width?image.toBitmap().subarray(0,width*height*4):image.crop({x:0,y:0,width,height}).toBitmap();
        cleanup();resolve(pixels);
      };
      const closed=()=>fail(new Error('Export renderer closed'));
      const timer=setTimeout(()=>fail(new Error('Export renderer did not paint')),15000);
      this.abortCapture=()=>fail(new Error('EXPORT_CANCELLED'));
      contents.on('paint',paint);contents.once('destroyed',closed);
      // Subscribe before changing the sample-clock scene. invalidate() can
      // re-emit an old bitmap, so wait for a genuine compositor paint instead.
      contents.executeJavaScript(render).catch(fail);
    });
  }
  async dispose(){this.cancel();await this.task;this.clearPreview();this.clearCache();}
  captureGPU(contents,render,frameId,index,fps){
    this.check();
    return new Promise((resolve,reject)=>{
      let done=false,busy=false,queued=null;
      const cleanup=()=>{done=true;contents.exportCaptureActive=false;clearTimeout(timer);clearInterval(refresh);contents.removeListener('paint',paint);contents.removeListener('destroyed',closed);queued?.release();queued=null;this.abortCapture=null;};
      const fail=e=>{if(done)return;cleanup();reject(e);};
      const consume=async texture=>{
        busy=true;let imported;
        try{
          imported=this.sharedTexture.importSharedTexture({textureInfo:texture.textureInfo,allReferencesReleased:()=>texture.release()});
          await this.sharedTexture.sendSharedTexture({frame:contents.mainFrame,importedSharedTexture:imported},{frameId,index,timestamp:Math.round(index*1e6/fps)});
          const accepted=await contents.executeJavaScript('window.exportEncoder.accepted()');
          if(!done&&accepted===frameId){
            const chunk=contents.executeJavaScript(`window.exportEncoder.take(${frameId})`).then(result=>Buffer.from(result.bytes));
            chunk.catch(()=>{});cleanup();resolve({chunk});
          }
        }catch(e){if(!imported)texture.release();fail(e);}
        finally{imported?.release();busy=false;if(queued&&!done){const next=queued;queued=null;void consume(next);}}
      };
      const paint=event=>{const texture=event.texture;if(!texture)return;if(busy){queued?.release();queued=texture;}else void consume(texture);};
      const closed=()=>fail(new Error('Export renderer closed'));
      const timer=setTimeout(()=>fail(new Error('GPU export frame timed out')),15000);
      // Chromium can coalesce damage while a prior surface is in flight. Ask
      // for a refresh if necessary; the frame token still rejects old surfaces.
      const refresh=setInterval(()=>{if(!done&&!contents.isDestroyed())contents.invalidate();},50);
      this.abortCapture=()=>fail(new Error('EXPORT_CANCELLED'));
      contents.exportCaptureActive=true;
      contents.on('paint',paint);contents.once('destroyed',closed);
      contents.executeJavaScript(render).catch(fail);
    });
  }
  clearPreview(){if(this.previewFile){fs.rmSync(this.previewFile,{force:true});this.previewFile=null;}}
  clearCache(){if(this.cache){fs.rmSync(this.cache.directory,{recursive:true,force:true});this.cache=null;}}
  async command(args,timeout=0){
    this.check();
    const child=this.child=spawn(this.ffmpeg,args,{windowsHide:true,stdio:['ignore','ignore','pipe']});
    let tail='';child.stderr.on('data',b=>tail=(tail+b).slice(-4000));
    const timer=timeout?setTimeout(()=>child.kill(),timeout):null;
    try{await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>code===0?resolve():reject(new Error(tail||`Encoder exited: ${code}`)));});}
    finally{clearTimeout(timer);if(this.child===child)this.child=null;}
    if(this.child===child)this.child=null;this.check();
  }
  async encoder(width,height,options,preview){
    if(preview||options.encoding==='software')return 'libx264';
    // Listing a codec does not prove the installed driver can initialize it.
    // Probe the actual bundled encoder at the requested output dimensions.
    try{
      await this.command(['-hide_banner','-loglevel','error','-nostdin','-f','lavfi','-i',`color=c=black:s=${width}x${height}:r=${options.fps}`,
        '-frames:v','8',...encoderArguments('h264_nvenc',options.quality),'-pix_fmt','yuv420p','-f','null','-'],8000);
      return 'h264_nvenc';
    }catch(e){this.check();return 'libx264';}
  }
  async analyze(pcm){
    this.check();
    const worker=this.worker=new Worker(path.join(__dirname,'export-analysis.cjs'),{workerData:{pcm,model:rhythmConfig(this.resource)}});
    try{return await new Promise((resolve,reject)=>{
      worker.on('message',e=>{
        if(e.type==='progress')this.update({phase:'analysis',progress:e.value});
        if(e.type==='complete')resolve(e.events);
        if(e.type==='error')reject(new Error(e.message));
      });
      worker.once('error',reject);worker.once('exit',code=>reject(new Error(`Analysis stopped: ${code}`)));
    });}finally{await worker.terminate();if(this.worker===worker)this.worker=null;}
  }
  start(request){
    if(this.task)throw new Error('An export is already running');
    this.cancelled=false;this.batch=null;this.state.batch=null;
    this.update({status:'running',phase:'decode',progress:null,preview:request.preview,trackId:request.scene.track.id,error:'',file:null,url:null,encoder:null,renderStats:null,renderFps:0,recentRenderFps:null,remainingSeconds:null});
    this.task=this.run(request).catch(e=>this.update({status:this.cancelled?'cancelled':'error',error:this.cancelled?'':e.message}))
      .finally(()=>{this.task=null;});
  }
  startBatch(requests,directory){
    if(this.task)throw new Error('An export is already running');
    if(!requests.length)throw new Error('No tracks selected');
    this.cancelled=false;
    this.batch={directory,index:0,items:requests.map(r=>({id:r.scene.track.id,title:r.scene.track.title,artist:r.scene.track.artist,durationMs:r.scene.track.durationMs,status:'queued',error:''}))};
    this.update({status:'running',phase:'decode',progress:null,preview:false,error:'',file:null,url:null});
    this.task=(async()=>{
      for(let i=0;i<requests.length&&!this.cancelled;i++){
        const request=requests[i],item=this.batch.items[i];let output,complete=false;
        this.batch.index=i;item.status='running';
        this.update({status:'running',phase:'decode',progress:null,trackId:item.id,error:'',file:null,encoder:null,renderStats:null,renderFps:0,recentRenderFps:null,remainingSeconds:null});
        try{
          if(!request.file||!fs.existsSync(request.file))throw new Error('EXPORT_AUDIO_MISSING');
          output=reserveOutput(directory,item.title);
          await this.run({...request,output,preview:false});
          complete=true;item.status='complete';item.file=output;
        }catch(e){item.status=this.cancelled?'cancelled':'error';item.error=this.cancelled?'':e.message;}
        finally{if(output&&!complete&&fs.existsSync(output)&&fs.statSync(output).size===0)fs.rmSync(output);}
        this.update({file:null});
      }
      for(const item of this.batch.items)if(item.status==='queued')item.status='cancelled';
      const batch=this.batch;this.batch=null;
      this.update({status:this.cancelled?'cancelled':'complete',progress:this.cancelled?this.state.progress:1,batch,file:null,error:''});
    })().catch(e=>{const batch=this.batch;this.batch=null;this.update({status:'error',batch,error:e.message});}).finally(()=>{this.task=null;});
  }
  async run({file,output,scene,options,preview=false,previewStart=0}){
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'autovj-export-'));
    // The partial file is on the destination volume, so completion is an atomic
    // rename. Cancellation never removes or truncates an existing user video.
    const partial=output+`.${path.basename(temp)}.partial.mp4`;
    let win,spectrum,encoded;
    try{
      this.ffmpeg=this.resource('node_modules/ffmpeg-static/ffmpeg.exe');
      const stat=fs.statSync(file),key=JSON.stringify([file,stat.size,stat.mtimeMs]);
      if(this.cache?.key!==key){
        this.clearCache();
        const pcm=path.join(temp,'audio.f32'),modelPcm=path.join(temp,'rhythm.f32');
        await this.command(['-hide_banner','-loglevel','error','-nostdin','-y','-i',file,
          '-map','0:a:0','-vn','-ac','1','-ar','44100','-f','f32le',pcm,
          '-map','0:a:0','-vn','-ac','1','-ar','22050','-f','f32le',modelPcm]);
        const duration=fs.statSync(pcm).size/(44100*4);
        if(!Number.isFinite(duration)||duration<=0)throw new Error('Empty audio');
        this.update({phase:'analysis',progress:0,duration});
        const events=await this.analyze(modelPcm);this.check();
        fs.rmSync(modelPcm);
        this.cache={key,directory:temp,pcm,duration,events};
      }
      const {pcm,duration,events}=this.cache;
      const start=preview?Math.min(Math.max(0,Number(previewStart)||0),Math.max(0,duration-1)):0;
      const length=preview?Math.min(8,duration-start):duration;
      const fps=preview?30:options.fps,[width,height]=dimensions(options,preview),frames=Math.ceil(length*fps);
      let gpu=Boolean(this.sharedTexture&&options.encoding!=='software'),encoder;
      const exportScene={...scene,settings:{...scene.settings,...options,rhythmSource:'audio',renderScale:1,performanceMode:'balanced',idleFrameLimit:false,showFps:false,frameRateLimit:String(fps)},active:true,standby:false,blackout:false,outputVisible:true,previewFrameRate:0};
      const openStage=async()=>{
        win=this.createWindow(width,height+4,gpu);
        await win.loadFile(path.join(this.root,'renderer/stage.html'),{query:{export:'1'}});
        await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{let n=0;const t=setInterval(()=>{if(window.exportStage){clearInterval(t);resolve(true);}else if(++n>300){clearInterval(t);reject(new Error('Renderer initialization timed out'));}},100);})`);
        await win.webContents.executeJavaScript(`window.exportStage.initialize(${JSON.stringify(exportScene)},${JSON.stringify({width,height})})`);
      };
      await openStage();
      if(gpu){
        try{
          const {videoBitrate}=await import('./export-quality.mjs');
          gpu=await win.webContents.executeJavaScript(`window.exportEncoder.initialize(${JSON.stringify({width,height,fps,quality:options.quality,bitrate:videoBitrate({width,height,fps,quality:options.quality})})})`);
        }catch{gpu=false;}
        if(!gpu){win.destroy();await openStage();}
      }
      encoder=gpu?'webcodecs':await this.encoder(width,height,options,preview);
      this.update({encoder});
      this.check();
      spectrum=new ExportSpectrum(pcm);
      const child=this.child=spawn(this.ffmpeg,['-hide_banner','-loglevel','error','-nostdin','-y',
        ...(gpu?['-r',String(fps),'-f','h264','-i','pipe:0']:['-f','rawvideo','-pixel_format','bgra','-video_size',`${width}x${height}`,'-framerate',String(fps),'-i','pipe:0']),
        '-ss',String(start),'-i',file,'-map','0:v:0','-map','1:a:0','-t',String(length),
        ...(gpu?['-c:v','copy']:encoderArguments(encoder,options.quality,preview)),
        '-pix_fmt','yuv420p','-c:a','aac','-b:a','256k','-movflags','+faststart',partial],
        {windowsHide:true,stdio:['pipe','ignore','pipe']});
      let tail='',encoderError=null;
      child.stderr.on('data',b=>tail=(tail+b).slice(-4000));
      child.stdin.on('error',e=>encoderError=e);
      encoded=new Promise((resolve,reject)=>{
        child.once('error',e=>{encoderError=e;reject(e);});
        child.once('close',code=>code===0?resolve():reject(encoderError=new Error(tail||`Encoder exited: ${code}`)));
      });
      // Attach immediately: encoding errors may precede the first frame.
      encoded.catch(()=>{});
      let eventAt=0,lastReport=0,pendingWrite=Promise.resolve();
      const speed=new ExportSpeed();
      const timing={frames:0,spectrumMs:0,renderAndReadbackMs:0,writeWaitMs:0},renderStarted=performance.now();
      const first=Math.round(start*fps),last=first+frames;
      // A bounded warm-up keeps later previews responsive. Whole-song export
      // always simulates every frame from zero.
      const begin=preview?Math.max(0,first-3*fps):0;
      while(eventAt<events.length&&events[eventAt].time<begin*1000/fps)eventAt++;
      for(let frame=begin;frame<last;frame++){
        this.check();if(encoderError)throw encoderError;
        const tick=performance.now();
        const time=frame*1000/fps,packet=spectrum.frame(time),rhythm=[];
        timing.spectrumMs+=performance.now()-tick;
        while(eventAt<events.length&&events[eventAt].time<=time)rhythm.push(events[eventAt++]);
        const renderTick=performance.now();
        if(frame===first)speed.start(renderTick);
        const frameId=frame+1,render=`window.exportStage.frame(${JSON.stringify({time,...packet,rhythm,frameId})})`;
        const rendered=frame>=first?(gpu?await this.captureGPU(win.webContents,render,frameId,frame-first,fps):await this.capture(win.webContents,render,width,height,frameId)):await win.webContents.executeJavaScript(render);
        timing.renderAndReadbackMs+=performance.now()-renderTick;
        if(frame>=first){
          if(!gpu&&rendered.length!==width*height*4)throw new Error('Unexpected export bitmap dimensions');
          const writeTick=performance.now();
          // Render the next frame while the encoder consumes this one. Keep at
          // most one write in flight, bounding memory even with a slow encoder.
          await pendingWrite;
          this.check();if(encoderError)throw encoderError;
          pendingWrite=(async()=>{
            const pixels=gpu?await rendered.chunk:rendered;
            await new Promise((resolve,reject)=>child.stdin.write(pixels,e=>e?reject(e):resolve()));
          })();
          pendingWrite.catch(e=>{encoderError=e;});
          timing.writeWaitMs+=performance.now()-writeTick;timing.frames++;
        }
        if(Date.now()-lastReport>200||frame===last-1){
          lastReport=Date.now();this.update({phase:frame<first?'prepare-preview':'render',progress:frame<first?(frame-begin)/Math.max(1,first-begin):(frame-first+1)/frames,frame:Math.max(0,frame-first+1),frames,...speed.sample(performance.now(),timing.frames,frames),renderStats:{...timing,elapsedMs:performance.now()-renderStarted}});
        }
      }
      await pendingWrite;
      if(gpu)await win.webContents.executeJavaScript('window.exportEncoder.finish()');
      this.check();this.update({phase:'finalize',progress:null});child.stdin.end();await encoded;
      if(this.child===child)this.child=null;this.check();
      fs.renameSync(partial,output);
      if(preview){this.clearPreview();this.previewFile=output;}
      this.update({status:'complete',progress:1,renderStats:{...timing,elapsedMs:performance.now()-renderStarted},file:output,url:preview?pathToFileURL(output).href:null});
    }finally{
      this.child?.kill();this.child=null;
      await encoded?.catch(()=>{});
      if(win&&!win.isDestroyed())win.destroy();spectrum?.close();
      fs.rmSync(partial,{force:true});if(this.cache?.directory!==temp)fs.rmSync(temp,{recursive:true,force:true});
    }
  }
}
module.exports={VideoExport};
