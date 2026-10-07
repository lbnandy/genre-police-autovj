const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {_electron}=require(process.env.AUTOVJ_PLAYWRIGHT||'playwright');
const {Library,atomicJson}=require('../packages/library.cjs');
(async()=>{
  const root=path.resolve(__dirname,'..'),data=path.join(root,'.qa',crypto.randomUUID()),out=path.join(root,'output/playwright/video-export');
  const recipe=process.env.AUTOVJ_QA_RECIPE?JSON.parse(fs.readFileSync(process.env.AUTOVJ_QA_RECIPE,'utf8')):{};
  if(process.env.AUTOVJ_QA_QUALITY)recipe.exportOptions={...recipe.exportOptions,quality:process.env.AUTOVJ_QA_QUALITY};
  fs.mkdirSync(out,{recursive:true});fs.mkdirSync(data,{recursive:true});
  const audio=path.join(data,'music.wav'),seconds=Number(process.env.AUTOVJ_QA_SECONDS)||2,resolution=process.env.AUTOVJ_QA_RESOLUTION==='1080'?'1080p':'720p';
  const args=process.env.AUTOVJ_QA_MUSIC?['-ss',process.env.AUTOVJ_QA_MUSIC_START||'0','-i',process.env.AUTOVJ_QA_MUSIC]:['-f','lavfi','-i','sine=frequency=80:sample_rate=44100'];
  execFileSync(require('ffmpeg-static'),['-v','error','-y',...args,'-t',String(seconds),'-c:a','pcm_s16le',audio],{windowsHide:true});
  const id=crypto.randomUUID(),trackId=crypto.randomUUID(),library=new Library(path.join(data,'libraries',id));
  for(const key of ['settings','djName','djLogo','djLogoScale','customArtwork'])if(recipe[key]!==undefined)library.data[key]=recipe[key];
  library.data.tracks=[{id:trackId,title:'Export verification',artist:'Local audio',filePath:audio,status:'ready',confirmed:true,durationMs:seconds*1000,manualGenre:recipe.genre||'dubstep'}];library.save();
  if(process.env.AUTOVJ_QA_BATCH){
    library.data.tracks.push({...library.data.tracks[0],id:crypto.randomUUID()}, {...library.data.tracks[0],id:crypto.randomUUID(),title:'Missing audio',filePath:path.join(data,'missing.wav')});library.save();
  }
  atomicJson(path.join(data,'app.json'),{activeLibrary:id,language:'zh',exportOptions:recipe.exportOptions});
  const env={...process.env,AUTOVJ_DATA_DIR:data};delete env.ELECTRON_RUN_AS_NODE;
  const launchArgs=process.env.AUTOVJ_QA_EXE?[]:[root];
  if(process.env.AUTOVJ_QA_DPI)launchArgs.push('--force-device-scale-factor='+Number(process.env.AUTOVJ_QA_DPI));
  const app=await _electron.launch({executablePath:process.env.AUTOVJ_QA_EXE||path.join(root,'node_modules/electron/dist/electron.exe'),args:launchArgs,env});
  const mainError=path.join(out,'main-error.txt');fs.rmSync(mainError,{force:true});
  await app.evaluate(({app},log)=>process.prependListener('uncaughtException',e=>{process.getBuiltinModule('fs').writeFileSync(log,e.stack);app.exit(1);}),mainError);
  // Test-only binary frame counter: decode the actual MP4 to detect stale,
  // duplicated or skipped compositor frames, not just a plausible frame count.
  if(process.env.AUTOVJ_QA_FRAME_CHECK||process.env.AUTOVJ_QA_LEGACY_GPU)await app.evaluate(({app})=>{
    app.on('browser-window-created',(_event,win)=>{
      const wc=win.webContents,execute=wc.executeJavaScript.bind(wc);
      wc.executeJavaScript=async(code,...args)=>{
        if(process.env.AUTOVJ_QA_LEGACY_GPU&&code.startsWith('window.exportEncoder.initialize('))return false;
        const result=await execute(code,...args);
        if(process.env.AUTOVJ_QA_FRAME_CHECK&&code.startsWith('window.exportStage.initialize('))await execute(`(()=>{
          if (document.querySelector('#hud').classList.contains('entering')) throw new Error('Offline HUD retained its entrance animation');
          for (const element of document.querySelectorAll('body, body *')) {
            if (getComputedStyle(element).transitionDuration.split(',').some(value => parseFloat(value) > 0)) throw new Error('Offline element retained a wall-clock transition');
          }

          const marker=document.createElement('div');
          marker.style.cssText='position:fixed;left:0;top:0;width:100vw;height:16px;display:flex;z-index:2147483647';
          for(let i=0;i<16;i++){const b=document.createElement('i');b.style.flex='1';marker.append(b);}
          document.body.append(marker);
          const edge=document.createElement('div');
          edge.style.cssText='position:fixed;left:0;top:'+(innerHeight-8)+'px;width:100vw;height:8px;background:#00ff00;z-index:2147483647';
          document.body.append(edge);
          const frame=window.exportStage.frame;
          window.exportStage.frame=(packet,paint)=>{
            const n=Math.round(packet.time*.06);
            [...marker.children].forEach((b,i)=>b.style.background=(n>>i)&1?'white':'black');
            return frame(packet,paint);
          };
        })()`);
        return result;
      };
    });
  });
  try{
    const page=app.windows().find(p=>p.url().includes('console.html'))||await app.waitForEvent('window',{predicate:p=>p.url().includes('console.html')});
    const errors=[];app.on('window',w=>w.on('pageerror',e=>errors.push(e.message)));page.on('pageerror',e=>errors.push(e.message));
    await page.waitForSelector('#live-toggle');let phase='';const reports=[];await page.exposeFunction('exportLog',x=>{reports.push(x);if(x.phase!==phase||x.status!=='running'){console.log(JSON.stringify(x));phase=x.phase;}});await page.evaluate(()=>window.autovj.onExport(s=>window.exportLog({status:s.status,phase:s.phase,progress:s.progress,error:s.error,encoder:s.encoder,renderStats:s.renderStats})));await page.locator('[data-tab=library]').click();
    await page.locator('[data-edit]').first().click();await page.locator('[data-action=export-video]').click();
    await page.locator('#video-export-dialog[open]').waitFor();
    assert.deepEqual(await page.locator('#export-quality option').evaluateAll(items=>items.map(item=>item.value)),['compact','standard','high']);
    await page.locator('#export-fullscreenLayout-button').click();
    const typography=await page.evaluate(()=>{
      const read=el=>{const s=getComputedStyle(el);return {size:s.fontSize,weight:s.fontWeight,line:s.lineHeight,family:s.fontFamily}};
      return {value:read(document.querySelector('#export-fullscreenLayout-button .select-value')),option:read(document.querySelector('#export-fullscreenLayout-menu .select-option span'))};
    });
    assert.deepEqual(typography.value,typography.option,'Closed and open picker typography must match');
    await page.screenshot({path:path.join(out,'export-picker.png')});
    await page.keyboard.press('Escape');
    await page.screenshot({path:path.join(out,'export-zh.png')});
    await page.locator('#export-preview').click();
    await page.waitForFunction(()=>!document.querySelector('#export-video').hidden||document.querySelector('#export-status').textContent.startsWith('导出失败'),{},{timeout:180000});
    assert.equal(await page.locator('#export-video').isVisible(),true,await page.locator('#export-status').textContent());
    await page.locator('#export-video').evaluate(async v=>{v.currentTime=1;await new Promise(resolve=>v.addEventListener('seeked',resolve,{once:true}));});
    await page.screenshot({path:path.join(out,'preview.png')});
    const target=path.join(out,'export.mp4');
    await app.evaluate(({dialog},target)=>{dialog.showSaveDialog=async()=>({filePath:target,canceled:false});},target);
    await page.locator('#export-resolution-button').click();await page.locator('#export-resolution-menu [role=option]').filter({hasText:resolution}).click();
    await page.locator('#export-fps-button').click();await page.locator('#export-fps-menu [role=option]').filter({hasText:'60 FPS'}).click();
    await page.locator('[data-export-setting=screenImpact]').check();
    await page.locator('#export-video').evaluate(async video=>{video.currentTime=0;await video.play();});
    await page.locator('#export-start').click();
    assert.equal(await page.locator('#export-video').evaluate(video=>video.paused),true,'Export must pause the preview player');
    await page.waitForFunction(()=>document.querySelector('#export-status').textContent==='视频已导出'||document.querySelector('#export-status').textContent.startsWith('导出失败'),{},{timeout:180000});
    assert.equal(await page.locator('#export-status').textContent(),'视频已导出');assert.ok(fs.statSync(target).size>10000);
    if(process.env.AUTOVJ_QA_FRAME_CHECK){
      const width=resolution==='1080p'?1920:1280;
      const rows=execFileSync(require('ffmpeg-static'),['-v','error','-i',target,'-vf','crop=iw:2:0:2,format=gray','-f','rawvideo','pipe:1'],{windowsHide:true,maxBuffer:20*1024*1024});
      assert.equal(rows.length/(width*2),seconds*60,'Encoded frame count');
      for(let n=0;n<seconds*60;n++){
        let code=0;for(let bit=0;bit<16;bit++)if(rows[n*width*2+Math.floor((bit+.5)*width/16)]>128)code|=1<<bit;
        assert.equal(code,n,`Stale or skipped frame at ${n}`);
      }
      console.log(`Verified all ${seconds*60} encoded frame timestamps in order`);
      const bottom=execFileSync(require('ffmpeg-static'),['-v','error','-i',target,'-vf','crop=64:2:0:ih-2,format=gray','-f','rawvideo','pipe:1'],{windowsHide:true,maxBuffer:2*1024*1024});
      assert.ok(bottom.every(value=>value>70&&value<225),'Encoded bottom edge must contain the test border, never the black/white synchronization gutter');
    }
    // Reuse prepared audio, cancel during rendering, preserve an existing file.
    const digest=crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
    await page.locator('#export-encoding-button').scrollIntoViewIfNeeded();
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.locator('#export-encoding-button').click();
    await page.locator('#export-encoding-menu [role=option]').filter({hasText:'软件（兼容模式）'}).click();
    await page.locator('#export-start').click();
    await page.waitForFunction(()=>document.querySelector('#export-status').textContent==='正在渲染视频…');
    await page.locator('#export-stop').click();
    await page.waitForFunction(()=>document.querySelector('#export-status').textContent==='已取消导出');
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex'),digest);
    assert.ok(!fs.readdirSync(out).some(name=>name.endsWith('.partial.mp4')));
    let previous=0;
    for(const report of reports){if(report.phase==='decode')previous=0;else if(report.status==='running'&&report.progress!==null){assert.ok(report.progress>=previous,'Progress moved backwards');previous=report.progress;}}
    // Settings remain local to export, and conditional controls stay related.
    await page.locator('#export-impactMode-button').scrollIntoViewIfNeeded();
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.locator('#export-impactMode-button').click();
    await page.locator('#export-impactMode-menu [role=option]').filter({hasText:'音乐响应'}).click();
    assert.equal(await page.locator('#export-beat-strength').isVisible(),false);
    const liveSettings=await page.evaluate(async()=>{const s=await window.autovj.call('state');return s.settings;});
    assert.equal(liveSettings.screenImpact,recipe.settings?.screenImpact||false);
    await page.locator('#export-close').click();
    for(const width of [1100,760]){
      await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('console.html')).setSize(width,820),width);
      for(const language of ['zh','en','ja','ko']){
        await page.evaluate(language=>window.autovj.call('settings',{language}),language);
        await page.waitForFunction(language=>document.documentElement.lang.startsWith(language),language);
        await page.locator('[data-edit]').first().click();await page.locator('[data-action=export-video]').click();
        await page.locator('#video-export-dialog[open]').waitFor();
        const layout=await page.locator('#video-export-dialog').evaluate(d=>({overflow:d.scrollWidth>d.clientWidth+1,button:d.querySelector('#export-start').getBoundingClientRect().bottom,bottom:d.getBoundingClientRect().bottom}));
        assert.equal(layout.overflow,false);assert.ok(layout.button<=layout.bottom);
        await page.screenshot({path:path.join(out,`export-${language}-${width}.png`)});
        await page.locator('#export-close').click();
      }
    }
    if(process.env.AUTOVJ_QA_BATCH){
      await page.evaluate(()=>window.autovj.call('settings',{language:'zh'}));
      await page.waitForFunction(()=>document.documentElement.lang==='zh-CN');
      const batchDir=path.join(data,'videos');fs.mkdirSync(batchDir);fs.writeFileSync(path.join(batchDir,'Export verification.mp4'),'preserve existing video');
      await app.evaluate(({dialog},dir)=>{dialog.showOpenDialog=async()=>({filePaths:[dir],canceled:false});},batchDir);
      await page.evaluate(()=>window.autovj.onExport(state=>window.batchState=state));
      await page.locator('#select-all').check();await page.locator('#export-selected').click();
      await page.screenshot({path:path.join(out,'batch-settings.png')});
      assert.equal(await page.locator('#export-track option').count(),3);
      await page.locator('#export-start').click();
      await page.waitForFunction(()=>window.batchState?.batch&&window.batchState.status==='running');
      await page.locator('#export-close').click();await page.locator('#export-task').click();
      await page.waitForFunction(()=>window.batchState?.batch&&window.batchState.status==='complete',{},{timeout:180000});
      const result=await page.evaluate(()=>window.batchState);
      assert.deepEqual(result.batch.items.map(item=>item.status),['complete','complete','error']);
      assert.equal(fs.readFileSync(path.join(batchDir,'Export verification.mp4'),'utf8'),'preserve existing video');
      for(const n of [2,3])assert.ok(fs.statSync(path.join(batchDir,`Export verification (${n}).mp4`)).size>10000);
      await page.screenshot({path:path.join(out,'batch-complete.png')});
      await page.locator('#export-start').click();
      await page.waitForFunction(()=>window.batchState?.status==='running'&&window.batchState.batch?.items[0].status==='complete',{},{timeout:180000});
      await page.locator('#export-stop').click();
      await page.waitForFunction(()=>window.batchState?.status==='cancelled');
      assert.ok(fs.statSync(path.join(batchDir,'Export verification (4).mp4')).size>10000);
      assert.equal(fs.existsSync(path.join(batchDir,'Export verification (5).mp4')),false);
      await page.locator('#export-close').click();
      for(const language of ['zh','en','ja','ko']){
        await page.evaluate(language=>window.autovj.call('settings',{language}),language);
        await page.waitForFunction(language=>document.documentElement.lang.startsWith(language),language);
        await page.locator('#export-selected').click();
        const fits=await page.locator('#video-export-dialog').evaluate(d=>d.scrollWidth<=d.clientWidth+1&&d.querySelector('#export-start').getBoundingClientRect().bottom<=d.getBoundingClientRect().bottom);
        assert.ok(fits);await page.screenshot({path:path.join(out,`batch-${language}.png`)});await page.locator('#export-close').click();
      }
      console.log('Batch export, duplicate filenames, missing audio, background progress and cancellation verified');
    }
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({output:target,errors,screenshot:path.join(out,'preview.png')}));
  }finally{await app.close();}
  assert.equal(fs.existsSync(mainError),false,fs.existsSync(mainError)?fs.readFileSync(mainError,"utf8"):"Main process error");
})().catch(e=>{console.error(e);process.exitCode=1;});
