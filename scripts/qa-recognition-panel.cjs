"use strict";
// UI scenarios use the production live-state reducer with native-format
// events. This checks presentation, not recognition accuracy from real audio.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),assert=require("node:assert/strict");
const {_electron}=require(process.env.AUTOVJ_PLAYWRIGHT||"playwright");
const {Library,atomicJson}=require("../packages/library.cjs");
const {initialLive,reduceLive}=require("../packages/live-state.cjs");
const ROOT=path.resolve(__dirname,".."),OUT=path.join(ROOT,"output/playwright/recognition-panel");
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const data=path.join(ROOT,".qa","recognition-"+crypto.randomUUID()),id=crypto.randomUUID(),a=crypto.randomUUID(),b=crypto.randomUUID();
  const lib=new Library(path.join(data,"libraries",id));
  lib.upsert({id:a,title:"Afterglow (Original Mix)",artist:"QA Current",status:"ready",fileTags:["Drum & Bass"],suggestion:{id:"drum-bass",source:"file",conflict:true,uncertain:true},analysis:{ai:{id:"house",confidence:.3}}});
  lib.upsert({id:b,title:"Incoming Track (Extended Mix)",artist:"QA Candidate",status:"ready",suggestion:{id:"techno",source:"local-ai"}});
  atomicJson(path.join(data,"app.json"),{activeLibrary:id,language:"zh"});
  const env={...process.env,AUTOVJ_DATA_DIR:data};delete env.ELECTRON_RUN_AS_NODE;
  const app=await _electron.launch({executablePath:path.join(ROOT,"node_modules/electron/dist/electron.exe"),args:[ROOT],env});
  const errors=[];
  try{
    const p=app.windows().find(w=>w.url().includes("console.html"))||await app.waitForEvent("window",{predicate:w=>w.url().includes("console.html")});
    await p.waitForSelector("#live-toggle");p.on("pageerror",e=>errors.push(e.message));
    let current=reduceLive({...initialLive(),running:true},{type:"match",event:"confirmed",trackUid:a,currentCharge:10,candidateCharge:10});
    const candidate=reduceLive(current,{type:"match",event:"mix-hold",trackUid:b,currentCharge:3,candidateCharge:8});
    const lost=reduceLive(candidate,{type:"device",lost:true});
    async function send(live){
      const state=await p.evaluate(()=>window.autovj.call("state"));
      state.live={...live,current:state.library.tracks.find(t=>t.id===live.currentId)||null,candidate:state.library.tracks.find(t=>t.id===live.candidateId)||null};
      await app.evaluate(({BrowserWindow},s)=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes("console.html")).webContents.send("autovj:state",s),state);
      await p.waitForFunction(({current,candidate})=>document.querySelector("#current-charge").textContent===current+" / 10"&&document.querySelector("#candidate-charge").textContent===candidate+" / 10",{current:live.currentCharge,candidate:live.candidateCharge});
    }
    for(const language of ["zh","en","ja","ko"]){
      await p.evaluate(language=>window.autovj.call("settings",{language}),language);
      await p.waitForFunction(language=>document.documentElement.lang===(language==="zh"?"zh-CN":language),language);
      for(const [name,live] of [["confirmed",current],["candidate",candidate],["lost",lost]]){
        await send(live);
        if(name==="candidate"){
          assert.equal(await p.locator("#cue-theme").textContent(),"DRUM & BASS");
          assert.ok((await p.locator("#candidate-name").textContent()).includes("Incoming Track"));
          assert.equal(await p.locator("#candidate-artist").textContent(),"QA Candidate");
          assert.equal(await p.locator("#candidate-battery").locator("..").getAttribute("aria-valuenow"),"8");
          assert.equal(await p.locator(".cue-note.warning").count(),1);
        }
        if(name==="lost") assert.equal(await p.locator("#cue-evidence-button").isVisible(),false);
      }
    }
    await p.evaluate(()=>window.autovj.call("settings",{language:"zh"}));
    await p.waitForFunction(()=>document.documentElement.lang==="zh-CN");
    for(const [width,height] of [[1024,768],[2560,1440]]){
      await p.setViewportSize({width,height});await send(candidate);
      assert.equal(await p.locator("#auto-button").isVisible(),true);
      const geometry=await p.evaluate(()=>({w:innerWidth,h:innerHeight,scroll:document.documentElement.scrollHeight,parts:['#console','main','#page-live','.hero-grid','.preview-panel','.cue','.cue-scroll','.cue-manual','.control-grid','footer'].map(q=>{const e=document.querySelector(q),r=e.getBoundingClientRect(),s=getComputedStyle(e);return{q,y:r.y,h:r.height,min:s.minHeight,basis:s.flexBasis,height:s.height,overflow:s.overflowY};})}));
      assert.ok(geometry.scroll<=geometry.h+2,JSON.stringify(geometry));
      await p.screenshot({path:path.join(OUT,`candidate-${width}.png`)});
    }
    await p.locator("#cue-evidence-button").click();
    await p.locator("#editor").waitFor({state:"visible"});
    assert.ok((await p.locator("#editor").textContent()).includes("Afterglow"));
    await p.locator('[data-close="editor"]').first().click();
    assert.deepEqual(errors,[]);
    console.log("Recognition panel passed: candidate/current separation, reset, source conflicts, four languages, compact layout and evidence details.");
  }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
