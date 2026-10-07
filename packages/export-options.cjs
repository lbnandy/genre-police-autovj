"use strict";
const SIZES = { landscape: [1920,1080], portrait: [1080,1920], square: [1080,1080] };
const CHOICES = {
  fullscreenLayout: ['stacked','split'], headingMode: ['genre','dj','logo','hidden'],
  intensity: ['calm','standard','energetic'], impactMode: ['music','beat'],
  beatStrength: ['dynamic','fixed'], impactLevel: ['low','medium','high','extreme','ultra'],
  visualSize: ['standard','large','maximum'],
  encoding: ['auto','software'],
};
const FLAGS = ['textVisible','trackInfoVisible','artworkVisible','brandingVisible','fullscreenCondensed','screenImpact'];
function exportOptions(input = {}, current = {}) {
  const result = {aspect:'landscape',resolution:'1080',fps:30,quality:'standard',encoding:'auto',brightness:1,
    fullscreenLayout:'stacked',headingMode:'genre',intensity:'standard',impactMode:'beat',
    beatStrength:'dynamic',impactLevel:'medium',visualSize:'large',textVisible:true,
    trackInfoVisible:true,artworkVisible:true,brandingVisible:true,fullscreenCondensed:false,screenImpact:false};
  const source = {...current,...input};
  for (const [key, values] of Object.entries(CHOICES)) if(values.includes(source[key])) result[key]=source[key];
  for (const key of FLAGS) if(typeof source[key]==='boolean') result[key]=source[key];
  if(Object.hasOwn(SIZES,source.aspect))result.aspect=source.aspect;
  if(['720','1080'].includes(String(source.resolution)))result.resolution=String(source.resolution);
  if([30,60].includes(Number(source.fps)))result.fps=Number(source.fps);
  if(['compact','standard','high'].includes(source.quality))result.quality=source.quality;
  if(Number.isFinite(Number(source.brightness)))result.brightness=Math.max(0,Math.min(1,Number(source.brightness)));
  return result;
}
function dimensions(options, preview=false) {
  const factor=(preview?720:Number(options.resolution))/1080;
  return SIZES[options.aspect].map(x=>Math.round(x*factor/2)*2);
}
module.exports={exportOptions,dimensions};
