import profiles from './export-quality.json' with {type:'json'};

// Values are target Mbps for 16:9 / 9:16. Square exports contain fewer pixels.
export function videoBitrate({width,height,fps,quality}){
  const profile=profiles[quality]||profiles.standard;
  const size=Math.min(width,height)<=720?720:1080;
  const area=width*height/(size*size*16/9);
  return Math.round(profile[size][fps===60?60:30]*1e6*area/100000)*100000;
}
