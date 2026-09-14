"use strict";
const {test} = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const {DatabaseSync} = require("node:sqlite");
const {Library, atomicJson} = require("../packages/library.cjs");
const {removeTracks, recoverRemovals, libraryPath, undoInfo, undoRemoval} = require("../packages/library-removal.cjs");
const ROOT = path.resolve(__dirname, ".."), EXE = path.join(ROOT,"native/bin/autovj-recognizer.exe");
function fixture(t) {
  const workspace = path.join(ROOT, ".qa"); fs.mkdirSync(workspace,{recursive:true});
  const dir = fs.mkdtempSync(path.join(workspace,"removal-")), root = path.join(dir,"libraries");
  fs.mkdirSync(root);
  t.after(() => { assert.ok(fs.realpathSync(dir).startsWith(fs.realpathSync(workspace)+path.sep)); fs.rmSync(dir,{recursive:true,force:true}); });
  const lib = new Library(path.join(root,crypto.randomUUID())), ids = Array.from({length:3},()=>crypto.randomUUID());
  const music = path.join(dir,"original.wav"); fs.writeFileSync(music,"original music sentinel");
  for (const [i,id] of ids.entries()) lib.upsert({id,title:"Track "+i,status:"ready",filePath:music,manualGenre:i===2?"techno":null});
  const db = new DatabaseSync(lib.db);
  db.exec("CREATE TABLE songs(song_id INTEGER PRIMARY KEY,song_name TEXT UNIQUE,total_hashes INTEGER,fingerprinted INTEGER); CREATE TABLE fingerprints(song_id INTEGER,hash TEXT,offset INTEGER);");
  for(const [i,id] of ids.entries()) {db.prepare("INSERT INTO songs VALUES(?,?,1,1)").run(i+1,id);db.prepare("INSERT INTO fingerprints VALUES(?,?,0)").run(i+1,"fixture-"+i);}
  db.close(); return {dir,root,lib,ids,music};
}
test("batch removal deletes matching database rows and preserves other tracks and original music",async t=>{
  const {root,lib,ids,music}=fixture(t);
  assert.equal(await removeTracks(root,lib,[ids[0],ids[1],ids[0]],EXE),2);
  assert.deepEqual(lib.data.tracks.map(t=>t.id),[ids[2]]);
  assert.equal(new Library(lib.root).track(ids[2]).manualGenre,"techno");
  const db=new DatabaseSync(lib.db);assert.equal(db.prepare("SELECT count(*) AS n FROM fingerprints").get().n,1);
  assert.equal(db.prepare("SELECT song_name FROM songs").get().song_name,ids[2]);db.close();
  assert.equal(fs.readFileSync(music,"utf8"),"original music sentinel");
  assert.deepEqual(fs.readdirSync(root).sort(),['.undo-'+lib.data.libraryId,lib.data.libraryId].sort());
  assert.equal(undoInfo(root,lib).count,2);
});

test('undo survives reopening and restores fingerprints without overwriting library preferences',async t=>{
  const {root,lib,ids,music}=fixture(t);
  const original=structuredClone(lib.data.tracks);
  await removeTracks(root,lib,[ids[0],ids[1]],EXE);
  const reopened=new Library(lib.root);
  reopened.data.name='New name';reopened.data.djName='DJ A';reopened.data.settings.renderScale=.5;reopened.save();
  assert.equal(undoInfo(root,reopened).count,2);
  assert.equal(await undoRemoval(root,reopened,EXE),2);
  assert.deepEqual(reopened.data.tracks,original);
  assert.equal(reopened.data.name,'New name');assert.equal(reopened.data.djName,'DJ A');assert.equal(reopened.data.settings.renderScale,.5);
  const db=new DatabaseSync(lib.db);assert.equal(db.prepare('SELECT count(*) AS n FROM fingerprints').get().n,3);db.close();
  assert.equal(fs.readFileSync(music,'utf8'),'original music sentinel');
  assert.equal(undoInfo(root,reopened),null);
  assert.deepEqual(fs.readdirSync(root),[lib.data.libraryId]);
});

test('later track edits invalidate an old undo; a second removal replaces its snapshot',async t=>{
  const {root,lib,ids}=fixture(t);
  await removeTracks(root,lib,[ids[0]],EXE);
  lib.track(ids[1]).manualGenre='house';lib.save();
  assert.equal(undoInfo(root,lib),null);
  await assert.rejects(undoRemoval(root,lib,EXE));
  await removeTracks(root,lib,[ids[1]],EXE);
  await undoRemoval(root,lib,EXE);
  assert.equal(lib.track(ids[0]),undefined);
  assert.equal(lib.track(ids[1]).manualGenre,'house');
});

test('undo restores uncheckpointed SQLite WAL fingerprints and a failed snapshot leaves removal intact',async t=>{
  const {dir,root,lib,ids}=fixture(t), db=new DatabaseSync(lib.db);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; INSERT INTO fingerprints VALUES(1,'wal-only',1);");
  const walCopy=path.join(dir,'wal-copy');fs.mkdirSync(walCopy);
  for(const suffix of ['', '-wal'])fs.copyFileSync(lib.db+suffix,path.join(walCopy,'db'+suffix));
  db.close();
  for(const suffix of ['', '-wal'])fs.copyFileSync(path.join(walCopy,'db'+suffix),lib.db+suffix);
  await removeTracks(root,lib,[ids[0]],EXE);
  const removedManifest=fs.readFileSync(lib.file);
  await assert.rejects(undoRemoval(root,lib,EXE,async()=>{throw Error('Snapshot failure');}));
  assert.deepEqual(fs.readFileSync(lib.file),removedManifest);
  assert.equal(undoInfo(root,lib).count,1);
  await undoRemoval(root,lib,EXE);
  const restored=new DatabaseSync(lib.db);
  assert.equal(restored.prepare('SELECT count(*) AS n FROM fingerprints').get().n,4);
  assert.equal(restored.prepare("SELECT count(*) AS n FROM fingerprints WHERE hash='wal-only'").get().n,1);
  restored.close();
});
test("native batch failure and stale selection leave the original manifest and database untouched",async t=>{
  const {root,lib,ids}=fixture(t),db=new DatabaseSync(lib.db);
  db.exec(`CREATE TRIGGER reject_delete BEFORE DELETE ON songs WHEN OLD.song_name='${ids[1]}' BEGIN SELECT RAISE(ABORT,'fixture failure'); END;`);db.close();
  const manifest=fs.readFileSync(lib.file),database=fs.readFileSync(lib.db);
  await assert.rejects(removeTracks(root,lib,[ids[0],ids[1]],EXE));
  await assert.rejects(removeTracks(root,lib,[crypto.randomUUID()],EXE));
  await assert.rejects(removeTracks(root,lib,[],EXE));
  assert.deepEqual(fs.readFileSync(lib.file),manifest);assert.deepEqual(fs.readFileSync(lib.db),database);
  assert.deepEqual(fs.readdirSync(root),[lib.data.libraryId]);
  assert.throws(()=>libraryPath(root,"../outside"));
});
test("interrupted directory swaps recover a complete library before loading",async t=>{
  const {root,lib}=fixture(t);
  for(const completed of [false,true]) {
    const token=crypto.randomUUID(),prefix=path.join(root,".remove-"+token),stage=prefix+"-new",backup=prefix+"-old";
    fs.cpSync(lib.root,stage,{recursive:true});
    const next={...lib.data,name:"completed removal"};atomicJson(path.join(stage,"library.json"),next);
    atomicJson(prefix+".json",{libraryId:lib.data.libraryId});
    fs.renameSync(lib.root,backup);if(completed)fs.renameSync(stage,lib.root);
    await recoverRemovals(root);
    assert.equal(JSON.parse(fs.readFileSync(lib.file,"utf8")).name,completed?"completed removal":undefined);
    assert.deepEqual(fs.readdirSync(root),[lib.data.libraryId]);
  }
});
