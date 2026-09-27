'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),vendor=path.join(root,'vendor/carabiner');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const runtime=path.join(root,'native/bin/Carabiner.exe'),receipt=path.join(root,'native/bin/Carabiner.build.json');
function inputs(){
 const manifest=JSON.parse(fs.readFileSync(path.join(vendor,'component.json'),'utf8'));
 for(const [file,expected] of [[manifest.sourceFile,manifest.sourceSha256],[manifest.patchFile,manifest.patchSha256]])
  if(hash(path.join(vendor,file))!==expected)throw Error('Link source verification failed: '+file);
 return {source:manifest.sourceSha256,patch:manifest.patchSha256,recipe:hash(path.join(__dirname,'prepare-link.ps1'))};
}
function valid(){try{const r=JSON.parse(fs.readFileSync(receipt,'utf8'));return JSON.stringify(r.inputs)===JSON.stringify(inputs())&&r.runtime===hash(runtime);}catch{return false;}}
if(require.main===module){
 if(process.argv[2]==='inputs')inputs();
 else if(process.argv[2]==='write')fs.writeFileSync(receipt,JSON.stringify({inputs:inputs(),runtime:hash(runtime)},null,2)+'\n');
 else process.exitCode=valid()?0:1;
}
module.exports={valid,inputs};
