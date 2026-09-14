"use strict";
// Only generated tracks/libraries are removed. The actual OS recycle-bin call
// is exercised on those isolated fixtures, never the user's library.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),assert=require("node:assert/strict");
const {DatabaseSync}=require("node:sqlite");
const {_electron}=require(process.env.AUTOVJ_PLAYWRIGHT||"playwright");
const {Library,atomicJson}=require("../packages/library.cjs");
const ROOT=path.resolve(__dirname,".."),OUT=path.join(ROOT,"output/playwright/removal");
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const data=path.join(ROOT,".qa","removal-ui-"+crypto.randomUUID()),root=path.join(data,"libraries");
  const a=new Library(path.join(root,crypto.randomUUID())),b=new Library(path.join(root,crypto.randomUUID()));
  a.data.name="QA DJ Library";a.save();b.data.name="QA Other Library";b.save();
  const original=path.join(data,"original.wav");fs.writeFileSync(original,"unchanged original fixture");
  const ids=Array.from({length:3},()=>crypto.randomUUID());
  for(const [i,id] of ids.entries())a.upsert({id,title:["Alpha","Beta","Gamma"][i],artist:"QA Artist",status:"ready",filePath:original,suggestion:{id:"techno",source:"file"}});
  const db=new DatabaseSync(a.db);db.exec("CREATE TABLE songs(song_id INTEGER PRIMARY KEY,song_name TEXT,total_hashes INTEGER,fingerprinted INTEGER); CREATE TABLE fingerprints(song_id INTEGER,hash TEXT,offset INTEGER);");
  ids.forEach((id,i)=>{db.prepare("INSERT INTO songs VALUES(?,?,1,1)").run(i+1,id);db.prepare("INSERT INTO fingerprints VALUES(?,?,0)").run(i+1,"fixture"+i);});db.close();
  atomicJson(path.join(data,"app.json"),{activeLibrary:a.data.libraryId,language:"zh"});
  const env={...process.env,AUTOVJ_DATA_DIR:data};delete env.ELECTRON_RUN_AS_NODE;
  const app=await _electron.launch({executablePath:path.join(ROOT,"node_modules/electron/dist/electron.exe"),args:[ROOT],env});
  const errors=[];
  try{
    const p=app.windows().find(p=>p.url().includes("console.html"))||await app.waitForEvent("window",{predicate:p=>p.url().includes("console.html")});
    p.on("pageerror",e=>errors.push(e.message));await p.waitForSelector("#library-select",{state:"attached"});
    await p.locator("[data-tab=library]").click();
    assert.equal(await p.locator("#remove-selected").isDisabled(),true);
    await p.locator(`[data-track-select="${ids[0]}"]`).check();
    await p.locator(`[data-track-select="${ids[1]}"]`).check();
    assert.equal(await p.locator("#select-all").evaluate(el=>el.indeterminate),true);
    await p.locator("#search").fill("Alpha");
    for(const language of ["zh","en","ja","ko"]){
      await p.evaluate(language=>window.autovj.call("settings",{language}),language);
      await p.waitForFunction(language=>document.documentElement.lang===(language==="zh"?"zh-CN":language),language);
      await p.locator("#remove-selected").click();
      assert.ok((await p.locator(".removal-summary").textContent()).includes("2"));
      assert.ok((await p.locator(".removal-tracks").textContent()).includes("Beta"),"Filtered-out selected tracks must be disclosed");
      assert.equal(await p.locator("[data-close=removal-dialog]").evaluate(el=>el===document.activeElement),true);
      await p.setViewportSize({width:1024,height:768});
      assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await p.screenshot({path:path.join(OUT,`confirm-${language}.png`)});
      await p.keyboard.press("Escape");
      assert.equal((await p.evaluate(()=>window.autovj.call("state"))).library.tracks.length,3);
    }
    await p.locator("#remove-selected").click();await p.locator("[data-action=confirm-removal]").click();
    await p.waitForFunction(()=>window.autovj.call("state").then(s=>s.library.tracks.length===1&&!s.maintenance));
    await p.locator("#removal-dialog").waitFor({state:"hidden"});
    await p.waitForFunction(()=>document.querySelector("#remove-selected").disabled);
    assert.equal(await p.locator("#remove-selected").isDisabled(),true);
    const remaining=new DatabaseSync(a.db);assert.equal(remaining.prepare("SELECT count(*) AS n FROM songs").get().n,1);assert.equal(remaining.prepare("SELECT song_name FROM songs").get().song_name,ids[2]);remaining.close();
    assert.equal(fs.readFileSync(original,"utf8"),"unchanged original fixture");
    await p.locator("#search").fill("");
    await p.locator(`[data-edit="${ids[2]}"]`).click();await p.locator("[data-action=remove-track]").click();
    await p.locator("#removal-dialog").waitFor({state:"visible"});await p.locator("[data-close=removal-dialog]").click();
    assert.equal((await p.evaluate(()=>window.autovj.call("state"))).library.tracks.length,1);
    // A failed OS operation must preserve both data and active-library config.
    await app.evaluate(({shell})=>{global.qaTrash=shell.trashItem;shell.trashItem=async()=>{throw Error("QA recycle failure");};});
    await p.locator("#library-manage-button").click();await p.locator("[data-action=delete-library]").click();await p.locator("[data-action=confirm-removal]").click();
    await p.waitForFunction(()=>window.autovj.call("state").then(s=>!s.maintenance&&s.error.includes("QA recycle failure")));
    await p.locator("#removal-dialog").waitFor({state:"hidden"});
    assert.equal(JSON.parse(fs.readFileSync(path.join(data,"app.json"),"utf8")).activeLibrary,a.data.libraryId);
    assert.ok(fs.existsSync(a.file));
    // Hold the OS operation briefly and verify the main-process busy guard.
    await app.evaluate(({shell})=>{shell.trashItem=target=>new Promise((resolve,reject)=>{global.qaFinishTrash=()=>global.qaTrash(target).then(resolve,reject);});});
    await p.locator("#library-manage-button").click();await p.locator("[data-action=delete-library]").click();await p.locator("[data-action=confirm-removal]").click();
    await p.waitForFunction(()=>window.autovj.call("state").then(s=>s.maintenance));
    await p.waitForFunction(()=>document.querySelector("[data-action=delete-library]").disabled);
    assert.equal(await p.locator("[data-action=delete-library]").isDisabled(),true);
    const blocked=await p.evaluate(()=>window.autovj.call("new-library","Should not exist").then(()=>false,()=>true));assert.equal(blocked,true);
    await app.evaluate(()=>global.qaFinishTrash());
    await p.waitForFunction(id=>window.autovj.call("state").then(s=>!s.maintenance&&s.library.id===id),b.data.libraryId);
    await p.locator("#removal-dialog").waitFor({state:"hidden"});
    assert.equal(fs.existsSync(a.root),false);assert.equal(fs.readFileSync(original,"utf8"),"unchanged original fixture");
    await app.evaluate(({shell})=>{shell.trashItem=global.qaTrash;});
    // Delete the final library: the fallback must be valid and survive reload.
    await p.locator("#library-manage-button").click();await p.locator("[data-action=delete-library]").click();
    await p.screenshot({path:path.join(OUT,"last-library.png")});
    await p.locator("[data-action=confirm-removal]").click();
    await p.waitForFunction(id=>window.autovj.call("state").then(s=>!s.maintenance&&s.library.id!==id),b.data.libraryId);
    await p.locator("#removal-dialog").waitFor({state:"hidden"});
    const end=await p.evaluate(()=>window.autovj.call("state"));assert.equal(end.libraries.length,1);assert.equal(end.library.tracks.length,0);assert.equal(end.live.currentId,null);
    assert.equal(JSON.parse(fs.readFileSync(path.join(data,"app.json"),"utf8")).activeLibrary,end.library.id);
    await p.reload();await p.waitForSelector("#live-toggle");
    assert.equal((await p.evaluate(()=>window.autovj.call("state"))).library.id,end.library.id);
    assert.deepEqual(errors,[]);
    console.log("Removal UI passed: four languages, hidden selections, cancel/single/batch, native DB rows, OS failure, concurrency, recycle bin and final-library fallback.");
  }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
