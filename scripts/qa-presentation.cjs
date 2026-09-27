const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {_electron}=require(process.env.AUTOVJ_PLAYWRIGHT || 'playwright');
const {Library,atomicJson}=require('../packages/library.cjs');
const {exportPackage,importPackage}=require('../packages/portable.cjs');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'output/playwright/presentation');fs.mkdirSync(out,{recursive:true});
 const data=path.join(root,'.qa',crypto.randomUUID()),id=crypto.randomUUID();const lib=new Library(path.join(data,'libraries',id));
 lib.setDjName('DJ NIGHT');atomicJson(path.join(data,'app.json'),{activeLibrary:id,language:'en'});
 const env={...process.env,AUTOVJ_DATA_DIR:data};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:path.join(root,'node_modules/electron/dist/electron.exe'),args:[root],env});
 const errors=[];
 try {
 const p=app.windows().find(p=>p.url().includes('console.html')) || await app.waitForEvent('window',{predicate:p=>p.url().includes('console.html')});
 await p.waitForSelector('#live-toggle');const stage=app.windows().find(p=>p.url().includes('stage.html'));for(const w of app.windows())w.on('pageerror',e=>errors.push(e.message));
 // Real PNG decoding, trimming and IPC; only the native picker is substituted.
 const file=path.join(out,'logo.png');
 const fixture = await app.evaluate(({nativeImage,dialog},file)=>{const b=Buffer.alloc(240*120*4);for(let y=30;y<90;y++)for(let x=20;x<220;x++){const i=(y*240+x)*4;b[i]=180;b[i+1]=240;b[i+2]=60;b[i+3]=255;}dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});return nativeImage.createFromBitmap(b,{width:240,height:120}).toPNG().toString('base64');},file);
 fs.writeFileSync(file,Buffer.from(fixture,'base64'));
 await p.evaluate(id=>window.autovj.call('library-logo',{libraryId:id}),id);
 const saved=new Library(lib.root);assert.ok(saved.data.djLogo.startsWith('data:image/png;'));
 const pack=path.join(data,'export');await exportPackage(saved,pack,'');const imported=await importPackage(pack,path.join(data,'import'), '');assert.equal(new Library(imported).data.djLogo,saved.data.djLogo);
 for(const language of ['zh','en','ja','ko']) {await p.evaluate(language=>window.autovj.call('settings',{language}),language);await p.locator('[data-tab=settings]').click();await p.locator('#heading-mode').waitFor({state:'attached'});await p.screenshot({path:path.join(out,`settings-${language}.png`)});}
 for(const layout of ['split','stacked']) for(const [width,height] of [[1280,720],[900,1200]]) {
 await app.evaluate(({BrowserWindow},{width,height})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('stage.html'));w.setSize(width,height);}, {width,height});
 await p.evaluate(layout=>window.autovj.call('settings',{headingMode:'logo',trackInfoVisible:false,brandingVisible:false,fullscreenLayout:layout}),layout);
 await stage.waitForFunction(()=>document.body.dataset.headingMode==='logo'&&document.body.dataset.trackInfo==='false');
 assert.equal(await stage.locator('.track-details').isVisible(),false);assert.equal(await stage.locator('#genre').isVisible(),false);assert.equal(await stage.locator('#dj-logo').isVisible(),true);
 await stage.screenshot({path:path.join(out,`${layout}-${width}.png`)});
 }
 await p.evaluate(()=>window.autovj.call('settings',{headingMode:'genre',trackInfoVisible:false,fullscreenLayout:'stacked'}));
 await p.evaluate(()=>window.autovj.call('lock','drum-bass'));
 await stage.waitForTimeout(1200);
 await stage.screenshot({path:path.join(out,'genre-no-info.png')});
 const gap=await stage.evaluate(()=>document.querySelector('#genre-face').getBoundingClientRect().top-document.querySelector('#parent-genre').getBoundingClientRect().bottom);
 assert.ok(gap>=0,'Parent and genre must not overlap: '+gap);
 await p.evaluate(()=>window.autovj.call('settings',{textVisible:false}));await stage.waitForFunction(()=>document.body.dataset.stageOutputText==='false');assert.equal(await stage.locator('#hud').isVisible(),false);
 await p.evaluate(()=>window.autovj.call('settings',{textVisible:true,headingMode:'hidden',trackInfoVisible:false}));await stage.waitForFunction(()=>document.body.dataset.stageOutputText==='false');
 await p.evaluate(()=>window.autovj.call('settings',{headingMode:'genre',trackInfoVisible:true,brandingVisible:true,fullscreenLayout:'stacked'}));
 await p.locator('[data-tab=library]').click();await p.locator('.dj-profile summary').click();await p.screenshot({path:path.join(out,'library.png')});
 await p.locator('[data-action=choose-cover]').click();
 await p.locator('.cover-crop').waitFor();
 await p.locator('.cover-crop input').fill('1.5');
 await p.locator('.cover-crop input').dispatchEvent('input');
 await p.screenshot({path:path.join(out,'cover-crop.png')});
 await p.locator('.crop-actions button').last().click();
 await p.waitForFunction(()=>!document.querySelector('#custom-cover-preview').hidden);
 const withCover=new Library(lib.root);assert.ok(withCover.data.customArtwork);
 await stage.waitForFunction(()=>document.querySelector('#artwork').src.startsWith('data:image/png'));
 const coverPack=path.join(data,'cover-export');await exportPackage(withCover,coverPack,'');
 const coverImported=await importPackage(coverPack,path.join(data,'cover-import'),'');
 assert.equal(new Library(coverImported).data.customArtwork,withCover.data.customArtwork);
 await p.screenshot({path:path.join(out,'library-cover.png')});
 await p.locator('[data-action=choose-cover]').click();await p.locator('.cover-crop').waitFor();
 await p.locator('.crop-actions button').first().click();assert.equal(new Library(lib.root).data.customArtwork,withCover.data.customArtwork);
 await p.locator('[data-action=remove-cover]').click();await p.waitForFunction(()=>document.querySelector('#custom-cover-preview').hidden);
 assert.equal(new Library(lib.root).data.customArtwork,'');
 await p.evaluate(id=>window.autovj.call('library-logo',{libraryId:id,remove:true}),id);assert.equal(new Library(lib.root).data.djLogo,'');
 assert.deepEqual(errors,[]);console.log('Presentation QA passed: 4 languages, 2 layouts, landscape/portrait, logo decode/trim/export/import/remove, visibility.');
 } finally {await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
