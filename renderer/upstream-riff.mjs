// Generated from the pinned Genre Police app.js. Run scripts/prepare-visuals.cjs.
import { presentationPixelRatio } from '../vendor/genre-police/renderer/output-resolution.mjs';
export function createRiffLayer(visual,riffStrings){
const riffStringsContext=riffStrings.getContext('2d');let riffStringsActive=false,riffPluckAt=-Infinity,riffPluckStrength=0,riffPluckDirection=1,currentTheme={};const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
function drawForegroundRiffStrings(metrics, time) {
  const metal = currentTheme.mode === 'metal';
  // This canvas only exists for the guitar-family string layer. Returning
  // before resize/clear avoids repainting a hidden 920×400 surface for every
  // Trance frame.
  if (currentTheme.id === 'country' || (!metal && currentTheme.mode !== 'rock')) {
    if (riffStringsActive && riffStrings.width && riffStrings.height) {
      riffStringsContext.clearRect(0, 0, riffStrings.width, riffStrings.height);
    }
    riffStringsActive = false;
    return;
  }
  riffStringsActive = true;
  const width = riffStrings.clientWidth;
  const height = riffStrings.clientHeight;
  if (!width || !height) return;
  const renderedWidth = riffStrings.getBoundingClientRect().width;
  const pixelRatio = presentationPixelRatio({
    designWidth: width,
    renderedWidth,
    devicePixelRatio: window.devicePixelRatio || 1
  });
  const pixelWidth = Math.round(width * pixelRatio);
  const pixelHeight = Math.round(height * pixelRatio);
  if (riffStrings.width !== pixelWidth || riffStrings.height !== pixelHeight) {
    riffStrings.width = pixelWidth;
    riffStrings.height = pixelHeight;
  }
  const ctx = riffStringsContext;
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const spectrum = visual.lastSpectrum?.outer || [];
  if (spectrum.length < 3) return;
  const center = visual.center();
  const spectrumRadii = spectrum.map((point) => Math.hypot(
    point.x - center.x,
    point.y - center.y
  ));
  const lineSpan = Math.max(...spectrumRadii) + 14;

  const count = 6;
  const spacing = metal ? 8.7 : 9.2;
  const rotation = currentTheme.id === 'country' ? -0.18 : -0.38;
  const tangent = { x: Math.cos(rotation), y: Math.sin(rotation) };
  const normal = { x: -tangent.y, y: tangent.x };
  const pulse = clamp(metrics.rhythmPulse || 0);
  const drive = metal
    ? clamp(metrics.mid * 0.4 + metrics.high * 0.38 + pulse * 0.38)
    : clamp(metrics.mid * 0.54 + metrics.high * 0.24 + pulse * 0.28);
  if (metrics.rhythmNow && time - riffPluckAt > 64) {
    riffPluckAt = time;
    riffPluckStrength = clamp(metrics.rhythmStrength ?? metrics.impact ?? pulse);
    riffPluckDirection *= -1;
  }

  ctx.save();
  // The strings are intentionally longer than the visual body. Clipping them
  // with the exact current spectrum polygon makes every visible endpoint the
  // live waveform edge, including during sharp peaks and concave notches.
  ctx.beginPath();
  spectrum.forEach((point, index) => {
    if (!index) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
  ctx.clip();
  ctx.lineCap = 'round';
  ctx.lineJoin = metal ? 'miter' : 'round';
  for (let stringIndex = 0; stringIndex < count; stringIndex += 1) {
    const offset = (stringIndex - (count - 1) * 0.5) * spacing;
    const left = {
      x: center.x - tangent.x * lineSpan + normal.x * offset,
      y: center.y - tangent.y * lineSpan + normal.y * offset
    };
    const right = {
      x: center.x + tangent.x * lineSpan + normal.x * offset,
      y: center.y + tangent.y * lineSpan + normal.y * offset
    };
    const sequenceIndex = riffPluckDirection > 0 ? stringIndex : count - 1 - stringIndex;
    const localPluckAge = time - riffPluckAt - sequenceIndex * (metal ? 6 : 9);
    const pluckEnvelope = localPluckAge >= 0
      ? Math.exp(-localPluckAge / (metal ? 92 : 138))
      : 0;
    const pluckOscillation = localPluckAge >= 0
      ? Math.sin(localPluckAge * (metal ? 0.135 : 0.094))
      : 0;
    const vibration = pluckOscillation * pluckEnvelope
      * (0.7 + riffPluckStrength * (metal ? 3.1 : 2.55));
    const points = [];
    const samples = metal ? 26 : 22;
    for (let sample = 0; sample <= samples; sample += 1) {
      const amount = sample / samples;
      const envelope = Math.sin(amount * Math.PI);
      const baseX = left.x + (right.x - left.x) * amount;
      const baseY = left.y + (right.y - left.y) * amount;
      const grit = metal
        ? Math.sin(amount * Math.PI * 8 + time * 0.008 + stringIndex * 0.78)
          * envelope * (0.08 + metrics.high * 0.22 + pulse * 0.14)
        : 0;
      const displacement = envelope * vibration + grit;
      points.push({
        x: baseX + normal.x * displacement,
        y: baseY + normal.y * displacement
      });
    }
    const trace = (normalShift = 0) => {
      ctx.beginPath();
      points.forEach((point, index) => {
        const px = point.x + normal.x * normalShift;
        const py = point.y + normal.y * normalShift;
        if (!index) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    };

    if (metal) {
      ctx.strokeStyle = currentTheme.accent2;
      ctx.globalAlpha = 0.18 + drive * 0.12 + pluckEnvelope * 0.16;
      ctx.lineWidth = 1.15 + drive * 0.32;
      ctx.shadowColor = currentTheme.accent2;
      ctx.shadowBlur = 6 + drive * 5;
      trace(1.45);
    }
    ctx.strokeStyle = stringIndex % 2 ? currentTheme.accent2 : currentTheme.accent;
    ctx.globalAlpha = (metal ? 0.47 : 0.4) + drive * (metal ? 0.17 : 0.14) + pluckEnvelope * 0.2;
    ctx.lineWidth = (metal ? 1.05 : 0.9) + drive * 0.24 + pluckEnvelope * 0.24;
    ctx.shadowColor = stringIndex % 2 ? currentTheme.accent2 : currentTheme.accent;
    ctx.shadowBlur = 6 + drive * 7 + pluckEnvelope * 4;
    trace();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

return (theme,metrics,time)=>{currentTheme=theme;drawForegroundRiffStrings(metrics,time);};
}
