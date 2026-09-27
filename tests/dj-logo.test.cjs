'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Library}=require('../packages/library.cjs');
const {validateLogo,logoScale}=require('../packages/dj-logo.cjs');
const {exportPackage,importPackage}=require('../packages/portable.cjs');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZkAAAAASUVORK5CYII=';
test('DJ logo and size survive reopening and portable export/import without audio',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'autovj-logo-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const lib=new Library(path.join(root,'source'));lib.data.djLogo=png;lib.data.djLogoScale=1.25;lib.save();
 assert.equal(new Library(lib.root).data.djLogo,png);
 await exportPackage(lib,path.join(root,'pack'),'');const result=await importPackage(path.join(root,'pack'),path.join(root,'destination'),'');
 const restored=new Library(result);assert.equal(restored.data.djLogo,png);assert.equal(restored.data.djLogoScale,1.25);
});
test('old DJ-name setting migrates without changing explicit heading choice',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'autovj-heading-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const lib=new Library(root);lib.data.settings={showDjName:true};lib.save();assert.equal(new Library(root).data.settings.headingMode,'dj');
 lib.data.settings={showDjName:true,headingMode:'hidden'};lib.save();assert.equal(new Library(root).data.settings.headingMode,'hidden');
});
test('logo validation rejects external content, malformed images and excessive dimensions',()=>{
 assert.equal(validateLogo(png),png);assert.equal(validateLogo(null),'');
 for(const value of ['https://example.com/logo.png','data:image/svg+xml;base64,AAAA','data:image/png;base64,AAAA'])assert.throws(()=>validateLogo(value));
 const bytes=Buffer.from(png.split(',')[1],'base64');bytes.writeUInt32BE(10000,16);assert.throws(()=>validateLogo('data:image/png;base64,'+bytes.toString('base64')));
 assert.equal(logoScale(Infinity),1);assert.equal(logoScale(20),1.5);assert.equal(logoScale(.1),.5);
});
