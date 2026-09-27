const test = require('node:test');
const assert = require('node:assert/strict');
const load = () => import('../renderer/screen-impact.mjs');

test('impact tiers remain distinct at saturated beat strength without adding triggers', async () => {
 const {ScreenImpact}=await load();const peaks=[],tails=[],rgb=[];
 for(const level of ['low','medium','high','extreme','ultra']){
  const fx=new ScreenImpact();fx.update({},0,true,'beat',level);
  rgb.push(fx.update({impact:1,beatNow:true},100,true,'beat',level).rgb);
  peaks.push(fx.update({impact:1,beatNow:true},112,true,'beat',level).motion);
  tails.push(fx.update({impact:1,beatNow:true},250,true,'beat',level).motion);
  assert.equal(fx.at,100);
 }
 for(let i=1;i<peaks.length;i++){assert.ok(peaks[i]>peaks[i-1]*1.4);assert.ok(tails[i]>tails[i-1]);}
 assert.deepEqual(rgb,[1,3,8,16,24]);
});
test('screen impact attacks quickly, decays and clears when disabled', async () => {
 const {ScreenImpact} = await load(); const fx = new ScreenImpact();
 fx.update({impact:0},0,true);
 assert.ok(fx.update({impact:1},100,true).flash > .9);
 const peak=fx.update({impact:.8},112,true).motion;
 assert.ok(peak > .9);
 assert.ok(fx.update({impact:0},400,true).motion < peak*.2);
 assert.equal(fx.update({impact:0},900,true).motion,0);
 assert.equal(fx.update({impact:1},1000,false).flash,0);
 assert.equal(fx.update({impact:1},1000,false).rgb,0);
 assert.equal(fx.update({impact:1},1010,true).motion,0);
});
test('beat mode ignores DSP-only events and consumes sustained flags', async () => {
 const {ScreenImpact} = await load(); const fx = new ScreenImpact();
 fx.update({},0,true,'beat');
 assert.equal(fx.update({impact:1,onsetNow:true},100,true,'beat').motion,0);
 assert.ok(fx.update({impact:.8,beatNow:true},200,true,'beat').flash > 0);
 assert.equal(fx.update({impact:.8,beatNow:true},400,true,'beat').flash,0);
 fx.update({},500,true,'beat');
 assert.ok(fx.update({impact:.8,beatNow:true},600,true,'beat').flash > 0);
});
