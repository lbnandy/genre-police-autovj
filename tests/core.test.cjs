"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  crypto = require("node:crypto");
const { PcmParser } = require("../packages/native-host.cjs");
const { Library, inside } = require("../packages/library.cjs");
const { matchingTrack, resolveEvidence } = require("../packages/evidence.cjs");
const { initialLive, reduceLive } = require("../packages/live-state.cjs");
const { readPackage } = require("../packages/portable.cjs");
const { resolveLanguage } = require("../packages/i18n.cjs");
test("system language follows supported regional locales and manual preference takes priority", () => {
  for (const [locale, expected] of [["zh-CN","zh"],["zh-TW","zh"],["ja-JP","ja"],["ko_KR","ko"],["en-GB","en"],["de-DE","en"]]) {
    assert.equal(resolveLanguage("system",locale),expected);
    assert.equal(resolveLanguage(undefined,locale),expected);
  }
  assert.equal(resolveLanguage("ja","zh-CN"),"ja");
});
test("lookup accepts exact version and rejects wrong remixer, artist and duration", () => {
  const track = {
    title: "Sunrise (Extended Mix)",
    artist: "Alpha",
    durationMs: 360000,
  };
  assert.equal(matchingTrack({ ...track }, track), true);
  for (const item of [
    { ...track, title: "Sunrise" },
    { ...track, title: "Sunrise (Radio Edit)" },
    { ...track, artist: "Unrelated Person" },
    { ...track, durationMs: 240000 },
  ])
    assert.equal(matchingTrack(item, track), false);
  const remix = {
    title: "Sunrise (Beta Remix)",
    artist: "Alpha",
    durationMs: 350000,
  };
  assert.equal(
    matchingTrack({ ...remix, title: "Sunrise (Zeta Remix)" }, remix),
    false,
  );
});
test("specific local tags win but contradictory genre evidence remains reviewable", () => {
  const r = resolveEvidence(
    ["Techno"],
    { results: [{ source: "catalog", tags: ["Jazz"], scope: "track" }] },
    { id: "techno", confidence: 0.6, margin: 0.2 },
  );
  assert.equal(r.id, "techno");
  assert.equal(r.conflict, true);
  assert.equal(r.uncertain, true);
  const refined = resolveEvidence(["Electronic"], null, {
    id: "techno",
    confidence: 0.6,
    margin: 0.2,
  });
  assert.equal(refined.id, "techno");
  assert.equal(refined.uncertain, false);
  assert.equal(resolveEvidence([], null, null).id, "unknown");
});
test("mixed chunk boundaries preserve native PCM order and reject malformed input", () => {
  const packets = [1, 2, 3].map((seq) => {
    const b = Buffer.alloc(28);
    b.writeUInt32LE(0x47504156, 0);
    b.writeUInt32LE(3, 4);
    b.writeUInt32LE(44100, 8);
    b.writeUInt32LE(seq, 12);
    for (let i = 0; i < 3; i++) b.writeFloatLE(seq / 10 + i / 100, 16 + i * 4);
    return b;
  });
  const frames = [],
    parser = new PcmParser((f) => frames.push(f));
  const all = Buffer.concat(packets);
  for (let i = 0; i < all.length; i += 7) parser.push(all.subarray(i, i + 7));
  assert.deepEqual(
    frames.map((f) => f.seq),
    [1, 2, 3],
  );
  assert.ok(Math.abs(frames[1].samples[2] - 0.22) < 1e-6);
  assert.throws(
    () => new PcmParser(() => {}).push(Buffer.alloc(16)),
    /protocol/,
  );
});
test("tentative matches never switch the scene; same confirmed track does not retrigger", () => {
  let s = { ...initialLive(), running: true };
  s = reduceLive(s, { type: "match", event: "tentative", trackUid: "a" });
  assert.equal(s.currentId, null);
  s = reduceLive(s, { type: "match", event: "confirmed", trackUid: "a" });
  assert.equal(s.revision, 1);
  s = reduceLive(s, { type: "match", event: "confirmed", trackUid: "a" });
  assert.equal(s.revision, 1);
  s = reduceLive(s, { type: "match", event: "mix-hold", trackUid: "b" });
  assert.equal(s.currentId, "a");
  s = reduceLive(
    { ...s, lockedTheme: "techno" },
    { type: "device", lost: true },
  );
  assert.equal(s.currentId, null);
  assert.equal(s.lockedTheme, "techno");
  assert.equal(s.peak, 0);
});
test("manual decisions survive reanalysis and persistence", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "autovj-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const lib = new Library(root),
    id = crypto.randomUUID();
  lib.upsert({ id, title: "Track", suggestion: { id: "house" } });
  lib.patch(id, { manualGenre: "techno", manualVisual: "synthwave" });
  lib.upsert({ id, title: "Track", suggestion: { id: "jazz" } });
  const reload = new Library(root);
  assert.equal(reload.genre(reload.track(id)), "techno");
  assert.equal(reload.visual(reload.track(id)), "synthwave");
  assert.throws(() => inside(root, "../escape"), /outside/);
  assert.throws(() => lib.patch(id, { manualGenre: "absent" }), /Unknown/);
});
test("portable pack rejects traversal and duplicate identities before copying", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "autovj-pack-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const lib = new Library(root),
    id = crypto.randomUUID();
  lib.upsert({ id, cover: "../../secret.png" });
  assert.throws(() => readPackage(root), /artwork/);
  lib.data.tracks = [{ id }, { id }];
  lib.save();
  assert.throws(() => readPackage(root), /duplicate/);
});

test("recognition evidence resets on signal loss and keeps a candidate separate from the confirmed track", () => {
  const initial = {...initialLive(), running: true};
  const current = reduceLive(initial, {type:'match',event:'confirmed',trackUid:'a',currentCharge:10,candidateCharge:10,confidence:.5});
  assert.equal(current.candidateCharge,0,"Confirmed candidate moves into the current slot");
  const candidate = reduceLive(current, {type:'match',event:'mix-hold',trackUid:'b',currentCharge:4,candidateCharge:8,confidence:.4});
  assert.equal(candidate.currentId,'a'); assert.equal(candidate.candidateId,'b'); assert.equal(candidate.matchEvent,'mix-hold');
  for(const type of ['device','reconnecting','standby','stale']) {
    const reset = reduceLive(candidate,{type,lost:true});
    assert.equal(reset.currentCharge,0); assert.equal(reset.candidateCharge,0); assert.equal(reset.confidence,0); assert.equal(reset.candidateId,null);
  }
});
