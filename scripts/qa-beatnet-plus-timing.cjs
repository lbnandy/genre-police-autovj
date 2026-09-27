'use strict';
// Controlled grid regression, not an accuracy claim for arbitrary EDM.
// Supply upstream test/test_data/808kick120bpm.mp3; skip the first 2 s of acquisition.
const { execFileSync } = require('node:child_process');
const { LocalRhythmModel } = require('../vendor/genre-police/src/rhythm-model-runtime');
const { BeatParticleFilter } = require('../vendor/genre-police/src/beat-particle-filter');
const fs = require('node:fs');

(async () => {
  const results = [];
  for (const bpm of [120, 150, 180]) {
    const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', process.argv[2], '-af', `atempo=${bpm / 120}`, '-ar', '22050', '-ac', '1', '-f', 'f32le', 'pipe:1']);
    const pcm = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
    for (const attenuation of [1, .125]) {
      let now = 0;
      const rows = [];
      const model = new LocalRhythmModel({ modelPath: 'output/beatnet-plus/generic_weights.onnx', modelKind: 'beatnet-plus', edmTiming: false, now: () => now });
      if (!await model.initialize()) throw Error('Model unavailable');
      const update = model.beatTracker.update.bind(model.beatTracker);
      model.beatTracker.update = (b, d) => { rows.push([now, b, d]); return update(b, d); };
      try {
        for (let i = 0; i < pcm.length + 22050 * 2; i += 441) {
          now = i / 22.05;
          const hop = new Float32Array(441);
          for (let j = 0; j < 441; j++) hop[j] = (pcm[i + j] || 0) * attenuation;
          model.ingest(hop);
          while (model.processing || model.queue.length) await new Promise(r => setImmediate(r));
        }
      } finally { await model.close(); }
      const grid = Array.from({ length: 19 }, (_, i) => (i + 1) * 60000 / bpm).filter(t => t >= 2000);
      for (const mode of [false, 'boundary']) for (const initial of [1, 2, 3]) {
        let seed = initial;
        const pf = new BeatParticleFilter({ edmTiming: mode, random: () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; } });
        const hits = rows.filter(r => pf.update(r[1], r[2]).trackedBeat).map(r => r[0]).filter(t => t >= 2000);
        const unmatched = [...grid]; let extra = 0;
        for (const t of hits) { const i = unmatched.findIndex(g => Math.abs(g - t) <= 70); if (i >= 0) unmatched.splice(i, 1); else extra++; }
        results.push({ bpm, attenuation, mode, seed: initial, missed: unmatched.length, extra, expected: grid.length, hits });
      }
    }
  }
  fs.writeFileSync('output/beatnet-plus/timing-comparison.json', JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results.map(({ hits, ...r }) => r)));
})().catch(e => { console.error(e); process.exitCode = 1; });
