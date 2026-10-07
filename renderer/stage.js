import { ScreenImpact } from "./screen-impact.mjs";
const screenImpact = new ScreenImpact();
const exporting = new URLSearchParams(location.search).has("export");
let exportPacket = null;
let brandAnchor = null;
let brandLayoutTransition = false;
import { RhythmClock } from "./rhythm-clock.mjs";
const rhythmClock = new RhythmClock();
let lastSignalAt = -Infinity;
import { VisualEngine } from "../vendor/genre-police/renderer/visual-engine.js";
import { AudioEngine } from "../vendor/genre-police/renderer/audio-engine.js";
import { applyVisualResponse } from "../vendor/genre-police/renderer/audio-response.mjs";
import { applyImpactLevel, impactPresentation } from "./impact-level.mjs";
import { synthwaveAudioResponse } from "../vendor/genre-police/renderer/synthwave-response.mjs";
import { KawaiiExpressionTracker } from "../vendor/genre-police/renderer/kawaii-expression.mjs";
import { visualFinish } from "../vendor/genre-police/renderer/visual-finish.mjs";
import { createRiffLayer } from "./upstream-riff.mjs";
import { createTypography } from "./upstream-typography.mjs";
import { createTextMotion } from "./upstream-text-motion.mjs";
import { scheduleFrame } from "../vendor/genre-police/renderer/frame-rate-limit.mjs";
import { outputFrameInterval } from "./output-frame-rate.mjs";
import { translate, setLanguage, readingLanguageFor } from "./i18n.mjs";
import { stageGeometry, visualSizeScale } from "./stage-geometry.mjs";
import { AdaptiveResolution } from "./adaptive-resolution.mjs";
const $ = (id) => document.getElementById(id),
  root = document.documentElement,
  body = document.body,
  app = $("app");
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number(v) || 0));
class NativeAudio extends AudioEngine {
  installOutputDeviceMonitor() {}
  async initialize() {
    this.localGenreModelEnabled = false;
    this.context = new AudioContext({
      sampleRate: 44100,
      latencyHint: "interactive",
    });
    await this.context.audioWorklet.addModule("pcm-worklet.js");
    this.node = new AudioWorkletNode(this.context, "native-pcm", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.64;
    this.analyser.minDecibels = -92;
    this.analyser.maxDecibels = -18;
    this.beatAnalyser = this.context.createAnalyser();
    this.beatAnalyser.fftSize = 1024;
    this.beatAnalyser.smoothingTimeConstant = 0.08;
    this.beatAnalyser.minDecibels = -92;
    this.beatAnalyser.maxDecibels = -18;
    this.frequency = new Uint8Array(this.analyser.frequencyBinCount);
    this.waveform = new Uint8Array(this.analyser.fftSize);
    this.beatFrequency = new Uint8Array(this.beatAnalyser.frequencyBinCount);
    this.beatPrevious = new Uint8Array(this.beatAnalyser.frequencyBinCount);
    this.node.connect(this.analyser);
    this.node.connect(this.beatAnalyser);
    const mute = this.context.createGain();
    mute.gain.value = 0;
    this.analyser.connect(mute);
    this.beatAnalyser.connect(mute);
    mute.connect(this.context.destination);
    await this.context.resume();
  }
}
const audio = new NativeAudio(),
  visual = new VisualEngine($("visualizer")),
  riff = createRiffLayer(visual, $("riff-strings")),
  kawaii = new KawaiiExpressionTracker();
const fitTypography = createTypography(),
  textMotion = createTextMotion(visual),
  adaptiveResolution = new AdaptiveResolution();
let scene = null,
  theme = null,
  themeKey = "",
  lastFrame = 0,
  lastStyle = 0,
  phase = 0,
  orbit = 0,
  soft = 0,
  travel = 0,
  energy = 0,
  impact = 0,
  fade = [],
  lastArt = "",
  nextFrame = 0,
  frameInterval = -1,
  fpsStartedAt = 0,
  fpsFrames = 0;
let animationRequest = 0, animationStarted = false, renderActive = true;
let firstScenePainted = false;
function resolutionScale(time) {
  const settings = scene?.settings || {};
  const lowPower = settings.performanceMode === 'low';
  const auto = settings.renderScale === "auto";
  const context = [themeKey, innerWidth, innerHeight, devicePixelRatio,
    settings.fullscreenLayout, settings.visualSize, settings.textVisible, settings.frameRateLimit,lowPower].join(":");
  const adaptive = adaptiveResolution.prepare({context, time,
    active: auto && scene?.outputVisible && !scene?.blackout && Boolean(scene?.active || !scene?.standby || scene?.externalOutput),
    frameRateLimit: settings.frameRateLimit,lowPower});
  const fixed = [1, .75, .5].includes(settings.renderScale) ? settings.renderScale : 1;
  return auto ? adaptive : Math.min(fixed,lowPower ? .75 : 1);
}
function applyResolution(value) {
  if (Math.abs(visual.outputResolutionScale - value) < .005) return;
  // The upstream automatic setter intentionally floors at .75; keep VJ's
  // explicit 50% manual option while sharing the backing-store resize path.
  visual.outputResolutionScale = value;
  visual.resize();
}
function scale() {
  brandAnchor = null;
  const size = visualSizeScale(scene?.settings.visualSize);
  const g = stageGeometry(innerWidth, innerHeight, scene?.settings.fullscreenLayout || "split", scene?.settings.visualSize);
  const {scale: s, x, y, designHeight} = g;
  let {stackY,hudTop} = g;
  if (scene?.settings.trackInfoVisible === false && scene?.settings.fullscreenLayout === "stacked") {
    const headingHeight = $("hud").offsetHeight || 72;
    const total = 200 * size + 28 + headingHeight;
    stackY = (designHeight - total) / 2 + 100 * size - designHeight * 0.025;
    hudTop = stackY + 100 * size + 28;
  }
  const p = {
    "--stage-output-scale": s,
    "--visual-size-scale": size,
    "--stage-split-hud-left": 330 + (size - 1) * 120 + "px",
    "--stage-design-height": designHeight + "px",
    "--stage-stack-y": stackY + "px",
    "--stage-hud-top": hudTop + "px",
    "--stage-center-y": designHeight / 2 + "px",
    "--stage-visual-left": -x + "px",
    "--stage-visual-top": -y + "px",
    "--stage-visual-width": 920 + 2 * x + "px",
    "--stage-visual-height": designHeight + 2 * y + "px",
    "--stage-split-visual-center-x": 206 + x + "px",
    "--stage-split-visual-center-y": 200 + y - (scene?.settings.trackInfoVisible === false ? 10 : 0) + "px",
    "--stage-stacked-visual-center-x": 460 + x + "px",
    "--stage-stacked-visual-center-y": stackY + y + "px",
    "--stage-hidden-visual-center-y": designHeight / 2 + y + "px",
    "--fullscreen-heading-left": (40 - g.left) / s - 180 + "px",
    "--fullscreen-heading-top": (32 - g.top) / s - hudTop + "px",
  };
  for (const [k, v] of Object.entries(p)) root.style.setProperty(k, v);
  visual.outputResolutionScale = resolutionScale(performance.now());
  visual.resize();
}
function identity(el, t) {
  for (const k of ["family", "mode", "genre"])
    el.dataset[k] = k === "genre" ? t.id : t[k];
  for (const [k, v] of Object.entries({
    "--accent": t.accent,
    "--accent-2": t.accent2,
    "--hot": t.hot,
  }))
    el.style.setProperty(k, v);
}
function setTheme(next, key) {
  if (key === themeKey) return;
  for (const a of fade) a.cancel();
  const previous = $("themed-backdrop-previous"),
    back = $("poster-backdrop");
  if (theme) {
    identity(previous, theme);
    previous.style.visibility = "visible";
  }
  theme = next;
  themeKey = key;
  const inkTint = [
    "hardcore",
    "hardstyle",
    "metal",
    "dubstep",
    "trap",
    "phonk",
  ].includes(theme.mode)
    ? 19
    : 14;
  for (const [k, v] of Object.entries({
    "--accent": theme.accent,
    "--accent-2": theme.accent2,
    "--hot": theme.hot,
    "--genre-font": theme.font,
    "--genre-weight": theme.fontWeight || 700,
    "--genre-letter-spacing": theme.letterSpacing || "-.5px",
    "--genre-ink":
      theme.genreInk ||
      `color-mix(in srgb, ${theme.hot} ${100 - inkTint}%, ${theme.accent2} ${inkTint}%)`,
    "--genre-ink-2":
      theme.genreInk2 ||
      `color-mix(in srgb, ${theme.hot} 91%, ${theme.accent} 9%)`,
    "--genre-ink-edge":
      theme.genreInkEdge ||
      `color-mix(in srgb, ${theme.accent2} 62%, ${theme.accent} 38%)`,
  }))
    root.style.setProperty(k, v);
  const finish = visualFinish(theme),
    fx = clamp(theme.textFx ?? 1, 0, 1.15);
  root.style.setProperty(
    "--genre-ink-alpha",
    Math.min(100, 70 + fx * 30) + "%",
  );
  root.style.setProperty(
    "--genre-hot-alpha",
    Math.min(68, fx * 55) * finish.textGlow + "%",
  );
  root.style.setProperty(
    "--genre-accent-alpha",
    Math.min(86, fx * 74) * Math.sqrt(finish.textGlow) + "%",
  );
  body.dataset.genre = theme.id;
  body.dataset.mode = theme.mode;
  body.dataset.family = theme.family;
  identity(back, theme);
  audio.setGenreTheme(theme);
  visual.setTheme(theme);
  kawaii.reset();
  $("genre-face").textContent = theme.hudLabel || theme.label;
  $("genre").dataset.text = theme.hudLabel || theme.label;
  $("parent-genre").textContent = theme.parent || theme.family.toUpperCase();
  const timing = {
    duration: 760,
    easing: "cubic-bezier(.16,1,.3,1)",
    fill: "forwards",
  };
  fade = [
    previous.animate([{ opacity: 1 }, { opacity: 0 }], timing),
    back.animate([{ opacity: 0 }, { opacity: 1 }], timing),
  ];
}
function receiveScene(next) {
  const reset = scene?.active && !next.active,
    changed =
      scene?.themeKey !== next.themeKey || scene?.track?.id !== next.track?.id;
  scene = next;
  setLanguage(next.settings.language);
  body.dataset.standby = String(next.standby);
  const neutralStandby = next.standby && next.themeKey === "neutral";
  body.dataset.neutralStandby = String(neutralStandby);
  if (reset) audio.node?.port.postMessage({ reset: true });
  body.dataset.fullscreenEnglish = next.settings.fullscreenCondensed ? "condensed" : "regular";
  body.dataset.fullscreenLayout = next.settings.fullscreenLayout || "split";
  setTheme(next.theme, next.themeKey);
  const mode = next.settings.headingMode || (next.settings.showDjName ? "dj" : "genre");
  const logo = mode === "logo" && next.djLogo;
  $("dj-logo").hidden = !logo;
  if (logo && $("dj-logo").getAttribute("src") !== logo) $("dj-logo").src = logo;
  if (!logo) $("dj-logo").removeAttribute("src");
  root.style.setProperty("--dj-logo-height", (72 * (next.djLogoScale || 1)) + "px");
  body.dataset.headingMode = logo ? "logo" : mode === "hidden" ? "hidden" : "text";
  body.dataset.trackInfo = String(next.settings.trackInfoVisible !== false);
  body.dataset.artworkVisible = String(next.settings.artworkVisible !== false);
  body.dataset.brandingVisible = String(next.settings.brandingVisible !== false);
  const djHeading = (mode === "dj" || mode === "logo") && next.djName?.trim();
  body.dataset.headingKind = djHeading ? "dj" : "genre";
  const label = djHeading || (next.standby
    ? "STANDBY"
    : theme.hudLabel || theme.label);
  $("genre-face").textContent = label;
  $("genre").dataset.text = label;
  $("genre").lang = djHeading ? readingLanguageFor(label, label, next.settings.language, theme.id) : "en";
  $("parent-genre").textContent = next.standby || djHeading ? "" : theme.parent || theme.family.toUpperCase();
  root.style.setProperty("--genre-font", neutralStandby ? '"Space Grotesk"' : theme.font);
  root.style.setProperty("--output-brightness", next.settings.brightness);
  body.classList.toggle("blackout", next.blackout);
  body.dataset.stageOutputText = String(next.settings.textVisible && !(mode === "hidden" && next.settings.trackInfoVisible === false));
  $("title").querySelector(".title-scroll-text").textContent =
    next.track?.title ||
    translate(next.settings.language, "等待音乐", "WAITING FOR MUSIC");
  $("artist").textContent = next.track?.artist || "";
  const readingContext = `${next.track?.title || ''} ${next.track?.artist || ''}`;
  for (const id of ["title", "artist"]) {
    $(id).lang = readingLanguageFor($(id).textContent, readingContext, next.settings.language, theme.id);
  }
  const art = next.customArtwork || next.track?.artwork || "";
  if (art !== lastArt) {
    lastArt = art;
    $("artwork").classList.remove("loaded");
    if (art) $("artwork").src = art;
    else $("artwork").removeAttribute("src");
  }
  scale();
  refreshTypography();
  if (!firstScenePainted) {
    firstScenePainted = true;
    requestAnimationFrame(() => requestAnimationFrame(() => window.autovj.stagePainted()));
  }
  if (changed) {
    $("hud").classList.remove("entering");
    void $("hud").offsetWidth;
    $("hud").classList.add("entering");
    clearTimeout(refreshTypography.timer);
    refreshTypography.timer = setTimeout(
      () => $("hud").classList.remove("entering"),
      1100,
    );
  }
}
window.autovj.onScene(receiveScene);
$("dj-logo").onload = () => scale();
$("artwork").onload = () => $("artwork").classList.add("loaded");
window.autovj.onPCM((frame) => {
  if (scene?.active && audio.node) {
    let sum=0;for(const sample of frame.samples)sum+=sample*sample;
    if(frame.samples.length && Math.sqrt(sum/frame.samples.length)>.0001) lastSignalAt=performance.now();
    audio.node.port.postMessage({ samples: frame.samples });
  }
  window.autovj.ackPCM();
});
window.autovj.onLink(e => rhythmClock.setLink(e));
window.autovj.onRhythm(e => {
  audio.setModelAssist(rhythmClock.source(scene?.settings||{},performance.timeOrigin+performance.now()) === "audio" ? e : {type:"disabled"});
  rhythmClock.setModel(e, performance.timeOrigin + performance.now());
});
window.autovj.onRenderActive(active => {
  renderActive = Boolean(active);
  body.classList.toggle('render-paused',!renderActive);
  if (!renderActive) { cancelAnimationFrame(animationRequest); adaptiveResolution.suspend(performance.now()); }
});
function fitStageTypography() {
  fitTypography();
  if (body.dataset.headingKind !== "dj") return;
  // Upstream genre labels have a 25px minimum. User-entered DJ names can be
  // longer, so allow only these headings to shrink further without clipping.
  const heading = $("genre"), face = $("genre-face");
  const width = heading.clientWidth * 0.94;
  for (let pass = 0; pass < 3 && width > 0 && face.scrollWidth > width + 1; pass++) {
    const size = parseFloat(getComputedStyle(heading).fontSize);
    heading.style.fontSize = `${Math.max(1, size * width / face.scrollWidth).toFixed(2)}px`;
  }
}
function refreshTypography() {
  // Chromium may defer animation callbacks on a hidden output window. Fit
  // immediately so its captured console preview also uses the current name.
  fitStageTypography();
  scale();
  document.fonts.ready.then(() => { fitStageTypography(); scale(); });
}
window.addEventListener("resize", () => {
  scale();
  refreshTypography();
});
window.autovj.onOutputResume(() => {
  adaptiveResolution.suspend(performance.now());
  scale();
  refreshTypography();
  if (!animationStarted || !renderActive) return;
  cancelAnimationFrame(animationRequest);
  nextFrame = 0;
  lastFrame = performance.now();
  // Draw once immediately after the native surface becomes visible, then
  // resume exactly one animation loop (including repeated fullscreen shows).
  animate(lastFrame);
});
for (const event of ['transitionrun', 'transitionend', 'transitioncancel']) {
  $('hud').addEventListener(event, e => {
    if (e.target === $('hud') && e.propertyName === 'transform') {
      brandLayoutTransition = event === 'transitionrun';
      brandAnchor = null;
    }
  });
}
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyX" && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey) window.autovj.call("settings", {screenImpact: !scene?.settings.screenImpact});
  if (e.code === "Escape") window.autovj.hideOutput();
});
window.addEventListener("error", (e) => window.autovj.stageError(e.message));
window.addEventListener("unhandledrejection", (e) =>
  window.autovj.stageError(e.reason?.message || e.reason),
);
function animate(time) {
  if (!renderActive) return;
  if (!exporting) animationRequest = requestAnimationFrame(animate);
  if (!theme) return;
  const interval = outputFrameInterval(scene);
  if (interval !== frameInterval) {
    frameInterval = interval;
    nextFrame = fpsStartedAt = fpsFrames = 0;
  }
  const scheduled = scheduleFrame(time, nextFrame, interval);
  nextFrame = scheduled.deadline;
  if (!exporting && !scheduled.due) return;
  applyResolution(resolutionScale(time));
  const workStartedAt = performance.now();
  const rawInterval = time - lastFrame;
  const dt = clamp(time - lastFrame, 4, 80);
  lastFrame = time;
  if (rhythmClock.prepare(scene?.settings || {}, performance.timeOrigin + time, Boolean(scene?.active))) {
    screenImpact.reset();
    audio.resetDetectionState();
    audio.setModelAssist({type:"disabled"});
  }
  if (exportPacket) {
    for (const e of exportPacket.rhythm) {
      audio.setModelAssist(e);
      rhythmClock.setModel(e, performance.timeOrigin + e.time);
    }
  }
  let metrics = scene?.active ? audio.update(time) : audio.emptyMetrics();
  // Raw waveform threshold, independent of adaptive visual gain.
  const signal=scene?.active && (exporting ? exportPacket?.signal : performance.now()-lastSignalAt<150);
  metrics = rhythmClock.update(metrics, scene?.settings || {}, performance.timeOrigin + time, Boolean(scene?.active), signal);
  const impactLevel = scene?.settings.impactLevel || 'medium';
  const hit = screenImpact.update(metrics, time, Boolean(scene?.settings.screenImpact && scene?.active && signal && !scene?.blackout), scene?.settings.impactMode, impactLevel);
  const layer = $("screen-impact-layer");
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const presentation = impactPresentation(scene?.active && signal && !scene?.blackout ? metrics : {}, impactLevel, reduced);
  root.style.setProperty('--visual-impact-scale', presentation.visualScale);
  root.style.setProperty('--title-impact-scale', presentation.titleScale);
  const motion = hit.motion * (reduced ? .25 : 1);
  const brand = document.querySelector('.jurisdiction');
  if (!brandAnchor || brandLayoutTransition) {
    layer.style.transform = 'none';
    brand.style.transform = 'none';
    const rect = brand.getBoundingClientRect();
    brandAnchor = {x: rect.left, y: rect.top, scale: stageGeometry(innerWidth, innerHeight, scene?.settings.fullscreenLayout || 'split', scene?.settings.visualSize).scale};
  }
  // Conjugate the inverse viewport transform into the brand's local space.
  // This anchors the existing text without cloning it or losing theme styling.
  if (motion > .001) {
    const zoom = 1 + motion * .065;
    const skew = Math.tan(Math.sin(hit.age * .045) * motion * .7 * Math.PI / 180);
    const cx = innerWidth / 2, cy = innerHeight / 2;
    const inverse = new DOMMatrix([zoom, 0, zoom * skew, zoom, cx - zoom * cx - zoom * skew * cy, cy - zoom * cy]).inverse();
    const {x, y, scale: s} = brandAnchor;
    const point = inverse.transformPoint({x, y});
    brand.style.transformOrigin = '0 0';
    brand.style.transform = `matrix(${inverse.a},${inverse.b},${inverse.c},${inverse.d},${(point.x-x)/s},${(point.y-y)/s})`;
  } else {
    brand.style.transform = 'none';
  }
  layer.style.transform = motion > .001 ? `scale(${1 + motion * .065}) skewX(${Math.sin(hit.age * .045) * motion * .7}deg)` : 'none';
  const rgb = !reduced && scene?.settings.performanceMode !== 'low' ? hit.rgb : 0;
  $('screen-rgb-red').setAttribute('dx', rgb.toFixed(2));
  $('screen-rgb-blue').setAttribute('dx', (-rgb).toFixed(2));
  layer.style.filter = rgb > .15 ? 'url(#screen-rgb)' : 'none';
  $("screen-impact-flash").style.opacity = String(hit.flash * (reduced ? .025 : .12));
  metrics = applyVisualResponse(
    metrics,
    { calm: "gentle", standard: "standard", energetic: "strong" }[
      scene?.settings.intensity
    ],
  );
  metrics = applyImpactLevel(metrics, scene?.settings.impactLevel || "medium");
  if (theme.id === "synthwave")
    metrics = {
      ...metrics,
      synthwaveResponse: synthwaveAudioResponse(metrics),
    };
  visual.render(metrics, time);
  riff(theme, metrics, time);
  if (scene.settings.textVisible)
    textMotion(
      theme,
      metrics,
      time,
      dt,
      scene.active,
      scene.settings.fullscreenLayout || "split",
    );
  const pulse = clamp(metrics.rhythmPulse),
    target = scene?.active
      ? clamp((metrics.relativeEnergy - 0.72) / 1.06) * 0.52 +
        clamp(metrics.volume) * 0.2 +
        clamp(metrics.drive) * 0.28
      : 0;
  energy +=
    (target - energy) * (1 - Math.exp(-dt / (target > energy ? 260 : 920)));
  impact +=
    (pulse - impact) * (1 - Math.exp(-dt / (pulse > impact ? 32 : 190)));
  phase = (phase + dt * (0.004 + energy * 0.01)) % 360;
  orbit = (orbit + dt * (0.0022 + energy * 0.0055)) % 360;
  soft = (soft + dt * (0.00042 + energy * 0.00105)) % 360;
  travel += dt * (0.012 + energy * 0.032);
  if (time - lastStyle > (scene.settings.performanceMode === 'low' ? 100 : 50)) {
    lastStyle = time;
    const depth = (travel * 0.014) % 1;
    const props = {
      "--poster-energy": energy,
      "--poster-impact": impact,
      "--poster-bass": clamp(metrics.bass),
      "--poster-phase": phase + "deg",
      "--poster-phase-quarter": orbit + "deg",
      "--poster-phase-soft": soft + "deg",
      "--poster-vortex-phase": (visual.tranceArmPhase || 0) + "rad",
      "--poster-flow-slow": travel + "px",
      "--poster-flow-reverse": -travel * 0.72 + "px",
      "--poster-flow-fast": travel * 2.35 + "px",
      "--poster-line-phase-a": (travel % 67) + "px",
      "--poster-line-phase-b": ((((-travel * 0.72) % 79) + 79) % 79) + "px",
      "--poster-line-phase-c": ((((-travel * 0.72) % 63) + 63) % 63) + "px",
      "--poster-depth-scale-a": 0.72 + depth * 0.64,
      "--poster-depth-scale-b": 0.72 + ((depth + 0.5) % 1) * 0.64,
      "--poster-depth-opacity-a":
        Math.sin(Math.PI * depth) ** 1.35 * (0.15 + energy * 0.16),
      "--poster-depth-opacity-b":
        Math.sin(Math.PI * ((depth + 0.5) % 1)) ** 1.35 *
        (0.15 + energy * 0.16),
    };
    for (const [k, v] of Object.entries(props)) app.style.setProperty(k, v);
    for (const [name, frequency, base, range] of [
      ["drift", 0.00019, 1.2, 2.2],
      ["float", 0.00019, 4.2, 7.2],
      ["wave", 0.00078, 12, 14],
      ["swing", 0.0022, 1.1, 2.7],
      ["wobble", 0.0034, 1.4, 4.8],
    ]) {
      app.style.setProperty(
        "--poster-" + name + "-x",
        Math.sin(time * frequency) * (base + energy * range) + "px",
      );
      app.style.setProperty(
        "--poster-" + name + "-y",
        Math.cos(time * frequency * 0.8) *
          (base * 0.72 + energy * range * 0.7) +
          "px",
      );
    }
    app.style.setProperty(
      "--trance-artwork-clarity",
      clamp(
        (visual.tranceEnergy || 0) * 0.42 + clamp(metrics.kickPulse) * 0.72,
      ),
    );
  }
  $("core-art").style.transform =
    theme.mode === "trance"
      ? `rotate(${visual.tranceArmPhase || 0}rad)`
      : `scale(${theme.id === "synthwave" ? 1 : 1 + pulse * 0.06})`;
  if (theme.id === "kawaii-bass") {
    const k = kawaii.update(metrics, time, dt / 16.667, true);
    $("kawaii-face").style.setProperty("--kawaii-open", k.expression);
    $("kawaii-face").style.setProperty("--kawaii-energy", k.energy);
    $("kawaii-face").style.setProperty("--kawaii-pulse", pulse);
    $("kawaii-face").style.setProperty("--kawaii-wave-scale", 1 + pulse * 0.06);
  }
  const resolution = adaptiveResolution.sample({time, interval: rawInterval, workMs: performance.now() - workStartedAt});
  if (resolution && scene.settings.renderScale === "auto") applyResolution(resolution.scale);
  if (scene.settings.showFps) {
    if (!fpsStartedAt) { fpsStartedAt = time; fpsFrames = 0; }
    else {
      fpsFrames++;
      const elapsed = time - fpsStartedAt;
      if (elapsed >= 1000) {
        window.autovj.reportPerformance({fps: fpsFrames * 1000 / elapsed});
        fpsStartedAt = time;
        fpsFrames = 0;
      }
    }
  } else fpsStartedAt = fpsFrames = 0;
}
if (exporting) {
  let exportStamp;
  body.dataset.offlineExport = "true";
  audio.context = {sampleRate:44100};
  audio.frequency = new Uint8Array(1024); audio.waveform = new Uint8Array(2048);
  audio.beatFrequency = new Uint8Array(512); audio.beatPrevious = new Uint8Array(512);
  audio.analyser = {getByteFrequencyData:a=>a.set(exportPacket.frequency),getByteTimeDomainData:a=>a.set(exportPacket.waveform)};
  audio.beatAnalyser = {getByteFrequencyData:a=>a.set(exportPacket.beatFrequency)};
  window.exportStage = {
    async initialize(next,viewport) {
      // Reserve a four-pixel compositor synchronization gutter outside the
      // video. Layout and effects still see precisely the requested viewport.
      if(viewport){
        Object.defineProperty(window,'innerWidth',{value:viewport.width,configurable:true});
        Object.defineProperty(window,'innerHeight',{value:viewport.height,configurable:true});
        document.body.style.width=viewport.width+'px';
        document.body.style.height=viewport.height+'px';
        $('screen-impact-layer').style.width=viewport.width+'px';
        $('screen-impact-layer').style.height=viewport.height+'px';
        const stamp=document.createElement('canvas');stamp.width=64;stamp.height=4;
        stamp.style.cssText=`position:fixed;left:0;top:${viewport.height}px;width:64px;height:4px;z-index:2147483647;pointer-events:none`;
        document.body.append(stamp);exportStamp=stamp.getContext('2d');
      }
      receiveScene(next);
      await document.fonts.ready;
      await Promise.all(Array.from(document.images, image=>image.src ? image.decode().catch(()=>{}) : Promise.resolve()));
      clearTimeout(refreshTypography.timer);
      $('hud').classList.remove('entering');
      for(const animation of fade) animation.cancel();
      $('themed-backdrop-previous').style.visibility='hidden';
      $('poster-backdrop').style.opacity='1';
      // The first encoded frame is the prepared scene, not a live scene switch.
      // Keep theme motion on song time without its initial blank-canvas fade.
      visual.transitionSnapshot = null;
      visual.transitionStartedAt = 0;
      refreshTypography();
      rhythmClock.prepare(next.settings,performance.timeOrigin,true);
      audio.resetDetectionState();audio.setModelAssist({type:'ready'});
    },
    async frame(packet) {
      window.exportTime=packet.time;exportPacket=packet;
      animate(packet.time);
      // CSS/WAAPI and canvas share the same song time. No wall-clock animations
      // can race the frame capture on a slow machine.
      for(const animation of document.getAnimations()) {
        animation.pause();animation.currentTime=packet.time;
      }
      if(exportStamp)for(let bit=0;bit<32;bit++){
        exportStamp.fillStyle=(packet.frameId>>>bit)&1?'#fff':'#000';
        exportStamp.fillRect(bit*2,0,2,4);
      }
    }
  };
} else audio
  .initialize()
  .catch((e) => window.autovj.stageError("实时音频图初始化失败：" + e.message))
  .finally(() => {
    scale();
    window.autovj.stageReady();
    animationStarted = true;
    animationRequest = requestAnimationFrame(animate);
  });
