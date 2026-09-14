"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),assert=require("node:assert/strict");
const {_electron}=require(process.env.AUTOVJ_PLAYWRIGHT||"playwright");
const {Library,atomicJson}=require("../packages/library.cjs");
const ROOT=path.resolve(__dirname,".."),OUT=path.join(ROOT,"output/playwright/responsive");
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const data=path.join(ROOT,".qa","responsive-"+crypto.randomUUID()),id=crypto.randomUUID(),trackId=crypto.randomUUID();
  const lib=new Library(path.join(data,"libraries",id));
  lib.upsert({id:trackId,title:"A long track title · 夜空を駆ける音楽と光 · 밤하늘의 음악 · Extended Mix",artist:"AutoVJ layout fixture",manualGenre:"uptempo-hardcore",status:"ready"});
  atomicJson(path.join(data,"app.json"),{activeLibrary:id});
  const env={...process.env,AUTOVJ_DATA_DIR:data};delete env.ELECTRON_RUN_AS_NODE;
  const app=await _electron.launch({executablePath:path.join(ROOT,"node_modules/electron/dist/electron.exe"),args:[ROOT,"--lang=ja-JP"],env});
  const errors=[],results=[];
  try{
    let p=app.windows().find(x=>x.url().includes("console.html"));
    if(!p)p=await app.waitForEvent("window",{predicate:x=>x.url().includes("console.html")});
    await p.waitForSelector("#live-toggle");
    const stage=app.windows().find(x=>x.url().includes("stage.html"));
    for(const page of app.windows())page.on("pageerror",e=>errors.push(e.message));
    let state=await p.evaluate(()=>window.autovj.call("state"));
    assert.equal(state.settings.languagePreference,"system");
    assert.equal(state.settings.language,"ja");
    assert.equal(await p.locator("#language").inputValue(),"system");
    await stage.waitForFunction(()=>document.body.dataset.standby==="true");
    assert.equal(await stage.locator("#genre-face").innerText(),"STANDBY");
    await p.evaluate(()=>window.autovj.call("settings",{language:"zh"}));
    await p.waitForFunction(()=>document.documentElement.lang==="zh-CN");
    for(const [width,height] of [[1440,940],[1366,768],[1024,768],[860,620],[1920,1080]]){
      await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes("console.html")).setSize(...size),[width,height]);
      for(const tab of ["live","settings"]){
        console.log((await p.locator(".tabs").ariaSnapshot()).replaceAll("\n"," "));
        await p.locator(`[data-tab=${tab}]`).click();
        await p.locator(`#page-${tab}`).waitFor({state:"visible"});
        await p.evaluate(()=>document.fonts.ready);
        const measure=await p.evaluate(tab=>{
          const box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
          return{width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,preview:box(document.querySelector('.program')),textToggle:box(document.querySelector('#text-visible')),footer:box(document.querySelector('footer')),cards:tab==='settings'?[...document.querySelectorAll('.settings-card')].map(box):[],controls:tab==='live'?[...document.querySelectorAll('.control-card')].map(box):[]};
        },tab);
        assert.ok(measure.scrollWidth<=width,JSON.stringify(measure));
        if(tab==="settings"){
          for(const [a,b] of [[0,1],[2,3]]){
            assert.ok(Math.abs(measure.cards[a].y-measure.cards[b].y)<1);
            assert.ok(Math.abs(measure.cards[a].bottom-measure.cards[b].bottom)<1,"Settings bottoms should align");
          }
        }else{
          assert.equal(measure.controls.length,3,"Audio, output and performance remain separate cards");
          assert.equal(await p.locator("#page-live #text-visible").count(),0,"Display preferences belong in Settings");
          if(width>=1024){
            assert.ok(measure.scrollHeight<=height+2,"Main controls should fit standard laptop height");
            assert.ok(Math.abs(measure.footer.bottom-height)<30,"No large unused bottom area");
          }
        }
        results.push({kind:"console",tab,...measure});
        await p.screenshot({path:path.join(OUT,`console-${tab}-${width}x${height}.png`)});
      }
    }
    // Real renderer viewport emulation covers aspect ratios without requiring
    // these physical displays to be attached to the development computer.
    for(const [width,height] of [[1280,720],[1920,1080],[1920,1200],[1280,960],[2560,1080],[3840,2160],[1080,1920]]){
      await stage.setViewportSize({width,height});
      for(const layout of ["split","stacked"]){
        await p.evaluate(({layout,id})=>window.autovj.call("settings",{fullscreenLayout:layout,textVisible:true}).then(()=>window.autovj.call("preview-track",id)),{layout,id:trackId});
        await stage.waitForFunction(layout=>document.body.dataset.fullscreenLayout===layout&&document.body.dataset.standby==="false",layout);
        await stage.waitForTimeout(1150);
        const measure=await stage.evaluate(()=>{
          const box=id=>{const r=document.getElementById(id).getBoundingClientRect();return{id,x:r.x,y:r.y,right:r.right,bottom:r.bottom};};
          return{width:innerWidth,height:innerHeight,canvas:box('visualizer'),backdrop:box('poster-backdrop'),text:['genre-face','title','artist'].map(box)};
        });
        for(const c of [measure.canvas,measure.backdrop])assert.ok(c.x<=0&&c.y<=0&&c.right>=width&&c.bottom>=height,`Background gap: ${JSON.stringify(measure)}`);
        for(const c of measure.text)assert.ok(c.x>=0&&c.y>=0&&c.right<=width+1&&c.bottom<=height+1,`Clipped text: ${layout} ${JSON.stringify(measure)}`);
        results.push({kind:"stage",layout,...measure});
        if([[1280,720],[2560,1080],[1080,1920]].some(([w,h])=>w===width&&h===height))await stage.screenshot({path:path.join(OUT,`stage-${layout}-${width}x${height}.png`)});
        await p.evaluate(()=>window.autovj.call("settings",{textVisible:false}));
        await stage.waitForFunction(()=>document.body.dataset.stageOutputText==="false");
        assert.equal(await stage.locator("#hud").isVisible(),false);
      }
    }
    await stage.setViewportSize({width:1280,height:720});
    await p.evaluate(()=>window.autovj.call("settings",{textVisible:true,fullscreenLayout:"split"}).then(()=>window.autovj.call("lock",null)));
    await stage.waitForFunction(()=>document.body.dataset.standby==="true");
    await stage.waitForTimeout(1400);
    const first=await stage.screenshot();await stage.waitForTimeout(500);const second=await stage.screenshot();
    assert.notDeepEqual(first,second,"Standby visual should continue animating");
    assert.equal(await stage.locator("#genre-face").innerText(),"STANDBY");
    await stage.screenshot({path:path.join(OUT,"standby.png")});
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(OUT,"report.json"),JSON.stringify({passed:true,systemLanguage:"ja",errors,results},null,2));
    console.log("Responsive QA passed: five console sizes, seven output viewports, both layouts, text toggle and animated standby.");
  }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
