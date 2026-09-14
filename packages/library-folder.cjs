"use strict";
const fs = require('node:fs'), path = require('node:path');
async function openLibraryFolder(library, shell) {
  const folder=path.resolve(library.root);
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory())
    throw new Error('曲库数据文件夹不存在，请检查是否被移动或删除。');
  // A packaged launcher can virtualize AppData for its child processes.
  // Explorer runs outside that view: resolve the physical directory through
  // Windows, not path.resolve() or the non-native realpath implementation.
  const physicalFolder=fs.realpathSync.native(folder);
  const error=await shell.openPath(physicalFolder);
  if(error)throw new Error('无法打开曲库数据文件夹，请检查文件夹访问权限。');
  return {ok:true};
}
module.exports={openLibraryFolder};
