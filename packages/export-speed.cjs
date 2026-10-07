"use strict";
// Samples arrive with progress updates, not per frame. Keep only the recent
// five seconds; preview warm-up is excluded from both speed and ETA.
class ExportSpeed {
  constructor() { this.startedAt = null; this.samples = []; }
  start(now) { if (this.startedAt === null) { this.startedAt = now; this.samples.push({now, frames:0}); } }
  sample(now, frames, total) {
    if (this.startedAt === null) return {renderFps:0, recentRenderFps:null, remainingSeconds:null};
    this.samples.push({now, frames});
    while (this.samples.length > 2 && this.samples[1].now <= now - 5000) this.samples.shift();
    const first=this.samples[0], elapsed=now-this.startedAt, span=now-first.now;
    const average=frames*1000/Math.max(1,elapsed);
    const recent=span>=1000 ? (frames-first.frames)*1000/span : null;
    return {renderFps:average, recentRenderFps:recent,
      remainingSeconds:frames>5 && recent>0 ? Math.max(0,total-frames)/recent : null};
  }
}
module.exports={ExportSpeed};
