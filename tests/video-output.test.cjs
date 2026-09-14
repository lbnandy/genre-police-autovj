const test=require('node:test'),assert=require('node:assert/strict');
const {videoSettings,SIZES}=require('../packages/video-sender.cjs');
test('untrusted video format stays within supported bounds and never includes routing flags',()=>{
  assert.deepEqual(videoSettings({resolution:'99999x99999',fps:1000,name:'\u0000 \n ',ndi:true}),{resolution:'1920x1080',fps:60,name:'Genre Police AutoVJ'});
  assert.equal(videoSettings({resolution:'__proto__'}).resolution,'1920x1080');
  assert.equal(videoSettings({name:'🎵'.repeat(100)}).name.length,64);
  for(const size of Object.values(SIZES))assert.ok(size[0]*size[1]<=3840*2160);
});
test('network video keeps its cadence during standby including 25 and 50 FPS',async()=>{
  const {outputFrameInterval}=await import('../renderer/output-frame-rate.mjs');
  for(const fps of [25,30,50,60])assert.equal(outputFrameInterval({externalOutput:true,standby:true,active:false,settings:{idleFrameLimit:true,frameRateLimit:String(fps)}}),1000/fps);
});
