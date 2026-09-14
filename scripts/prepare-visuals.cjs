"use strict";
const fs = require("node:fs"),
  path = require("node:path");
const root = process.env.AUTOVJ_IMPORT_ROOT || path.resolve(__dirname, ".."),
  source = path.join(root, "vendor/genre-police/renderer");
const html = fs.readFileSync(path.join(source, "index.html"), "utf8");
const ornament = html.slice(
  html.indexOf('      <div id="themed-backdrop-previous"'),
  html.indexOf('      <section id="hud">'),
);
if (!ornament.includes("kawaii-face") || ornament.includes("<script"))
  throw new Error(
    "Upstream stage DOM changed; review adapter before upgrading",
  );
const body = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; worker-src 'self'; connect-src 'self'"><title>Genre Police AutoVJ · Output</title><link rel="stylesheet" href="../vendor/genre-police/renderer/stage-styles.css"><link rel="stylesheet" href="stage.css"></head><body data-stage-output="true" data-stage-output-text="false" data-background-style="themed" data-layout="side" data-fullscreen-layout="split" data-playback="playing"><main id="app">${ornament}<section id="hud"><div class="jurisdiction"><span class="unit-mark"></span><span>GENRE POLICE</span><span>AUTO VJ</span></div><div id="parent-genre"></div><h1 id="genre"><span id="genre-face"></span></h1><div class="track-details"><div class="track-rule"></div><div id="title"></div><div id="artist"></div></div></section></main><div id="blackout"></div><script type="module" src="stage.js"></script></body></html>`;
fs.mkdirSync(path.join(root, "renderer"), { recursive: true });
fs.writeFileSync(
  path.join(root, "renderer/stage.html"),
  body
    .replace(
      'data-stage-output-text="false"',
      'data-stage-output-text="true" data-fullscreen-english="condensed"',
    )
    .replace(
      '<div id="title"></div>',
      '<div id="title"><span class="title-scroll-text"></span></div>',
    ),
);
const app = fs
  .readFileSync(path.join(source, "app.js"), "utf8")
  .replaceAll("\r\n", "\n");
const start = app.indexOf(
    "function drawForegroundRiffStrings(metrics, time) {",
  ),
  end = app.indexOf("\nfunction setPlayPauseIcon(", start);
if (start < 0 || end < 0)
  throw new Error("Upstream guitar ornament changed; review adapter");
fs.writeFileSync(
  path.join(root, "renderer/upstream-riff.mjs"),
  `// Generated from the pinned Genre Police app.js. Run scripts/prepare-visuals.cjs.\nimport { presentationPixelRatio } from '../vendor/genre-police/renderer/output-resolution.mjs';\nexport function createRiffLayer(visual,riffStrings){\nconst riffStringsContext=riffStrings.getContext('2d');let riffStringsActive=false,riffPluckAt=-Infinity,riffPluckStrength=0,riffPluckDirection=1,currentTheme={};const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));\n${app.slice(start, end)}\nreturn (theme,metrics,time)=>{currentTheme=theme;drawForegroundRiffStrings(metrics,time);};\n}\n`,
);
console.log("Prepared the original stage ornaments and guitar layer.");
function between(start, end) {
  const a = app.indexOf(start),
    b = app.indexOf(end, a + start.length);
  if (a < 0 || b < 0)
    throw new Error("Upstream typography adapter changed: " + start);
  return app.slice(a, b);
}
const typeFunctions = between(
  "function textInkBounds(",
  "\nfunction scheduleGenreFit(",
);
const marquee = between("function updateTitleOverflow() {", "\nfunction ");
fs.writeFileSync(
  path.join(root, "renderer/upstream-typography.mjs"),
  `// Generated from the pinned Genre Police controller.\nexport function createTypography(){\nconst appShell=document.querySelector('#app'),genreLabel=document.querySelector('#genre'),genreFace=document.querySelector('#genre-face'),parentGenre=document.querySelector('#parent-genre'),trackRule=document.querySelector('.track-rule'),jurisdictionLabel=document.querySelector('.jurisdiction > span:nth-child(2)'),titleLabel=document.querySelector('#title');\nconst genreMetricsContext=document.createElement('canvas').getContext('2d');const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));let titlePanAnimation=null,titlePanSignature='';\n${typeFunctions}\n${marquee}\nreturn ()=>{fitGenreLabel();updateTitleOverflow();};\n}\n`,
);
const dynamicStyle = between("const dynamicStyleValues = new WeakMap();", "\nfunction genreFilterValue(");
const filter = between("function genreFilterValue(", "\nconst UI_SCALE_BASE");
const pulse = between(
  "  const rawTextPulse = playbackActive",
  "  const kawaiiActive = ",
);
const motion = between(
  "  if (bilibiliMode) {\n    const bilibiliGenreTarget",
  "  if (lyricStyleDue) renderSyncedLyrics(time);",
);
fs.writeFileSync(
  path.join(root, "renderer/upstream-text-motion.mjs"),
  `// Generated original text filters, spring motion, glow, and impact layers.\nimport { resolveImpactFx } from '../vendor/genre-police/renderer/impact-fx.mjs';\nimport { visualFinish } from '../vendor/genre-police/renderer/visual-finish.mjs';\nimport { smoothMotionEnvelope } from '../vendor/genre-police/renderer/motion-envelope.mjs';\nconst clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));\n${dynamicStyle}\n${filter}\nexport function createTextMotion(visual){\nconst genreLabel=document.querySelector('#genre'),genreFace=document.querySelector('#genre-face');let tranceTextPulse=0,genreVelocity=0,genreScale=1,genreLiftValue=0,lastForegroundStyleAt=0;\nreturn (currentTheme,metrics,time,elapsedMs,playbackActive,fullscreenLayoutMode)=>{const frameScale=Math.min(2,elapsedMs/16.667),foregroundStyleDue=!lastForegroundStyleAt||time-lastForegroundStyleAt>=1000/60,stageOutputActive=true,bilibiliMode=false,asmrMode=false,asmrBreath=.5+.5*Math.sin(time*.00062),synthwaveMode=currentTheme.id==='synthwave',tranceMode=currentTheme.mode==='trance'&&currentTheme.family!=='classical'&&!['soundtrack','synthwave'].includes(currentTheme.id);\nif(foregroundStyleDue)lastForegroundStyleAt=time;\n${pulse}\n${motion}\n};\n}\n`,
);
console.log(
  "Prepared original typography, long-title scrolling and text motion.",
);
