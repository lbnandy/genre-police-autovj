const {test}=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {migrateEquipment,channelOptions,InputHealth,PerformanceSession}=require('../packages/performance-session.cjs');
const {openLibraryFolder}=require('../packages/library-folder.cjs');

test('equipment migrates once and is not replaced by another DJ library',()=>{
  const config={};migrateEquipment(config,{deviceId:'A',channelStart:2,displayId:123});
  migrateEquipment(config,{deviceId:'B',channelStart:0,displayId:456});
  assert.deepEqual(config.equipment,{deviceId:'A',channelStart:2,displayId:123});
});
test('channel choices reflect mono, stereo, odd and multichannel hardware',()=>{
  assert.deepEqual(channelOptions({channels:1}),[{value:0,label:'1',mono:true}]);
  assert.deepEqual(channelOptions({channels:2}),[{value:0,label:'1 + 2',mono:false}]);
  assert.deepEqual(channelOptions({channels:3}).map(x=>x.value),[0,2,-1]);
  assert.equal(channelOptions({channels:3})[1].mono,true);
  assert.deepEqual(channelOptions({channels:12}).map(x=>x.value),[0,2,4,6,8,10,-1]);
  assert.deepEqual(channelOptions(null),[]);
});
test('input notices distinguish silence, missing data, transient overload and device loss',()=>{
  const h=new InputHealth(),live={running:true};h.reset(0);
  h.level({peak:0},7000);assert.equal(h.status(live,7000),'ok');
  h.level({peak:0},9000);assert.equal(h.status(live,9000),'silent');
  h.level({peak:1},10000);assert.equal(h.status(live,11000),'overload');
  h.level({peak:.1},14000);assert.equal(h.status(live,14000),'ok');
  assert.equal(h.status(live,21000),'no-data');
  assert.equal(h.status({...live,deviceLost:true},21000),'disconnected');
  assert.equal(h.status({running:false},21000),'stopped');
});
test('wake protection releases its blocker and bounded diagnostics do not grow indefinitely',()=>{
  const calls=[],session=new PerformanceSession({start:type=>{calls.push(type);return 8;},stop:id=>calls.push(id)});
  session.updateAwake(true);session.updateAwake(true);assert.equal(calls.length,1);
  session.updateAwake(true,false);session.updateAwake(false);assert.deepEqual(calls,['prevent-display-sleep',8]);
  session.updateAwake(true);session.updateAwake(false);assert.equal(session.blocker,null);
  for(let i=0;i<500;i++)session.record('test',{i});
  assert.equal(session.events.length,400);assert.equal(session.events[0].i,100);
});
test('open folder passes an existing absolute directory, and reports missing paths or OS failures',async t=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'AutoVJ library 日本語 '));t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
  const seen=[];
  await openLibraryFolder({root:folder},{openPath:async target=>{seen.push(target);return '';}});
  assert.deepEqual(seen,[fs.realpathSync.native(folder)]);
  await assert.rejects(openLibraryFolder({root:path.join(folder,'missing')},{openPath:()=>{throw Error('Must not call shell');}}),/不存在/);
  await assert.rejects(openLibraryFolder({root:folder},{openPath:async()=> 'OS error'}),/访问权限/);
});

test('opening a redirected library uses the OS physical path, not the process-local AppData alias',async t=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'AutoVJ redirected '));t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
  const physical=path.join(folder,'physical 日本語');fs.mkdirSync(physical);
  const native=t.mock.method(fs.realpathSync,'native',target=>{assert.equal(target,path.resolve(folder));return physical;});
  let opened;
  await openLibraryFolder({root:folder},{openPath:async target=>{opened=target;return '';}});
  assert.equal(native.mock.callCount(),1);assert.equal(opened,physical);
});
