const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number(v)||0));
// Beat ownership is separate from DSP music-event detection.
export class RhythmClock {
  constructor(){this.link=null;this.model=null;this.reset();}
  reset(){this.key='';this.lastBeat=null;this.lastFired=-Infinity;this.lastSerial=0;this.pulse=0;this.impact=0;this.lastAt=0;this.signalAt=-Infinity;}
  setLink(sample){this.link=sample;}
  setModel(sample,at){
    if(sample.type!=='rhythm'){this.model=null;this.lastSerial=0;return;}
    const previous=this.model;
    this.model={...sample,at,peakSerial:sample.trackedBeat?sample.trackedSerial:previous?.peakSerial||0,peakAt:sample.trackedBeat?at:previous?.peakAt||0};
  }
  source(settings,now){
    const preference=settings.rhythmSource||'auto';
    const valid=this.link?.status==='connected'&&this.link.peers>0&&now-this.link.at>=0&&now-this.link.at<600;
    return preference==='audio'?'audio':valid?'link':preference==='link'?'none':'audio';
  }
  prepare(settings,now,active){
    const source=this.source(settings,now);
    const key=`${settings.rhythmSource||'auto'}:${source}:${source==='link'?this.link?.epoch||0:0}:${settings.impactMode}:${settings.beatStrength}:${settings.linkOffsetMs||0}:${active}`;
    if(key===this.key)return false;
    this.reset();this.key=key;
    // Consume delivered peaks rather than replaying them on a mode change.
    this.lastSerial=Number(this.model?.peakSerial)||0;
    return true;
  }
  update(metrics,settings,now,active,signal) {
    const changed=this.prepare(settings,now,active),source=this.source(settings,now),link=source==='link';
    const dt=this.lastAt?clamp(now-this.lastAt,0,1000):0;this.lastAt=now;
    if(signal)this.signalAt=now;
    const audible=active&&now-this.signalAt<250;
    let event=false;
    if(link){
      const beat=this.link.beat+(now-this.link.at-clamp(settings.linkOffsetMs,-250,250))*this.link.bpm/60000;
      const integer=Math.floor(beat);
      event=this.lastBeat!==null&&integer===this.lastBeat+1&&integer>this.lastFired&&dt<250;
      if(this.lastBeat===null||Math.abs(integer-this.lastBeat)>1||dt>=250)this.lastFired=integer;
      else if(event)this.lastFired=Math.max(this.lastFired,integer);
      this.lastBeat=integer;
    }else if(source==='audio'&&this.model&&now-this.model.at<450){
      const serial=Number(this.model.peakSerial)||0;
      event=serial>this.lastSerial&&now-this.model.peakAt<190&&dt<250;
      this.lastSerial=Math.max(this.lastSerial,serial);
    }
    event=event&&audible&&!changed;
    const energy=clamp(Math.max((metrics.bassPulse||0)*.65+(metrics.drive||0)*.35,
      ((metrics.midPulse||0)*.7+(metrics.highPulse||0)*.3)*.65,(metrics.volume||0)*.55));
    if(settings.impactMode!=='beat'){
      // Link supplies tempo and a small beat accent; off-grid DSP events remain intact.
      // Audio keeps the existing DSP + BeatNet fusion unchanged.
      if(source==='audio')return {...metrics,rhythmSource:source};
      const accent=event?energy*.35:0;
      return {...metrics,rhythmSource:source,impact:Math.max(metrics.impact||0,accent),
        ...(link?{bpm:this.link.bpm,tempoConfidence:1}:{bpm:0,tempoConfidence:0,modelTempoBpm:0,modelTempoConfidence:0})};
    }
    this.pulse*=Math.exp(-dt/145);this.impact*=Math.exp(-dt/92);
    const strength=settings.beatStrength==='fixed'?.78:.5+.5*Math.sqrt(energy);
    // Each accepted beat starts at its selected amplitude, independent of frame timing.
    if(event){this.pulse=strength;this.impact=strength;}
    if(!audible)this.pulse=this.impact=0;
    return {...metrics,rhythmNow:event,beatNow:event,kickNow:event,onsetNow:event,rhythmStrength:event?strength:0,rhythmPulse:this.pulse,impact:this.impact,beat:this.pulse,accent:this.impact,kickPulse:this.pulse,rhythmSource:source,
      modelBeatNow:false,modelDownbeatNow:false,
      ...(link?{bpm:this.link.bpm,tempoConfidence:1}:source==='none'?{bpm:0,tempoConfidence:0}: {})};
  }
}
