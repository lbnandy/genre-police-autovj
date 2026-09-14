"use strict";
// Electron window APIs verify the frameless native shell; the OS file picker is
// the only mocked boundary. App IPC, file tags and fingerprint preparation are real.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), assert = require("node:assert/strict");
const { _electron } = require(process.env.AUTOVJ_PLAYWRIGHT || "playwright");
const ROOT = path.resolve(__dirname, ".."), OUT = path.join(ROOT,"output/playwright/ui-review");
const {select} = require("./qa-picker.cjs");
const messages = require("../packages/messages.json");
const tr = (lang, zh) => lang === "zh" ? zh : messages[zh][lang];
(async () => {
  fs.mkdirSync(OUT,{recursive:true});
  const env = {...process.env,AUTOVJ_DATA_DIR:path.join(ROOT,".qa","interface-"+crypto.randomUUID())};
  delete env.ELECTRON_RUN_AS_NODE;
  const packaged=Boolean(process.argv[2]);
  const app = await _electron.launch({executablePath: process.argv[2] || path.join(ROOT,"node_modules/electron/dist/electron.exe"),args:packaged?["--lang=zh-CN"]:[ROOT,"--lang=zh-CN"],env});
  const errors=[], report=[];
  try {
    let page=app.windows().find(p=>p.url().includes("console.html"));
    if(!page) page=await app.waitForEvent("window",{predicate:p=>p.url().includes("console.html")});
    await page.waitForSelector("#live-toggle");
    const stage=app.windows().find(p=>p.url().includes("stage.html"));
    for(const p of app.windows())p.on("pageerror",e=>errors.push(e.message));
    const bounds=await app.evaluate(({BrowserWindow})=>{
      const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes("console.html"));
      return {window:w.getBounds(), content:w.getContentBounds()};
    });
    assert.equal(bounds.window.height,bounds.content.height,"No native title bar should consume content height");
    let state=await page.evaluate(()=>window.autovj.call("state"));
    assert.equal(state.settings.standbyTheme,"neutral");
    await stage.waitForFunction(()=>document.body.dataset.standby==="true");
    assert.equal(await stage.locator("#app").isVisible(),true);
    assert.equal(await page.locator("#live-toggle").isDisabled(),true,"Input selection is required");
    for(const width of [1440,1180,1040]) {
      const height=width===1440?940:740;
      await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes("console.html")).setSize(...size),[width,height]);
      for(const lang of ["zh","en","ja","ko"]) {
        // Settings is always reachable through the currently observed navigation.
        console.log((await page.locator(".tabs").ariaSnapshot()).replaceAll("\n"," "));
        await page.locator('[data-tab="settings"]').click();
        await select(page, "language", lang);
        await page.waitForFunction(lang=>document.documentElement.lang===(lang==="zh"?"zh-CN":lang),lang);
        for(const [step,tab,label] of [["01","live","现场演出"],["02","library","准备音乐"],["03","settings","设置"]]) {
          await page.getByRole("button",{name:tr(lang,label),exact:true}).click();
          await page.locator("#page-"+tab).waitFor({state:"visible"});
          await page.evaluate(()=>document.fonts.ready);
          const measured=await page.evaluate(tab=>{
            const targets=tab==="live"?["#device","#display","#brightness","#intensity","#live-toggle","#auto-button"]:tab==="library"?["#library-select","#search","#filter"]:["#language","#standbyTheme","#layout","#text-visible","#english-condensed","#show-dj-name"];
            return {width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,font:getComputedStyle(document.body).fontFamily,controls:targets.map(id=>{const r=(document.querySelector(id + "-button") || document.querySelector(id)).getBoundingClientRect();return{id,x:r.x,y:r.y,right:r.right,bottom:r.bottom};})};
          },tab);
          assert.equal(measured.overflow,false,`Horizontal overflow: ${lang} ${tab} ${width}`);
          for(const c of measured.controls) assert.ok(c.x>=0&&c.right<=width&&c.y>=0&&c.bottom<=height,`Control clipped: ${lang} ${tab} ${width} ${JSON.stringify(c)}`);
          if(lang==="ja")assert.ok(measured.font.indexOf("Noto Sans JP")<measured.font.indexOf("Noto Sans SC"));
          if(lang==="ko")assert.ok(measured.font.indexOf("Noto Sans KR")<measured.font.indexOf("Noto Sans SC"));
          report.push({lang,tab,width,...measured});
          if(width!==1040)await page.screenshot({path:path.join(OUT,`${step}-${packaged?"packaged":"after"}-${tab}-${lang}-${width}.png`)});
        }
      }
    }
    await select(page, "language", "zh");
    await page.waitForFunction(()=>document.documentElement.lang==="zh-CN");
    await page.getByRole("button",{name:"现场演出",exact:true}).click();
    await select(page, "lock-theme", "techno");
    await stage.waitForFunction(()=>document.body.dataset.standby==="false"&&document.body.dataset.genre==="techno");
    await page.getByRole("button",{name:/恢复自动/}).click();
    await stage.waitForFunction(()=>document.body.dataset.standby==="true");
    await page.locator("#window-maximize").click();
    await page.waitForFunction(()=>window.autovj.call("state").then(s=>s.maximized));
    await page.getByRole("button",{name:"还原窗口",exact:true}).click();
    await page.waitForFunction(()=>window.autovj.call("state").then(s=>!s.maximized));
    await page.getByRole("button",{name:"最小化",exact:true}).click();
    await app.evaluate(async({BrowserWindow})=>{
      const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes("console.html"));
      await new Promise(r=>setTimeout(r,250));
      if(!w.isMinimized())throw Error("Minimize failed");
      w.restore();w.focus();
    });
    // Genuine ID3v2 metadata and native preparation, with optional services off.
    const tagged=path.join(ROOT,"output/playwright/audio/tagged.mp3");
    if(!fs.existsSync(tagged))throw Error("Generate the tagged.mp3 fixture before running interface QA");
    await page.getByRole("button",{name:"设置",exact:true}).click();
    await page.locator("#online").uncheck();
    await page.locator("#localAI").uncheck();
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},tagged);
    await page.getByRole("button",{name:"准备音乐",exact:true}).click();
    await page.getByRole("button",{name:"+ 添加音乐",exact:true}).click();
    await page.getByRole("button",{name:"分析待准备曲目",exact:true}).click();
    for(let i=0;i<300;i++) {
      state=await page.evaluate(()=>window.autovj.call("state"));
      if(state.library.tracks[0]?.status==="ready"&&!state.job)break;
      if(state.library.tracks[0]?.status==="failed")throw Error(JSON.stringify(state.library.tracks[0]));
      await new Promise(r=>setTimeout(r,100));
    }
    assert.equal(state.library.tracks[0]?.status,"ready",JSON.stringify(state.library.tracks[0]));
    const track=state.library.tracks[0];
    assert.deepEqual(track.fileTags,["Techno"]);
    assert.equal(track.title,"ID3 Verification Track");
    assert.equal(track.artist,"AutoVJ QA");
    assert.equal(track.suggestion.source,"file");
    assert.equal(track.genreId,"techno");
    await page.getByRole("button",{name:"编辑",exact:true}).click();
    assert.ok((await page.locator(".evidence").innerText()).includes("ID3 / Vorbis"));
    await page.screenshot({path:path.join(OUT,`${packaged?"packaged":"after"}-id3-evidence.png`)});
    await page.getByRole("button",{name:"关闭",exact:true}).last().click();
    await page.getByRole("button",{name:"设置",exact:true}).click();
    await select(page, "language", "ja");
    await page.getByRole("button",{name:"楽曲準備",exact:true}).click();
    await page.getByRole("button",{name:"+ ライブラリを作成",exact:true}).click();
    for(let i=0;i<50;i++) {
      state=await page.evaluate(()=>window.autovj.call("state"));
      if(state.library.tracks.length===0)break;
      await new Promise(r=>setTimeout(r,100));
    }
    assert.equal(state.settings.language,"ja","Language must survive library switching");
    assert.equal(state.library.tracks.length,0);
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(OUT,`${packaged?"packaged":"source"}-report.json`),JSON.stringify({passed:true,packaged,windowControls:true,neutralStandby:true,id3:{genre:track.genreId,source:track.suggestion.source},languagePersists:true,errors,report},null,2));
    console.log("Interface QA passed: 4 languages, 3 window sizes, native window controls, neutral standby, real ID3 tags.");
  } finally {await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
