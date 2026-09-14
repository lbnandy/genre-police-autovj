"use strict";
// One complete compositor frame fans out to GPU presenters and the native
// sender. Slow consumers drop frames instead of retaining an unbounded queue.
class TextureDistributor {
  constructor(sharedTexture,now=()=>performance.now()){this.api=sharedTexture;this.now=now;this.busy=new Set();this.nextPreview=0;this.previewInterval=0;this.pending=new Set();}
  paint(texture,targets,sender) {
    let references=1,released=false;
    const release=()=>{if(--references===0&&!released){released=true;try{texture.release();}catch{}}};
    references++;sender.offer(texture.textureInfo,release);
    const now=this.now();
    for(const target of targets){
      if(!target?.ready||!target.visible||target.window?.isDestroyed())continue;
      const wc=target.window.webContents;
      if(this.busy.has(wc.id))continue;
      if(target.id==='preview'){
        const interval=1000/(target.fps || 30);
        if(interval!==this.previewInterval){this.previewInterval=interval;this.nextPreview=now;}
        if(now+.5<this.nextPreview)continue;
        // Keep phase across source-frame jitter, instead of discarding every
        // other frame when a 15/30 FPS source arrives just before the deadline.
        this.nextPreview=now-this.nextPreview>interval?now+interval:this.nextPreview+interval;
      }
      this.busy.add(wc.id);references++;
      let imported;
      try{imported=this.api.importSharedTexture({textureInfo:texture.textureInfo,allReferencesReleased:release});}
      catch{this.busy.delete(wc.id);release();continue;}
      const task=this.api.sendSharedTexture({frame:wc.mainFrame,importedSharedTexture:imported},{id:target.id,maxWidth:target.maxWidth,maxHeight:target.maxHeight})
        .catch(()=>{}) // A closing/reloading presenter must not stop other routes.
        .finally(()=>{imported.release();this.busy.delete(wc.id);this.pending.delete(task);});
      this.pending.add(task);
    }
    release();
  }
  async drain(){await Promise.allSettled([...this.pending]);}
}
module.exports={TextureDistributor};
