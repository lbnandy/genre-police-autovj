import {updateSelectPickers} from "./select-picker.mjs";
import {videoBitrate} from '../packages/export-quality.mjs';
export function createVideoExporter({api,t,esc}) {
  const dialog=document.createElement('dialog');dialog.id='video-export-dialog';
  dialog.setAttribute('aria-labelledby','video-export-title');document.body.append(dialog);
  let track=null,tracks=[],batchMode=false,options=null,job={status:'idle'},busy=false,previewOptions='',queueKey='';
  const $=id=>dialog.querySelector('#'+id);
  const select=(key,label,values)=>`<label class="field"><span>${t(label)}</span><select id="export-${key}" data-export-setting="${key}">${values.map(([value,text])=>`<option value="${value}" ${String(options[key])===String(value)?'selected':''}>${esc(t(text))}</option>`).join('')}</select></label>`;
  const toggle=(key,label)=>`<label class="export-toggle"><span>${t(label)}</span><input type="checkbox" data-export-setting="${key}" ${options[key]?'checked':''}></label>`;
  function read(){
    for(const el of dialog.querySelectorAll('[data-export-setting]'))options[el.dataset.exportSetting]=el.type==='checkbox'?el.checked:el.type==='range'?Number(el.value):el.value;
    $('export-beat-strength').hidden=options.impactMode!=='beat';
    $('export-brightness-value').textContent=Math.round(options.brightness*100)+'%';
    for(const key of ['headingMode','fullscreenCondensed','trackInfoVisible'])dialog.querySelector(`[data-export-setting="${key}"]`).disabled=!options.textVisible||busy;
    const size=Number(options.resolution);
    const rate=videoBitrate({width:options.aspect==='square'?size:size*16/9,height:size,fps:Number(options.fps),quality:options.quality});
    const seconds=(batchMode?tracks:[track]).reduce((sum,item)=>sum+(Number(item.durationMs)||0)/1000,0);
    const mb=(rate+256000)*seconds/8/1e6;
    $('export-size').textContent=options.encoding==='auto'&&seconds>0?t('预计体积约 {size}；实际大小取决于编码器。').replace('{size}',mb>=1000?(mb/1000).toFixed(1)+' GB':Math.ceil(mb)+' MB'):t('使用 H.264 / AAC 压缩，文件大小随画面和编码器变化。');
  }
  function status(){
    const taskButton=document.getElementById('export-task');
    if(taskButton){taskButton.hidden=job.status==='idle';taskButton.textContent=t('导出任务');taskButton.title=job.status==='running'?t('正在导出视频…'):t('导出任务');}
    if(!dialog.open||!$('export-progress'))return;
    busy=job.status==='running';
    $('export-fields').disabled=busy;
    $('export-preview').disabled=busy;
    $('export-start').disabled=busy;
    $('export-stop').hidden=!busy;
    $('export-close').hidden=false;$('export-close').textContent=t(busy?'收起':'关闭');
    $('export-reveal').hidden=job.batch?!job.batch.items.some(item=>item.status==='complete'):job.status!=='complete'||job.preview;
    if($('export-track'))$('export-track').disabled=busy;
    $('export-preview-start').disabled=busy;
    const progress=$('export-progress');
    progress.hidden=!busy;
    if(job.progress===null)progress.removeAttribute('value');else progress.value=job.progress||0;
    const labels={decode:'正在读取音频…',analysis:'正在分析节拍…','prepare-preview':'正在准备预览…',render:'正在渲染视频…',finalize:'正在完成视频…'};
    $('export-status').textContent=busy?t(labels[job.phase]||'正在准备预览…'):job.status==='complete'?t(job.preview?'预览已就绪':'视频已导出'):job.status==='cancelled'?t('已取消导出'):job.status==='error'?t('导出失败')+': '+job.error:t(batchMode?'统一设置，每首曲目导出一个视频。':'先预览片段，再导出整首歌。');
    $('export-count').textContent=busy&&job.progress!==null?Math.floor((job.progress||0)*100)+'%':'';
    $('export-rate').title=t('渲染速度，不是成片帧率；近期速度按最近 5 秒计算。');
    $('export-rate').textContent=busy&&job.phase==='render'?`${job.frame} / ${job.frames} ${t('帧')} · ${t('近期')} ${job.recentRenderFps==null?'—':Number(job.recentRenderFps).toFixed(1)} FPS · ${t('平均')} ${Number(job.renderFps||0).toFixed(1)} FPS${job.remainingSeconds!==null?' · '+t('预计剩余')+' '+Math.ceil(job.remainingSeconds/60)+' '+t('分钟'):''} · ${t(['h264_nvenc','webcodecs'].includes(job.encoder)?'硬件编码':'软件编码')}`:'';
    const batch=job.batch;
    if(batch){
      const complete=batch.items.filter(item=>item.status==='complete').length,failed=batch.items.filter(item=>item.status==='error').length;
      $('export-status').textContent=busy?`${batch.index+1} / ${batch.items.length} · ${batch.items[batch.index].title} · ${t(labels[job.phase]||'正在渲染视频…')}`:t('已导出 {done} 首，失败 {failed} 首').replace('{done}',complete).replace('{failed}',failed)+(job.status==='cancelled'?' · '+t('已取消导出'):'');
      progress.value=busy?(batch.index+(job.progress||0))/batch.items.length:job.status==='complete'?1:(batch.index+(job.progress||0))/batch.items.length;
      $('export-count').textContent=busy?Math.floor(progress.value*100)+'%':'';
      const key=JSON.stringify(batch.items);
      if(queueKey!==key){queueKey=key;
        const labels={queued:'等待导出',running:'正在导出',complete:'已导出',error:'导出失败',cancelled:'已取消'};
        $('export-queue').innerHTML=batch.items.map(item=>`<li><span>${esc(item.title)}${item.error?`<small>${esc(item.error==='EXPORT_AUDIO_MISSING'?t('原始音频不存在，请重新关联音频后重试。'):item.error)}</small>`:''}</span><span class="muted">${t(labels[item.status])}</span></li>`).join('');
      }
    }
    if(job.status==='complete'&&job.preview&&job.url){
      const video=$('export-video');if(video.src!==job.url){video.src=job.url;video.load();}
      video.hidden=false;$('export-placeholder').hidden=true;
    }
    read();updateSelectPickers(dialog);
    if(!busy&&job.status==='complete'&&job.preview&&previewOptions&&previewOptions!==JSON.stringify(options))$('export-status').textContent=t('设置已更改，请重新预览。');
  }
  async function start(preview){
    if(busy)return;read();
    $('export-video')?.pause();
    busy=true;$('export-preview').disabled=$('export-start').disabled=true;
    try{
      const result=await api.call(batchMode&&!preview?'video-export-batch':'video-export-start',{id:track.id,ids:tracks.map(item=>item.id),options,preview,previewStart:Number($('export-preview-start').value)||0});
      if(result?.ok&&preview)previewOptions=JSON.stringify(options);
      if(result?.canceled){busy=false;status();}
    }catch(e){job={status:'error',error:e.message.replace(/^Error invoking remote method '[^']+': Error: /,'')};status();}
  }
  api.onExport(next=>{job=next;status();});
  dialog.addEventListener('close',()=>{$('export-video')?.pause();});
  async function open(selected){
    const result=await api.call('video-export-options');options=result.options;job=result.job;
    if(job.status==='running'&&job.batch){tracks=job.batch.items;batchMode=true;track=tracks[0];}
    else if(job.status==='running'){if(!track)track=(Array.isArray(selected)?selected:[selected]).find(item=>item?.id===job.trackId);}
    else if(selected){tracks=Array.isArray(selected)?selected:[selected];batchMode=Array.isArray(selected);track=tracks[0];job={status:'idle'};}
    else if(job.batch){tracks=job.batch.items;batchMode=true;track=tracks[0];}
    if(!track)return;
    queueKey='';previewOptions='';
    dialog.innerHTML=`<header class="export-header"><h2 id="video-export-title">${t(batchMode?'批量导出视频':'导出视频')}</h2><p class="muted">${batchMode?t('已选择 {count} 首曲目').replace('{count}',tracks.length):esc(track.title)+(track.artist?' · '+esc(track.artist):'')}</p></header>
      <div class="export-body"><section class="export-preview-pane" aria-label="${t('预览')}">
        ${batchMode?`<label class="field"><span>${t('预览曲目')}</span><select id="export-track">${tracks.map(item=>`<option value="${esc(item.id)}">${esc(item.title)}</option>`).join('')}</select></label>`:''}
        <div class="export-screen"><video id="export-video" controls preload="metadata" hidden></video><div id="export-placeholder"><b>${t('片段预览')}</b><p>${t('预览使用与导出相同的视觉设置。')}</p></div></div>
        <label class="export-preview-time">${t('预览起点（秒）')}<input id="export-preview-start" type="number" min="0" max="${Math.max(0,(track.durationMs||1000)/1000-1)}" step="1" value="0"></label>
        <p class="muted export-hint">${t('预览 8 秒；导出包含整首歌和音频。')}</p>
        <div class="export-status-region"><div class="row between"><span id="export-status" role="status" aria-live="polite"></span><span id="export-count"></span></div><progress id="export-progress" max="1" aria-label="${t('导出进度')}" hidden></progress><p id="export-rate" class="export-rate"></p></div>
        <ul id="export-queue" class="export-queue">${batchMode?tracks.map(item=>`<li><span>${esc(item.title)}</span><span class="muted">${t('等待导出')}</span></li>`).join(''):''}</ul>
      </section><fieldset id="export-fields"><legend class="sr-only">${t('导出设置')}</legend>
        <section class="export-section"><h3>${t('画面')}</h3><div class="export-grid">
          ${select('aspect','画面比例',[['landscape','横屏 16:9'],['portrait','竖屏 9:16'],['square','方形 1:1']])}
          ${select('resolution','分辨率',[['720','720p'],['1080','1080p']])}
          ${select('fps','帧率',[[30,'30 FPS'],[60,'60 FPS']])}
          ${select('quality','视频质量',[['compact','低'],['standard','中'],['high','高']])}
          <div class="export-encoding">${select('encoding','视频编码',[['auto','自动（优先硬件）'],['software','软件（兼容模式）']])}</div>
          ${select('fullscreenLayout','布局',[['stacked','上下'],['split','左右']])}
          ${select('headingMode','标题内容',[['genre','曲风'],['dj','DJ 名字'],['logo','DJ Logo'],['hidden','隐藏']])}
        </div><p id="export-size" class="muted export-hint"></p><div class="export-switches">${toggle('textVisible','显示文字')}${toggle('trackInfoVisible','显示曲目信息')}${toggle('fullscreenCondensed','英文窄体')}${toggle('artworkVisible','显示封面')}${toggle('brandingVisible','显示品牌文字')}</div></section>
        <section class="export-section"><h3>${t('视觉表现')}</h3>
          <label class="field export-brightness"><span>${t('画面亮度')}<output id="export-brightness-value"></output></span><input type="range" min="0" max="1" step="0.01" value="${options.brightness}" data-export-setting="brightness"></label>
          <div class="export-grid">${select('visualSize','可视化大小',[['standard','小'],['large','标准'],['maximum','大']])}
          ${select('intensity','音乐响应程度',[['calm','低'],['standard','中'],['energetic','高']])}
          ${select('impactMode','冲击模式',[['music','音乐响应'],['beat','节拍驱动']])}
          <div id="export-beat-strength">${select('beatStrength','节拍冲击强度',[['dynamic','随音乐变化'],['fixed','固定强度']])}</div>
          ${select('impactLevel','冲击强度',[['low','低'],['medium','中'],['high','高'],['extreme','极高'],['ultra','超高']])}</div>
          ${toggle('screenImpact','全屏冲击')}</section>
        <p class="muted export-hint">${t('此处设置单独保存，不影响现场演出。Logo 和封面沿用当前曲库。')}</p>
      </fieldset></div>
      <div class="actions export-footer"><button id="export-close">${t('关闭')}</button><button id="export-stop" hidden>${t(batchMode?'取消剩余任务':'取消导出')}</button><button id="export-reveal" hidden>${t('打开文件夹')}</button><span class="grow"></span><button id="export-preview">${t('预览片段')}</button><button id="export-start" class="primary">${t(batchMode?'选择文件夹并导出':'导出 MP4')}</button></div>`;
    if($('export-track'))$('export-track').onchange=()=>{track=tracks.find(item=>item.id===$('export-track').value);$('export-preview-start').max=Math.max(0,(track.durationMs||1000)/1000-1);$('export-preview-start').value=0;$('export-video').pause();$('export-video').hidden=true;$('export-placeholder').hidden=false;job={status:'idle'};status();};
    $('export-close').onclick=()=>dialog.close();
    $('export-stop').onclick=async()=>{await api.call('video-export-cancel');};
    $('export-reveal').onclick=()=>api.call('video-export-reveal');
    $('export-video').onplay=()=>{if(busy)$('export-video').pause();};
    $('export-preview').onclick=()=>start(true);$('export-start').onclick=()=>start(false);
    $('export-fields').onchange=()=>{read();status();};$('export-fields').oninput=()=>{read();if(!busy&&job.preview&&previewOptions&&previewOptions!==JSON.stringify(options))$('export-status').textContent=t('设置已更改，请重新预览。');};
    dialog.showModal();status();$('export-preview').focus();
  }
  open.refresh=status;
  return open;
}
