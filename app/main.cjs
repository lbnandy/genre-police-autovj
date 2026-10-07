"use strict";
const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  nativeImage,
  screen,
  shell,
  session,
  net,
  powerSaveBlocker,
  sharedTexture,
} = require("electron");
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { LinkClient } = require("../packages/link-client.cjs");
const linkClient = new LinkClient();
let rhythmStatus = "off";
let lastLinkSummary = "";
const { Worker } = require("node:worker_threads");
const { Library, atomicJson, UUID } = require("../packages/library.cjs");
const { LiveHost, nativeTask } = require("../packages/native-host.cjs");
const { initialLive, reduceLive } = require("../packages/live-state.cjs");
const { createOutputController } = require("../packages/output-window.cjs");
const { VideoSender, videoSettings, SIZES } = require("../packages/video-sender.cjs");
const { TextureDistributor } = require("../packages/texture-distributor.cjs");
const { ConsoleState } = require("../packages/console-state.cjs");
const { performanceProfile, previewProfile, needsVisuals } = require("../packages/performance-profile.cjs");
const { UPDATE_RELEASES_URL, canonicalVersion, compareVersions, isAllowedReleaseUrl, isUpdateCheckDue, selectLatestUpdate } = require("../packages/update-checker.cjs");
const consoleState = new ConsoleState();
const { exportPackage, importPackage } = require("../packages/portable.cjs");
const { libraryPath, removeTracks, recoverRemovals, undoInfo, undoRemoval, clearUndo } = require("../packages/library-removal.cjs");
const { openLibraryFolder } = require("../packages/library-folder.cjs");
const { migrateEquipment, channelOptions, InputHealth, PerformanceSession } = require("../packages/performance-session.cjs");
const performanceSession = new PerformanceSession(powerSaveBlocker), inputHealth = new InputHealth();
inputHealth.reset();
let recoveringOutput = false, outputCrashes = [];
const ROOT = path.resolve(__dirname, "..");
const { translate, resolveLanguage } = require("../packages/i18n.cjs");
const languagePreference = () => config.language || "system";
const language = () => resolveLanguage(languagePreference(), app.getLocale());
const tr = (text) => translate(language(), text);
const settings = () => ({ ...library.data.settings, rhythmSource:["auto","audio","link"].includes(config.rhythmSource) ? config.rhythmSource : "auto", linkOffsetMs:Math.max(-250,Math.min(250,Number(config.linkOffsetMs)||0)), ...config.equipment, performanceMode:performanceProfile(config.performanceMode), keepAwake:config.keepAwake !== false, language: language(), languagePreference: languagePreference() });
const realResource = (p) =>
  app.isPackaged
    ? path.join(process.resourcesPath, "app.asar.unpacked", p)
    : path.join(ROOT, p);
const {VideoExport} = require('../packages/video-export.cjs');
const {exportOptions} = require('../packages/export-options.cjs');
const videoExport = new VideoExport({root:ROOT,resource:realResource,sharedTexture,
  createWindow:(width,height,gpu=false)=>{
    const w=secureWindow({width,height,show:false,useContentSize:true,webPreferences:{offscreen:gpu?{useSharedTexture:true,sharedTexturePixelFormat:'argb'}:true,...(gpu?{preload:path.join(__dirname,'export-encoder-preload.cjs')}:{})}});
    if(gpu)w.webContents.on('paint',event=>{if(!w.webContents.exportCaptureActive)event.texture?.release();});
    // Offscreen bitmap dimensions are the compositor viewport, not the
    // physical monitor size. Do not divide them by Windows display scaling.
    w.setContentSize(width,height);
    // Export advances song time explicitly. The offscreen compositor must not
    // pace the job at the live display's refresh rate.
    w.webContents.setZoomFactor(1);w.webContents.setFrameRate(240);
    return w;
  },
  onState:state=>{if(consoleWindow&&!consoleWindow.isDestroyed())consoleWindow.webContents.send('autovj:export',state);}
});
const EXE = realResource("native/bin/autovj-recognizer.exe"),
  MODELS = realResource("vendor/genre-police/assets/models");
const LINK_EXE = realResource("native/bin/Carabiner.exe");
const videoSender = new VideoSender(realResource("native/bin/autovj-video-output.exe"));
const textures = new TextureDistributor(sharedTexture);
let videoRoutes = {spout:false,ndi:false}, videoChanging = false, videoChange = Promise.resolve();
let videoRecoveryTimer=null, videoCrashes=[], videoHasSent=false;
const externalOutput = () => videoRoutes.spout || videoRoutes.ndi;
app.setName("Genre Police AutoVJ");
app.setPath(
  "userData",
  path.join(app.getPath("appData"), "Genre Police AutoVJ"),
);
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
if (process.env.AUTOVJ_DATA_DIR)
  app.setPath("userData", path.resolve(process.env.AUTOVJ_DATA_DIR));
const dataRoot = app.getPath("userData"),
  librariesRoot = path.join(dataRoot, "libraries"),
  configPath = path.join(dataRoot, "app.json");
const networkSessionId = crypto.randomUUID();
let consoleWindow,
  stageWindow,
  sourceWindow,
  library,
  host,
  worker,
  analysisPool,
  rhythmWorker,
  config = {},
  live = initialLive(),
  devices = [],
  queue = [],
  job = null,
  analysisBatch = null,
  maintenance = false,
  error = "",
  previewVisible = true,
  stageReady = false,
  pcmPending = 0,
  rhythmPending = 0,
  quitting = false;
let presenterReady = false, consolePresenterReady = false, renderSizeKey = '', renderActive = true;
let librariesCache = null, librariesCacheOwner = null, librariesCacheData = null, librariesCacheRevision = -1;
let latestUpdate = null, updateCheckTask = null, updateCheckTimer = null;
let updateState = { status: "idle", currentVersion: "" };
videoSender.on('state', (state) => {
  if(state.status==='sending')videoHasSent=true;
  if(!quitting && externalOutput() && state.status==='error' && videoHasSent && !videoRecoveryTimer){
    videoCrashes=videoCrashes.filter(time=>Date.now()-time<30000);
    if(videoCrashes.length<3){
      videoCrashes.push(Date.now());
      videoRecoveryTimer=setTimeout(()=>{videoRecoveryTimer=null;
        if(!quitting && externalOutput())changeVideo(()=>videoSender.start(config.video,videoRoutes)).catch(()=>{});
      },1000*videoCrashes.length);
      performanceSession.record('video-recovering',{attempt:videoCrashes.length});
    }
  }
  if(library)broadcast();
});
const audioExtensions = new Set([
  ".mp3",
  ".flac",
  ".wav",
  ".m4a",
  ".aac",
  ".aif",
  ".aiff",
  ".aifc",
]);
function saveConfig() {
  atomicJson(configPath, config);
  librariesCache = null;
}
function updateStatus(status, release = null) {
  return {
    status,
    currentVersion: canonicalVersion(app.getVersion()) || `v${app.getVersion()}`,
    latestVersion: release?.version || "",
    releaseName: release?.name || "",
    releaseUrl: release?.url || "",
  };
}
async function requestLatestUpdate() {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await net.fetch("https://api.github.com/repos/lbnandy/genre-police-autovj/releases?per_page=10", {
      cache: "no-store",
      headers: { Accept: "application/vnd.github+json", "User-Agent": `Genre-Police-AutoVJ/${app.getVersion()}`, "X-GitHub-Api-Version": "2022-11-28" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    const releases = await response.json();
    if (!Array.isArray(releases)) throw new Error("GitHub returned an invalid release list");
    latestUpdate = selectLatestUpdate(releases, app.getVersion());
    return updateStatus(latestUpdate ? "available" : "current", latestUpdate);
  } finally { clearTimeout(timeout); }
}
async function checkForUpdates({ manual = false } = {}) {
  if (!manual && !isUpdateCheckDue(config.lastUpdateCheckAt)) return updateState;
  if (updateCheckTask) return updateCheckTask;
  config.lastUpdateCheckAt = Date.now();
  saveConfig();
  updateState = updateStatus("checking");
  broadcast();
  updateCheckTask = requestLatestUpdate().catch(() => updateStatus("error")).finally(() => { updateCheckTask = null; });
  updateState = await updateCheckTask;
  broadcast();
  return updateState;
}
function scheduleAutomaticUpdateCheck() {
  if (updateCheckTimer) return;
  updateCheckTimer = setTimeout(() => { updateCheckTimer = null; void checkForUpdates(); }, 10_000);
  updateCheckTimer.unref?.();
}
async function openUpdatePage(value) {
  const url = isAllowedReleaseUrl(value) ? String(value) : latestUpdate?.url || UPDATE_RELEASES_URL;
  if (!isAllowedReleaseUrl(url)) return { ok: false };
  await shell.openExternal(url);
  return { ok: true };
}
function listLibraries() {
  if (librariesCache && librariesCacheOwner === library && librariesCacheData === library.data && librariesCacheRevision === library.revision) return librariesCache;
  librariesCacheOwner = library; librariesCacheData = library.data; librariesCacheRevision = library.revision;
  return librariesCache = fs
    .readdirSync(librariesRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && UUID.test(d.name))
    .flatMap((d) => {
      try {
        const v = JSON.parse(
          fs.readFileSync(
            path.join(librariesRoot, d.name, "library.json"),
            "utf8",
          ),
        );
        return [
          { id: d.name, name: v.name || "My library", count: v.tracks.length },
        ];
      } catch {
        return [];
      }
    });
}
function publicState() {
  const libraryView = consoleState.libraryView(library);
  return {
    name: app.getName(),
    version: app.getVersion(),
    library: libraryView,
    libraries: listLibraries(),
    settings: settings(),
    video: {...videoSender.state, ...videoRoutes, changing:videoChanging, settings:videoSettings(config.video)},
    rhythm: {model:rhythmStatus,link:{status:linkClient.state.status,peers:linkClient.state.peers,bpm:Math.round((linkClient.state.bpm||0)*10)/10},componentAvailable:fs.existsSync(LINK_EXE)},
    devices,
    channels: channelOptions(devices.find(d => d.id === settings().deviceId)),
    inputHealth: inputHealth.status(live),
    undoRemoval: undoInfo(librariesRoot,library),
    displays: screen.getAllDisplays().map((d) => ({
      id: d.id,
      label: d.label || `${d.size.width} × ${d.size.height}`,
      primary: d.id === screen.getPrimaryDisplay().id,
    })),
    live: {
      ...live,
      current: consoleState.tracks.get(live.currentId) || null,
      candidate: consoleState.tracks.get(live.candidateId) || null,
    },
    job: job ? { ...job, remaining: queue.length } : null,
    queue: queue.length,
    analysisBatch: analysisBatch?.libraryId === library.data.libraryId ? { ...analysisBatch } : null,
    maintenance,
    error,
    outputVisible: Boolean(stageWindow?.isVisible()),
    maximized: Boolean(consoleWindow?.isMaximized()),
    update: { ...updateState, dismissed: compareVersions(config.dismissedUpdateVersion, updateState.latestVersion) === 0 },
  };
}
let broadcastTimer;
function broadcast() {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    if (consoleWindow && !consoleWindow.isDestroyed())
      consoleWindow.webContents.send("autovj:state", consoleState.delta(publicState()));
  }, 40);
}
function previewActive() { return Boolean(previewVisible && consoleWindow && !consoleWindow.isDestroyed() && consoleWindow.isVisible() && !consoleWindow.isMinimized()); }
function updateRenderActivity() {
  if(!sourceWindow || sourceWindow.isDestroyed())return;
  const active = needsVisuals({preview:previewActive(),local:stageWindow?.isVisible() && !stageWindow?.isMinimized(),external:externalOutput(),recovering:recoveringOutput || !stageReady});
  if(active === renderActive)return;
  renderActive = active;
  sourceWindow.webContents.send('autovj:render-active',active);
  if(active) { sourceWindow.webContents.startPainting(); sourceWindow.webContents.send('autovj:output-resume'); }
  else sourceWindow.webContents.stopPainting();
}
function scene() {
  const track = library.track(live.currentId);
  let themeId =
    live.lockedTheme ||
    (track ? library.visual(track) : library.data.settings.standbyTheme);
  const theme =
    library.theme(themeId) ||
    library.theme(library.data.settings.standbyTheme) ||
    library.theme("unknown");
  return {
    standby: !track && !live.lockedTheme,
    theme: { ...theme, id: theme.baseId || theme.id },
    themeKey: themeId,
    track: library.publicTrack(track, true),
    djName: library.data.djName,
    customArtwork: library.data.customArtwork,
    djLogo: library.data.djLogo,
    djLogoScale: library.data.djLogoScale,
    settings: externalOutput() ? {...settings(),frameRateLimit:String(videoSettings(config.video).fps),idleFrameLimit:false} : settings(),
    blackout: live.blackout,
    active: live.running && !live.deviceLost,
    outputVisible: externalOutput() || Boolean(stageWindow?.isVisible() && !stageWindow?.isMinimized()),
    externalOutput: externalOutput(),
    previewFrameRate: !externalOutput() && !Boolean(stageWindow?.isVisible() && !stageWindow?.isMinimized()) ? previewProfile(config.performanceMode).fps : 0,
    revision: live.revision,
  };
}
function sendScene() {
  performanceSession.updateAwake(!quitting && (live.running || externalOutput() || Boolean(stageWindow?.isVisible())), config.keepAwake !== false);
  configureRenderSize();
  videoSender.setBlackout(live.blackout);
  if (stageReady && !sourceWindow?.isDestroyed())
    sourceWindow.webContents.send("autovj:scene", scene());
  if (presenterReady && !stageWindow?.isDestroyed())stageWindow.webContents.send('autovj:scene',{blackout:live.blackout});
  updateRenderActivity();
  broadcast();
}
function configureRenderSize() {
  if(!sourceWindow || sourceWindow.isDestroyed())return;
  const profile=previewProfile(config.performanceMode);
  let width=profile.maxWidth,height=profile.maxHeight;
  const localVisible=stageWindow?.isVisible() && !stageWindow?.isMinimized();
  const display=stageWindow && !stageWindow.isDestroyed() ? screen.getDisplayMatching(stageWindow.getBounds()) : screen.getPrimaryDisplay();
  if(externalOutput()) [width,height]=SIZES[videoSettings(config.video).resolution];
  else if(localVisible) {
    const [w,h]=stageWindow.getContentSize();width=Math.round(w*display.scaleFactor);height=Math.round(h*display.scaleFactor);
  }
  const scale=Math.min(1,3840/width,3840/height,Math.sqrt(3840*2160/(width*height)));
  width=Math.max(64,Math.round(width*scale));height=Math.max(64,Math.round(height*scale));
  const dpi=screen.getDisplayMatching(sourceWindow.getBounds()).scaleFactor;
  let fps=externalOutput()?videoSettings(config.video).fps:settings().frameRateLimit==='display'?Math.round(display.displayFrequency||60):Number(settings().frameRateLimit)||60;
  if(!externalOutput() && !localVisible)fps=Math.min(fps,profile.fps);
  const key=[width,height,dpi,fps].join(':');if(renderSizeKey===key)return;renderSizeKey=key;
  sourceWindow.setContentSize(Math.ceil(width/dpi),Math.ceil(height/dpi));
  sourceWindow.webContents.setZoomFactor(1/dpi);
  sourceWindow.webContents.setFrameRate(Math.max(1,Math.min(240,fps)));
}
function changeVideo(work) {
  const task=videoChange.then(async()=>{
    videoChanging=true;broadcast();
    try{return await work();}
    finally{videoChanging=false;sendScene();}
  });videoChange=task.catch(()=>{});return task;
}
function ensureIdle() {
  if (maintenance) throw new Error(tr("正在更新曲库，请稍候。"));
  if (live.running) throw new Error(tr("请先停止现场监听，再修改或准备曲库。"));
  if (job || queue.length) throw new Error(tr("请等待当前分析结束，或先停止分析。"));
}
async function maintainLibrary(work) {
  ensureIdle();
  maintenance = true;
  broadcast();
  try { return await work(); }
  finally { maintenance = false; broadcast(); }
}
function secureWindow(options) {
  const w = new BrowserWindow({
    ...options,
    icon: path.join(ROOT, "assets/icon.png"),
    backgroundColor: "#090c12",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      ...options.webPreferences,
    },
  });
  w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  w.webContents.on("will-navigate", (e) => e.preventDefault());
  return w;
}
function openConsole() {
  consoleState.resetDelivery();
  const area = screen.getPrimaryDisplay().workAreaSize;
  consoleWindow = secureWindow({
    width: Math.min(1440, area.width),
    height: Math.min(940, area.height),
    minWidth: Math.min(860, area.width),
    minHeight: Math.min(620, area.height),
    frame: false,
    title: "Genre Police AutoVJ",
    autoHideMenuBar: true,
  });
  consoleWindow.loadFile(path.join(ROOT, "renderer/console.html"));
  consoleWindow.webContents.on('did-start-loading',()=>consoleState.resetDelivery());
  for(const event of ['show','hide','minimize','restore'])consoleWindow.on(event,updateRenderActivity);
  consoleWindow.once("ready-to-show", () => {
    consoleWindow.show();
    consoleWindow.focus();
  });
  consoleWindow.on("maximize", broadcast);
  consoleWindow.on("unmaximize", broadcast);
  consoleWindow.on("closed", () => {
    consoleWindow = null;
    app.quit();
  });
}
function createStage() {
  stageReady = false;
  presenterReady = false;
  renderSizeKey = '';
  renderActive = true;
  stageWindow = secureWindow({
    width: 1280,
    height: 720,
    show: false,
    frame: false,
    title: "Genre Police AutoVJ · Output",
    autoHideMenuBar: true,
    webPreferences: { paintWhenInitiallyHidden: true },
  });
  stageWindow.loadFile(path.join(ROOT, "renderer/output.html"));
  sourceWindow = secureWindow({width:1280,height:720,show:false,frame:false,
    title:'Genre Police AutoVJ · Render',
    webPreferences:{offscreen:{useSharedTexture:true,sharedTexturePixelFormat:'argb'},paintWhenInitiallyHidden:true}});
  sourceWindow.webContents.on('paint', (event) => {
    const texture=event.texture;if(!texture)return;
    if(quitting){texture.release();return;}
    textures.paint(texture,[
      {id:'output',window:stageWindow,ready:presenterReady,visible:stageWindow?.isVisible() && !stageWindow?.isMinimized()},
      {id:'preview',window:consoleWindow,ready:consolePresenterReady,visible:previewActive(),...previewProfile(config.performanceMode)},
    ],videoSender);
  });
  sourceWindow.loadFile(path.join(ROOT,'renderer/stage.html'));
  // backgroundThrottling is disabled to keep the console preview alive. That
  // also makes document.hidden unreliable; pass actual native visibility.
  for (const event of ["show", "hide", "minimize", "restore", "resize", "move"])
    stageWindow.on(event, sendScene);
  stageWindow.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      hideOutput();
    }
  });
  const recover = (_event, details) => {
    if (quitting) return;
    output.capture();
    stageReady = false;
    performanceSession.record('output-crash', {reason:details.reason,exitCode:details.exitCode});
    error = tr("输出进程已重启，画面正在恢复。");
    stageWindow.destroy();
    sourceWindow?.destroy();
    sourceWindow = null;
    stageWindow = null;
    outputCrashes = outputCrashes.filter(time => Date.now()-time < 30000);
    outputCrashes.push(Date.now());
    recoveringOutput = outputCrashes.length <= 3;
    if (!recoveringOutput) {
      error = tr("画面连续恢复失败，请点击重新启动画面。");
      performanceSession.updateAwake(live.running, config.keepAwake !== false);
      broadcast(); return;
    }
    createStage();
    broadcast();
  };
  stageWindow.webContents.on('render-process-gone',recover);
  sourceWindow.webContents.on('render-process-gone',recover);
}
function configureLink() {
  if (config.rhythmSource !== "audio") linkClient.start(LINK_EXE);
  else linkClient.disconnect();
}
function needsRhythmModel() {
  return live.running && config.rhythmSource !== "link" && (config.rhythmSource === "audio" || linkClient.state.status !== "connected" || !linkClient.state.peers);
}
linkClient.on('state', sample => {
  if (stageReady && !sourceWindow?.isDestroyed()) sourceWindow.webContents.send('autovj:link',sample);
  if (!library || quitting) return;
  if (needsRhythmModel() && !rhythmWorker) startRhythm();
  else if (!needsRhythmModel() && rhythmWorker) stopRhythm();
  const summary=JSON.stringify([sample.status,sample.peers,Math.round((sample.bpm||0)*10)]);
  if(summary!==lastLinkSummary){lastLinkSummary=summary;broadcast();}
});
function startRhythm() {
  stopRhythm();
  if (!needsRhythmModel()) return;
  rhythmStatus = "starting";
  const rhythmConfig = require("../packages/rhythm-config.cjs").rhythmConfig(realResource);
  rhythmWorker = new Worker(path.join(ROOT, "packages/rhythm-worker.cjs"), {
    workerData: {
      ...rhythmConfig,
    },
  });
  const worker = rhythmWorker;
  rhythmWorker.on("message", (m) => {
    if (worker !== rhythmWorker) return;
    if (m.type === "ack") rhythmPending = Math.max(0, rhythmPending - 1);
    else {
      const next=['ready','rhythm'].includes(m.type)?'ready':m.type==='unavailable'?'unavailable':rhythmStatus;
      if(next!==rhythmStatus){rhythmStatus=next;broadcast();}
      if(stageReady)sourceWindow.webContents.send("autovj:rhythm", m);
    }
  });
  rhythmWorker.on("error", (e) => {
    if (worker !== rhythmWorker) return;
    rhythmStatus = "unavailable";
    error = tr("音频节拍不可用：") + e.message;
    if (stageReady) sourceWindow.webContents.send("autovj:rhythm", {type:"unavailable"});
    broadcast();
  });
}
function stopRhythm() {
  rhythmStatus = "off";
  rhythmWorker?.terminate();
  rhythmWorker = null;
  rhythmPending = 0;
  if (stageReady)
    sourceWindow.webContents.send("autovj:rhythm", { type: "disabled" });
}
async function stopLive() {
  await host.stop();
  performanceSession.record('listening-stop');
  stopRhythm();
  live = {
    ...initialLive(),
    lockedTheme: live.lockedTheme,
    blackout: live.blackout,
    revision: live.revision + 1,
  };
  sendScene();
}
async function startLive() {
  if (job || queue.length) throw new Error(tr("先停止前置分析，再开始演出。"));
  if (live.running) return;
  const id = settings().deviceId;
  if (!id) throw new Error(tr("请选择 DJ Master 输入设备。"));
  devices = (await nativeTask(EXE, ["--devices"])).devices;
  const device = devices.find((d) => d.id === id);
  if (!device) throw new Error(tr("所选设备当前未连接。"));
  if (!channelOptions(device).some(option => option.value === settings().channelStart))
    throw new Error(tr("所选通道超出设备范围，请改选已有通道。"));
  live = {
    ...live,
    running: true,
    phase: "starting",
    currentId: null,
    error: null,
  };
  error = "";
  inputHealth.reset();
  performanceSession.record('listening-start');
  startRhythm();
  try {
    await host.start(library.db, id, settings().channelStart);
  } catch (e) {
    await stopLive();
    throw e;
  }
  sendScene();
}
function setSettings(input) {
  const s = library.data.settings;
  for (const [key, value] of Object.entries(input || {})) {
    if (
      [
        "online",
        "localAI",
        "textVisible",
        "showDjName",
        "trackInfoVisible",
        "artworkVisible",
        "brandingVisible",
        "fullscreenCondensed",
        "screenImpact",
        "idleFrameLimit",
        "showFps",
      ].includes(key)
    )
      { s[key] = Boolean(value); if (key === "showDjName") s.headingMode = value ? "dj" : "genre"; }
    else if (key === "rhythmSource" && ["auto","audio","link"].includes(value)) config.rhythmSource=value;
    else if (key === "linkOffsetMs" && Number.isFinite(Number(value))) config.linkOffsetMs=Math.max(-250,Math.min(250,Math.round(Number(value))));
    else if (key === "beatStrength" && ["fixed","dynamic"].includes(value)) s.beatStrength=value;
    else if (key === "impactMode" && ["music","beat"].includes(value)) s.impactMode=value;
    else if (key === "impactLevel" && ["low","medium","high","extreme","ultra"].includes(value)) s.impactLevel=value;
    else if (key === "visualSize" && ["standard","large","maximum"].includes(value)) s.visualSize=value;
    else if (key === "headingMode" && ["genre", "dj", "logo", "hidden"].includes(value)) { s.headingMode = value; s.showDjName = value === "dj"; }
    else if (key === "brightness")
      s[key] = Math.max(0.05, Math.min(1, Number(value) || 0.85));
    else if (
      key === "intensity" &&
      ["calm", "standard", "energetic"].includes(value)
    )
      s[key] = value;
    else if (key === "fullscreenLayout" && ["split", "stacked"].includes(value))
      s[key] = value;
    else if (key === "language" && ["system", "zh", "en", "ja", "ko"].includes(value)) {
      config.language = value;
      s[key] = value;
      saveConfig();
    }
    else if (key === "renderScale" && ["auto", 0.5, 0.75, 1].includes(value))
      s[key] = value;
    else if (key === "frameRateLimit" && ["display", "120", "90", "60", "30"].includes(String(value)))
      s[key] = String(value);
    else if (key === "standbyTheme" && (value === "neutral" || library.theme(value))) s[key] = value;
    else if (key === "keepAwake") config.keepAwake = Boolean(value);
    else if (key === "performanceMode" && ['standard','low'].includes(value)) config.performanceMode = value;
    else if (key === "displayId")
      config.equipment[key] = screen.getAllDisplays().some((d) => d.id === value)
        ? value
        : null;
    else if (
      key === "deviceId" &&
      !live.running &&
      typeof value === "string" &&
      devices.some((d) => d.id === value)
    )
      { config.equipment[key] = value; config.equipment.channelStart = 0; }
    else if (
      key === "channelStart" &&
      !live.running &&
      channelOptions(devices.find(d => d.id === settings().deviceId)).some(option => option.value === value)
    )
      config.equipment[key] = value;
  }
  saveConfig();
  library.save();
  if ("rhythmSource" in input) configureLink();
  if (needsRhythmModel() && !rhythmWorker) startRhythm();
  else if (!needsRhythmModel() && rhythmWorker) stopRhythm();
  sendScene();
}
function collectFiles(paths) {
  const found = [];
  const visit = (p) => {
    if (found.length >= 10000) return;
    const s = fs.lstatSync(p);
    if (s.isSymbolicLink()) return;
    if (s.isDirectory()) {
      for (const d of fs.readdirSync(p)) visit(path.join(p, d));
    } else if (s.isFile() && audioExtensions.has(path.extname(p).toLowerCase()))
      found.push(p);
  };
  for (const p of paths) visit(p);
  return found;
}
async function addFiles(folder) {
  ensureIdle();
  const r = await dialog.showOpenDialog(consoleWindow, {
    title: folder ? tr("选择音乐文件夹") : tr("添加本地音乐"),
    properties: folder ? ["openDirectory"] : ["openFile", "multiSelections"],
    filters: [
      {
        name: "Music",
        extensions: [...audioExtensions].map((e) => e.slice(1)),
      },
    ],
  });
  if (r.canceled) return;
  const files = collectFiles(r.filePaths);
  for (const filePath of files) {
    const existing = library.data.tracks.find(
      (t) => t.filePath?.toLowerCase() === filePath.toLowerCase(),
    );
    if (existing) continue;
    library.data.tracks.push({
      id: crypto.randomUUID(),
      filePath,
      title: path.basename(filePath, path.extname(filePath)),
      artist: "",
      status: "pending",
      addedAt: new Date().toISOString(),
    });
  }
  library.save();
  broadcast();
}
function analyze(ids, refresh = false) {
  if (live.running) throw new Error(tr("现场运行中不能开始前置分析。"));
  if (job || queue.length) throw new Error(tr("请等待当前分析结束，或先停止分析。"));
  const selected =
    Array.isArray(ids) && ids.length
      ? ids
      : library.data.tracks
          .filter((t) => t.status !== "ready")
          .map((t) => t.id);
  for (const id of selected) {
    const t = library.track(id);
    if (
      t &&
      t.filePath &&
      fs.existsSync(t.filePath) &&
      id !== job?.id &&
      !queue.some((q) => q.id === id)
    )
      queue.push({ id, refresh });
  }
  if (queue.length) analysisBatch = { id: crypto.randomUUID(), libraryId: library.data.libraryId, total: queue.length, processed: 0, succeeded: 0, failed: 0, status: "running" };
  nextJob();
  broadcast();
}
function finishAnalysisBatch() {
  if (analysisBatch && ["running", "cancelling"].includes(analysisBatch.status) && !job && !queue.length)
    analysisBatch.status = analysisBatch.status === "cancelling" ? "cancelled" : "complete";
  if(!job && !queue.length && analysisPool){analysisPool.postMessage('close');analysisPool=null;}
}
function nextJob() {
  if (job || live.running || !queue.length) return;
  const item = queue.shift(),
    track = library.track(item.id);
  if (!track) {
    analysisBatch.processed++;
    analysisBatch.failed++;
    finishAnalysisBatch();
    broadcast();
    nextJob();
    return;
  }
  job = { id: track.id, title: track.title, phase: "metadata", fraction: 0 };
  track.status = "analyzing";
  library.save();
  if(!analysisPool){
    analysisPool=new Worker(path.join(ROOT,'packages/analysis-worker.cjs'),{workerData:{persistent:true}});
    const pool=analysisPool;
    const clear=()=>{if(analysisPool===pool)analysisPool=null;};
    pool.on('exit',clear);pool.on('error',clear);
  }
  const w = analysisPool;
  const jobData = {
      track,
      root: library.root,
      exe: EXE,
      modelRoot: MODELS,
      online: library.data.settings.online,
      localAI: library.data.settings.localAI,
      refresh: item.refresh,
      networkCachePath: path.join(dataRoot, "network-country.json"),
      networkSessionId,
    };
  worker = w;
  let finished = false;
  async function finish(message) {
    if (finished) return;
    finished = true;
    let outcome = message.cancelled ? "cancelled" : "failed";
    try {
      if (message.type === "complete") {
        const duplicate = library.data.tracks.find(
          (t) =>
            t.id !== track.id &&
            t.audioHash &&
            t.audioHash === message.track.audioHash &&
            t.status === "ready",
        );
        if (duplicate) {
          await nativeTask(EXE, ["--remove", library.db, track.id]);
          fs.copyFileSync(
            path.join(library.root, "analysis", track.id + ".json"),
            path.join(library.root, "analysis", duplicate.id + ".json"),
          );
          library.upsert({
            ...message.track,
            id: duplicate.id,
            cover: duplicate.cover || message.track.cover,
          });
          library.data.tracks = library.data.tracks.filter(
            (t) => t.id !== track.id,
          );
          library.save();
        } else library.upsert(message.track);
        outcome = "succeeded";
      } else {
        track.status = message.cancelled ? "pending" : "failed";
        track.error = message.message;
        library.save();
      }
    } catch (e) {
      outcome = "failed";
      track.status = "failed";
      track.error = e.message;
      library.save();
      error = e.message;
    } finally {
      w.off('message',onMessage);w.off('error',onError);w.off('exit',onExit);
      if (outcome !== "cancelled") {
        analysisBatch.processed++;
        analysisBatch[outcome]++;
      }
      job = null;
      worker = null;
      finishAnalysisBatch();
      broadcast();
      setTimeout(nextJob, 100);
    }
  }
  function onMessage(m) {
    if (m.type === "progress") {
      if (job?.phase !== "cancelling") Object.assign(job || {}, m);
      broadcast();
    } else finish(m);
  }
  const onError = (e) => finish({ type: "failed", message: e.message });
  const onExit = (code) => {
    if (!finished)
      finish({ type: "failed", message: "分析进程退出 (" + code + ")" });
  };
  w.on('message',onMessage);w.on('error',onError);w.on('exit',onExit);
  w.postMessage({type:'analyze',data:jobData});
  broadcast();
}
const output = createOutputController({
  getWindow: () => stageWindow,
  getDisplay: (restoreId) =>
    screen
      .getAllDisplays()
      .find((d) => d.id === (restoreId ?? settings().displayId)) ||
    screen
      .getAllDisplays()
      .find((d) => d.id !== screen.getPrimaryDisplay().id) ||
    screen.getPrimaryDisplay(),
  onShown: () => {
    sendScene();
    if (stageReady) sourceWindow.webContents.send("autovj:output-resume");
  },
  onChanged: sendScene,
});
function hideOutput() {
  output("hide").catch((e) => { error = e.message; broadcast(); });
}
async function action(name, input) {
  if (maintenance && !["state", "output", "blackout", "video-route", "video-retry", "window-control", "open-repository", "update-check", "open-update", "dismiss-update", "export-diagnostics", "restart-output"].includes(name))
    throw new Error(tr("正在更新曲库，请稍候。"));
  switch (name) {
    case 'video-route':
      if(!['spout','ndi'].includes(input?.route)||typeof input.enabled!=='boolean')throw new Error('Invalid video route');
      return changeVideo(async()=>{
        videoRoutes={...videoRoutes,[input.route]:input.enabled};sendScene();
        await videoSender.start(config.video,videoRoutes);
        performanceSession.record('video-routes',{...videoRoutes});return {ok:true};
      });
    case 'video-settings':
      return changeVideo(async()=>{
        if(externalOutput())throw new Error(tr('先关闭 Spout 和 NDI，再修改输出格式。'));
        config.video=videoSettings({...videoSettings(config.video),...input});saveConfig();return {ok:true};
      });
    case 'video-retry':
      return changeVideo(async()=>{clearTimeout(videoRecoveryTimer);videoRecoveryTimer=null;videoCrashes=[];await videoSender.start(config.video,videoRoutes,true);return {ok:true};});
    case "open-repository": {
      const url = new Map([
        ["genre-police", "https://github.com/lbnandy/genre-police-visualizer"],
        ["vjvision", "https://github.com/ichiryu0021/VJVision"],
        ["ndi", "https://ndi.video/"],
        ["carabiner", "https://github.com/Deep-Symmetry/carabiner/releases"],
        ["spout", "https://spout.zeal.co/"],
      ]).get(input);
      if (!url) throw new Error("Unknown repository");
      await shell.openExternal(url);
      break;
    }
    case "update-check":
      return checkForUpdates({ manual: true });
    case "open-update":
      return openUpdatePage(input);
    case "dismiss-update":
      if (!updateState.latestVersion || compareVersions(input, updateState.latestVersion) !== 0) return { ok: false };
      config.dismissedUpdateVersion = canonicalVersion(input);
      saveConfig();
      broadcast();
      return { ok: true };
    case "window-control":
      if (input === "minimize") consoleWindow.minimize();
      else if (input === "maximize") consoleWindow.isMaximized() ? consoleWindow.unmaximize() : consoleWindow.maximize();
      else if (input === "close") consoleWindow.close();
      break;
    case "state":
      return publicState();
    case "devices":
      devices = (await nativeTask(EXE, ["--devices"])).devices;
      broadcast();
      return devices;
    case "settings":
      setSettings(input);
      break;
    case "add-files":
      await addFiles(false);
      break;
    case "add-folder":
      await addFiles(true);
      break;
    case "analyze":
      analyze(input?.ids, input?.refresh);
      break;
    case "cancel-analysis":
      queue = [];
      worker?.postMessage("cancel");
      if (analysisBatch && ["running", "cancelling"].includes(analysisBatch.status)) analysisBatch.status = "cancelling";
      if (job) job.phase = "cancelling";
      finishAnalysisBatch();
      broadcast();
      break;
    case "track":
      library.patch(input.id, input.changes);
      sendScene();
      break;
    case "preset":
      library.addPreset(input);
      broadcast();
      break;
    case "live-start":
      await startLive();
      break;
    case "live-stop":
      await stopLive();
      break;
    case "lock":
      if (input !== null && !library.theme(input))
        throw new Error(tr("未知视觉"));
      live.lockedTheme = input;
      if (input === null && !live.running) live.currentId = null;
      sendScene();
      break;
    case "video-export-options":
      return {options:exportOptions(config.exportOptions,settings()),job:videoExport.state};
    case "video-export-cancel":
      videoExport.cancel();return {ok:true};
    case "video-export-reveal":
      if(videoExport.state.batch?.directory)await shell.openPath(videoExport.state.batch.directory);
      else if(videoExport.state.status==='complete'&&videoExport.state.file)shell.showItemInFolder(videoExport.state.file);
      return {ok:true};
    case "video-export-batch": {
      ensureIdle();
      if(videoExport.task)throw new Error(tr("视频正在导出，请稍候。"));
      const owner=library,ids=[...new Set(Array.isArray(input?.ids)?input.ids:[])];
      const tracks=ids.map(id=>owner.track(id));
      if(!tracks.length||tracks.some(track=>!track))throw new Error(tr("曲目不存在"));
      const pick=await dialog.showOpenDialog(consoleWindow,{title:tr("选择视频输出文件夹"),properties:['openDirectory','createDirectory']});
      if(pick.canceled)return {canceled:true};
      ensureIdle();
      if(owner!==library)throw new Error(tr("曲库已切换，请重新选择。"));
      if(videoExport.task)throw new Error(tr("视频正在导出，请稍候。"));
      const options=exportOptions(input.options,settings()),base=structuredClone(scene());
      const requests=tracks.map(track=>{
        const themeId=owner.visual(track),theme=owner.theme(themeId)||owner.theme('unknown');
        return {file:track.filePath,options,scene:{...base,track:owner.publicTrack(track,true),theme:{...theme,id:theme.baseId||theme.id},themeKey:themeId}};
      });
      config.exportOptions=options;saveConfig();videoExport.startBatch(requests,pick.filePaths[0]);return {ok:true};
    }
    case "video-export-start": {
      ensureIdle();
      if(videoExport.task)throw new Error(tr("视频正在导出，请稍候。"));
      const track=library.track(input?.id);
      if(!track)throw new Error(tr("曲目不存在"));
      let file=track.filePath;
      if(!file||!fs.existsSync(file)){
        const pick=await dialog.showOpenDialog(consoleWindow,{title:tr("选择这首曲目的原始音频"),properties:['openFile'],filters:[{name:tr("音频文件"),extensions:[...audioExtensions].map(s=>s.slice(1))}]});
        if(pick.canceled)return {canceled:true};file=pick.filePaths[0];
      }
      const options=exportOptions(input.options,settings()),preview=input.preview===true;
      let output;
      if(preview)output=path.join(app.getPath('temp'),`autovj-preview-${crypto.randomUUID()}.mp4`);
      else{
        const pick=await dialog.showSaveDialog(consoleWindow,{title:tr("导出视频"),defaultPath:(track.title||'AutoVJ').replace(/[<>:"/\\|?*]/g,'_')+'.mp4',filters:[{name:'MP4',extensions:['mp4']}]});
        if(pick.canceled||!pick.filePath)return {canceled:true};
        output=pick.filePath.toLowerCase().endsWith('.mp4')?pick.filePath:pick.filePath+'.mp4';
        if(path.resolve(output).toLowerCase()===path.resolve(file).toLowerCase())throw new Error(tr("请选择不同的输出文件。"));
      }
      config.exportOptions=options;saveConfig();
      const themeId=library.visual(track),theme=library.theme(themeId)||library.theme('unknown');
      const exportScene={...scene(),track:library.publicTrack(track,true),theme:{...theme,id:theme.baseId||theme.id},themeKey:themeId};
      videoExport.start({file,output,scene:exportScene,options,preview,previewStart:input.previewStart});
      return {ok:true};
    }
    case "preview-track":
      if (live.running) throw new Error(tr("停止现场监听后可预览曲目视觉。"));
      if (!library.track(input)) throw new Error(tr("曲目不存在"));
      live.currentId = input;
      live.lockedTheme = library.visual(library.track(input));
      if (!library.theme(live.lockedTheme)) live.lockedTheme = null;
      sendScene();
      break;
    case "remove-track":
    case "remove-tracks":
      return maintainLibrary(async () => {
        const request = name === "remove-track" ? { libraryId: library.data.libraryId, ids: [input] } : input;
        if (request?.libraryId !== library.data.libraryId) throw new Error(tr("曲库已切换，请重新选择。"));
        const count = await removeTracks(librariesRoot, library, request.ids, EXE);
        performanceSession.record('tracks-removed',{count});
        if (request.ids.includes(live.currentId)) {
          live = { ...initialLive(), blackout: live.blackout, revision: live.revision + 1 };
        }
        error = "";
        sendScene();
        return { ok: true, count };
      });
    case "undo-removal":
      return maintainLibrary(async () => {
        if(input?.libraryId !== library.data.libraryId) throw new Error(tr("曲库已切换，请重新选择。"));
        const count=await undoRemoval(librariesRoot,library,EXE);
        performanceSession.record('undo-removal',{count});sendScene();return {count};
      });
    case "delete-library":
      return maintainLibrary(async () => {
        if (input?.libraryId !== library.data.libraryId) throw new Error(tr("曲库已切换，请重新选择。"));
        const old = library, oldConfig = { ...config };
        const target = libraryPath(librariesRoot, old.data.libraryId);
        const other = listLibraries().find(item => item.id !== old.data.libraryId);
        const next = new Library(other ? libraryPath(librariesRoot, other.id) : path.join(librariesRoot, crypto.randomUUID()));
        if (!other) { next.data.settings = { ...old.data.settings }; next.save(); }
        try {
          // Persist a valid fallback before moving the old library to the OS
          // recycle bin. A crash cannot leave the active ID pointing at deletion.
          config.activeLibrary = next.data.libraryId;
          saveConfig();
          await shell.trashItem(target);
        } catch (e) {
          config = oldConfig;
          saveConfig();
          if (!other) {
            // Only this operation's newly created, unused fallback directory.
            const unused = libraryPath(librariesRoot, next.data.libraryId);
            await fs.promises.rm(unused, { recursive: true, force: true });
          }
          throw e;
        }
        library = next;
        try {await clearUndo(librariesRoot,old.data.libraryId);}catch {performanceSession.record('undo-cleanup-failed');}
        live = { ...initialLive(), blackout: live.blackout, revision: live.revision + 1 };
        error = "";
        sendScene();
        return { ok: true };
      });
    case "relink-track": {
      ensureIdle();
      const track = library.track(input);
      if (!track) throw new Error(tr("曲目不存在"));
      const r = await dialog.showOpenDialog(consoleWindow, {
        title: tr("重新关联这首歌的本地音频"),
        properties: ["openFile"],
        filters: [
          {
            name: "Music",
            extensions: [...audioExtensions].map((e) => e.slice(1)),
          },
        ],
      });
      if (!r.canceled) {
        track.filePath = r.filePaths[0];
        library.save();
        analyze([track.id], true);
      }
      break;
    }
    case "blackout":
      live.blackout = Boolean(input);
      sendScene();
      break;
    case "output":
      await output(input);
      performanceSession.record('output-mode',{mode:input});
      break;
    case "export": {
      ensureIdle();
      const r = await dialog.showOpenDialog(consoleWindow, {
        title: tr("选择导出位置（可选 U 盘）"),
        properties: ["openDirectory", "createDirectory"],
      });
      if (!r.canceled) {
        const out = path.join(r.filePaths[0], `AutoVJ-Library-${Date.now()}`);
        await exportPackage(library, out, EXE);
        shell.showItemInFolder(path.join(out, "library.json"));
        return { path: out };
      }
      break;
    }
    case "import": {
      ensureIdle();
      const r = await dialog.showOpenDialog(consoleWindow, {
        title: tr("选择 AutoVJ-Library 文件夹"),
        properties: ["openDirectory"],
      });
      if (!r.canceled) {
        const root = await importPackage(r.filePaths[0], librariesRoot, EXE);
        library = new Library(root);
        config.activeLibrary = library.data.libraryId;
        saveConfig();
        live = {...initialLive(),blackout:live.blackout};
        sendScene();
      }
      break;
    }
    case "library":
      ensureIdle();
      if (!UUID.test(input) || !listLibraries().some((l) => l.id === input))
        throw new Error(tr("曲库不存在"));
      library = new Library(path.join(librariesRoot, input));
      config.activeLibrary = input;
      saveConfig();
      live = {...initialLive(),blackout:live.blackout};
      sendScene();
      break;
    case "library-cover": {
      const owner = library;
      if (input?.libraryId !== owner.data.libraryId) throw new Error(tr("曲库已切换，请重新选择。"));
      if (input.remove) owner.data.customArtwork = "";
      else if (input.image !== undefined) {
        const data = require("../packages/dj-logo.cjs").validateLogo(input.image);
        const image = nativeImage.createFromDataURL(data);
        const size = image.getSize();
        if (image.isEmpty() || size.width !== size.height || size.width > 1024) throw new Error("Invalid cover image");
        owner.data.customArtwork = image.toDataURL();
      } else {
        const result = await dialog.showOpenDialog(consoleWindow, {properties:["openFile"],filters:[{name:"PNG / WebP / JPEG",extensions:["png","webp","jpg","jpeg"]}]});
        if (result.canceled) return null;
        if (owner !== library) throw new Error(tr("曲库已切换，请重新选择。"));
        if (fs.statSync(result.filePaths[0]).size > 16*1024*1024) throw new Error(tr("图片不能超过 16 MB。"));
        let image = nativeImage.createFromPath(result.filePaths[0]);
        if (image.isEmpty()) throw new Error(tr("无法读取图片。"));
        const {width,height}=image.getSize(), ratio=Math.min(1,2048/Math.max(width,height));
        if(ratio<1) image=image.resize({width:Math.max(1,Math.round(width*ratio)),height:Math.max(1,Math.round(height*ratio))});
        return {image:image.toDataURL()};
      }
      owner.save(); sendScene(); break;
    }
    case "library-logo": {
      const owner = library;
      if (input?.libraryId !== owner.data.libraryId) throw new Error(tr("曲库已切换，请重新选择。"));
      if (input.remove) owner.data.djLogo = "";
      else if (input.scale !== undefined) owner.data.djLogoScale = require("../packages/dj-logo.cjs").logoScale(input.scale);
      else {
        const result = await dialog.showOpenDialog(consoleWindow, {properties:["openFile"], filters:[{name:"Logo (PNG / WebP / JPEG)",extensions:["png","webp","jpg","jpeg"]}]});
        if (result.canceled) break;
        if (owner !== library) throw new Error(tr("曲库已切换，请重新选择。"));
        const file = result.filePaths[0];
        if (fs.statSync(file).size > 16 * 1024 * 1024) throw new Error(tr("Logo 图片不能超过 16 MB。"));
        let image = nativeImage.createFromPath(file);
        if (image.isEmpty()) throw new Error(tr("无法读取 Logo 图片。"));
        const size = image.getSize();
        const ratio = Math.min(1, 2048 / Math.max(size.width,size.height));
        if (ratio < 1) image = image.resize({width:Math.max(1,Math.round(size.width*ratio)),height:Math.max(1,Math.round(size.height*ratio))});
        // Remove transparent padding so the visible mark, not its canvas, determines scale.
        const {width,height}=image.getSize(), pixels=image.toBitmap();
        let left=width,top=height,right=-1,bottom=-1;
        for(let y=0;y<height;y++) for(let x=0;x<width;x++) if(pixels[(y*width+x)*4+3]>8) {left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
        if(right<0) throw new Error(tr("无法读取 Logo 图片。"));
        image=image.crop({x:left,y:top,width:right-left+1,height:bottom-top+1});
        owner.data.djLogo=require("../packages/dj-logo.cjs").validateLogo(image.toDataURL());
      }
      owner.save(); sendScene(); break;
    }
    case "library-profile":
      if (typeof input?.djName !== "string") throw new Error("Invalid DJ name");
      library.setDjName(input.djName);
      sendScene();
      break;
    case "rename-library": {
      ensureIdle();
      if (input?.libraryId !== library.data.libraryId) throw new Error(tr("曲库已切换，请重新选择。"));
      const name = typeof input.name === "string" ? input.name.replace(/[\u0000-\u001f\u007f]/g, " ").trim() : "";
      if (!name || Array.from(name).length > 80) throw new Error(tr("请输入 1–80 个字符的曲库名称。"));
      const next = { ...library.data, name };
      atomicJson(library.file, next);
      library.data = next;
      broadcast();
      break;
    }
    case "new-library": {
      ensureIdle();
      const id = crypto.randomUUID();
      library = new Library(path.join(librariesRoot, id));
      library.data.name = String(input || "New library").slice(0, 80);
      library.save();
      config.activeLibrary = id;
      saveConfig();
      live = {...initialLive(),blackout:live.blackout};
      sendScene();
      break;
    }
    case "reveal-library":
      return openLibraryFolder(library, shell);
    case "restart-output":
      output.capture(); stageReady=false; outputCrashes=[]; recoveringOutput=true;
      stageWindow?.destroy(); sourceWindow?.destroy(); createStage();
      performanceSession.record('output-restart');
      break;
    case "export-diagnostics": {
      const choice=await dialog.showSaveDialog(consoleWindow,{title:tr("导出诊断报告"),defaultPath:`AutoVJ-diagnostics-${Date.now()}.json`,filters:[{name:'JSON',extensions:['json']}]});
      if (choice.canceled || !choice.filePath) return {canceled:true};
      const report={version:app.getVersion(),createdAt:new Date().toISOString(),platform:process.platform,
        library:{tracks:library.data.tracks.length,prepared:library.data.tracks.filter(t=>t.status==='ready').length},
        input:{channels:devices.find(d=>d.id===settings().deviceId)?.channels,channelStart:settings().channelStart,status:inputHealth.status(live)},
        output:{visible:Boolean(stageWindow?.isVisible()),frameRateLimit:settings().frameRateLimit,renderScale:settings().renderScale,displays:screen.getAllDisplays().map(d=>({size:d.size,scaleFactor:d.scaleFactor}))},
        video:{...videoSender.state,name:undefined,spoutName:undefined,...videoRoutes,settings:{resolution:videoSettings(config.video).resolution,fps:videoSettings(config.video).fps}},
        events:performanceSession.events};
      atomicJson(choice.filePath,report); return {ok:true};
    }
    default:
      throw new Error("Unknown action");
  }
  return { ok: true };
}
ipcMain.handle("autovj:action", async (e, name, input) => {
  if (e.sender !== consoleWindow?.webContents)
    throw new Error("Operator console required");
  try {
    return await action(name, input);
  } catch (err) {
    error = err.message;
    broadcast();
    throw err;
  }
});
ipcMain.on("autovj:preview-size", (e, size) => {
  if (e.sender !== consoleWindow?.webContents) return;
  if (!Number.isFinite(size?.width) || !Number.isFinite(size?.height)) return;
  previewVisible = size.width > 0 && size.height > 0;
  updateRenderActivity();
});
ipcMain.on("autovj:performance", (e, stats) => {
  if (e.sender !== sourceWindow?.webContents || !library.data.settings.showFps) return;
  if (!Number.isFinite(stats?.fps) || stats.fps < 0 || stats.fps > 1000) return;
  if (consoleWindow && !consoleWindow.isDestroyed())
    consoleWindow.webContents.send("autovj:performance", {fps: stats.fps});
});
ipcMain.on("autovj:stage-ready", (e) => {
  if (e.sender === sourceWindow?.webContents) {
    stageReady = true;
    pcmPending = 0;
    sendScene();
  }
});
ipcMain.on("autovj:stage-painted", (e) => {
  if(e.sender !== sourceWindow?.webContents || !recoveringOutput) return;
  recoveringOutput=false;
  output.restore().then(()=>{error='';performanceSession.record('output-recovered');broadcast();})
    .catch(e=>{error=e.message;broadcast();});
});
ipcMain.on("autovj:pcm-ack", (e) => {
  if (e.sender === sourceWindow?.webContents)
    pcmPending = Math.max(0, pcmPending - 1);
});
ipcMain.on("autovj:stage-error", (e, message) => {
  if (e.sender === sourceWindow?.webContents) {
    error = tr("画面：") + message;
    broadcast();
  }
});
ipcMain.on("autovj:hide-output", (e) => {
  if (e.sender === stageWindow?.webContents) {
    hideOutput();
  }
});
ipcMain.on('autovj:presenter-ready',(e)=>{
  if(e.sender===consoleWindow?.webContents)consolePresenterReady=true;
  else if(e.sender===stageWindow?.webContents)presenterReady=true;
  else return;
  sendScene();
});
if (!app.requestSingleInstanceLock()) app.quit();
else
  app
    .whenReady()
    .then(async () => {
      session.defaultSession.setPermissionRequestHandler(
        (_wc, _permission, callback) => callback(false),
      );
      fs.mkdirSync(librariesRoot, { recursive: true });
      await recoverRemovals(librariesRoot);
      try {
        config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      } catch {}
      if (!UUID.test(config.activeLibrary || ""))
        config.activeLibrary = crypto.randomUUID();
      library = new Library(path.join(librariesRoot, config.activeLibrary));
      migrateEquipment(config, library.data.settings);
      config.video=videoSettings(config.video);
      for (const t of library.data.tracks)
        if (t.status === "analyzing") t.status = "pending";
      library.save();
      saveConfig();
      host = new LiveHost(EXE);
      host.on("pcm", (frame) => {
        if (stageReady && pcmPending < 4) {
          pcmPending++;
          sourceWindow.webContents.send("autovj:pcm", frame);
        }
        if (rhythmWorker && rhythmPending < 8) {
          rhythmPending++;
          rhythmWorker.postMessage({ samples: frame.samples });
        }
      });
      host.on("status", (e) => {
        const prior = live;
        live = reduceLive(live, e);
        if (e.type === 'level') inputHealth.level(e);
        if (['ready','device','reconnecting','standby','stale','error'].includes(e.type))
          performanceSession.record(e.type,{lost:e.lost,code:e.code});
        if(e.type==='match' && ['confirmed','tentative','mix-hold'].includes(e.event) && (live.currentId!==prior.currentId || live.candidateId!==prior.candidateId))
          performanceSession.record('recognition',{event:e.event,trackId:UUID.test(e.trackUid || '') ? e.trackUid : undefined});
        if (e.type === "error") error = e.message;
        if (["device", "reconnecting", "standby", "stale"].includes(e.type)) {
          rhythmWorker?.postMessage({ type: "reset" });
          sendScene();
        } else if (live.currentId !== prior.currentId) sendScene();
        else broadcast();
      });
      configureLink();
      createStage();
      openConsole();
      scheduleAutomaticUpdateCheck();
      try {
        devices = (await nativeTask(EXE, ["--devices"])).devices;
      } catch (e) {
        error = e.message;
      }
      broadcast();
      setInterval(() => {if(live.running)broadcast();},1000).unref();
      screen.on("display-added", broadcast);
      screen.on("display-removed", () => {
        hideOutput();
        error = tr("显示器配置改变，输出已返回预览。");
        broadcast();
      });
    })
    .catch((e) => {
      dialog.showErrorBox("Genre Police AutoVJ", e.stack || e.message);
      app.quit();
    });
app.on("second-instance", () => {
  consoleWindow?.show();
  consoleWindow?.focus();
});
app.on("before-quit", (e) => {
  if (quitting) return;
  e.preventDefault();
  quitting = true;
  linkClient.stop();
  clearTimeout(videoRecoveryTimer);
  performanceSession.updateAwake(false);
  queue = [];
  worker?.postMessage("cancel");
  stopRhythm();
  Promise.allSettled([videoExport.dispose(),host?.stop(),videoChange.then(()=>videoSender.stop()),textures.drain()]).finally(() => {
    worker?.terminate();
    analysisPool?.terminate();
    app.quit();
  });
});
