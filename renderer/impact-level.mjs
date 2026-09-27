import { softenMotionMetrics } from '../vendor/genre-police/renderer/motion-preference.mjs';

const PROFILES = Object.freeze({
  low: { motion: .45, flash: .5, release: 100, rgb: 1, visualKick: 0, titleKick: 0 },
  medium: { motion: 1, flash: 1, release: 130, rgb: 3, visualKick: 0, titleKick: 0 },
  high: { motion: 1.8, flash: 1.4, release: 160, rgb: 8, visualKick: .075, titleKick: .03 },
  extreme: { motion: 2.7, flash: 1.8, release: 190, rgb: 16, visualKick: .15, titleKick: .06 },
  ultra: { motion: 3.9, flash: 2.1, release: 210, rgb: 24, visualKick: .23, titleKick: .09 },
});
export function impactProfile(level) { return PROFILES[level] || PROFILES.medium; }
export function impactPresentation(metrics, level, reducedMotion = false) {
  const profile = impactProfile(level);
  const pulse = Math.max(0, Math.min(1, Math.max(Number(metrics.impact) || 0, Number(metrics.rhythmPulse) || 0)));
  const motion = pulse * (reducedMotion ? .25 : 1);
  return { visualScale: 1 + motion * profile.visualKick, titleScale: 1 + motion * profile.titleKick };
}

export function applyImpactLevel(metrics, level = 'medium') {
  if (level === 'low') return softenMotionMetrics(metrics, 'gentle');
  const gain = level === 'ultra' ? 2.1 : level === 'extreme' ? 1.7 : level === 'high' ? 1.35 : 1;
  if (gain === 1) return metrics;
  const result = { ...metrics };
  // Amplify only existing impact envelopes, not the spectrum, beat clock or
  // event count. Keep the renderer's normalized input contract.
  for (const key of ['impact', 'accent', 'rhythmStrength', 'rhythmPulse', 'kickPulse']) {
    result[key] = Math.max(0, Math.min(1, (Number(metrics[key]) || 0) * gain));
  }
  return result;
}
