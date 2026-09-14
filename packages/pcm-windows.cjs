"use strict";
const fs=require('node:fs');
// The pinned model's sinc kernel and GLOBAL sample coordinates are preserved.
// Read only the source region needed by the next AI window; reuse its overlap.
class PcmWindows {
  static async open(file) {
    const handle=await fs.promises.open(file,'r');
    try {return new PcmWindows(handle,(await handle.stat()).size);} catch(e){await handle.close();throw e;}
  }
  constructor(handle,bytes) {
    if(!bytes || bytes%2)throw new Error('Invalid mono PCM file');
    this.handle=handle;this.sourceLength=bytes/2;this.length=Math.max(1,Math.round(this.sourceLength*16000/44100));
    this.ratio=44100/16000;this.radius=10;this.previous=null;this.previousStart=0;
    this.buffer=Buffer.alloc(0);this.samples=new Float32Array(0);
    const cutoff=16000/44100*.94;
    this.kernels=Array.from({length:512},(_,phase)=>{
      const kernel=new Float32Array(21),fraction=phase/512;let total=0;
      for(let tap=-10;tap<=10;tap++){
        const d=tap-fraction,x=cutoff*d,pi=Math.PI*x;
        const value=cutoff*(Math.abs(x)<1e-8?1:Math.sin(pi)/pi)*(.5+.5*Math.cos(Math.PI*d/11));
        kernel[tap+10]=value;total+=value;
      }
      for(let i=0;i<21;i++)kernel[i]/=total;
      return kernel;
    });
  }
  async read(start,count=32768) {
    if(!Number.isInteger(start)||start<0||!Number.isInteger(count)||count<1||count>32768)throw new Error('Invalid AI window');
    const output=new Float32Array(count),end=Math.min(this.length,start+count);
    let from=start;
    if(this.previous && start>=this.previousStart && start<this.previousStart+this.previous.length){
      const overlap=Math.min(end-start,this.previousStart+this.previous.length-start);
      if(overlap>0){output.set(this.previous.subarray(start-this.previousStart,start-this.previousStart+overlap));from+=overlap;}
    }
    if(from<end){
      const lo=Math.max(0,Math.floor((from+.5)*this.ratio-.5)-10);
      const hi=Math.min(this.sourceLength,Math.floor((end-.5)*this.ratio-.5)+11);
      const n=hi-lo,bytes=n*2;
      if(this.buffer.length<bytes){this.buffer=Buffer.alloc(bytes);this.samples=new Float32Array(n);}
      for(let at=0;at<bytes;){const r=await this.handle.read(this.buffer,at,bytes-at,lo*2+at);if(!r.bytesRead)throw new Error('PCM file ended unexpectedly');at+=r.bytesRead;}
      for(let i=0;i<n;i++)this.samples[i]=this.buffer.readInt16LE(i*2)/32768;
      for(let index=from;index<end;index++){
        const position=(index+.5)*this.ratio-.5,center=Math.floor(position);
        const kernel=this.kernels[Math.min(511,Math.round((position-center)*511))];let value=0;
        for(let tap=-10;tap<=10;tap++){
          const source=center+tap;if(source>=0 && source<this.sourceLength)value+=this.samples[source-lo]*kernel[tap+10];
        }
        output[index-start]=value;
      }
    }
    this.previous=output;this.previousStart=start;return output;
  }
  async close(){await this.handle.close();this.previous=null;}
}
module.exports={PcmWindows};
