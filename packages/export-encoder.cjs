"use strict";
const profiles=require('./export-quality.json');
function encoderArguments(name,quality,preview=false){
  const value=String((profiles[quality]||profiles.standard).cq);
  if(name==='h264_nvenc')return ['-c:v',name,'-preset','p5','-tune','hq','-rc','vbr','-cq',value,'-b:v','0'];
  return ['-c:v','libx264','-preset',preview?'ultrafast':'medium','-crf',value];
}
module.exports={encoderArguments};
