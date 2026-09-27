import { impactProfile } from './impact-level.mjs';
const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));

// A fast attack followed by exponential release; never accumulate zoom.
export class ScreenImpact {
  constructor() { this.reset(); }
  reset() {
    this.enabled = false;
    this.at = -Infinity;
    this.previous = 0;
    this.flag = false;
    this.strength = 0;
  }
  update(metrics, now, enabled, mode = 'music', level = 'medium') {
    const profile = impactProfile(level);
    const value = clamp(metrics.impact);
    const flag = Boolean(mode === 'beat' ? metrics.beatNow : metrics.rhythmNow || metrics.onsetNow);
    const trigger = mode === 'beat' ? flag && !this.flag : (flag && !this.flag) || value > this.previous + .12;
    if (!enabled) this.reset();
    if (enabled && this.enabled && trigger && now - this.at >= 100) {
      this.at = now;
      this.strength = Math.max(.3, value, clamp(metrics.rhythmStrength));
    }
    this.enabled = enabled;
    this.previous = value;
    this.flag = flag;
    const age = now - this.at;
    const motion = enabled && age < profile.release * 6 ? this.strength * Math.min(1, (age + 4) / 12) * Math.exp(-Math.max(0, age - 12) / profile.release) * profile.motion : 0;
    const flash = enabled && age < 55 ? this.strength * (1 - age / 55) * profile.flash : 0;
    const rgb = enabled && age < 100 ? this.strength * profile.rgb * Math.exp(-age / 35) : 0;
    return { motion, flash, rgb, age: Number.isFinite(age) ? age : 0 };
  }
}
