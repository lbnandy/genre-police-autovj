"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { _electron } = require(process.env.AUTOVJ_PLAYWRIGHT || "playwright");
const { Library, atomicJson } = require("../packages/library.cjs");
const ROOT = path.resolve(__dirname, ".."), OUT = path.join(ROOT, "docs", "screenshots");
// The capture script is a maintainer tool. Keep source and personal media paths separate
// so another checkout can reproduce it by setting these environment variables.
const MUSIC = process.env.AUTOVJ_README_MUSIC || path.join(ROOT, "examples", "readme-music");
const THEME = process.env.AUTOVJ_README_THEME || "techno";
const LIVE_ONLY = process.env.AUTOVJ_README_LIVE_ONLY === "1";
const IMPACT = process.env.AUTOVJ_README_IMPACT === "1";
const COVER_PATH = process.env.AUTOVJ_README_COVER || path.join(ROOT, "assets", "icon.png");

async function presentAutoDemo(app, library, trackId, themeId, artwork, consoleOnly = false) {
  const consolePage = app.windows().find(window => window.url().includes("console.html"));
  const state = await consolePage.evaluate(() => window.autovj.call("state"));
  const track = state.library.tracks.find(item => item.id === trackId), theme = library.theme(themeId);
  const demoDevice = state.devices?.[0] || { id: "demo-dj-master", name: "DJ Master · Demo", loopback: false };
  const demoChannels = state.channels?.length ? state.channels : [{ value: 0, label: "1 + 2", mono: false }];
  const nextState = {
    ...state,
    devices: state.devices?.length ? state.devices : [demoDevice],
    channels: demoChannels,
    settings: { ...state.settings, deviceId: state.settings.deviceId || demoDevice.id, channelStart: state.settings.channelStart >= 0 ? state.settings.channelStart : demoChannels[0].value },
    live: {
      ...state.live,
      running: true,
      phase: "confirmed",
      currentId: trackId,
      current: track,
      lockedTheme: null,
      currentCharge: 10,
      candidateCharge: 0,
      confidence: 0.94,
      rms: 0.18,
      peak: 0.35,
      matchEvent: "confirmed",
    },
  };
  await app.evaluate(({ BrowserWindow }, next) => {
    BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes("console.html"))?.webContents.send("autovj:state", next.state);
    if (!next.consoleOnly) BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes("stage.html"))?.webContents.send("autovj:scene", next.scene);
  }, { consoleOnly, state: nextState, scene: { standby: false, theme, themeKey: themeId, track: { ...track, filePath: undefined, artwork }, djName: library.data.djName, djLogo: library.data.djLogo, djLogoScale: library.data.djLogoScale, customArtwork: library.data.customArtwork, settings: state.settings, blackout: false, active: true, outputVisible: true, externalOutput: false, previewFrameRate: 60, revision: state.live.revision } });
}

async function animateAudio(app, musicFile) {
  if (process.env.AUTOVJ_README_LOOPBACK === "1") {
    return app.evaluate(async ({BrowserWindow}, root) => {
      if (globalThis.readmeHosts) return;
      const require = process.mainModule.require.bind(process.mainModule);
      const {LiveHost,nativeTask} = require(root + "/packages/native-host.cjs");
      const exe = root + "/native/bin/autovj-recognizer.exe";
      const devices = (await nativeTask(exe,["--devices"])).devices.filter(d=>d.loopback);
      globalThis.readmeHosts=[];
      globalThis.readmeLevels={};
      for (const device of devices) {
        const host=new LiveHost(exe); globalThis.readmeHosts.push(host);
        host.on("pcm", frame=>{
          let sum=0; for(const x of frame.samples) sum+=x*x;
          const rms=Math.sqrt(sum/frame.samples.length);
          globalThis.readmeLevels[device.id]={rms,at:Date.now(),name:device.name};
          const active=Object.entries(globalThis.readmeLevels).filter(([,v])=>Date.now()-v.at<300).sort((a,b)=>b[1].rms-a[1].rms)[0];
          if(active?.[0]===device.id) BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes("stage.html"))?.webContents.send("autovj:pcm",frame);
        });
        await host.start(root + "/.qa/readme-live-audio.db",device.id,0);
      }
    },ROOT);
  }
  const decoded = spawnSync(process.env.AUTOVJ_FFMPEG || "ffmpeg", ["-v", "error", "-ss", "60", "-i", musicFile, "-t", "12", "-ac", "1", "-ar", "44100", "-f", "f32le", "pipe:1"], {maxBuffer: 8 * 1024 * 1024});
  if (decoded.status !== 0) throw new Error(decoded.stderr.toString());
  await app.evaluate(({ BrowserWindow }, encoded) => {
    clearInterval(globalThis.readmeAudioTimer);
    const bytes = Buffer.from(encoded, "base64");
    const pcm = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
    let offset = 0;
    globalThis.readmeAudioTimer = setInterval(() => {
      const target = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes("stage.html"));
      target?.webContents.send("autovj:pcm", {samples: pcm.slice(offset, offset + 1024)});
      offset = offset + 1024 >= pcm.length - 1024 ? 0 : offset + 1024;
    }, 1024 / 44100 * 1000);
  }, decoded.stdout.toString("base64"));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const data = path.join(ROOT, ".qa", "readme-capture-" + crypto.randomUUID());
  const libraryId = crypto.randomUUID();
  let selectedId = crypto.randomUUID();
  const library = new Library(path.join(data, "libraries", libraryId));
  const coverDir = path.join(library.root, "covers"); fs.mkdirSync(coverDir, { recursive: true });
  fs.copyFileSync(COVER_PATH, path.join(coverDir, selectedId + ".png"));
  library.data.name = "Demo Library"; library.data.djName = "ICHIRYU";
  if (process.env.AUTOVJ_README_LIBRARY) {
    const source = JSON.parse(fs.readFileSync(process.env.AUTOVJ_README_LIBRARY, "utf8"));
    for (const key of ["djName", "djLogo", "djLogoScale", "customArtwork"]) library.data[key] = source[key];
  }
  const tracks = [
    ["Action (Extended Mix)", "Alessia Labate, Conrad Taylor", "Action (Extended Mix).flac", "techno"],
    ["Afterlife (Original Mix)", "Kurbz, scoobs_mc", "Afterlife (Original Mix).flac", "drum-bass"],
    ["After Hours (Original Mix)", "Demo Artist", "After Hours (Original Mix).flac", "dubstep"],
    ["Disco Wonder (Original Mix)", "Demo Artist", "Disco Wonder (Original Mix).flac", "house"],
    ["DiscoFly (Original Mix)", "Demo Artist", "DiscoFly  (Original Mix).flac", "trance"],
    ["Alone (Original Mix)", "Demo Artist", "Alone (Orignal Mix).flac", "drum-bass"],
  ];
  const ids = tracks.map((_, index) => index === 0 ? selectedId : crypto.randomUUID());
  tracks.forEach(([title, artist, file, genre], index) => {
    const probe = spawnSync(process.env.AUTOVJ_FFPROBE || "ffprobe", ["-v", "error", "-show_entries", "format=duration:format_tags=artist,title", "-of", "json", path.join(MUSIC, file)], {encoding: "utf8"});
    if (probe.status !== 0) throw new Error(probe.stderr || "Unable to read screenshot music metadata");
    const format = JSON.parse(probe.stdout).format;
    const tags = Object.fromEntries(Object.entries(format.tags || {}).map(([key, value]) => [key.toLowerCase(), value]));
    library.upsert({
    id: ids[index], filePath: path.join(MUSIC, file),
    title: tags.title || title, artist: tags.artist || artist, durationMs: Math.round(Number(format.duration) * 1000),
    ...(index === 0 ? { cover: "covers/" + selectedId + ".png" } : {}),
    suggestion: { id: genre, source: "ai", confidence: 0.94 }, status: "ready", confirmed: true,
    });
  });
  const selectedIndex = tracks.findIndex(track => track[3] === THEME);
  selectedId = ids[selectedIndex];
  library.save(); atomicJson(path.join(data, "app.json"), { activeLibrary: libraryId, language: "zh" });
  const env = { ...process.env, AUTOVJ_DATA_DIR: data }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ executablePath: path.join(ROOT, "node_modules/electron/dist/electron.exe"), args: [ROOT, "--lang=zh-CN"], env });
  try {
    const page = app.windows().find(window => window.url().includes("console.html")) || await app.waitForEvent("window", { predicate: window => window.url().includes("console.html") });
    await page.waitForSelector("#live-toggle"); await page.setViewportSize({ width: 1440, height: 960 });
    await page.evaluate(IMPACT => window.autovj.call("settings", { brightness: 1, fullscreenLayout: "stacked", headingMode: "logo", trackInfoVisible: false, impactMode: "music", screenImpact: IMPACT, impactLevel: IMPACT ? "high" : "medium" }), IMPACT);
    const artwork = "data:image/png;base64," + fs.readFileSync(path.join(coverDir, ids[0] + ".png")).toString("base64");
    for (const language of ["zh", "en", "ja"]) {
      await page.evaluate(language => window.autovj.call("settings", { language }), language);
      await page.waitForFunction(language => document.documentElement.lang === (language === "zh" ? "zh-CN" : language), language);
      await page.locator('[data-tab="live"]').click();
      await page.evaluate(id => window.autovj.call("preview-track", id), selectedId);
      await presentAutoDemo(app, library, selectedId, THEME, artwork);
      await animateAudio(app, path.join(MUSIC, tracks[selectedIndex][2])); await page.waitForTimeout(2500);
      await presentAutoDemo(app, library, selectedId, THEME, artwork);
      await page.waitForTimeout(100);
      if (IMPACT) {
        const stage=app.windows().find(w=>w.url().includes("stage.html"));
        await stage.evaluate(async()=>{
          if(window.readmeResume) window.readmeResume();
          const {ScreenImpact}=await import("./screen-impact.mjs");
          const original=ScreenImpact.prototype.update, raf=window.requestAnimationFrame;
          window.readmePeak=null;
          let pending;
          window.requestAnimationFrame=callback=>{pending=raf.call(window,callback);return pending;};
          ScreenImpact.prototype.update=function(...args){
            const hit=original.apply(this,args); window.readmeMax=Math.max(window.readmeMax||0,hit.motion);
            if(!window.readmePeak && hit.motion>1.4 && hit.age>0 && hit.age<55) {
              window.readmePeak=hit;
              cancelAnimationFrame(pending);
              window.readmeResume=()=>{ScreenImpact.prototype.update=original;window.requestAnimationFrame=raf;window.dispatchEvent(new Event('resize'));};
            }
            return hit;
          };
        });
        try { await stage.waitForFunction(()=>window.readmePeak,{},{timeout:15000}); } catch(e) { console.log(await app.evaluate(()=>globalThis.readmeLevels)); console.log(await stage.evaluate(()=>({max:window.readmeMax,peak:window.readmePeak}))); throw e; }
        console.log(language,await stage.evaluate(()=>window.readmePeak));
        await presentAutoDemo(app, library, selectedId, THEME, artwork, true);
        await page.waitForTimeout(150);
      }
      await page.screenshot({ path: path.join(OUT, `autovj-live-stacked-${language}.png`), fullPage: true });
      if (IMPACT) { const stage=app.windows().find(w=>w.url().includes("stage.html")); await stage.reload(); await stage.waitForTimeout(500); }
      await page.evaluate(() => window.autovj.call("live-stop"));
      if (LIVE_ONLY) continue;
      await page.waitForTimeout(300);
      await page.locator('[data-tab="library"]').click(); await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT, `autovj-prepare-library-${language}.png`), fullPage: true });
    }
    console.log("Localized live and library README screenshots captured");
  } finally { await app.evaluate(async()=>{for(const host of globalThis.readmeHosts||[]) await host.stop();}); await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
