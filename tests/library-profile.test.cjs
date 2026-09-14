"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), crypto = require("node:crypto");
const { Library, normalizeDjName } = require("../packages/library.cjs");
const { exportPackage, importPackage } = require("../packages/portable.cjs");

test("one DJ name per library survives reanalysis, reopening and portable round trip", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "autovj-profile-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const lib = new Library(path.join(root, crypto.randomUUID()));
  assert.equal(lib.data.djName, "");
  assert.equal(lib.data.settings.showDjName, false);
  lib.setDjName("  DJ ICHIRYU 夜空 밤  ");
  const id = crypto.randomUUID();
  lib.upsert({ id, title: "Song", suggestion: { id: "techno" } });
  lib.upsert({ id, title: "Song", suggestion: { id: "house" } });
  lib.data.settings.showDjName = true; lib.save();
  const reopened = new Library(lib.root);
  assert.equal(reopened.data.djName, "DJ ICHIRYU 夜空 밤");
  assert.equal(reopened.data.settings.showDjName, true);
  const empty = new Library(path.join(root, crypto.randomUUID()));
  assert.equal(empty.data.djName, "", "A new library does not inherit another DJ's name");
  const pack = path.join(root, "usb-pack");
  await exportPackage(reopened, pack);
  const imported = new Library(await importPackage(pack, path.join(root, "imported")));
  assert.equal(imported.data.djName, reopened.data.djName);
  assert.notEqual(imported.data.libraryId, reopened.data.libraryId);
  assert.equal(imported.track(id).suggestion.id, "house");
  assert.equal(imported.track(id).djName, undefined, "The name belongs to the library, not individual tracks");
  delete empty.data.djName; empty.save();
  assert.equal(new Library(empty.root).data.djName, "", "Old libraries migrate with no new heading");
});

test("DJ names are bounded Unicode text with an empty fallback", () => {
  assert.equal(normalizeDjName(null), "");
  assert.equal(normalizeDjName("\n DJ\tName \r"), "DJ Name");
  assert.equal(normalizeDjName("🎧".repeat(65)), "🎧".repeat(64));
});
