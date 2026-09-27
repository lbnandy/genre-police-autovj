"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { atomicJson, UUID, inside, normalizeDjName } = require("./library.cjs");
const { nativeTask } = require("./native-host.cjs");
function readPackage(root) {
  const file = path.join(root, "library.json");
  if (fs.statSync(file).size > 32 * 1024 * 1024)
    throw new Error("Library manifest too large");
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  if (
    data.format !== "genre-police-autovj" ||
    data.version !== 1 ||
    !UUID.test(data.libraryId) ||
    !Array.isArray(data.tracks) ||
    data.tracks.length > 50000
  )
    throw new Error("Unsupported library package");
  const ids = new Set();
  for (const t of data.tracks) {
    if (!UUID.test(t.id) || ids.has(t.id))
      throw new Error("Invalid or duplicate track ID");
    ids.add(t.id);
    if (t.cover && !/^covers\/[a-f0-9-]+\.(jpg|png)$/i.test(t.cover))
      throw new Error("Invalid artwork path");
  }
  for (const p of data.presets || [])
    if (!/^custom-[a-f0-9-]+$/i.test(p.id))
      throw new Error("Invalid preset ID");
  data.djName = normalizeDjName(data.djName);
  data.customArtwork = require("./dj-logo.cjs").validateLogo(data.customArtwork);
  data.djLogo = require("./dj-logo.cjs").validateLogo(data.djLogo);
  data.djLogoScale = require("./dj-logo.cjs").logoScale(data.djLogoScale);
  return data;
}
function copyRegular(from, to, limit) {
  const stat = fs.lstatSync(from);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit)
    throw new Error("Invalid package file: " + path.basename(from));
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}
function copyAttachments(from, to, data) {
  for (const t of data.tracks) {
    if (t.cover)
      copyRegular(inside(from, t.cover), inside(to, t.cover), 8 * 1024 * 1024);
    const rel = "analysis/" + t.id + ".json";
    if (fs.existsSync(inside(from, rel)))
      copyRegular(inside(from, rel), inside(to, rel), 4 * 1024 * 1024);
  }
}
async function exportPackage(library, target, exe) {
  if (fs.existsSync(target))
    throw new Error("Export destination already exists");
  const staging = target + ".partial-" + crypto.randomUUID();
  fs.mkdirSync(staging, { recursive: true });
  const data = structuredClone(library.data);
  data.exportedAt = new Date().toISOString();
  for (const t of data.tracks) {
    delete t.filePath;
    delete t.fileHash;
    if (t.status !== "ready") t.status = "needs-source";
  }
  // Hardware settings belong to the computer, never to a USB pack.
  data.settings = {};
  copyAttachments(library.root, staging, data);
  if (fs.existsSync(library.db))
    await nativeTask(exe, [
      "--snapshot",
      library.db,
      path.join(staging, "fingerprints.db"),
    ]);
  atomicJson(path.join(staging, "library.json"), data);
  fs.renameSync(staging, target);
  return target;
}
async function importPackage(source, librariesRoot, exe) {
  const data = readPackage(source);
  const localId = crypto.randomUUID();
  const target = path.join(librariesRoot, localId),
    staging = target + ".partial";
  fs.mkdirSync(staging, { recursive: true });
  copyAttachments(source, staging, data);
  const db = path.join(source, "fingerprints.db");
  if (fs.existsSync(db)) {
    if (!fs.lstatSync(db).isFile() || fs.lstatSync(db).isSymbolicLink())
      throw new Error("Invalid fingerprint database");
    await nativeTask(exe, [
      "--snapshot",
      db,
      path.join(staging, "fingerprints.db"),
    ]);
  }
  data.originLibraryId = data.libraryId;
  data.libraryId = localId;
  data.name = data.name || "Imported library";
  data.settings = {};
  for (const t of data.tracks) {
    delete t.filePath;
    delete t.fileHash;
    if (t.status !== "ready") t.status = "needs-source";
  }
  atomicJson(path.join(staging, "library.json"), data);
  fs.renameSync(staging, target);
  return target;
}
module.exports = { readPackage, exportPackage, importPackage };
