// Adapted from the desktop renderer/app.js performance loop at the pinned
// Genre Police revision. Canvas-only scaling; UI and typography stay native.
import { performanceTargetFps } from '../vendor/genre-police/renderer/frame-rate-limit.mjs';

export const RESOLUTION_LEVELS = Object.freeze([1, .9, .82, .76]);
export const LOW_RESOLUTION_LEVELS = Object.freeze([.75, .67, .58, .5]);
const percentile = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .95))] || 0;
};

export class AdaptiveResolution {
  constructor() {
    this.profiles = new Map();
    this.context = '';
    this.scale = 1;
    this.active = false;
    this.resetSamples(0);
  }
  resetSamples(time) {
    this.warmupUntil = time + 1200;
    this.startedAt = null;
    this.intervals = [];
    this.work = [];
    this.lowWindows = this.highWindows = 0;
  }
  prepare({context, time, active, frameRateLimit = '60', lowPower = false}) {
    this.levels = lowPower ? LOW_RESOLUTION_LEVELS : RESOLUTION_LEVELS;
    if (this.context !== context) {
      this.context = context;
      this.scale = this.profiles.get(context) || this.levels[0];
      this.resetSamples(time);
    }
    if (Boolean(active) !== this.active) {
      this.active = Boolean(active);
      this.resetSamples(time);
    }
    this.targetFps = [25,50].includes(Number(frameRateLimit)) ? Number(frameRateLimit) : performanceTargetFps(frameRateLimit);
    return this.scale;
  }
  suspend(time) {
    this.active = false;
    this.resetSamples(time);
  }
  sample({time, interval, workMs}) {
    if (!this.active || time < this.warmupUntil || !(interval > 0) || !Number.isFinite(workMs)) return null;
    // A native-window stall or debugger pause is not evidence to lower quality.
    if (interval > 250) { this.resetSamples(time); return null; }
    if (this.startedAt === null) this.startedAt = time;
    this.intervals.push(interval);
    this.work.push(workMs);
    if (time - this.startedAt < 2000) return null;

    const fps = 1000 / (this.intervals.reduce((a, b) => a + b, 0) / this.intervals.length);
    const frameP95 = percentile(this.intervals), workP95 = percentile(this.work);
    const targetInterval = 1000 / this.targetFps;
    // Preserve the desktop heuristic: sustained missed frames with little JS
    // work suggest compositor pressure. CPU stalls should not blur the canvas.
    const overloaded = fps < this.targetFps * .958 && frameP95 >= targetInterval * 1.5 && workP95 < 14;
    const stable = fps > this.targetFps * .966 && frameP95 < targetInterval * 1.23;
    this.lowWindows = overloaded ? this.lowWindows + 1 : 0;
    this.highWindows = stable ? this.highWindows + 1 : 0;
    let next = this.scale;
    if (this.lowWindows >= 2) {
      next = this.levels.find(level => level < this.scale - .005) ?? this.scale;
      this.lowWindows = this.highWindows = 0;
    } else if (this.highWindows >= 20 && this.scale < this.levels[0] - .005) {
      next = [...this.levels].reverse().find(level => level > this.scale + .005) ?? this.scale;
      this.lowWindows = this.highWindows = 0;
    }
    if (next !== this.scale) {
      this.scale = next;
      this.profiles.delete(this.context);
      this.profiles.set(this.context, next);
      // Window-size keys prevent cross-display reuse; cap the session cache.
      if (this.profiles.size > 64) this.profiles.delete(this.profiles.keys().next().value);
      this.warmupUntil = time + 1200;
    }
    this.startedAt = null;
    this.intervals = [];
    this.work = [];
    return {scale: this.scale, fps, frameP95, workP95};
  }
}
