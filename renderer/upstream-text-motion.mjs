// Generated original text filters, spring motion, glow, and impact layers.
import { resolveImpactFx } from '../vendor/genre-police/renderer/impact-fx.mjs';
import { visualFinish } from '../vendor/genre-police/renderer/visual-finish.mjs';
import { smoothMotionEnvelope } from '../vendor/genre-police/renderer/motion-envelope.mjs';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const dynamicStyleValues = new WeakMap();
function setDynamicStyleProperty(element, name, value) {
  const normalizedValue = String(value);
  let values = dynamicStyleValues.get(element);
  if (!values) {
    values = new Map();
    dynamicStyleValues.set(element, values);
  }
  if (values.get(name) === normalizedValue) return;
  values.set(name, normalizedValue);
  element.style.setProperty(name, normalizedValue);
}

function genreFilterValue({
  bilibiliMode,
  tranceMode,
  synthwaveMode,
  brightness,
  saturation,
  blur,
  distortion,
  glow,
  echoLeft,
  echoRight,
  echoBlur,
  echoAlpha
}) {
  if (bilibiliMode) return 'none';
  const exposure = `brightness(${brightness}) saturate(calc(${saturation} * var(--genre-extra-saturation, 1)))`;
  const hotGlow = `drop-shadow(0 0 var(--genre-hot-blur, 5px) color-mix(in srgb, var(--hot) var(--genre-hot-alpha, 55%), transparent))`;
  const accentGlow = `drop-shadow(0 0 ${glow}px color-mix(in srgb, var(--accent) var(--genre-accent-alpha, 74%), transparent))`;

  if (tranceMode) {
    return `${exposure} ${hotGlow} ${accentGlow} drop-shadow(var(--genre-depth-x, 2px) var(--genre-depth-y, 2px) var(--genre-depth-blur, 0px) color-mix(in srgb, var(--accent-2) var(--genre-depth-alpha, 42%), transparent))`;
  }
  if (synthwaveMode) {
    return `${exposure} drop-shadow(0 0 4px color-mix(in srgb, white 50%, transparent)) drop-shadow(0 0 var(--genre-hot-blur, 7px) color-mix(in srgb, var(--accent-2) var(--genre-hot-alpha, 52%), transparent)) drop-shadow(0 0 ${glow}px color-mix(in srgb, var(--accent) var(--genre-accent-alpha, 68%), transparent)) drop-shadow(2px 3px 0 color-mix(in srgb, #12052b 68%, var(--accent) 32%))`;
  }
  return `${exposure} blur(${blur}px) drop-shadow(${(-distortion * 3).toFixed(3)}px 0 0 color-mix(in srgb, var(--accent) 72%, transparent)) drop-shadow(${(distortion * 3).toFixed(3)}px 0 0 color-mix(in srgb, var(--accent-2) 72%, transparent)) ${hotGlow} ${accentGlow} drop-shadow(${echoLeft}px 0 ${echoBlur}px color-mix(in srgb, var(--accent) ${echoAlpha}%, transparent)) drop-shadow(${echoRight}px 0 ${echoBlur}px color-mix(in srgb, var(--accent-2) ${echoAlpha}%, transparent)) drop-shadow(var(--genre-depth-x, 2px) var(--genre-depth-y, 2px) var(--genre-depth-blur, 0px) color-mix(in srgb, var(--accent-2) var(--genre-depth-alpha, 42%), transparent))`;
}

export function createTextMotion(visual){
const genreLabel=document.querySelector('#genre'),genreFace=document.querySelector('#genre-face');let tranceTextPulse=0,genreVelocity=0,genreScale=1,genreLiftValue=0,lastForegroundStyleAt=0;
return (currentTheme,metrics,time,elapsedMs,playbackActive,fullscreenLayoutMode)=>{const frameScale=Math.min(2,elapsedMs/16.667),foregroundStyleDue=!lastForegroundStyleAt||time-lastForegroundStyleAt>=1000/60,stageOutputActive=true,bilibiliMode=false,asmrMode=false,asmrBreath=.5+.5*Math.sin(time*.00062),synthwaveMode=currentTheme.id==='synthwave',tranceMode=currentTheme.mode==='trance'&&currentTheme.family!=='classical'&&!['soundtrack','synthwave'].includes(currentTheme.id);
if(foregroundStyleDue)lastForegroundStyleAt=time;
  const rawTextPulse = playbackActive && !bilibiliMode ? clamp(metrics.rhythmPulse || 0) : 0;
  // The Trance canvas deliberately has continuous flow, so the title should
  // follow a continuous envelope as well. This also absorbs the brief audio
  // discontinuity produced when the player seeks to a new position.
  tranceTextPulse = tranceMode
    ? smoothMotionEnvelope(tranceTextPulse, rawTextPulse, elapsedMs, { attackMs: 38, releaseMs: 155 })
    : rawTextPulse;
  const textPulse = tranceMode ? tranceTextPulse : rawTextPulse;
  const genreFlare = playbackActive
    ? asmrMode
      ? 0.025 + asmrBreath * 0.055
      : Math.min(1, textPulse * (tranceMode ? 1.42 : 1.15))
    : 0;
  const impactFx = playbackActive
    ? resolveImpactFx(currentTheme, tranceMode ? { ...metrics, rhythmPulse: textPulse } : metrics)
    : { amount: 0, bloom: 0, blur: 0, echo: 0, chroma: 0, slice: 0, exposure: 1, saturation: 1 };
  const finish = visualFinish(currentTheme);
  const textFx = clamp(currentTheme.textFx ?? 1, 0, 1.15);
  const lineHot = clamp(impactFx.amount * .42 + genreFlare * .08);

  if (bilibiliMode) {
    const bilibiliGenreTarget = playbackActive
      ? 0.99
        + visual.bilibiliVoiceActivity * 0.008
        + visual.bilibiliSectionDrive * 0.028
        + visual.bilibiliTransientDrive * 0.05
      : 1;
    genreVelocity += (bilibiliGenreTarget - genreScale) * 0.18 * frameScale;
    genreVelocity *= 0.76 ** frameScale;
    genreScale += genreVelocity * frameScale;
    genreScale = Math.max(0.982, Math.min(1.078, genreScale));
  } else {
    if (playbackActive && metrics.rhythmNow && !asmrMode) {
      genreVelocity -= (tranceMode
        ? .003 + metrics.rhythmPulse * .009
        : .006 + metrics.rhythmPulse * .018) * finish.textMotion;
    }
    const genreTarget = playbackActive
      ? asmrMode
        ? 0.998 + asmrBreath * 0.01
        : 1 + textPulse * (tranceMode ? .052 : .048) * finish.textMotion
      : 1;
    genreVelocity += (genreTarget - genreScale) * 0.22 * frameScale;
    genreVelocity *= 0.69 ** frameScale;
    genreScale += genreVelocity * frameScale;
    genreScale = Math.max(.93, Math.min(1.145, genreScale));
  }
  const lockStackedGenreCenter = stageOutputActive && fullscreenLayoutMode === 'stacked';
  const genreLiftTarget = playbackActive && !lockStackedGenreCenter
    ? bilibiliMode
      ? 0
      : asmrMode
      ? -0.35 - asmrBreath * 0.55
      : -textPulse * (tranceMode ? 4.4 : 4.2) * finish.textMotion
    : 0;
  if (lockStackedGenreCenter) {
    genreLiftValue = 0;
  } else if (tranceMode) {
    const liftResponse = 1 - Math.exp(-frameScale * 0.18);
    genreLiftValue += (genreLiftTarget - genreLiftValue) * liftResponse;
  } else {
    genreLiftValue = genreLiftTarget;
  }
  const genreTranslateY = synthwaveMode && document.body.dataset.layout === 'poster'
    ? `calc(var(--genre-balance-y, 0px) + ${genreLiftValue.toFixed(2)}px)`
    : `calc(3px + var(--genre-balance-y, 0px) + ${genreLiftValue.toFixed(2)}px)`;
  const genreSkew = synthwaveMode
    ? 'skewX(-7deg) '
    : document.body.dataset.family === 'hardstyle'
      ? 'skewX(-4deg) '
      : '';
  const nextGenreTransform = `${genreSkew}translateY(${genreTranslateY}) scale(${genreScale.toFixed(4)})`;
  if (genreLabel.style.transform !== nextGenreTransform) genreLabel.style.transform = nextGenreTransform;
  const textBaseGlow = bilibiliMode ? 0 : Number(currentTheme.textBaseGlow ?? 18);
  const textSliceFx = clamp(currentTheme.textSliceFx ?? textFx, 0.05, 1.15) * finish.textGlow;
  const textEchoFx = clamp(currentTheme.textEchoFx ?? textFx, 0.05, 1.15) * finish.textGlow;
  const textMotionGate = playbackActive && !bilibiliMode ? 1 : 0;
  const gentleHardcore = currentTheme.mode === 'hardcore'
    && ['happy-hardcore', 'uk-hardcore'].includes(currentTheme.id);
  const distortedGenre = (['hardcore', 'hardstyle'].includes(currentTheme.mode) && !gentleHardcore)
    || currentTheme.mode === 'phonk'
    || currentTheme.id === 'industrial-metal';
  const genreGlow = (textBaseGlow + (genreFlare * 11 + impactFx.bloom * 18) * textFx) * finish.textGlow;
  const genreBrightness = Math.min(finish.maxBrightness, 1 + (genreFlare * .2 + impactFx.exposure - 1) * textFx);
  const genreSaturation = 1 + (genreFlare * .12 + impactFx.saturation - 1) * textFx;
  const genreBlur = impactFx.blur * .72 * textFx * finish.textGlow;
  const genreDistortion = playbackActive && distortedGenre ? metrics.rhythmPulse : 0;
  const genreEchoLeft = -impactFx.echo * 8 * textEchoFx * textMotionGate;
  const genreEchoRight = impactFx.echo * 8 * textEchoFx * textMotionGate;
  const genreEchoBlur = impactFx.bloom * 12 * textEchoFx * textMotionGate;
  const genreEchoAlpha = Math.min(42, impactFx.echo * 72 * textEchoFx * textMotionGate);
  const nextGenreFilter = genreFilterValue({
    bilibiliMode,
    tranceMode,
    synthwaveMode,
    brightness: genreBrightness.toFixed(3),
    saturation: genreSaturation.toFixed(3),
    blur: genreBlur.toFixed(3),
    distortion: genreDistortion,
    glow: genreGlow.toFixed(2),
    echoLeft: genreEchoLeft.toFixed(2),
    echoRight: genreEchoRight.toFixed(2),
    echoBlur: genreEchoBlur.toFixed(2),
    echoAlpha: genreEchoAlpha.toFixed(1)
  });
  if (genreFace.style.filter !== nextGenreFilter) genreFace.style.filter = nextGenreFilter;
  if (foregroundStyleDue) {
    setDynamicStyleProperty(genreLabel, '--impact-slice-left', `${((-impactFx.slice * 9 - impactFx.chroma * 3) * textSliceFx * textMotionGate).toFixed(2)}px`);
    setDynamicStyleProperty(genreLabel, '--impact-slice-right', `${((impactFx.slice * 9 + impactFx.chroma * 3) * textSliceFx * textMotionGate).toFixed(2)}px`);
    setDynamicStyleProperty(genreLabel, '--impact-slice-opacity', Math.min(.68, (impactFx.slice * .72 + impactFx.chroma * .28) * textSliceFx * textMotionGate).toFixed(3));
    setDynamicStyleProperty(genreLabel, '--impact-ghost-blur', `${(impactFx.blur * 2.2 * textSliceFx * textMotionGate).toFixed(2)}px`);
  }
  if (foregroundStyleDue) {
    setDynamicStyleProperty(
      document.documentElement,
      '--distortion',
      genreDistortion.toFixed(3)
    );
  }

};
}
