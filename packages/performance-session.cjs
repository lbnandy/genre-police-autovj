"use strict";

// Native device routing is a property of this computer, not of a DJ library.
function migrateEquipment(config, legacy = {}) {
  if (config.equipment) return;
  config.equipment = {
    deviceId: typeof legacy.deviceId === 'string' ? legacy.deviceId : '',
    channelStart: Number.isInteger(legacy.channelStart) ? legacy.channelStart : 0,
    displayId: Number.isInteger(legacy.displayId) ? legacy.displayId : null,
  };
}
function channelOptions(device) {
  const count = Number(device?.channels);
  if (!Number.isInteger(count) || count < 1 || count > 256) return [];
  const options = [];
  for (let i = 0; i < count; i += 2)
    options.push({value:i, label:i + 1 < count ? `${i + 1} + ${i + 2}` : String(i + 1), mono:i + 1 === count});
  if (count > 2) options.push({value:-1, mixed:true});
  return options;
}
class InputHealth {
  reset(now = Date.now()) {this.startedAt=now;this.lastSignal=now;this.lastLevel=now;this.overloadUntil=0;}
  level(event, now = Date.now()) {
    this.lastLevel=now;
    if (Number(event.peak) >= .0001) this.lastSignal=now;
    if (Number(event.peak) >= .98) this.overloadUntil=now+3000;
  }
  status(live, now = Date.now()) {
    if (!live.running) return 'stopped';
    if (live.deviceLost || live.phase === 'reconnecting') return 'disconnected';
    if (now < this.overloadUntil) return 'overload';
    if (now - this.lastLevel > 6000) return 'no-data';
    if (now - this.lastSignal > 8000) return 'silent';
    return 'ok';
  }
}
class PerformanceSession {
  constructor(powerSaveBlocker) {this.power=powerSaveBlocker;this.blocker=null;this.events=[];}
  updateAwake(active, enabled = true) {
    if (active && enabled && this.blocker === null)
      this.blocker=this.power.start('prevent-display-sleep');
    if ((!active || !enabled) && this.blocker !== null) {
      this.power.stop(this.blocker);this.blocker=null;
    }
  }
  record(type, detail = {}) {
    this.events.push({at:new Date().toISOString(),type,...detail});
    if(this.events.length>400)this.events.splice(0,this.events.length-400);
  }
}
module.exports={migrateEquipment,channelOptions,InputHealth,PerformanceSession};
