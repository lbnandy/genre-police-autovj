'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {_electron}=require(process.env.AUTOVJ_PLAYWRIGHT||'playwright');
const {select}=require('./qa-picker.cjs');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'output/playwright/visual-size');fs.mkdirSync(out,{recursive:true});
 const env={...process.env,AUTOVJ_DATA_DIR:path.join(root,'.qa','visual-size-'+crypto.randomUUID())};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:path.join(root,'node_modules/electron/dist/electron.exe'),args:[root],env});
 const errors=[];
 try{
  const page=app.windows().find(p=>p.url().includes('console.html'))||await app.waitForEvent('window',{predicate:p=>p.url().includes('console.html')});
  await page.waitForSelector('#visualSize-button');
  const stage=app.windows().find(p=>p.url().includes('stage.html'));
  for(const p of app.windows())p.on('pageerror',e=>errors.push(e.message));
  for(const level of ['low','medium','high','extreme','ultra']){
   await select(page,'impactLevel',level);
   await page.waitForFunction(async level=>(await window.autovj.call('state')).settings.impactLevel===level,level);
  }
  await page.evaluate(()=>window.autovj.call('settings',{impactLevel:'medium',brightness:1}));
  const dimensions=[];
  for(const layout of ['split','stacked'])for(const [width,height] of [[1280,720],[900,1200]]){
   await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('stage.html')).setSize(...size),[width,height]);
   await page.evaluate(fullscreenLayout=>window.autovj.call('settings',{fullscreenLayout}),layout);
   await stage.waitForFunction(layout=>document.body.dataset.fullscreenLayout===layout,layout);
   for(const size of ['standard','large','maximum']){
    await select(page,'visualSize',size);
    await stage.waitForFunction(s=>Number(getComputedStyle(document.documentElement).getPropertyValue('--visual-size-scale'))===({standard:1,large:1.15,maximum:1.3})[s],size);
    await stage.locator('#hud').evaluate(async el=>{await Promise.all(el.getAnimations().filter(a=>a.effect.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
    const box=await stage.evaluate(()=>{const a=document.querySelector('#core-art').getBoundingClientRect(),h=document.querySelector('#hud').getBoundingClientRect();return {width:a.width,center:[a.x+a.width/2,a.y+a.height/2],hudTop:h.top,artBottom:a.bottom};});
    if(layout==='stacked')assert.ok(box.hudTop>box.artBottom,JSON.stringify({layout,size,...box}));
    dimensions.push({layout,viewportWidth:width,viewportHeight:height,size,...box});
    await stage.screenshot({path:path.join(out,`${layout}-${width}-${size}.png`)});
   }
  }
  for(let i=0;i<dimensions.length;i+=3){assert.ok(dimensions[i+1].width>dimensions[i].width);assert.ok(dimensions[i+2].width>dimensions[i+1].width);}
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'dimensions.json'),JSON.stringify(dimensions,null,2));
  console.log('Visual size QA passed: 3 sizes, 2 layouts, landscape/portrait; all 5 impact levels persist.');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
