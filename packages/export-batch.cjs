"use strict";
const fs=require('node:fs'),path=require('node:path');
function reserveOutput(directory,title){
  let base=String(title||'AutoVJ').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/g,'').slice(0,100)||'AutoVJ';
  if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base))base='_'+base;
  for(let n=1;n<100000;n++){
    const file=path.join(directory,base+(n===1?'':` (${n})`)+'.mp4');
    try{fs.closeSync(fs.openSync(file,'wx'));return file;}
    catch(e){if(e.code!=='EEXIST')throw e;}
  }
  throw new Error('Unable to allocate an output filename');
}
module.exports={reserveOutput};
