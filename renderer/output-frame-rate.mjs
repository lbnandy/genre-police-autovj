import { frameIntervalFor } from "../vendor/genre-police/renderer/frame-rate-limit.mjs";

// An unrecognized track can still be part of a live DJ set. Only the quiet
// standby preview (before listening starts) qualifies for the idle cap.
export function outputFrameInterval(scene) {
  const settings = scene?.settings || {};
  if(scene?.externalOutput && [25,30,50,60].includes(Number(settings.frameRateLimit)))return 1000/Number(settings.frameRateLimit);
  const idle = Boolean(scene?.standby && !scene.active && settings.idleFrameLimit);
  const interval = frameIntervalFor({
    animationActive: !idle,
    frameRateLimit: settings.frameRateLimit || "60",
    idleFrameLimitEnabled: idle,
  });
  return [15,30].includes(scene?.previewFrameRate) ? Math.max(interval,1000/scene.previewFrameRate) : interval;
}
