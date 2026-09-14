"use strict";
const { contextBridge, ipcRenderer, sharedTexture } = require("electron");
const calls = new Set([
  "window-control",
  "open-repository",
  "update-check",
  "open-update",
  "dismiss-update",
  "state",
  "devices",
  "settings",
  "add-files",
  "add-folder",
  "analyze",
  "cancel-analysis",
  "track",
  "preset",
  "live-start",
  "live-stop",
  "lock",
  "blackout",
  "output",
  "video-route",
  "video-settings",
  "video-retry",
  "export",
  "import",
  "library",
  "library-profile",
  "new-library",
  "rename-library",
  "reveal-library",
  "export-diagnostics",
  "restart-output",
  "remove-track",
  "remove-tracks",
  "undo-removal",
  "delete-library",
  "preview-track",
  "relink-track",
]);
function subscribe(channel, callback) {
  const listener = (_, data) => callback(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}
contextBridge.exposeInMainWorld("autovj", {
  call: (name, data) => {
    if (!calls.has(name)) return Promise.reject(new Error("Unknown action"));
    return ipcRenderer.invoke("autovj:action", name, data);
  },
  onState: (fn) => subscribe("autovj:state", fn),
  onScene: (fn) => subscribe("autovj:scene", fn),
  onOutputResume: (fn) => subscribe("autovj:output-resume", fn),
  onRenderActive: (fn) => subscribe("autovj:render-active", fn),
  onPCM: (fn) => subscribe("autovj:pcm", fn),
  onRhythm: (fn) => subscribe("autovj:rhythm", fn),
  onPerformance: (fn) => subscribe("autovj:performance", fn),
  reportPerformance: (stats) => ipcRenderer.send("autovj:performance", stats),
  previewSize: (size) => ipcRenderer.send("autovj:preview-size", size),
  stageReady: () => ipcRenderer.send("autovj:stage-ready"),
  stagePainted: () => ipcRenderer.send("autovj:stage-painted"),
  ackPCM: () => ipcRenderer.send("autovj:pcm-ack"),
  stageError: (message) =>
    ipcRenderer.send("autovj:stage-error", String(message).slice(0, 500)),
  hideOutput: () => ipcRenderer.send("autovj:hide-output"),
});

// Available in Electron's sandboxed preload. No Node access is exposed to page
// scripts; only a VideoFrame is drawn into the local presentation canvas.
window.addEventListener('DOMContentLoaded',()=>{
  const page=location.pathname.split('/').pop();
  if(!['console.html','output.html'].includes(page))return;
  sharedTexture.setSharedTextureReceiver(async({importedSharedTexture:texture},target)=>{
    let frame;
    try{
      const preview=target.id==='preview';
      const canvas=document.getElementById(preview?'preview':'output-frame');
      if(!canvas)return;
      frame=texture.getVideoFrame();
      const scale=preview?Math.min(1,(target.maxWidth||1280)/frame.displayWidth,(target.maxHeight||720)/frame.displayHeight):1;
      const width=Math.max(1,Math.round(frame.displayWidth*scale)),height=Math.max(1,Math.round(frame.displayHeight*scale));
      if(canvas.width!==width)canvas.width=width;
      if(canvas.height!==height)canvas.height=height;
      canvas.getContext('2d',{alpha:false,desynchronized:true}).drawImage(frame,0,0,width,height);
      canvas.dataset.ready='true';window.dispatchEvent(new Event('autovj-video-frame'));
    }finally{frame?.close();texture.release();}
  });
  ipcRenderer.send('autovj:presenter-ready');
});
