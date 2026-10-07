// Isolated export pages use a sample clock; the live renderer is untouched.
if(new URLSearchParams(location.search).has('export')){
  window.exportTime=0;
  Object.defineProperty(performance,'now',{value:()=>window.exportTime});
  let seed=0x4750564a;
  Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
}
