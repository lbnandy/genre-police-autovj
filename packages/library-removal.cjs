"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { atomicJson, UUID } = require("./library.cjs");
const { nativeTask } = require("./native-host.cjs");

function libraryPath(root, id) {
  if (!UUID.test(id)) throw new Error("Invalid library ID");
  const parent = fs.realpathSync(root), target = path.join(parent, id);
  const stat = fs.lstatSync(target);
  if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(target) !== target)
    throw new Error("Invalid library directory");
  return target;
}
function transactionPaths(root, token) {
  if (!UUID.test(token)) throw new Error("Invalid removal transaction");
  const parent = fs.realpathSync(root), prefix = path.join(parent, ".remove-" + token);
  return { stage: prefix + "-new", backup: prefix + "-old", journal: prefix + ".json" };
}
const trackHash = tracks => crypto.createHash('sha256').update(JSON.stringify(tracks)).digest('hex');
const undoCache = new WeakMap();
function undoPath(root, id) {
  if (!UUID.test(id)) throw new Error('Invalid undo library');
  const target=path.join(fs.realpathSync(root), '.undo-'+id);
  if (fs.existsSync(target) && (fs.lstatSync(target).isSymbolicLink() || !fs.lstatSync(target).isDirectory())) throw new Error('Invalid undo directory');
  return target;
}
async function clearUndo(root, id) {
  const target=undoPath(root,id);
  if (path.dirname(target)!==fs.realpathSync(root)) throw new Error('Invalid undo cleanup');
  await fs.promises.rm(target,{recursive:true,force:true});
}
async function retainUndo(root, backup, record) {
  if (!fs.existsSync(backup)) return;
  atomicJson(path.join(backup,'.undo-state.json'), {afterHash:record.afterHash,count:record.count});
  await clearUndo(root, record.libraryId);
  fs.renameSync(backup,undoPath(root,record.libraryId));
}
function undoInfo(root, library) {
  const cached=undoCache.get(library);
  if(cached?.data === library.data && cached.revision === library.revision) return cached.info;
  let result=null;
  try {
    const info=JSON.parse(fs.readFileSync(path.join(undoPath(root,library.data.libraryId),'.undo-state.json'),'utf8'));
    result=info.afterHash === trackHash(library.data.tracks) ? {count:info.count} : null;
  } catch {}
  undoCache.set(library,{data:library.data,revision:library.revision,info:result});
  return result;
}
async function discard(root, token, kind) {
  // Only generated transaction directories directly inside the library root.
  const target = transactionPaths(root, token)[kind];
  if (!["stage", "backup"].includes(kind) || path.dirname(target) !== fs.realpathSync(root))
    throw new Error("Invalid cleanup path");
  await fs.promises.rm(target, { recursive: true, force: true });
}
async function recoverRemovals(root) {
  for (const name of fs.readdirSync(root)) {
    const match = /^\.remove-([a-f0-9-]{36})\.json$/.exec(name);
    if (!match) continue;
    const token = match[1], p = transactionPaths(root, token);
    const record = JSON.parse(fs.readFileSync(p.journal, "utf8")), {libraryId} = record;
    if (!UUID.test(libraryId)) throw new Error("Invalid removal recovery record");
    const active = path.join(fs.realpathSync(root), libraryId);
    // No active folder means the process stopped between the two renames.
    const committed=fs.existsSync(active);
    if (!committed) {
      if (!fs.existsSync(p.backup)) throw new Error("Library removal recovery is incomplete");
      fs.renameSync(p.backup, active);
    }
    libraryPath(root, libraryId);
    if (committed && record.afterHash) await retainUndo(root,p.backup,record);
    if (committed && record.consumeUndo) await clearUndo(root,libraryId);
    await discard(root, token, "stage");
    await discard(root, token, "backup");
    fs.unlinkSync(p.journal);
  }
  // A crash during preparation can leave a copy before a journal was needed.
  for (const name of fs.readdirSync(root)) {
    const match = /^\.remove-([a-f0-9-]{36})-new$/.exec(name);
    if (match && !fs.existsSync(transactionPaths(root, match[1]).journal)) await discard(root, match[1], "stage");
  }
}
async function removeTracks(root, library, requested, exe, run = nativeTask) {
  const active = libraryPath(root, library.data.libraryId);
  if (path.resolve(library.root) !== active || !Array.isArray(requested) || !requested.length)
    throw new Error("曲目选择无效，请重新选择。");
  const ids = [...new Set(requested)];
  if (ids.some(id => !UUID.test(id) || !library.track(id))) throw new Error("曲目列表已改变，请重新选择。");
  const token = crypto.randomUUID(), p = transactionPaths(root, token);
  let committed = false;
  try {
    // Build a complete replacement first. A native failure leaves the live
    // manifest and fingerprint database unchanged, even for large selections.
    await fs.promises.cp(active, p.stage, { recursive: true, filter: async source => {
      if ((await fs.promises.lstat(source)).isSymbolicLink()) throw new Error("Library links are not supported");
      return true;
    }});
    const database = path.join(p.stage, "fingerprints.db");
    if (fs.existsSync(database)) {
      const list = path.join(p.stage, ".remove-ids.txt");
      fs.writeFileSync(list, ids.join("\n") + "\n");
      await run(exe, ["--remove-many", database, list]);
      fs.unlinkSync(list);
    }
    const removed = new Set(ids), next = structuredClone(library.data);
    next.tracks = next.tracks.filter(track => !removed.has(track.id));
    atomicJson(path.join(p.stage, "library.json"), next);
    const record={libraryId:library.data.libraryId,afterHash:trackHash(next.tracks),count:ids.length};
    atomicJson(p.journal, record);
    fs.renameSync(active, p.backup);
    try { fs.renameSync(p.stage, active); }
    catch (error) { fs.renameSync(p.backup, active); throw error; }
    committed = true;
    library.data = next;
    // A journal left by a crash is completed or rolled back at next startup.
    try { await retainUndo(root, p.backup, record); fs.unlinkSync(p.journal); } catch {}
    undoCache.delete(library);
    return ids.length;
  } finally {
    if (!committed) {
      await discard(root, token, "stage");
      if (fs.existsSync(p.journal) && fs.existsSync(active) && !fs.existsSync(p.backup)) fs.unlinkSync(p.journal);
    }
  }
}
async function undoRemoval(root, library, exe, run = nativeTask) {
  undoCache.delete(library);
  const active=libraryPath(root,library.data.libraryId), info=undoInfo(root,library);
  if (!info) throw new Error('曲库曲目已改变，无法撤销上次移除。');
  const source=undoPath(root,library.data.libraryId), previous=JSON.parse(fs.readFileSync(path.join(source,'library.json'),'utf8'));
  const token=crypto.randomUUID(), p=transactionPaths(root,token);
  let committed=false;
  try {
    await fs.promises.cp(active,p.stage,{recursive:true,filter:async file=>{
      if ((await fs.promises.lstat(file)).isSymbolicLink()) throw new Error('Library links are not supported');
      return true;
    }});
    // Removals retain artwork/analysis. Restore the pre-removal fingerprint DB
    // and tracks, preserving later name, DJ, presets and preference changes.
    const database=path.join(source,'fingerprints.db');
    if(fs.existsSync(database)) {
      const stat=fs.lstatSync(database);
      if(!stat.isFile() || stat.isSymbolicLink())throw new Error('Invalid undo database');
      // Read the committed SQLite view, including any retained WAL. Copying
      // only the .db file can silently lose fingerprints or replay a newer WAL.
      const snapshot=path.join(p.stage,'fingerprints-restored.db');
      await run(exe,['--snapshot',database,snapshot]);
      for(const suffix of ['', '-wal', '-shm']) {
        const target=path.join(p.stage,'fingerprints.db'+suffix);
        if (fs.existsSync(target)) fs.unlinkSync(target);
      }
      fs.renameSync(snapshot,path.join(p.stage,'fingerprints.db'));
    }
    const next={...library.data,tracks:previous.tracks};
    atomicJson(path.join(p.stage,'library.json'),next);
    atomicJson(p.journal,{libraryId:library.data.libraryId,consumeUndo:true});
    fs.renameSync(active,p.backup);
    try {fs.renameSync(p.stage,active);}catch(error){fs.renameSync(p.backup,active);throw error;}
    committed=true;library.data=next;
    try {await clearUndo(root,library.data.libraryId);await discard(root,token,'backup');fs.unlinkSync(p.journal);}catch{}
    return info.count;
  } finally {
    if(!committed){await discard(root,token,'stage');if(fs.existsSync(p.journal)&&fs.existsSync(active)&&!fs.existsSync(p.backup))fs.unlinkSync(p.journal);}
  }
}
module.exports = { libraryPath, removeTracks, recoverRemovals, undoInfo, undoRemoval, clearUndo };
