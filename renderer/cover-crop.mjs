export async function cropCover(source, t) {
  const image = new Image(); image.src = source; await image.decode();
  const dialog = document.createElement('dialog');
  dialog.className = 'cover-crop'; dialog.setAttribute('aria-label', t('裁剪封面', 'Crop cover'));
  const heading=document.createElement('h2'); heading.textContent=t('裁剪封面','Crop cover');
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
  const hint=document.createElement('p');hint.textContent=t('拖动图片调整位置，使用滑块缩放。','Drag to reposition; use the slider to zoom.');
  const zoom=document.createElement('input');zoom.type='range';zoom.min=1;zoom.max=4;zoom.step=.01;zoom.value=1;zoom.setAttribute('aria-label',t('缩放','Zoom'));
  const actions=document.createElement('div');actions.className='crop-actions';
  const cancel=document.createElement('button'),save=document.createElement('button');cancel.textContent=t('取消','Cancel');save.textContent=t('保存','Save');save.className='primary';actions.append(cancel,save);
  dialog.append(heading,canvas,hint,zoom,actions);document.body.append(dialog);
  const ctx=canvas.getContext('2d');const base=512/Math.min(image.width,image.height);let x=0,y=0;
  function draw(){const scale=base*Number(zoom.value),w=image.width*scale,h=image.height*scale;x=Math.max(-(w-512)/2,Math.min((w-512)/2,x));y=Math.max(-(h-512)/2,Math.min((h-512)/2,y));ctx.clearRect(0,0,512,512);ctx.drawImage(image,(512-w)/2+x,(512-h)/2+y,w,h);}
  let drag=null;
  canvas.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);};
  canvas.onpointermove=e=>{if(!drag)return;const ratio=512/canvas.getBoundingClientRect().width;x+=(e.clientX-drag.x)*ratio;y+=(e.clientY-drag.y)*ratio;drag={x:e.clientX,y:e.clientY};draw();};
  canvas.onpointerup=canvas.onpointercancel=()=>{drag=null;};zoom.oninput=draw;
  draw();dialog.showModal();
  return new Promise(resolve=>{let result=null;save.onclick=()=>{result=canvas.toDataURL('image/png');dialog.close();};cancel.onclick=()=>dialog.close();dialog.onclose=()=>{dialog.remove();resolve(result);};});
}
