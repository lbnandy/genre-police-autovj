"use strict";
const { parentPort, workerData } = require("node:worker_threads");
const {
  LocalRhythmModel,
} = require("../vendor/genre-police/src/rhythm-model-runtime");
const model = new LocalRhythmModel({
  modelPath: workerData.modelPath,
  modelKind: workerData.modelKind || 'beatnet',
  edmTiming: workerData.edmTiming ?? true,
  onEvent: (e) => parentPort.postMessage(e),
});
// Streaming 31-tap low-pass FIR before the exact 44.1 -> 22.05 kHz decimation.
const coefficients = Float64Array.from({ length: 31 }, (_, i) => {
  const x = i - 15;
  return (
    (x === 0 ? 0.45 : Math.sin(Math.PI * 0.45 * x) / (Math.PI * x)) *
    (0.54 - 0.46 * Math.cos((2 * Math.PI * i) / 30))
  );
});
const sum = coefficients.reduce((a, b) => a + b, 0);
for (let i = 0; i < 31; i++) coefficients[i] /= sum;
const history = new Float32Array(31);
let position = 0,
  phase = 0,
  hop = new Float32Array(441),
  at = 0;
parentPort.on("message", (message) => {
  if (message.type === "reset") {
    model.reset();
    history.fill(0);
    position = phase = at = 0;
    return;
  }
  for (const sample of message.samples) {
    history[position] = sample;
    position = (position + 1) % 31;
    if ((phase++ & 1) === 0) {
      let value = 0;
      for (let i = 0; i < 31; i++)
        value += history[(position + i) % 31] * coefficients[i];
      hop[at++] = value;
      if (at === 441) {
        model.ingest(hop);
        hop = new Float32Array(441);
        at = 0;
      }
    }
  }
  parentPort.postMessage({ type: "ack" });
});
model
  .initialize()
  .catch((e) =>
    parentPort.postMessage({ type: "unavailable", reason: e.message }),
  );
