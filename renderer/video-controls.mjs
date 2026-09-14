export function videoRoutesMarkup(t) {
  return `<div class="video-routes" aria-label="${t('视频发送','Video senders')}">
    <div class="video-route"><a class="repository-link" data-repository="spout" href="https://spout.zeal.co/">Spout</a><span class="video-route-status" id="spout-status"></span><input id="spout-enabled" type="checkbox" role="switch" aria-label="${t('Spout 发送','Spout sender')}"></div>
    <div class="video-route"><a class="repository-link" data-repository="ndi" href="https://ndi.video/" title="NDI® is a registered trademark of Vizrt NDI AB">NDI®</a><span class="video-route-status" id="ndi-status"></span><input id="ndi-enabled" type="checkbox" role="switch" aria-label="${t('NDI 发送','NDI sender')}"></div>
    <button class="small ghost video-retry" data-action="video-retry" id="video-retry" hidden>${t('重新连接','Reconnect')}</button>
  </div>`;
}
export function videoSettingsMarkup(t,option) {
  return `<details class="performance-details video-settings" id="video-settings"><summary><span>Spout / NDI · ${t('视频发送','Video senders')}</span><img class="ui-icon" src="../assets/material-symbols/expand_more.svg" alt=""></summary>
    <label class="setting-row"><div><p>${t('输出源名称','Source name')}</p></div><input id="video-name" type="text" maxlength="64" autocomplete="off"></label>
    <label class="setting-row"><div><p>${t('发送分辨率','Send resolution')}</p></div><select id="video-resolution">${['1280x720','1920x1080','2560x1440','3840x2160','1080x1920','1920x1200'].map(size=>option(size,size.replace('x',' × '))).join('')}</select></label>
    <label class="setting-row"><div><p>${t('发送帧率','Send frame rate')}</p></div><select id="video-fps">${[25,30,50,60].map(f=>option(f,`${f} FPS`)).join('')}</select></label>
    <p class="settings-note" id="video-format-hint"></p>
    <p class="settings-note">${t('仅发送画面。音频由调音台或播控软件另行路由。','Video only. Route audio separately through your mixer or production software.')}</p>
    <p class="settings-note">${t('收起只隐藏本地窗口，发送继续；切黑作用于所有输出。','Hide closes the local view while sending continues. Blackout affects every output.')}</p>
    <div class="video-links"><a class="repository-link" data-repository="spout" href="https://spout.zeal.co/">Spout</a><a class="repository-link" data-repository="ndi" href="https://ndi.video/">NDI®</a></div>
  </details>`;
}
export function syncVideo(state,t,setValue) {
  const $=id=>document.getElementById(id),v=state.video||{},active=v.spout||v.ndi;
  for(const route of ['spout','ndi']){
    const enabled=Boolean(v[route]),problem=v[`${route}Error`]||v.error;
    setValue(`${route}-enabled`,enabled);$(`${route}-enabled`).disabled=Boolean(v.changing);
    let label=t('已关闭','Off');
    if(enabled){
      if(v.changing||v.status==='starting')label=t('正在连接…','Connecting…');
      else if(problem||v.status==='error')label=t('发送失败','Send failed');
      else if(v.stalled)label=t('画面中断 · 已切黑','Visual interrupted · Black');
      else if(v.blackout)label=t('切黑中','Blackout');
      else if(route==='ndi'&&!v.ndiReceivers)label=t('等待接收','Waiting for receiver');
      else label=`${t('发送中','Sending')} · ${Math.round(v[`${route}Fps`]||0)} FPS`;
    }
    const status=$(`${route}-status`);status.textContent=label;status.classList.toggle('warning',enabled&&Boolean(problem||v.stalled));
    status.title=problem||[route==='spout'?v.spoutName:v.settings?.name,v.settings?.resolution?.replace('x',' × '),route==='ndi'&&v.ndiReceivers?`${t('接收端','Receivers')}: ${v.ndiReceivers}`:''].filter(Boolean).join(' · ');
  }
  for(const [id,key] of [['video-name','name'],['video-resolution','resolution'],['video-fps','fps']]){setValue(id,v.settings?.[key]);$(id).disabled=active||v.changing;}
  $('frameRateLimit').disabled=Boolean(active);$('local-frame-hint').hidden=!active;
  $('video-format-hint').textContent=active
    ?t('发送期间锁定格式。关闭 Spout 和 NDI 后可修改。','Format is locked while sending. Turn off Spout and NDI to change it.')
    :t('发送时使用固定格式；待机降帧和本地帧率上限不会降低发送帧率。','Senders use a fixed format. Standby throttling and the local frame cap do not lower the send frame rate.');
  $('video-retry').hidden=!active||!(v.error||v.spoutError||v.ndiError);
  $('video-retry').disabled=Boolean(v.changing);
}
