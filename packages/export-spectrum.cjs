"use strict";
const fs=require('node:fs');
const {BluesteinRealFft}=require('../vendor/genre-police/src/rhythm-model-runtime.js');
// Web Audio's Blackman window, amplitude smoothing and dB-to-byte mapping.
// Sample-clock inputs let the existing DSP run without a live AudioContext.
class ExportSpectrum {
  constructor(file){this.file=fs.openSync(file,'r');this.bytes=Buffer.alloc(2048*4);
    this.fft=[new BluesteinRealFft(2048),new BluesteinRealFft(1024)];
    this.previous=[new Float32Array(1024),new Float32Array(512)];}
  frame(time){
    const end=Math.round(time*44.1),start=Math.max(0,end-2048),missing=Math.max(0,2048-end);
    this.bytes.fill(0);fs.readSync(this.file,this.bytes,missing*4,(2048-missing)*4,start*4);
    const samples=new Float32Array(this.bytes.buffer,this.bytes.byteOffset,2048);
    const frequency=this.fft.map((fft,index)=>{
      const n=index?1024:2048,offset=2048-n,window=new Float32Array(n);
      for(let i=0;i<n;i++)window[i]=samples[offset+i]*(.42-.5*Math.cos(2*Math.PI*i/n)+.08*Math.cos(4*Math.PI*i/n));
      const magnitude=fft.magnitude(window),smooth=index?.08:.64,previous=this.previous[index];
      return Array.from(magnitude,(v,i)=>{
        const amplitude=previous[i]=previous[i]*smooth+(1-smooth)*v/n;
        return Math.round(Math.max(0,Math.min(255,(20*Math.log10(Math.max(1e-12,amplitude))+92)/74*255)));
      });
    });
    let rms=0;for(const x of samples)rms+=x*x;
    return {frequency:frequency[0],beatFrequency:frequency[1],waveform:Array.from(samples,x=>Math.max(0,Math.min(255,Math.floor(128+128*x)))),signal:Math.sqrt(rms/2048)>.0001};
  }
  close(){if(this.file!==null){fs.closeSync(this.file);this.file=null;}}
}
module.exports={ExportSpectrum};
