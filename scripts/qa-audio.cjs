"use strict";
// Deterministic synthetic fixture. No user music or microphone recording is used.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { Worker } = require("node:worker_threads");
const { Library, atomicJson } = require("../packages/library.cjs");
const { nativeTask } = require("../packages/native-host.cjs");
const { exportPackage, importPackage } = require("../packages/portable.cjs");
const ROOT = path.resolve(__dirname, ".."),
  out = path.join(ROOT, "output/playwright/audio"),
  exe = path.join(ROOT, "native/bin/autovj-recognizer.exe");
fs.mkdirSync(out, { recursive: true });
function signal(seed, seconds) {
  let state = seed >>> 0;
  const rand = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const samples = new Float32Array(seconds * 44100),
    notes = [];
  for (let i = 0; i < seconds * 4; i++)
    notes.push([110 + rand() * 1400, 250 + rand() * 2800, rand() * 6.28]);
  for (let i = 0; i < samples.length; i++) {
    const t = i / 44100,
      n = notes[Math.floor(t * 4)],
      p = t % 0.5,
      k =
        Math.sin(2 * Math.PI * (52 * p + 25 * (1 - Math.exp(-p * 22)))) *
        Math.exp(-p * 16);
    samples[i] = Math.max(
      -0.95,
      Math.min(
        0.95,
        k * 0.3 +
          (Math.sin(t * 2 * Math.PI * n[0] + n[2]) * 0.22 +
            Math.sin(t * 2 * Math.PI * n[1]) * 0.14) *
            (0.45 + 0.55 * Math.exp(-(t % 0.25) * 8)) +
          (rand() - 0.5) * 0.07 * Math.exp(-(t % 0.125) * 24),
      ),
    );
  }
  return samples;
}
function wav(file, data) {
  const b = Buffer.alloc(44 + data.length * 2);
  b.write("RIFF");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(44100, 24);
  b.writeUInt32LE(88200, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(data.length * 2, 40);
  data.forEach((x, i) => b.writeInt16LE(Math.round(x * 32767), 44 + 2 * i));
  fs.writeFileSync(file, b);
}
async function worker(track, lib) {
  return new Promise((resolve, reject) => {
    const w = new Worker(path.join(ROOT, "packages/analysis-worker.cjs"), {
      workerData: {
        track,
        root: lib.root,
        exe,
        modelRoot: path.join(ROOT, "vendor/genre-police/assets/models"),
        online: false,
        localAI: true,
      },
    });
    w.on("error", reject);
    w.on("message", (m) => {
      if (m.type === "progress")
        console.log(track.title, m.phase, m.fraction || "");
      if (m.type === "complete") resolve(m.track);
      if (m.type === "failed") reject(new Error(m.message));
    });
  });
}
(async () => {
  const id = crypto.randomUUID(),
    library = new Library(path.join(out, "library-" + id));
  const a = signal(781, 18),
    b = signal(4001, 18);
  wav(path.join(out, "alpha.wav"), a);
  wav(path.join(out, "beta.wav"), b);
  const tracks = [];
  for (const [i, name] of ["alpha", "beta"].entries()) {
    const track = {
      id: crypto.randomUUID(),
      filePath: path.join(out, name + ".wav"),
      title: "QA " + name,
      artist: "Generated fixture",
      status: "pending",
    };
    library.upsert(track);
    if (!i) {
      const result = await worker(track, library);
      if (result.analysis.errors.length)
        throw new Error(result.analysis.errors.join(";"));
      if (result.analysis.ai.accepted < 10)
        throw new Error("Whole-track analysis did not cover the fixture");
      library.upsert(result);
      tracks.push(result);
    } else {
      const result = await nativeTask(exe, [
        "--prepare",
        track.filePath,
        library.db,
        track.id,
        path.join(out, "beta.pcm"),
      ]);
      library.upsert({
        ...track,
        status: "ready",
        durationMs: result.durationMs,
        hashes: result.hashes,
      });
      tracks.push(track);
    }
  }
  library.patch(tracks[0].id, { manualGenre: "techno" });
  const mix = new Float32Array(a.length + b.length);
  mix.set(a);
  mix.set(b, a.length);
  wav(path.join(out, "set.wav"), mix);
  const confirmations = [];
  await nativeTask(exe, ["--replay", path.join(out, "set.wav"), library.db], {
    onEvent: (e) => {
      if (e.type === "confirmed") {
        confirmations.push(e);
        console.log("Confirmed", e);
      }
    },
  });
  for (const track of tracks)
    if (!confirmations.some((e) => e.trackUid === track.id))
      throw new Error("Native replay did not recognize " + track.title);
  const exported = await exportPackage(
      library,
      path.join(out, "pack-" + id),
      exe,
    ),
    imported = await importPackage(exported, path.join(out, "imports"), exe),
    copy = new Library(imported);
  if (
    copy.genre(copy.track(tracks[0].id)) !== "techno" ||
    copy.track(tracks[0].id).filePath
  )
    throw new Error("Portable identity/manual choice failed");
  const after = [];
  await nativeTask(exe, ["--replay", path.join(out, "alpha.wav"), copy.db], {
    onEvent: (e) => {
      if (e.type === "confirmed") after.push(e.trackUid);
    },
  });
  if (!after.includes(tracks[0].id))
    throw new Error("Imported fingerprints not recognized");
  const report = {
    at: new Date().toISOString(),
    library: library.root,
    tracks: tracks.map((t) => t.id),
    confirmations,
    ai: library.track(tracks[0].id).analysis.ai,
    exported,
    imported,
    passed: true,
  };
  atomicJson(path.join(out, "report.json"), report);
  console.log(JSON.stringify(report, null, 2));
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
