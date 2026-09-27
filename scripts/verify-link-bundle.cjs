'use strict';
const fs=require('node:fs'),path=require('node:path');
module.exports=async function verifyLinkBundle(context){
  const root=context.appDir||path.resolve(__dirname,'..');
  const model=require('../packages/rhythm-config.cjs').rhythmConfig(p=>path.join(root,p));
  const digest=require('node:crypto').createHash('sha256').update(fs.readFileSync(model.modelPath)).digest('hex');
  if(digest!==require('../packages/rhythm-config.cjs').MODEL_SHA256) throw Error('BeatNet+ model missing or modified; refusing to build a different beat engine.');
  const folder=path.join(root,'vendor/carabiner');
  if(!require('./link-build-info.cjs').valid())throw Error('Patched Link runtime missing or stale. Run npm run prepare:link.');
  for(const file of ['LICENSE.md','ABLETON-LINK-LICENSE.md','GFLAGS_LICENSE.txt','ASIO-LICENSE.txt','README.md'])if(!fs.existsSync(path.join(folder,file)))throw Error('Missing Carabiner notice: '+file);
};
