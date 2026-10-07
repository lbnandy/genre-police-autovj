import { createVideoExporter } from "./video-export.mjs";
import { cropCover } from "./cover-crop.mjs";
import { updateSelectPickers, closeSelectPicker } from "./select-picker.mjs";
import { translate, setLanguage } from "./i18n.mjs";
import { videoRoutesMarkup, videoSettingsMarkup, syncVideo } from './video-controls.mjs';
import { sortGenreOptions } from "./genre-options.mjs";
const api = window.autovj,
  $ = (id) => document.getElementById(id),
  esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
let state,
  tab = "live",
  selected = new Set(),
  search = "",
  filter = "all",
  lastTable = "",
  lastError = "",
  editorId = null;
let removal = null, removalBusy = false;
let libraryStatsOwner = null, libraryStats = {}, filteredOwner = null, filteredKey = '', filteredTracks = [];
const t = (zh, en) => translate(state?.settings.language || "zh", zh, en);
const openVideoExport = createVideoExporter({api,t,esc});
const iconNames = {"volume-2": "volume_up", monitor: "desktop_windows", "sliders-horizontal": "tune", "refresh-cw": "refresh", "music-2": "music_note", x: "close"};
const icon = (name) => `<img class="ui-icon material-symbol" src="../assets/material-symbols/${iconNames[name] || name}.svg" alt="">`;
const windowIcon = (name) => `<img class="ui-icon material-symbol" data-symbol="${name}" src="../assets/material-symbols/${name}.svg" alt="">`;
const option = (id, label, parent = "") =>
  `<option value="${esc(id)}"${parent ? ` data-parent="${esc(parent)}"` : ""}>${esc(label)}</option>`;
function toast(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("toast").hidden = true), 6000);
}
async function call(name, input) {
  try {
    return await api.call(name, input);
  } catch (e) {
    toast(t(e.message.replace(/^Error invoking remote method.*?: Error: /, "")));
    return null;
  }
}
function themeLabel(id) {
  if (id === "neutral") return "STANDBY";
  return (
    state?.library.themes.find((x) => x.id === id)?.label ||
    t("待确认", "Unassigned")
  );
}
function themeOptions(automatic = false) {
  return sortGenreOptions([
    ...(automatic ? [{ value: "", label: t("跟随自动结果", "Use automatic result"), pinned: true }] : []),
    ...state.library.themes.map((theme) => ({ value: theme.id, label: theme.label, parent: theme.parent })),
  ]).map((item) => option(item.value, item.label, item.parent)).join("");
}
function view() {
  $("toast").hidden = true;
  closeSelectPicker();
  previewObserver.disconnect();
  const oldTab = tab;
  setLanguage(state.settings.language);
  $("console").innerHTML =
    `<header class="topbar">
  <div class="brand"><img class="brand-mark" src="../assets/icon.png" alt=""><div><div class="brand-title">GENRE POLICE</div><div class="brand-sub">AUTO VJ</div></div></div>
  <nav class="tabs" aria-label="${t("主导航", "Navigation")}"><button data-tab="live"><span>${t("现场演出", "Live")}</span></button><button data-tab="library"><span>${t("准备音乐", "Prepare")}</span></button><button data-tab="settings"><span>${t("设置", "Settings")}</span></button></nav>
  <div class="top-status"><span id="top-status"></span></div>
  <div class="window-controls"><button data-action="minimize" aria-label="${t("最小化", "Minimize")}">${windowIcon("remove")}</button><button id="window-maximize" data-action="maximize" aria-label="${t("最大化", "Maximize")}">${windowIcon("crop_square")}</button><button data-action="close" aria-label="${t("关闭", "Close")}">${windowIcon("close")}</button></div>
</header>
<aside id="update-notice" class="update-notice" role="status" hidden><div><strong>${t("发现新版本", "Update available")}</strong><span id="update-notice-copy"></span></div><div class="row"><button class="small ghost" data-action="dismiss-update">${t("暂不提醒", "Not now")}</button><button class="small primary" data-action="open-update">${t("查看更新", "View update")}</button></div></aside>
<main>
<section class="page" id="page-live">
  <div class="page-heading"><div class="row"><h1>${t("现场演出", "Live")}</h1><span id="live-library" class="muted"></span></div><button id="live-toggle" class="primary" data-action="live-toggle"></button></div>
  <div class="hero-grid">
    <article class="panel preview-panel"><div class="panel-head"><h3>${t("输出预览", "Output preview")}</h3><span id="fps-readout" class="fps-readout" hidden></span><span id="output-badge" class="badge"></span></div>
      <div class="program"><canvas id="preview" aria-label="${t("现场输出画面预览", "Live output preview")}"></canvas><div class="preview-placeholder">${t("正在启动视觉引擎…", "Starting the visual engine…")}</div></div>
      <div class="program-footer"><div class="readouts grow"><span>MASTER</span><div class="meter"><i id="input-meter"></i></div><span id="db-value">−∞ dB</span></div><div class="preview-actions"><button class="small ghost" id="screen-impact-button" data-action="screen-impact" aria-pressed="false">${t("全屏冲击", "Screen impact")} <kbd class="key">X</kbd></button><button class="small ghost danger" id="blackout-button" data-action="blackout">${t("切黑", "Blackout")} <span class="key">B</span></button></div></div>
    </article>
    <aside class="panel cue"><div><div class="row between"><h3>${t("当前视觉", "Current visual")}</h3><span id="mode-badge" class="badge purple"></span></div><div id="cue-theme" class="cue-theme"></div><div id="cue-track" class="cue-track"></div><div id="cue-artist" class="cue-artist"></div></div>
      <div class="cue-scroll">
        <section class="recognition-details"><h4>${t("音乐电量", "Music charge")}</h4><p id="recognition-status" class="recognition-status"></p>
          <div class="evidence-meter"><div class="row between"><span class="charge-label"><span>${t("当前曲目", "Current track")}</span><span id="current-charge-title" class="charge-title"></span></span><span id="current-charge" class="charge-value"></span></div><div class="meter" role="meter" aria-label="${t("当前曲目匹配证据", "Current track match evidence")}" aria-valuemin="0" aria-valuemax="10" aria-valuenow="0"><i id="current-battery"></i></div></div>
          <div class="evidence-meter"><div class="row between"><span class="charge-label"><span>${t("候选曲目", "Candidate track")}</span><span id="candidate-charge-title" class="charge-title"></span></span><span id="candidate-charge" class="charge-value"></span></div><div class="meter" role="meter" aria-label="${t("候选曲目匹配证据", "Candidate track match evidence")}" aria-valuemin="0" aria-valuemax="10" aria-valuenow="0"><i id="candidate-battery"></i></div></div>
          <p id="candidate-name" class="cue-hint"></p><p id="candidate-artist" class="cue-hint"></p><p id="recognition-note" class="cue-note"></p>
        </section>
        <section id="cue-rhythm"><h4>${t("节奏与冲击", "Rhythm & impact")}</h4><p id="live-rhythm-status" class="cue-note"></p></section><section class="genre-evidence"><div class="row between"><h4>${t("曲风依据", "Genre evidence")}</h4><button id="cue-evidence-button" class="small ghost">${t("详情", "Details")}</button></div><div id="cue-evidence"></div></section>
      </div>
      <div class="cue-manual"><label class="field"><span>${t("手动指定视觉", "Manual visual")}</span><select id="lock-theme" data-searchable data-search-placeholder="${t("输入或选择曲风", "Type or choose a genre")}" data-empty-text="${t("未找到曲风", "No matching genres")}" aria-label="${t("手动指定视觉", "Manual visual")}"></select></label><button id="auto-button" class="small ghost" data-action="auto">${t("恢复自动", "Return to auto")} <span class="key">A</span></button></div>
    </aside>
  </div>
  <div class="control-grid">
    <article class="panel control-card"><div class="control-title">${icon("volume-2")}<h3>${t("音频输入", "Audio input")}</h3><button class="small ghost" style="margin-left:auto" data-action="refresh" aria-label="${t("刷新设备", "Refresh devices")}">${icon("refresh-cw")}</button></div><div class="field-row"><label class="field"><span>DJ MASTER</span><select id="device" aria-label="DJ Master"></select></label><label class="field"><span>${t("通道", "Channels")}</span><select id="channels"></select></label></div><p id="input-hint" class="bottom-caption"></p></article>
    <article class="panel control-card"><div class="control-title">${icon("monitor")}<h3>${t("画面输出", "Visual output")}</h3><button class="small ghost sender-settings-button" data-action="video-config">${t("发送设置", "Sender settings")}</button></div><label class="field"><span>${t("输出屏幕", "Display")}</span><select id="display"></select></label><div class="output-actions"><button data-action="window">${t("窗口预览", "Window")}</button><button data-action="fullscreen">${t("全屏输出", "Fullscreen")}</button><button class="ghost" data-action="hide">${t("收起窗口", "Hide window")}</button></div>${videoRoutesMarkup(t)}</article>
    <article class="panel control-card performance-card"><div class="control-title">${icon("sliders-horizontal")}<h3>${t("现场表现", "Performance")}</h3></div><div class="row between"><label for="brightness" class="muted">${t("画面亮度", "Brightness")}</label><span id="brightness-value" class="range-label"></span></div><input id="brightness" type="range" min="5" max="100" aria-label="${t("画面亮度", "Brightness")}"><div class="performance-options"><label class="performance-field"><span>${t("视觉响应强度", "Visual response intensity")}</span><select id="intensity"><option value="calm">${t("低", "Low")}</option><option value="standard">${t("中", "Medium")}</option><option value="energetic">${t("高", "High")}</option></select></label><label class="performance-field"><span>${t("冲击效果强度", "Impact effect intensity")}</span><select id="impactLevel"><option value="low">${t("低", "Low")}</option><option value="medium">${t("中", "Medium")}</option><option value="high">${t("高", "High")}</option><option value="extreme">${t("极高", "Very high")}</option><option value="ultra">${t("超高", "Ultra")}</option></select></label><label class="performance-field"><span>${t("可视化大小", "Visualizer size")}</span><select id="visualSize"><option value="standard">${t("小", "Small")}</option><option value="large">${t("标准", "Standard")}</option><option value="maximum">${t("大", "Large")}</option></select></label></div></article>
  </div>
</section>
<section class="page" id="page-library">
  <div class="page-heading"><h1>${t("准备音乐", "Prepare")}</h1><div class="row"><button data-action="import">${t("导入曲库包", "Import pack")}</button><button data-action="export">${t("导出曲库包", "Export library pack")}</button></div></div>
  <div class="library-bar"><label class="field"><span>${t("当前曲库", "Active library")}</span><select id="library-select"></select></label><button data-action="new-library">+ ${t("新建曲库", "New library")}</button><button class="ghost" data-action="rename-library">${t("重命名", "Rename")}</button><div class="library-management"><button id="library-manage-button" class="ghost" popovertarget="library-manage" aria-controls="library-manage" aria-expanded="false">${t("管理曲库", "Manage library")}<img class="ui-icon" src="../assets/material-symbols/expand_more.svg" alt=""></button><div id="library-manage" class="action-popover" popover aria-label="${t("管理曲库", "Manage library")}"><button class="ghost" data-action="reveal">${t("打开曲库数据文件夹", "Open library data folder")}</button><div class="divider"></div><button class="ghost danger" data-action="delete-library">${t("删除曲库", "Delete library")}</button></div></div><div class="summary-grid" id="summaries"></div></div>
  <article class="dj-profile"><h2>${t("曲库视觉素材")}</h2><p class="dj-profile-note">${t("自动保存到当前曲库，导出曲库时一起携带。", "Saved automatically to this library and included in its export.")}</p><div class="dj-profile-fields"><label class="field dj-name-field"><span>${t("DJ 名字", "DJ name")}</span><input id="dj-name" type="text" maxlength="64" autocomplete="off" placeholder="${t("整套曲库使用的 DJ 名字", "One DJ name for this library")}" title="${t("自动保存到当前曲库，导出曲库时一起携带。", "Saved automatically to this library and included in its export.")}"></label><div class="dj-logo-control"><span class="profile-label">DJ Logo</span><div class="profile-actions"><img id="dj-logo-preview" alt="DJ Logo" hidden><button class="ghost" data-action="choose-logo">${t("选择 DJ Logo", "Choose DJ logo")}</button><button id="remove-logo" class="small ghost" data-action="remove-logo">${t("移除", "Remove")}</button></div><label id="logo-scale-field" class="field"><span>${t("Logo 大小", "Logo size")} <output id="logo-scale-value"></output></span><input id="logo-scale" type="range" min="50" max="150" step="5" aria-label="${t("Logo 大小", "Logo size")}"></label><small>${t("推荐透明 PNG，自动裁去透明边距并保留比例。", "Transparent PNG recommended; padding is trimmed and proportions preserved.")}</small></div><div class="library-cover-control"><span class="profile-label">${t("自定义封面", "Custom cover")}</span><div class="profile-actions"><img id="custom-cover-preview" alt="" hidden><button class="ghost" data-action="choose-cover">${t("自定义封面", "Custom cover")}</button><button id="remove-cover" class="small ghost" data-action="remove-cover">${t("移除", "Remove")}</button></div><small>${t("替换整套曲库的封面；移除后恢复曲目封面。", "Overrides artwork for this library. Remove to restore track artwork.")}</small></div></div></article>
  <div class="toolbar"><button class="primary" data-action="files">+ ${t("添加音乐", "Add music")}</button><button data-action="folder">${t("添加文件夹", "Add folder")}</button><span class="analysis-control"><button id="analyze-button" data-action="analyze"></button><button id="cancel-analysis" class="ghost inactive" data-action="cancel" aria-hidden="true">${t("停止分析", "Stop analysis")}</button></span><button id="export-task" class="small ghost" data-action="export-task" hidden>${t("导出任务")}</button><span class="grow"></span><input id="search" type="search" aria-label="${t("搜索曲名或艺人", "Search tracks or artists")}" placeholder="${t("搜索曲名或艺人", "Search tracks or artists")}"><select id="filter" aria-label="${t("筛选曲目", "Filter tracks")}"><option value="all">${t("全部曲目", "All tracks")}</option><option value="review">${t("需要确认", "Needs review")}</option><option value="pending">${t("待准备", "Not prepared")}</option><option value="ready">${t("已准备", "Prepared")}</option></select></div>
  <article class="panel tracks-panel"><div class="track-selection-bar"><span id="selection-info"></span><div class="row" id="selection-actions"><button class="small ghost" data-action="clear-selection">${t("清除选择", "Clear selection")}</button><button id="export-selected" class="small ghost" data-action="export-selected">${t("批量导出视频")}</button><button id="remove-selected" class="small ghost danger" data-action="remove-selected">${t("移除所选曲目", "Remove selected tracks")}</button></div></div><div class="table-wrap" id="tracks"></div><div class="table-footer"><div class="library-activity"><div id="undo-removal-note" class="undo-note" role="status" hidden><span id="undo-removal-text"></span><button class="small ghost" data-action="undo-removal">${t("撤销移除", "Undo removal")}</button></div><p id="library-busy" role="status" hidden></p><div id="job" class="job" hidden><div class="job-copy"><span id="job-title"></span><span id="job-count" class="muted"></span><span id="job-detail" class="muted"></span></div><div id="job-progress" class="meter" role="progressbar" aria-label="${t("整批分析进度", "Batch analysis progress")}" aria-valuemin="0" aria-valuemax="100"><i class="job-progress-fill"></i></div></div></div></div></article><p class="bottom-caption">${t("曲库包包含分析数据，不含音乐文件。音乐需另行携带。", "Library packs contain analysis data, not music. Bring your audio files separately.")}</p>
</section>
<section class="page" id="page-settings">
  <div class="page-heading"><h1>${t("设置", "Settings")}</h1><label class="settings-language"><span>${t("语言", "Language")}</span><select id="language"><option value="system">${t("跟随系统", "Follow system")}</option><option value="zh">简体中文</option><option value="en">English</option><option value="ja">日本語</option><option value="ko">한국어</option></select></label></div>
  <div class="settings-grid">
  <div class="settings-column">
  <article class="panel settings-card display-settings"><h2>${t("画面与文字", "Visuals & text")}</h2>
    <label class="setting-row"><div><p>${t("布局", "Layout")}</p></div><select id="layout"><option value="split">${t("左右", "Side by side")}</option><option value="stacked">${t("上下", "Stacked")}</option></select></label>
    <label class="setting-row"><div><p>${t("显示文字与 Logo", "Show text & logo")}</p></div><input id="text-visible" type="checkbox" role="switch"></label>
    <div class="text-options">
      <label class="setting-row"><div><p>${t("标题内容", "Heading")}</p><small>${t("DJ 名字和 Logo 在准备音乐中设置。", "Set your DJ name and logo in Prepare.")}</small></div><select id="heading-mode"><option value="genre">${t("曲风", "Genre")}</option><option value="dj">${t("DJ 名字", "DJ name")}</option><option value="logo">DJ Logo</option><option value="hidden">${t("隐藏", "Hidden")}</option></select></label>
      <label class="setting-row"><div><p>${t("显示曲目信息", "Show track information")}</p><small>${t("显示曲名、艺人及分隔线；隐藏后画面主体居中。", "Show title, artist and divider; center the composition when hidden.")}</small></div><input id="track-info-visible" type="checkbox" role="switch"></label>
      <label class="setting-row"><div><p>${t("显示品牌标识", "Show branding")}</p></div><input id="branding-visible" type="checkbox" role="switch"></label>
      <label class="setting-row"><div><p>${t("英文窄体", "Condensed English")}</p><small>${t("用于曲名和艺人的英文文字。", "For English track titles and artist names.")}</small></div><input id="english-condensed" type="checkbox" role="switch"></label>
    </div>
    <label class="setting-row"><div><p>${t("显示封面", "Show artwork")}</p></div><input id="artwork-visible" type="checkbox" role="switch"></label>
    <label class="setting-row"><div><p>${t("待机视觉", "Standby visual")}</p><small>${t("等待音乐时使用的画面。", "Visual used while waiting for music.")}</small></div><select id="standbyTheme" data-searchable data-search-placeholder="${t("输入或选择曲风", "Type or choose a genre")}" data-empty-text="${t("未找到曲风", "No matching genres")}"></select></label>
    <div class="setting-row preset-setting"><div><p>${t("自定义视觉预设", "Custom visual presets")}</p><small>${t("保存曲风配色，分配给曲目或现场手动使用。", "Save genre colors for a track or manual live use.")}</small></div><button data-action="new-preset">${t("创建预设", "Create preset")}</button></div>
  </article>
  <article class="panel settings-card analysis-settings"><h2>${t("曲风分析", "Genre analysis")}</h2>
    <label class="setting-row"><div><p>${t("在线查询曲风", "Online genre lookup")}</p><small>${t("准备时查询并缓存。仅发送曲名和艺人，不上传音频。", "Look up and cache during preparation. Only title and artist are sent, never audio.")}</small></div><input type="checkbox" id="online" role="switch"></label>
    <label class="setting-row"><div><p>${t("本地 AI 分析", "Local AI analysis")}</p><small>${t("汇总整首音乐的曲风，支持离线准备。", "Analyze genre across the whole track, including offline.")}</small></div><input type="checkbox" id="localAI" role="switch"></label>
    <details class="performance-details analysis-details"><summary>${t("判定规则与网络策略", "Decision rules & network policy")}<img class="ui-icon" src="../assets/material-symbols/expand_more.svg" alt=""></summary><p class="settings-note">${t("读取文件曲风标签（ID3 / Vorbis 等），结合在线资料和整曲 AI 结果。具体标签优先，冲突结果标记待确认。", "Reads file genre tags (ID3 / Vorbis etc.) alongside online metadata and whole-track AI. Specific tags take priority; conflicting results are flagged for review.")}</p><p class="settings-note">${t("手动指定始终优先，重新分析不会覆盖它。", "Manual choices take priority and survive reanalysis.")}</p><p class="settings-note">${t("根据网络地区自动调整查询：中国大陆优先 Apple 中国区，并跳过 Deezer。", "Lookup adapts to the network region: in mainland China, prefer Apple China and skip Deezer.")}</p></details>
  </article>
  <article class="panel settings-card about-card"><div class="row"><img class="about-icon" src="../assets/icon.png" alt=""><div><h2>GENRE POLICE AUTOVJ</h2><span class="muted app-version">v${esc(state.version)}</span></div></div><div class="credit">Project design, visuals & genre analysis by <strong>LBN</strong><br><div class="recognition-credit"><span>Audio recognition by <strong>DJ ICHIRYU</strong></span><span class="credit-logo"><img src="../assets/credits/dj-ichiryu.png" alt="DJ ICHIRYU"></span></div>Based on <a class="repository-link" data-repository="genre-police" href="https://github.com/lbnandy/genre-police-visualizer">Genre Police Visualizer</a> & <a class="repository-link" data-repository="vjvision" href="https://github.com/ichiryu0021/VJVision">VJVision</a></div><div class="software-update"><div><p>${t("软件更新", "Software update")}</p><small id="update-state"></small></div><div class="row"><button id="update-check-button" class="small ghost" data-action="update-check">${t("检查更新", "Check for updates")}</button><button id="update-view-button" class="small primary" data-action="open-update" hidden>${t("查看更新", "View update")}</button></div></div><p class="settings-note ndi-attribution">NDI® is a registered trademark of Vizrt NDI AB.</p><p class="settings-note">${t("本地曲风模型的许可信息见随附 THIRD_PARTY_NOTICES。", "See the included THIRD_PARTY_NOTICES for the local genre model license.")}</p></article>
  </div>
  <div class="settings-column">
    <article class="panel settings-card rhythm-settings"><h2>${t("节奏与冲击", "Rhythm & impact")}</h2>
      <label class="setting-row"><div><p>${t("节拍来源", "Beat source")}</p><small>${t("自动：Link 已连接时使用 Link，否则使用音频识别。", "Auto uses Link when connected, otherwise audio detection.")}</small></div><select id="rhythmSource">${option("auto",t("自动（推荐）", "Auto (recommended)"))}${option("audio",t("音频识别", "Audio detection"))}${option("link","Ableton Link")}</select></label>
      <div id="link-settings" hidden>
        <p id="link-state" class="settings-note" role="status"></p>
        <details class="performance-details"><summary>${t("连接与校准", "Connection & calibration")}<img class="ui-icon" src="../assets/material-symbols/expand_more.svg" alt=""></summary>
          <p class="settings-note">${t("在 rekordbox 中开启全局和 Deck 的 LINK，并连接同一局域网。同步组件自动启动，AutoVJ 只跟随，不改变速度。", "Enable global and deck LINK in rekordbox and join the same local network. The sync component starts automatically; AutoVJ follows without changing tempo.")}</p>
        <label class="setting-row"><div><p>${t("同步偏移（毫秒）", "Sync offset (ms)")}</p><small>${t("正值延后画面，负值提前。仅保存在本机。", "Positive delays visuals; negative advances them. Saved on this computer.")}</small></div><input id="linkOffsetMs" type="number" min="-250" max="250" step="5" aria-label="${t("同步偏移（毫秒）", "Sync offset (ms)")}"></label>
        </details>
      </div>
      <label class="setting-row"><div><p>${t("冲击模式", "Impact mode")}</p><small>${t("音乐响应跟随音乐事件；节拍驱动仅在拍点冲击。静音时停止冲击。", "Music response follows musical events; beat-driven impacts occur only on beats. Impacts stop during silence.")}</small></div><select id="impactMode">${option("music",t("音乐响应", "Music response"))}${option("beat",t("节拍驱动", "Beat-driven"))}</select></label>
      <label class="setting-row" id="beat-strength-row"><div><p>${t("冲击强度", "Impact strength")}</p><small>${t("每拍都会触发；随音乐变化只改变强弱。", "Every beat triggers; music only changes its strength.")}</small></div><select id="beatStrength">${option("fixed",t("固定强度", "Fixed"))}${option("dynamic",t("随音乐变化", "Follow music"))}</select></label>
    </article>
  <article class="panel settings-card performance-settings"><h2>${t("输出与性能", "Output & performance")}</h2>
    <label class="setting-row"><div><p>${t("低负载模式", "Low-load mode")}</p><small>${t("降低预览与动画开销，文字和发送格式保持不变。仅保存在本机。", "Reduce preview and animation work while preserving text and the send format. Saved on this computer.")}</small></div><input type="checkbox" id="low-load" role="switch"></label>
    ${videoSettingsMarkup(t,option)}
    <label class="setting-row"><div><p>${t("本地帧率上限", "Local frame rate limit")}</p><small id="local-frame-hint" hidden>${t("发送期间由发送帧率决定画面节奏。", "While sending, the send frame rate sets the visual cadence.")}</small></div><select id="frameRateLimit">${option("display", t("跟随显示器", "Match display"))}${[120,90,60,30].map(n => option(n, n + " FPS")).join("")}</select></label>
    <label class="setting-row"><div><p>${t("渲染质量", "Render quality")}</p><small>${t("自动调节动画分辨率，文字保持清晰；也可固定画质。", "Automatically adjust animation resolution while keeping text sharp, or choose a fixed quality.")}</small></div><select id="renderScale"><option value="auto">${t("自动（推荐）", "Auto (recommended)")}</option><option value="1">100%</option><option value="0.75">75%</option><option value="0.5">50%</option></select></label>
    <details class="performance-details"><summary>${t("待机与帧率监测", "Standby & frame rate monitoring")}<img class="ui-icon" src="../assets/material-symbols/expand_more.svg" alt=""></summary><label class="setting-row"><div><p>${t("待机时降低帧率", "Limit standby frame rate")}</p><small>${t("未启动监听的待机画面限制为 30 FPS。", "Limit standby to 30 FPS while listening is stopped.")}</small></div><input type="checkbox" id="idleFrameLimit" role="switch"></label><label class="setting-row"><div><p>${t("控制台显示帧率", "Show FPS in console")}</p><small>${t("分别显示输出和预览帧率，观众画面不显示。", "Show output and preview FPS in the console only.")}</small></div><input type="checkbox" id="showFps" role="switch"></label></details>
    <details class="performance-details"><summary>${t("演出保护与诊断", "Show protection & diagnostics")}<img class="ui-icon" src="../assets/material-symbols/expand_more.svg" alt=""></summary>
      <label class="setting-row"><div><p>${t("演出时保持屏幕唤醒", "Keep screen awake during shows")}</p><small>${t("监听或输出期间阻止空闲休眠，结束后恢复。", "Prevent idle sleep while listening or outputting; release when finished.")}</small></div><input id="keepAwake" type="checkbox" role="switch"></label>
      <p class="bottom-caption">${t("音频设备、通道和输出屏幕保存在本机，切换曲库时保留。", "Audio routing and output display stay on this computer when switching libraries.")}</p>
      <div class="row diagnostic-actions"><button class="small ghost" data-action="restart-output">${t("重新启动画面", "Restart visuals")}</button><button class="small ghost" data-action="export-diagnostics">${t("导出诊断报告", "Export diagnostics")}</button></div>
      <p class="bottom-caption">${t("仅导出本次运行的状态与事件，不含音频、曲名和文件路径。", "Export session status and events only, without audio, track titles or file paths.")}</p>
    </details>
  </article>
  </div>
  </div>
</section>
</main>
<footer><span class="shortcuts"><span class="shortcut-label">${t("控制台快捷键", "Console shortcuts")}${state.settings.language === "zh" || state.settings.language === "ja" ? "：" : ":"}</span><span class="shortcut"><kbd class="key">B</kbd>${t("切黑", "Blackout")}</span><span class="shortcut"><kbd class="key">X</kbd>${t("全屏冲击", "Screen impact")}</span><span class="shortcut"><kbd class="key">A</kbd>${t("自动", "Auto")}</span><span class="shortcut"><kbd class="key">F</kbd>${t("全屏", "Fullscreen")}</span><span class="shortcut"><kbd class="key">Esc</kbd>${t("收起窗口", "Hide window")}</span></span></footer>
`;
  $("library-manage").addEventListener("toggle", e => {
    $("library-manage-button").setAttribute("aria-expanded", String(e.newState === "open"));
  });
  $("library-manage").addEventListener("beforetoggle", e => {
    if (e.newState !== "open") return;
    closeSelectPicker();
    const r = $("library-manage-button").getBoundingClientRect();
    $("library-manage").style.left = Math.min(r.left, innerWidth - 210) + "px";
    $("library-manage").style.top = r.bottom + 6 + "px";
  });
  $("layout").setAttribute("aria-label", t("布局", "Layout"));

  previewObserver.observe(document.querySelector(".program"));
  setTab(oldTab);
  $("search").value = search;
  $("filter").value = filter;
  let scrollFrame = 0;
  $('tracks').addEventListener('scroll',()=>{
    if(scrollFrame)return;
    scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;renderTracks();});
  });
  lastTable = "";
  sync();
}
function setTab(next) {
  closeSelectPicker();
  const changed = next !== tab;
  tab = next;
  document.body.dataset.page = next;
  document
    .querySelectorAll("[data-tab]")
    .forEach((x) => { x.classList.toggle("active", x.dataset.tab === tab); x.setAttribute("aria-current", x.dataset.tab === tab ? "page" : "false"); });
  document
    .querySelectorAll(".page")
    .forEach((x) => x.classList.toggle("active", x.id === "page-" + tab));
  if (changed) document.querySelector("main").scrollTop = 0;
  if(tab === 'library' && $('tracks'))renderTracks();
}
function setValue(id, value) {
  const el = $(id);
  if (document.activeElement === el) return;
  if (el.type === "checkbox") el.checked = Boolean(value);
  else el.value = value ?? "";
}
function setOptions(id, html) {
  if ($(id).innerHTML !== html && document.activeElement !== $(id))
    $(id).innerHTML = html;
}
function statusText() {
  if (state.live.running && state.live.candidateId)
    return state.live.currentId ? t("候选复核中 · 保持当前画面", "Checking candidate · holding current visual") : t("正在复核候选曲目", "Verifying candidate track");
  return (
    {
      stopped: t("监听未启动", "Not listening"),
      starting: t("正在连接输入", "Connecting input"),
      listening: t("等待识别曲目", "Listening for a track"),
      confirmed: t("曲目已确认", "Track confirmed"),
      "device-lost": t("设备断开 · 等待恢复", "Device lost · waiting"),
      standby: t("静音 · 待机", "Silence · standby"),
      stale: t("暂未识别 · 待机", "Unknown track · standby"),
      reconnecting: t("识曲服务恢复中", "Recognition reconnecting"),
      error: t("需要检查输入", "Check the input"),
    }[state.live.phase] || state.live.phase
  );
}
function syncGenreEvidence(track) {
  const button = $("cue-evidence-button");
  button.hidden = !track;
  if (track) button.dataset.edit = track.id;
  else delete button.dataset.edit;
  let html;
  if (!track) html = `<p class="cue-note">${t("识别曲目后显示已保存的分析依据。", "Saved analysis appears after a track is identified.")}</p>`;
  else {
    const source = track.manualGenre ? t("手动指定", "Manual override") : ({
      file: t("文件标签", "File tags"), "local-ai": t("整曲 AI", "Whole-track AI"),
      "Apple Music catalog": t("Apple 曲目资料", "Apple track metadata"),
      "Deezer album": t("Deezer 专辑资料", "Deezer album metadata"),
      default: t("暂无有效依据", "No usable evidence"),
    })[track.suggestion?.source] || track.suggestion?.source || t("暂无有效依据", "No usable evidence");
    const rows = [[t("判定来源", "Decision source"), source]];
    if ((state.live.lockedTheme || track.visualId) !== track.genreId)
      rows.unshift([t("曲目曲风", "Track genre"), themeLabel(track.genreId)]);
    if (track.fileTags?.length) rows.push([t("文件标签", "File tags"), track.fileTags.join(", ")]);
    if (track.analysis?.ai?.id) rows.push([t("整曲 AI", "Whole-track AI"), themeLabel(track.analysis.ai.id)]);
    const review = !track.manualGenre && !track.confirmed && track.suggestion?.uncertain;
    const note = track.manualGenre ? t("人工指定优先于自动分析。", "Manual choice takes priority over analysis.")
      : track.confirmed ? t("已人工复核", "Reviewed manually")
      : track.suggestion?.conflict ? t("来源结果有冲突，建议复核。", "Sources disagree; review is recommended.")
      : review ? t("结果待确认", "Result needs review") : "";
    html = `${note ? `<p class="cue-note${review ? " warning" : ""}">${note}</p>` : ""}<dl>${rows.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd title="${esc(value)}">${esc(value)}</dd></div>`).join("")}</dl>`;
  }
  if ($("cue-evidence").innerHTML !== html) $("cue-evidence").innerHTML = html;
}
function sync() {
  const live = state.live,
    s = state.settings;
  const update = state.update || { status: "idle" };
  const trackIds = new Set(state.library.tracks.map(track => track.id));
  for (const id of selected) if (!trackIds.has(id)) selected.delete(id);
  const busy = live.running || Boolean(state.job || state.queue || state.maintenance);
  const themeId = live.lockedTheme || live.current?.visualId || s.standbyTheme;
  $("top-status").innerHTML =
    `<span class="dot" style="color:${live.running ? "var(--cyan)" : "#718094"}"></span>${esc(live.running ? t("正在监听现场", "Listening to master") : t("未监听", "Not listening"))}`;
  const updateCopy = {
    checking: t("正在检查更新…", "Checking for updates…"),
    current: t("已经是最新版本", "Up to date"),
    available: `${update.latestVersion || ""} · ${t("新版本已可下载。", "A new version is ready to download.")}`,
    error: t("无法检查更新，请稍后重试。", "Unable to check for updates. Try again later."),
    idle: `${t("当前版本", "Current version")} · v${state.version}`,
  }[update.status] || `${t("当前版本", "Current version")} · v${state.version}`;
  $("update-state").textContent = updateCopy;
  $("update-check-button").disabled = update.status === "checking";
  $("update-check-button").setAttribute("aria-busy", String(update.status === "checking"));
  $("update-view-button").hidden = update.status !== "available";
  $("update-notice").hidden = update.status !== "available" || update.dismissed;
  $("update-notice-copy").textContent = update.status === "available" ? `${update.latestVersion || ""} · ${t("新版本已可下载。", "A new version is ready to download.")}` : "";
  $("live-toggle").textContent = live.running
    ? t("■ 停止监听", "■ Stop listening")
    : t("▶ 开始监听", "▶ Start listening");
  const selectedDevice = state.devices.find(d => d.id === s.deviceId);
  const validChannels = (state.channels || []).some(c => c.value === s.channelStart);
  $("live-toggle").disabled = Boolean(state.job || state.queue || state.maintenance) || (!live.running && (!selectedDevice || !validChannels));
  const inputMessages = {
    disconnected:t("设备已断开，正在等待重新连接。", "Device disconnected. Waiting for reconnection."),
    overload:t("输入接近过载，请降低声卡或混音器输出增益。", "Input is near clipping. Lower the interface or mixer output gain."),
    silent:t("持续无输入，请检查 Master 路由和所选通道。", "No signal. Check the Master routing and selected channels."),
    "no-data":t("未收到音频数据，请检查设备连接。", "No audio data received. Check the device connection."),
  };
  const inputMessage = !s.deviceId ? t("选择 DJ Master 输入后开始监听。", "Select a DJ Master input to start listening.")
    : !selectedDevice ? t("所选设备未连接，请连接设备或重新选择。", "Selected device is disconnected. Connect it or choose another.")
    : !validChannels ? t("所选通道不可用，请重新选择。", "Selected channels are unavailable. Choose another pair.")
    : inputMessages[state.inputHealth] || (s.channelStart === -1 ? t("混合全部通道可能包含耳机预听，建议选择 Master 通道对。", "Mixing all channels may include headphone cue. Prefer the Master channel pair.") : t("采集所选输入，不播放音频。", "Captures the selected input without playing it back."));
  if ($("input-hint").textContent !== inputMessage) $("input-hint").textContent = inputMessage;
  $("input-hint").classList.toggle("warning", Boolean(inputMessages[state.inputHealth] || (s.deviceId && (!selectedDevice || !validChannels))));
  const video = state.video || {}, requested = video.spout || video.ndi;
  const sending = state.outputVisible || (video.status === "sending" && !video.error && ((video.spout && !video.spoutError) || (video.ndi && !video.ndiError)));
  const connecting = video.changing || video.status === "starting";
  $("output-badge").textContent = sending ? t("正在输出", "Output on") : requested ? connecting ? t("正在连接…", "Connecting…") : t("发送失败", "Send failed") : t("仅预览", "Preview only");
  $("output-badge").className = "badge" + (sending ? " green" : requested && !connecting ? " amber" : "");
  $("cue-theme").textContent = !live.current && !live.lockedTheme ? "STANDBY" : themeLabel(themeId);

  $("window-maximize").setAttribute("aria-label", state.maximized ? t("还原窗口", "Restore window") : t("最大化", "Maximize"));
  $("window-maximize").innerHTML = windowIcon(state.maximized ? "filter_none" : "crop_square");
  $("cue-theme").style.color =
    state.library.themes.find((x) => x.id === themeId)?.accent ||
    "var(--purple)";
  $("cue-track").textContent =
    live.current?.title || t("等待音乐", "Waiting for music");
  $("cue-artist").textContent =
    live.current?.artist ||
    "";
  $("mode-badge").textContent = live.lockedTheme ? t("手动锁定", "Locked") : t("自动", "Auto");
  $("recognition-status").textContent = statusText();
  $("input-meter").style.width = Math.min(100, (live.rms || 0) * 350) + "%";
  $("db-value").textContent =
    live.rms > 0
      ? Math.max(-90, 20 * Math.log10(live.rms)).toFixed(0) + " dB"
      : "−∞ dB";
  $("current-battery").style.width =
    Math.min(100, ((live.currentCharge || 0) / 10) * 100) + "%";
  $("candidate-battery").style.width =
    Math.min(100, ((live.candidateCharge || 0) / 10) * 100) + "%";
  for (const [id, charge] of [["current", live.currentCharge], ["candidate", live.candidateCharge]]) {
    const value = Math.max(0, Math.min(10, Number(charge) || 0));
    $(id + "-charge").textContent = value + " / 10";
    $(id + "-battery").parentElement.setAttribute("aria-valuenow", value);
  }
  for (const id of ["current", "candidate"]) {
    const title = live[id]?.title || "";
    $(id + "-charge-title").textContent = title ? "· " + title : "";
    $(id + "-charge-title").title = title;
  }
  $("candidate-name").textContent = live.candidate?.title
    ? `${t("候选", "Candidate")}: ${live.candidate.title}`
    : t(
        "暂无候选曲目",
        "No candidate track",
      );
  $("candidate-artist").textContent = live.candidate?.artist || "";
  $("recognition-note").textContent = live.candidate
    ? t("积累匹配证据并复核，确认后才切换。", "Accumulate and verify matches before switching.")
    : live.current && live.running && ["no-match", "noise"].includes(live.matchEvent)
      ? t("匹配证据暂时减弱，继续保持当前画面。", "Match evidence has weakened; keeping the current visual.")
      : "";
  $("recognition-note").hidden = !$("recognition-note").textContent;
  document.querySelector(".genre-evidence").hidden = !live.current;
  for (const el of document.querySelectorAll(".evidence-meter")) {
    el.hidden = !live.running && !live.current;
    el.title = t("电量条表示指纹匹配证据，不是曲风置信度。", "Bars show fingerprint evidence, not genre confidence.");
  }
  $("candidate-name").hidden = Boolean(live.candidate?.title) || (!live.running && !live.current);
  syncGenreEvidence(live.current);
  $("blackout-button").classList.toggle("primary", live.blackout);
  $("blackout-button").setAttribute("aria-pressed", String(live.blackout));
  $("blackout-button").firstChild.textContent =
    (live.blackout ? t("恢复画面", "Restore output") : t("切黑", "Blackout")) +
    " ";
  setOptions(
    "lock-theme",
    option("", t("自动跟随曲风", "Follow genre automatically")) +
      themeOptions(),
  );
  setValue("lock-theme", live.lockedTheme || "");
  $("auto-button").disabled = !live.lockedTheme;
  setOptions(
    "device",
    option("", t("请选择输入设备", "Select an input device")) +
      (s.deviceId && !selectedDevice ? option(s.deviceId,t("所选设备未连接", "Selected device disconnected")) : "") +
      state.devices
        .map((d) => option(d.id, (d.loopback ? "↶ " : "↳ ") + d.name))
        .join(""),
  );
  setValue("device", s.deviceId);
  $("device").disabled = live.running;
  const channels = state.channels || [];
  let channelHtml = channels.map(c => option(c.value, c.mixed ? t("全部混合", "Mix all channels") : c.label + (c.mono ? t(" · 单声道", " · mono") : ""))).join("");
  if (!channels.some(c => c.value === s.channelStart)) channelHtml = option(s.channelStart, !s.deviceId ? t("先选择设备", "Select device first") : t("通道不可用", "Channel unavailable")) + channelHtml;
  setOptions("channels", channelHtml);
  setValue("channels", s.channelStart);
  $("channels").disabled = live.running || !channels.length;
  setOptions(
    "display",
    option("", t("自动选择外接屏幕", "Automatic external display")) +
      state.displays
        .map((d) =>
          option(d.id, d.label + (d.primary ? t(" · 主屏", " · primary") : "")),
        )
        .join(""),
  );
  setValue("display", s.displayId ?? "");
  setValue("layout", s.fullscreenLayout || "split");
  setValue("brightness", Math.round(s.brightness * 100));
  $("brightness-value").textContent = Math.round(s.brightness * 100) + "%";
  setValue("intensity", s.intensity);
  setValue("impactLevel", s.impactLevel || "medium");
  setValue("visualSize", s.visualSize || "large");
  $("screen-impact-button").setAttribute("aria-pressed", String(Boolean(s.screenImpact)));
  setValue("text-visible", s.textVisible);
  setValue("english-condensed", s.fullscreenCondensed);
  setValue("heading-mode", s.headingMode || (s.showDjName ? "dj" : "genre"));
  for (const [id,key] of [["track-info-visible","trackInfoVisible"],["branding-visible","brandingVisible"],["artwork-visible","artworkVisible"]]) setValue(id,s[key] !== false);
  for (const id of ["english-condensed", "heading-mode", "track-info-visible", "branding-visible"]) $(id).disabled = !s.textVisible;
  document.querySelector(".text-options").classList.toggle("is-disabled", !s.textVisible);
  for (const key of [
    "online",
    "localAI",
    "renderScale",
    "frameRateLimit",
    "idleFrameLimit",
    "showFps",
    "keepAwake",
  ])
    setValue(key, s[key]);
  const preference=s.rhythmSource || 'auto';
  setValue('rhythmSource',preference);setValue('impactMode',s.impactMode || 'beat');setValue('linkOffsetMs',s.linkOffsetMs || 0);
  setValue('beatStrength',s.beatStrength || 'dynamic');
  $('beat-strength-row').hidden=s.impactMode!=='beat';
  $('link-settings').hidden=preference==='audio';
  const link=state.rhythm?.link || {}, linked=preference!=='audio' && link.status==='connected' && link.peers>0;
  const audioSource=t('音频识别','Audio detection');
  const linkLabel=linked?`${Number(link.bpm).toFixed(1)} BPM · ${t('连接设备：{count}', 'Peers: {count}').replace('{count}',link.peers)}`:link.status==='connecting'?t('正在连接 Link','Connecting to Link'):t('Link 未连接','Link disconnected');
  $('link-state').textContent=linkLabel+(preference==='auto'&&!linked?' · '+t('使用音频识别','Using audio detection'):'');
  const sourceLabel=linked?`Link · ${linkLabel}`:preference==='link'?linkLabel:audioSource;
  const waiting=state.live.running&&!linked&&preference!=='link'&&s.impactMode==='beat'&&state.rhythm?.model!=='ready';
  $('live-rhythm-status').textContent=sourceLabel+' · '+(s.impactMode==='beat'?t('节拍驱动','Beat-driven'):t('音乐响应','Music response'))+(waiting?' · '+t('等待音频拍点','Waiting for audio beats'):'');
  $('cue-rhythm').hidden=!state.live.running && preference==='audio';
  syncVideo(state,t,setValue);
  setValue('low-load',s.performanceMode === 'low');
  setValue("language", s.languagePreference || "system");
  setOptions("standbyTheme", option("neutral", t("默认可视化", "Default visual")) + themeOptions());
  setValue("standbyTheme", s.standbyTheme);
  setOptions(
    "library-select",
    state.libraries.map((l) => option(l.id, `${l.name === "My library" ? t("我的曲库", "My library") : l.name} (${l.count})`)).join(""),
  );
  setValue("library-select", state.library.id);
  setValue("dj-name", state.library.djName);
  const cover = state.library.customArtwork || "";
  $("custom-cover-preview").hidden = !cover;
  if (cover && $("custom-cover-preview").getAttribute("src") !== cover) $("custom-cover-preview").src = cover;
  $("remove-cover").hidden = !cover;
  const logo = state.library.djLogo || "";
  $("dj-logo-preview").hidden = !logo;
  if (logo && $("dj-logo-preview").getAttribute("src") !== logo) $("dj-logo-preview").src = logo;
  if (!logo) $("dj-logo-preview").removeAttribute("src");
  $("remove-logo").hidden = $("logo-scale-field").hidden = !logo;
  setValue("logo-scale", Math.round((state.library.djLogoScale || 1)*100));
  $("logo-scale-value").textContent = Math.round((state.library.djLogoScale || 1)*100) + "%";
  $("library-select").disabled = busy;
  for (const el of document.querySelectorAll("[data-action=import], [data-action=export], [data-action=new-library], [data-action=rename-library], [data-action=delete-library], [data-action=files], [data-action=folder]")) el.disabled = busy;
  syncEditorActions();
  document.querySelector("[data-action=clear-selection]").disabled = !selected.size;
  $("export-selected").title = $("remove-selected").title = selected.size ? "" : t("先勾选需要操作的曲目");
  $("undo-removal-note").hidden = !state.undoRemoval || busy;
  $("undo-removal-text").textContent = state.undoRemoval ? t("已移除 {count} 首曲目，可撤销上次移除。", "Removed {count} tracks. The last removal can be undone.").replace("{count}",state.undoRemoval.count) : "";
  document.querySelector("[data-action=undo-removal]").disabled = busy;
  $("library-busy").hidden = !busy || Boolean(state.job || state.queue);
  const libraryBusyMessage = live.running
    ? t("正在监听。停止监听后可切换、整理和分析曲库。", "Listening is active. Stop listening to switch, organize or analyze libraries.")
    : t("曲库正在更新，完成后可继续管理。", "The library is being updated. Management will be available when it finishes.");
  if ($("library-busy").textContent !== libraryBusyMessage) $("library-busy").textContent = libraryBusyMessage;
  $("export-selected").disabled = busy || !selected.size;
  $("remove-selected").disabled = busy || !selected.size;
  $("remove-selected").textContent = `${t("移除所选曲目", "Remove selected tracks")}${selected.size ? ` (${selected.size})` : ""}`;
  if (state.maintenance) $("remove-selected").textContent = t("正在更新曲库，请稍候。", "Updating library. Please wait.");
  if(libraryStatsOwner !== state.library){
    libraryStatsOwner=state.library;
    libraryStats={ready:state.library.tracks.filter(x=>x.status==='ready').length,review:state.library.tracks.filter(needsReview).length};
  }
  $("live-library").textContent = (state.library.name === "My library" ? t("我的曲库", "My library") : state.library.name) + " · " + libraryStats.ready + " " + t("首已准备", "prepared tracks");
  const all = state.library.tracks,
    ready = libraryStats.ready,
    review = libraryStats.review;
  const summary = [
    [t("已准备", "Prepared"), ready - review],
    [t("需要确认", "Needs review"), review],
    [t("待准备", "Not prepared"), all.length - ready],
  ];
  const summaryHtml = summary
    .map(
      ([label, n]) =>
        `<div class="summary"><small>${label}</small><b>${n.toLocaleString()}</b></div>`,
    )
    .join("");
  if($('summaries').innerHTML !== summaryHtml)$('summaries').innerHTML=summaryHtml;
  const j = state.job, analyzing = Boolean(j || state.queue), analysisFocus = document.activeElement;
  const batch = state.analysisBatch;
  const showBatch = batch?.total > 0 && !live.running && !state.maintenance && !(state.undoRemoval && !analyzing);
  $("job").hidden = !showBatch;
  $("analyze-button").classList.toggle("inactive", analyzing);
  $("analyze-button").setAttribute("aria-hidden", String(analyzing));
  $("cancel-analysis").classList.toggle("inactive", !analyzing);
  $("cancel-analysis").setAttribute("aria-hidden", String(!analyzing));
  if (showBatch) {
    const phases = {
      metadata: t("读取曲目信息", "Reading metadata"),
      decode: t("解码音频", "Decoding audio"),
      fingerprint: t("生成音乐指纹", "Creating fingerprints"),
      online: t("查询在线资料", "Looking up metadata"),
      ai: t("汇总整曲 AI 结果", "Analyzing whole-track genres"),
      cancelling: t("正在停止", "Stopping"),
    };
    const progress = $("job-progress");
    const processed = Math.min(batch.total, Math.max(0, batch.processed));
    const count = t("已处理 {done} / {total} 首", "Processed {done} / {total} tracks").replace("{done}", processed).replace("{total}", batch.total);
    const aiPercent = j?.phase === "ai" && Number.isFinite(j.fraction) ? Math.round(Math.max(0, Math.min(1, j.fraction)) * 100) : null;
    const title = analyzing ? j?.title || t("准备下一首…", "Preparing the next track…") : batch.status === "cancelled" ? t("已停止分析", "Analysis stopped") : t("分析完成", "Analysis complete");
    const result = [t("成功 {count} 首", "{count} succeeded").replace("{count}", batch.succeeded), batch.failed ? t("失败 {count} 首", "{count} failed").replace("{count}", batch.failed) : ""].filter(Boolean).join(" · ");
    const detail = analyzing ? [j ? phases[j.phase] || j.phase : "", aiPercent === null ? "" : aiPercent + "%", batch.failed ? t("失败 {count} 首", "{count} failed").replace("{count}", batch.failed) : ""].filter(Boolean).join(" · ") : result;
    for (const [id, text] of [["job-title", title], ["job-detail", detail], ["job-count", count]]) {
      if ($(id).textContent !== text) $(id).textContent = text;
      $(id).title = text;
    }
    $("cancel-analysis").disabled = batch.status === "cancelling";
    $("cancel-analysis").textContent = batch.status === "cancelling" ? phases.cancelling : t("停止分析", "Stop analysis");
    // This bar measures settled tracks, not elapsed time or one AI phase.
    // Keep its denominator fixed on cancellation and reset only for a new batch.
    progress.classList.toggle("progress-snap", progress.dataset.batchId !== batch.id);
    progress.dataset.batchId = batch.id;
    progress.setAttribute("aria-label", t("整批分析进度", "Batch analysis progress"));
    progress.setAttribute("aria-valuemax", String(batch.total));
    progress.setAttribute("aria-valuenow", String(processed));
    progress.setAttribute("aria-valuetext", [count, detail].filter(Boolean).join(" · "));
    progress.firstElementChild.style.transform = `scaleX(${processed / batch.total})`;
  }
  $("analyze-button").textContent = selected.size
    ? `${t("分析选中", "Analyze selected")} (${selected.size})`
    : t("分析待准备曲目", "Analyze pending");
  $("analyze-button").disabled = live.running || state.maintenance;
  if (analyzing && analysisFocus === $("analyze-button") && !$("cancel-analysis").disabled) $("cancel-analysis").focus({ preventScroll: true });
  if (!analyzing && analysisFocus === $("cancel-analysis") && !$("analyze-button").disabled) $("analyze-button").focus({ preventScroll: true });
  $("selection-info").textContent = selected.size
    ? `${selected.size} ${t("首已选择", "selected")}`
    : `${all.length} ${t("首音乐", "tracks")} · ${t("勾选曲目可批量操作")}`;
  updateSelectPickers();
  renderPerformance();
  renderTracks();
  if (state.error && state.error !== lastError) {
    lastError = state.error;
    toast(t(state.error));
  }
}
function needsReview(track) {
  return (
    track.status === "ready" &&
    !track.confirmed &&
    !track.manualGenre &&
    (track.suggestion?.uncertain ||
      track.analysis?.errors?.length ||
      track.genreId === "unknown")
  );
}
function renderTracks() {
  if(tab !== 'library')return;
  const key = search + '\0' + filter;
  const changed = filteredOwner !== state.library || filteredKey !== key;
  if(changed){
  if(filteredKey !== key || filteredOwner?.id !== state.library.id)$('tracks').scrollTop=0;
  filteredOwner=state.library;filteredKey=key;
  const query=search.toLowerCase();
  filteredTracks = state.library.tracks.filter(
    (x) =>
      (!search ||
        `${x.title} ${x.artist}`
          .toLowerCase()
          .includes(query)) &&
      (filter === "all" ||
        (filter === "review" && needsReview(x)) ||
        (filter === "pending" && x.status !== "ready") ||
        (filter === "ready" && x.status === "ready" && !needsReview(x))),
  );
  }
  const tracks=filteredTracks, virtual=tracks.length>250;
  const first=virtual?Math.max(0,Math.min(tracks.length-1,Math.floor(Math.max(0,$('tracks').scrollTop-42)/60)-8)):0;
  const end=virtual?Math.min(tracks.length,first+Math.ceil(($('tracks').clientHeight||600)/60)+18):tracks.length;
  const signature = JSON.stringify([
    state.library.id,
    state.library.revision,
    state.library.tracks.length,
    key,first,end,selected.size,
    state.settings.language,
  ]);
  if (!changed && signature === lastTable) return;
  lastTable = signature;
  if (!tracks.length) {
    $("tracks").innerHTML =
      `<div class="empty"><div class="empty-icon">${icon("music-2")}</div><h2>${state.library.tracks.length ? t("没有匹配的曲目", "No matching tracks") : t("曲库为空", "Library is empty")}</h2><p>${state.library.tracks.length ? t("试试其他关键词，或清除搜索与筛选。", "Try another keyword, or clear the search and filter.") : t("添加本地音乐，或导入已准备的曲库包。", "Add local music or import a prepared library pack.")}</p>${state.library.tracks.length ? `<button class="ghost" data-action="clear-filters">${t("清除搜索与筛选", "Clear search & filter")}</button>` : ""}</div>`;
    return;
  }
  const rows = tracks.slice(first,end)
    .map((x) => {
      const ready = x.status === "ready",
        review = needsReview(x),
        status = ready
          ? review
            ? t("待确认", "Review")
            : t("已准备", "Ready")
          : {
              pending: t("待分析", "Pending"),
              analyzing: t("分析中", "Analyzing"),
              failed: t("分析失败", "Failed"),
              "needs-source": t("需要音乐文件", "Needs source"),
            }[x.status] || x.status;
      const mins = Math.floor((x.durationMs || 0) / 60000),
        secs = Math.floor((x.durationMs || 0) / 1000) % 60;
      return `<tr><td><input type="checkbox" data-track-select="${x.id}" ${selected.has(x.id) ? "checked" : ""} aria-label="${esc(x.title)}"></td><td class="track-cell"><b title="${esc(x.title)}">${esc(x.title)}</b><small>${esc(x.artist || "—")}</small></td><td>${esc(themeLabel(x.genreId))}${x.manualGenre ? ` <span class="badge purple">${t("手动", "Manual")}</span>` : ""}</td><td><span class="badge ${review ? "amber" : ready ? "green" : ""}">${esc(status)}</span></td><td class="muted">${x.durationMs ? `${mins}:${String(secs).padStart(2, "0")}` : "—"}</td><td class="track-row-actions"><button class="small ghost" data-edit="${x.id}">${t("曲目详情")}</button><button class="small ghost" data-track-export="${x.id}">${t("导出视频")}</button></td></tr>`;
    })
    .join("");
  const spacer=count=>count?`<tr class="virtual-spacer" aria-hidden="true"><td colspan="6" style="height:${count*60}px"></td></tr>`:'';
  const focused=document.activeElement?.closest('[data-track-select],[data-edit],[data-track-export]');
  const headerFocused=document.activeElement?.id==='select-all';
  const focusKey=focused?.dataset.trackSelect?['data-track-select',focused.dataset.trackSelect]:focused?.dataset.edit?['data-edit',focused.dataset.edit]:focused?.dataset.trackExport?['data-track-export',focused.dataset.trackExport]:null;
  $("tracks").innerHTML =
    `<table class="${virtual?'virtual-table':''}" aria-rowcount="${tracks.length+1}"><colgroup><col style="width:40px"><col><col style="width:18%"><col style="width:13%"><col style="width:8%"><col style="width:240px"></colgroup><thead><tr><th><input type="checkbox" id="select-all" aria-label="${t("选择列表曲目", "Select displayed tracks")}"></th><th>${t("曲目 / 艺人", "Track / artist")}</th><th>${t("曲风", "Genre")}</th><th>${t("状态", "Status")}</th><th>${t("时长", "Length")}</th><th></th></tr></thead><tbody>${spacer(first)}${rows}${spacer(tracks.length-end)}</tbody></table>`;
  if(focusKey)$('tracks').querySelector(`[${focusKey[0]}="${focusKey[1]}"]`)?.focus({preventScroll:true});
  if(headerFocused)$('select-all').focus({preventScroll:true});
  let rowIndex=first+2;
  for(const row of $('tracks').querySelectorAll('tbody tr:not(.virtual-spacer)'))row.setAttribute('aria-rowindex',rowIndex++);
  $("select-all").onchange = (e) => {
    for (const x of tracks)
      e.target.checked ? selected.add(x.id) : selected.delete(x.id);
    sync();
  };
  const count = tracks.filter(track => selected.has(track.id)).length;
  $("select-all").checked = count === tracks.length;
  $("select-all").indeterminate = count > 0 && count < tracks.length;
}
function renameLibrary() {
  if (state.live.running || state.job || state.queue || state.maintenance) return;
  const dialog = $("rename-dialog"), libraryId = state.library.id;
  dialog.innerHTML = `<form novalidate><h2 id="rename-title">${t("重命名曲库", "Rename library")}</h2><label class="field" style="margin-top:20px"><span>${t("曲库名称", "Library name")}</span><input id="library-name" type="text" maxlength="80" required autocomplete="off" aria-describedby="rename-error"></label><p id="rename-error" class="warning" role="alert" hidden></p><div class="actions"><button type="button" data-close="rename-dialog">${t("取消", "Cancel")}</button><button class="primary" type="submit">${t("保存", "Save")}</button></div></form>`;
  const input = $("library-name");
  input.value = state.library.name === "My library" ? t("我的曲库", "My library") : state.library.name;
  input.oninput = () => { $("rename-error").hidden = true; input.removeAttribute("aria-invalid"); };
  let saving = false;
  dialog.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    if (saving) return;
    const name = input.value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
    if (!name || Array.from(name).length > 80) {
      $("rename-error").textContent = t("请输入 1–80 个字符的曲库名称。", "Enter a library name of 1–80 characters.");
      $("rename-error").hidden = false;
      input.setAttribute("aria-invalid", "true");
      input.focus();
      return;
    }
    saving = true;
    const save = dialog.querySelector("[type=submit]"); save.disabled = true;
    try {
      if (await call("rename-library", { libraryId, name })) {
        dialog.close();
        state = await api.call("state"); sync();
        toast(t("曲库已重命名。", "Library renamed."));
      }
    } finally { saving = false; save.disabled = false; }
  };
  dialog.showModal(); input.focus(); input.select();
}
function confirmRemoval(kind, ids = []) {
  if (state.live.running || state.job || state.queue || state.maintenance) return;
  const tracks = state.library.tracks.filter(track => ids.includes(track.id));
  if (kind === "tracks" && !tracks.length) return;
  removal = { kind, libraryId: state.library.id, ids: tracks.map(track => track.id) };
  const whole = kind === "library", dialog = $("removal-dialog");
  const name = state.library.name === "My library" ? t("我的曲库", "My library") : state.library.name;
  dialog.innerHTML = `<h2 id="removal-title">${whole ? t("删除曲库", "Delete library") : t("移除所选曲目", "Remove selected tracks")}</h2>
    <p class="removal-summary">${esc(name)} · ${whole ? state.library.tracks.length : tracks.length} ${t("首音乐", "tracks")}</p>
    <p>${whole ? t("此曲库及其指纹、分析和缓存将移至系统回收站。原音乐文件和已导出的曲库包不会删除。", "This library, its fingerprints, analysis and cache will be moved to the system recycle bin. Original music files and exported packs will be kept.") : t("将从当前曲库移除所选曲目及其识别指纹，包括筛选后隐藏的已选曲目。原音乐文件不会删除。", "Remove the selected tracks and their fingerprints, including selected tracks hidden by filters. Original music files will be kept.")}</p>
    ${whole ? `<p class="muted">${state.libraries.length > 1 ? t("删除后切换到另一个曲库。", "Switch to another library after deletion.") : t("这是最后一个曲库，删除后会自动新建空曲库。", "This is the last library. An empty library will be created after deletion.")}</p>` : `<ul class="removal-tracks">${tracks.slice(0,20).map(track => `<li><b>${esc(track.title)}</b><span>${esc(track.artist || "—")}</span></li>`).join("")}</ul>${tracks.length > 20 ? `<p class="muted">${t("其余所选曲目", "Other selected tracks")}: ${tracks.length - 20}</p>` : ""}`}
    <div class="actions"><button data-close="removal-dialog" autofocus>${t("取消", "Cancel")}</button><button class="danger" data-action="confirm-removal">${whole ? t("删除曲库", "Delete library") : t("确认移除", "Confirm removal")}</button></div>`;
  dialog.showModal();
  dialog.querySelector("[data-close]").focus();
}
async function executeRemoval() {
  if (!removal || removalBusy) return;
  removalBusy = true;
  const request = removal, dialog = $("removal-dialog");
  for (const button of dialog.querySelectorAll("button")) button.disabled = true;
  dialog.querySelector("[data-action]").textContent = t("正在更新曲库，请稍候。", "Updating library. Please wait.");
  try {
    const result = await call(request.kind === "library" ? "delete-library" : "remove-tracks", { libraryId: request.libraryId, ids: request.ids });
    if (result) {
      selected.clear();
      dialog.close();
      removal = null;
      state = await api.call("state");
      sync();
      if (request.kind === "library") toast(t("曲库已移至回收站。原音乐文件已保留。", "Library moved to the recycle bin. Original music files were kept."));
    } else {
      dialog.close();
      removal = null;
    }
  } finally { removalBusy = false; }
}
$("removal-dialog").addEventListener("cancel", e => { if (removalBusy) e.preventDefault(); });
function editTrack(id) {
  editorId = id;
  const track = state.library.tracks.find((x) => x.id === id);
  if (!track) return;
  const a = track.analysis,
    review = needsReview(track);
  const evidence = [
    `${t("文件曲风标签（ID3 / Vorbis 等）", "File genre tags (ID3 / Vorbis etc.)")}: ${esc((track.fileTags || []).join(", ") || "—")}`,
    `${t("自动建议", "Suggested genre")}: <b>${esc(themeLabel(track.suggestion?.id))}</b>`,
    `${t("AI 结果", "AI result")}: ${esc(a?.ai ? themeLabel(a.ai.id) : "—")}`,
    `${t("在线查询", "Online lookup")}: ${esc(({found:t("已匹配", "Matched"), "no-match":t("未找到匹配", "No match"), "missing-metadata":t("缺少曲目信息", "Missing track metadata"), disabled:t("未启用", "Disabled"), failed:t("查询失败", "Lookup failed")})[a?.online?.status] || a?.online?.status || "—")}`,
    ...(track.suggestion?.candidates || []).filter(c => !["file", "local-ai"].includes(c.source)).map(c => `${esc(c.source)}: ${esc(themeLabel(c.id))}`),
    ...(a?.errors || []).map((x) => `<span class="warning">${esc(x)}</span>`),
    track.error ? `<span class="warning">${esc(track.error)}</span>` : "",
  ]
    .filter(Boolean)
    .join("<br>");
  $("editor").innerHTML =
    `<div class="row between"><h2 id="editor-title">${esc(track.title)}</h2><button class="small ghost" data-close="editor" aria-label="${t("关闭", "Close")}">${icon("x")}</button></div><p class="muted">${esc(track.artist || "—")}</p><div class="dialog-fields"><label class="field"><span>${t("指定曲风", "Genre override")}</span><select id="edit-genre" data-searchable data-search-placeholder="${t("输入或选择曲风", "Type or choose a genre")}" data-empty-text="${t("未找到曲风", "No matching genres")}">${themeOptions(true)}</select></label><label class="field"><span>${t("指定视觉（可与曲风不同）", "Visual override")}</span><select id="edit-visual" data-searchable data-search-placeholder="${t("输入或选择曲风", "Type or choose a genre")}" data-empty-text="${t("未找到曲风", "No matching genres")}">${themeOptions(true)}</select></label></div>${review ? `<p class="warning editor-review">${t("分析结果需要确认，请检查后保存。", "This result needs review. Check it before saving.")}</p>` : ""}<details class="performance-details editor-evidence" ${review || track.error ? "open" : ""}><summary>${t("分析依据", "Analysis evidence")}<img class="ui-icon" src="../assets/material-symbols/expand_more.svg" alt=""></summary><div class="evidence">${evidence}</div></details><label class="checkbox-row" style="margin-top:18px"><input type="checkbox" id="edit-confirmed" ${track.confirmed ? "checked" : ""}>${t("我已检查这首歌的结果", "I have reviewed this result")}</label><div class="actions editor-save"><button data-close="editor">${t("取消", "Cancel")}</button><button class="primary" data-action="save-track">${t("保存选择", "Save choices")}</button></div>`;
  $("edit-genre").value = track.manualGenre || "";
  $("edit-visual").value = track.manualVisual || "";
  updateSelectPickers($("editor"));
  $("editor").showModal();
}
function newPreset() {
  $("preset-dialog").innerHTML =
    `<div class="row between"><h2 id="preset-title">${t("创建视觉预设", "Create visual preset")}</h2><button class="small ghost" data-close="preset-dialog" aria-label="${t("关闭", "Close")}">${icon("x")}</button></div><div class="dialog-fields"><label class="field"><span>${t("预设名称", "Preset name")}</span><input type="text" id="preset-name" maxlength="50" aria-describedby="preset-error" placeholder="${t("预设名称", "Preset name")}"></label><label class="field"><span>${t("基础曲风", "Base visual")}</span><select id="preset-base" data-searchable data-search-placeholder="${t("输入或选择曲风", "Type or choose a genre")}" data-empty-text="${t("未找到曲风", "No matching genres")}">${sortGenreOptions(state.library.themes
      .filter((x) => !x.id.startsWith("custom-"))
      .map((x) => ({ value: x.id, label: x.label, parent: x.parent })))
      .map((x) => option(x.value, x.label, x.parent))
      .join("")}</select></label></div><div class="colors">${[
      ["accent", t("主色", "Primary"), "#75efdd"],
      ["accent2", t("辅色", "Secondary"), "#aa91ff"],
      ["hot", t("高光", "Highlight"), "#f2f7ff"],
    ]
      .map(
        ([id, label, color]) =>
          `<label class="field"><span>${label}</span><input id="preset-${id}" type="color" value="${color}"></label>`,
      )
      .join(
        "",
      )}</div><p id="preset-error" class="warning" role="alert" hidden></p><div class="actions"><button data-close="preset-dialog">${t("取消", "Cancel")}</button><button class="primary" data-action="save-preset">${t("保存预设", "Save preset")}</button></div>`;
  $("preset-base").value = "synthwave";
  updateSelectPickers($("preset-dialog"));
  $("preset-dialog").showModal();
}
document.addEventListener("click", async (e) => {
  const repository = e.target.closest("a[data-repository]");
  if (repository) {
    e.preventDefault();
    await call("open-repository", repository.dataset.repository);
    return;
  }
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.tab) {
    setTab(b.dataset.tab);
    return;
  }
  if (b.dataset.trackExport) {
    const track = state.library.tracks.find(x => x.id === b.dataset.trackExport);
    if (track) await openVideoExport(track);
    return;
  }
  if (b.dataset.edit) {
    editTrack(b.dataset.edit);
    addEditorActions();
    return;
  }
  if (b.dataset.close) {
    $(b.dataset.close).close();
    return;
  }
  const action = b.dataset.action;
  if (!action) return;
  if (action === "choose-cover") {
    const libraryId = state.library.id;
    const source = await call("library-cover", {libraryId});
    if (source?.image) {
      const image = await cropCover(source.image, t);
      if (image) await call("library-cover", {libraryId, image});
    }
    return;
  }
  if (action === "remove-cover") { await call("library-cover", {libraryId:state.library.id, remove:true}); return; }
  if (["choose-logo", "remove-logo"].includes(action)) { await call("library-logo", {libraryId:state.library.id, remove:action === "remove-logo"}); return; }
  if (b.closest("#library-manage")) $("library-manage").hidePopover();
  if (action === "video-config") { document.querySelector("[data-tab=settings]").click(); $("video-settings").open=true; $("video-settings").scrollIntoView({block:"center"}); $("video-settings").querySelector("summary").focus(); return; }
  if (action === "video-retry") { await call("video-retry"); return; }
  if (action === "export-task") { await openVideoExport(); return; }
  if (action === "export-selected") { await openVideoExport(state.library.tracks.filter(x=>selected.has(x.id))); return; }
  if (action === "export-video") {
    const track=state.library.tracks.find(x=>x.id===editorId);
    if(track){$("editor").close();await openVideoExport(track);}
    return;
  }
  if (action === "preview-track") {
    $("editor").close();
    const r = await call("preview-track", editorId);
    if (r) setTab("live");
    return;
  }
  if (action === "remove-track") {
    $("editor").close();
    confirmRemoval("tracks", [editorId]);
    return;
  }
  if (action === "relink-track") {
    $("editor").close();
    await call("relink-track", editorId);
    return;
  }
  const actions = {
    "clear-filters": () => { search = ""; filter = "all"; $("search").value = ""; $("filter").value = "all"; sync(); $("search").focus(); },
    "rename-library": renameLibrary,
    "delete-library": () => confirmRemoval("library"),
    "remove-selected": () => confirmRemoval("tracks", [...selected]),
    "confirm-removal": executeRemoval,
    minimize: () => call("window-control", "minimize"),
    maximize: () => call("window-control", "maximize"),
    close: () => call("window-control", "close"),
    "live-toggle": () => call(state.live.running ? "live-stop" : "live-start"),
    "screen-impact": () => call("settings", {screenImpact: !state.settings.screenImpact}),
    blackout: () => call("blackout", !state.live.blackout),
    auto: () => call("lock", null),
    refresh: () => call("devices"),
    window: () => call("output", "window"),
    fullscreen: () => call("output", "fullscreen"),
    hide: () => call("output", "hide"),
    files: () => call("add-files"),
    folder: () => call("add-folder"),
    analyze: () => call("analyze", { ids: [...selected] }),
    cancel: () => call("cancel-analysis"),
    import: () => call("import"),
    export: async () => {
      const r = await call("export");
      if (r?.path)
        toast(
          t(
            "曲库已导出。",
            "Library exported.",
          ),
        );
    },
    reveal: () => call("reveal-library"),
    "undo-removal": async () => {const result=await call("undo-removal",{libraryId:state.library.id});if(result){selected.clear();toast(t("曲目已恢复。", "Tracks restored."));}},
    "restart-output": () => call("restart-output"),
    "export-diagnostics": async () => {const result=await call("export-diagnostics");if(result?.ok)toast(t("诊断报告已导出。", "Diagnostics exported."));},
    "update-check": () => call("update-check"),
    "open-update": () => call("open-update", state.update?.releaseUrl),
    "dismiss-update": () => call("dismiss-update", state.update?.latestVersion),
    "clear-selection": () => {
      selected.clear();
      sync();
    },
    "new-library": async () => {
      const r = await call(
        "new-library",
        t("新曲库", "New library") + " " + (state.libraries.length + 1),
      );
      if (r) selected.clear();
    },
    "new-preset": () => newPreset(),
    "save-preset": async () => {
      if (!$("preset-name").value.trim()) {
        $("preset-error").textContent = t("请输入预设名称。", "Enter a preset name.");
        $("preset-error").hidden = false;
        $("preset-name").setAttribute("aria-invalid", "true");
        $("preset-name").focus();
        return;
      }
      const r = await call("preset", {
        name: $("preset-name").value,
        base: $("preset-base").value,
        accent: $("preset-accent").value,
        accent2: $("preset-accent2").value,
        hot: $("preset-hot").value,
      });
      if (r) $("preset-dialog").close();
    },
    "save-track": async () => {
      const r = await call("track", {
        id: editorId,
        changes: {
          manualGenre: $("edit-genre").value || null,
          manualVisual: $("edit-visual").value || null,
          confirmed: $("edit-confirmed").checked,
        },
      });
      if (r) $("editor").close();
    },
    reanalyze: async () => {
      $("editor").close();
      await call("analyze", { ids: [editorId], refresh: true });
    },
  };
  await actions[action]?.();
});
document.addEventListener("change", async (e) => {
  if (e.target.id === 'low-load') { await call('settings',{performanceMode:e.target.checked?'low':'standard'}); return; }
  const el = e.target;
  if (el.dataset.trackSelect) {
    el.checked
      ? selected.add(el.dataset.trackSelect)
      : selected.delete(el.dataset.trackSelect);
    sync();
    return;
  }
  if (el.id === "filter") {
    filter = el.value;
    renderTracks();
    return;
  }
  if (el.id === "lock-theme") {
    await call("lock", el.value || null);
    return;
  }
  if (el.id === "library-select") {
    selected.clear();
    await call("library", el.value);
    return;
  }
  if (el.id === "logo-scale") { await call("library-logo", {libraryId:state.library.id, scale:Number(el.value)/100}); return; }
  if (el.id === "dj-name") {
    await call("library-profile", { djName: el.value });
    return;
  }
  if (["spout-enabled", "ndi-enabled"].includes(el.id)) { await call("video-route", {route:el.id.split("-")[0], enabled:el.checked}); return; }
  const videoKeys={"video-name":"name", "video-resolution":"resolution", "video-fps":"fps"};
  if(videoKeys[el.id]) { await call("video-settings", {[videoKeys[el.id]]:el.value}); return; }
  const map = {
    device: "deviceId",
    channels: "channelStart",
    display: "displayId",
    brightness: "brightness",
    intensity: "intensity",
    "text-visible": "textVisible",
    "heading-mode": "headingMode",
    "track-info-visible": "trackInfoVisible",
    "branding-visible": "brandingVisible",
    "artwork-visible": "artworkVisible",
    "english-condensed": "fullscreenCondensed",
    online: "online",
    localAI: "localAI",
    rhythmSource: "rhythmSource",
    impactMode: "impactMode",
    beatStrength: "beatStrength",
    linkOffsetMs: "linkOffsetMs",
    impactLevel: "impactLevel",
    visualSize: "visualSize",
    renderScale: "renderScale",
    frameRateLimit: "frameRateLimit",
    idleFrameLimit: "idleFrameLimit",
    showFps: "showFps",
    keepAwake: "keepAwake",
    standbyTheme: "standbyTheme",
    language: "language",
    layout: "fullscreenLayout",
  };
  const key = map[el.id];
  if (key) {
    let value = el.type === "checkbox" ? el.checked : el.value;
    if (key === "channelStart" || (key === "renderScale" && value !== "auto")) value = Number(value);
    if (key === "displayId") value = value ? Number(value) : null;
    if (key === "brightness") value = Number(value) / 100;
    await call("settings", { [key]: value });
  }
});
function addEditorActions() {
  const row = document.createElement("div");
  row.className = "row editor-secondary";
  row.style.marginTop = "16px";
  row.innerHTML = `<button class="small ghost" data-action="export-video">${t("导出视频", "Export video")}</button><button class="small ghost" data-action="preview-track">${t("预览视觉", "Preview visual")}</button><button class="small ghost" data-action="reanalyze">${t("重新分析", "Analyze again")}</button><button class="small ghost" data-action="relink-track">${t("重新关联音频", "Relink audio")}</button><span class="grow"></span><button class="small ghost danger" data-action="remove-track">${t("从曲库移除", "Remove from library")}</button>`;
  $("editor").insertBefore(row, $("editor").querySelector(".editor-save"));
  syncEditorActions();
}
function syncEditorActions() {
  for (const el of $("editor").querySelectorAll("[data-action]")) {
    const action = el.dataset.action;
    el.disabled = Boolean(state.maintenance ||
      (state.live.running && action !== "save-track") ||
      ((state.job || state.queue) && ["relink-track", "remove-track"].includes(action)));
  }
}
let brightnessTimer;
document.addEventListener("input", (e) => {
  if (e.target.id === "preset-name") { $("preset-error").hidden = true; e.target.removeAttribute("aria-invalid"); }
  if (e.target.id === "search") {
    search = e.target.value;
    renderTracks();
  }
  if (e.target.id === "brightness") {
    $("brightness-value").textContent = e.target.value + "%";
    clearTimeout(brightnessTimer);
    brightnessTimer = setTimeout(
      () => call("settings", { brightness: Number(e.target.value) / 100 }),
      60,
    );
  }
});
document.addEventListener("keydown", (e) => {
  if (
    e.repeat ||
    e.ctrlKey ||
    e.altKey ||
    e.metaKey ||
    ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName) ||
    document.querySelector("dialog[open], :popover-open")
  )
    return;
  if (e.code === "KeyX") call("settings", {screenImpact: !state.settings.screenImpact});
  if (e.code === "KeyB") call("blackout", !state.live.blackout);
  if (e.code === "KeyA") call("lock", null);
  if (e.code === "KeyF") call("output", "fullscreen");
});
let stageFps = null, previewFps = null, previewFrames = [], lastPreviewReport = 0;
function recordPreviewFrame() {
  const now = performance.now();
  previewFrames = previewFrames.filter(time => now - time < 2000);
  previewFrames.push(now);
  if (now - lastPreviewReport >= 1000 && previewFrames.length > 1) {
    previewFps = (previewFrames.length - 1) * 1000 / (now - previewFrames[0]);
    lastPreviewReport = now;
    renderPerformance();
  }
}
function renderPerformance() {
  const label = $("fps-readout");
  if (!label) return;
  label.hidden = !state?.settings.showFps;
  const fps = value => value === null ? "—" : Math.round(value);
  label.textContent = `${t("输出", "Output")} ${fps(stageFps)} FPS · ${t("预览", "Preview")} ${fps(previewFps)} FPS`;
  label.title = t("输出与预览分别计数；GPU 预览最高 30 FPS，不影响发送帧率。", "Output and preview are measured separately. GPU preview is limited to 30 FPS without changing the send frame rate.");
}
api.onPerformance(stats => { stageFps = stats.fps; renderPerformance(); });
window.addEventListener("autovj-video-frame",recordPreviewFrame);
api.onState((next) => {
  // A broadcast can arrive while the initial full IPC snapshot is in flight.
  if(!state && !next.library)return;
  const language = state?.settings.language;
  const previousLibrary = state?.library.id;
  state = {...state,...next};
  if (previousLibrary !== state.library.id) selected.clear();
  if (!$("page-live") || language !== state.settings.language) view();
  else sync();
  openVideoExport.refresh();
});
const previewObserver = new ResizeObserver(entries => {
  const r = entries[0]?.contentRect;
  if (r) api.previewSize({width: Math.ceil(r.width * devicePixelRatio), height: Math.ceil(r.height * devicePixelRatio)});
});
state = await api.call("state");
view();
