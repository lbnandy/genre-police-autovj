const test=require('node:test');
const assert=require('node:assert/strict');
test('logo shares actual title spring and themed filter while preserving sharp pixels',async()=>{
 const element=()=>({hidden:false,style:{setProperty(name,value){this[name]=value;}}});
 const elements={'#genre':element(),'#genre-face':element(),'#dj-logo':element()};
 const previous=global.document;
 global.document={querySelector:id=>elements[id],body:{dataset:{layout:'poster',family:'electronic'}},documentElement:element()};
 try {
 const {createTextMotion}=await import('../renderer/upstream-text-motion.mjs');
 const update=createTextMotion({});
 const theme={id:'synthwave',mode:'trance',family:'electronic',textFx:1};
 const metrics={rhythmPulse:.8,rhythmNow:true,volume:.6,drive:.6,relativeEnergy:1};
 for(let i=1;i<15;i++)update(theme,metrics,i*17,17,true,'stacked');
 const title=elements['#genre'].style.transform,logo=elements['#dj-logo'].style.transform;
 assert.equal(logo.match(/scale\([^)]+\)/)[0],title.match(/scale\([^)]+\)/)[0]);
 assert.ok(!logo.includes('skew'));assert.match(title,/skewX\(-7deg\)/);assert.ok(!logo.includes('genre-balance'));
 assert.ok(!elements['#dj-logo'].style.filter.includes('#12052b'));
 assert.equal((elements['#dj-logo'].style.filter.match(/drop-shadow\(0 0 /g)||[]).length,2);
 assert.ok(!elements['#dj-logo'].style.filter.includes(' blur('));
 update({...theme,id:'dubstep',mode:'dubstep',family:'bass'},metrics,300,17,true,'split');
 assert.ok(!elements['#dj-logo'].style.transform.includes('skewX(-7deg)'));
 assert.ok(!elements['#dj-logo'].style.filter.includes(' blur('));
 assert.equal((elements['#dj-logo'].style.filter.match(/drop-shadow\(0 0 /g)||[]).length,2);
 } finally {global.document=previous;}
});
