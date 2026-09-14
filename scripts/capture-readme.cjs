"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { _electron } = require(process.env.AUTOVJ_PLAYWRIGHT || "playwright");
const { Library, atomicJson } = require("../packages/library.cjs");
const ROOT = path.resolve(__dirname, ".."), OUT = path.join(ROOT, "docs", "screenshots");
// The capture script is a maintainer tool. Keep source and personal media paths separate
// so another checkout can reproduce it by setting these environment variables.
const MUSIC = process.env.AUTOVJ_README_MUSIC || path.join(ROOT, "examples", "readme-music");
const COVER_PATH = process.env.AUTOVJ_README_COVER || path.join(ROOT, "assets", "icon.png");

async function presentAutoDemo(app, trackId, themeId, artwork) {
  const consolePage = app.windows().find(window => window.url().includes("console.html"));
  const state = await consolePage.evaluate(() => window.autovj.call("state"));
  const track = state.library.tracks.find(item => item.id === trackId), theme = state.library.themes.find(item => item.id === themeId);
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
    BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes("stage.html"))?.webContents.send("autovj:scene", next.scene);
  }, { state: nextState, scene: { standby: false, theme, themeKey: themeId, track: { ...track, filePath: undefined, artwork }, djName: state.library.djName, settings: state.settings, blackout: false, active: true, outputVisible: true, externalOutput: false, previewFrameRate: 60, revision: state.live.revision } });
}

async function animateAudio(app) {
  await app.evaluate(async ({ BrowserWindow }) => {
    const target = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes("stage.html"));
    const samples = new Float32Array(2048);
    for (let frame = 0; frame < 45; frame += 1) {
      for (let i = 0; i < samples.length; i += 1) {
        const time = (frame * samples.length + i) / 44100;
        samples[i] = Math.sin(2 * Math.PI * 55 * time) * 0.65 + Math.sin(2 * Math.PI * 220 * time) * 0.2;
      }
      target?.webContents.send("autovj:pcm", { samples });
      await new Promise(resolve => setTimeout(resolve, 22));
    }
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const data = path.join(ROOT, ".qa", "readme-capture-" + crypto.randomUUID());
  const libraryId = crypto.randomUUID(), selectedId = crypto.randomUUID();
  const library = new Library(path.join(data, "libraries", libraryId));
  const coverDir = path.join(library.root, "covers"); fs.mkdirSync(coverDir, { recursive: true });
  fs.copyFileSync(COVER_PATH, path.join(coverDir, selectedId + ".png"));
  library.data.name = "Demo Library"; library.data.djName = "ICHIRYU";
  const tracks = [
    ["Afterlife (Original Mix)", "Demo Artist", "Afterlife (Original Mix).flac", "synthwave"],
    ["Action (Extended Mix)", "Demo Artist", "Action (Extended Mix).flac", "techno"],
    ["After Hours (Original Mix)", "Demo Artist", "After Hours (Original Mix).flac", "dubstep"],
    ["Disco Wonder (Original Mix)", "Demo Artist", "Disco Wonder (Original Mix).flac", "house"],
    ["DiscoFly (Original Mix)", "Demo Artist", "DiscoFly  (Original Mix).flac", "trance"],
    ["Alone (Original Mix)", "Demo Artist", "Alone (Orignal Mix).flac", "drum-bass"],
  ];
  const ids = tracks.map((_, index) => index === 0 ? selectedId : crypto.randomUUID());
  tracks.forEach(([title, artist, file, genre], index) => library.upsert({
    id: ids[index], title, artist, filePath: path.join(MUSIC, file),
    ...(index === 0 ? { cover: "covers/" + selectedId + ".png" } : {}),
    suggestion: { id: genre, source: "ai", confidence: 0.94 }, status: "ready", confirmed: true,
  }));
  library.save(); atomicJson(path.join(data, "app.json"), { activeLibrary: libraryId, language: "zh" });
  const env = { ...process.env, AUTOVJ_DATA_DIR: data }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ executablePath: path.join(ROOT, "node_modules/electron/dist/electron.exe"), args: [ROOT, "--lang=zh-CN"], env });
  try {
    const page = app.windows().find(window => window.url().includes("console.html")) || await app.waitForEvent("window", { predicate: window => window.url().includes("console.html") });
    await page.waitForSelector("#live-toggle"); await page.setViewportSize({ width: 1440, height: 960 });
    await page.evaluate(() => window.autovj.call("settings", { brightness: 1, fullscreenLayout: "stacked" }));
    const artwork = "data:image/png;base64," + fs.readFileSync(path.join(coverDir, selectedId + ".png")).toString("base64");
    for (const language of ["zh", "en", "ja"]) {
      await page.evaluate(language => window.autovj.call("settings", { language }), language);
      await page.waitForFunction(language => document.documentElement.lang === (language === "zh" ? "zh-CN" : language), language);
      await page.locator('[data-tab="live"]').click();
      await page.evaluate(id => window.autovj.call("preview-track", id), selectedId);
      await presentAutoDemo(app, selectedId, "synthwave", artwork);
      await animateAudio(app); await presentAutoDemo(app, selectedId, "synthwave", artwork); await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(OUT, `autovj-live-stacked-${language}.png`), fullPage: true });
      await page.evaluate(() => window.autovj.call("live-stop"));
      await page.waitForTimeout(300);
      await page.locator('[data-tab="library"]').click(); await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT, `autovj-prepare-library-${language}.png`), fullPage: true });
    }
    console.log("Localized live and six-track README screenshots captured");
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
