"use strict";
const { parentPort, workerData: initialData } = require("node:worker_threads");
const {PcmWindows}=require("./pcm-windows.cjs");
let workerData=initialData, modelSession=null;
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { nativeTask } = require("./native-host.cjs");
const { atomicJson } = require("./library.cjs");
const { lookup } = require("./catalog.cjs");
const { detectNetworkCountry } = require("./network-policy.cjs");
const { resolveEvidence } = require("./evidence.cjs");
const model = require("../vendor/genre-police/src/audio-genre-model");
let controller = new AbortController();
parentPort.on("message", (m) => {
  if (m === "cancel") controller.abort();
});
function progress(phase, extra = {}) {
  parentPort.postMessage({ type: "progress", phase, ...extra });
}
function cancelled() {
  if (controller.signal.aborted) throw new Error("Cancelled");
}
async function analyzeAI(pcmFile, modelRoot) {
  const ort = require("onnxruntime-node");
  const session = modelSession ||= await ort.InferenceSession.create(
    path.join(modelRoot, "discogs-effnet-bsdynamic-1.onnx"),
    { executionProviders: ["cpu"], intraOpNumThreads: 1, interOpNumThreads: 1 },
  );
  const samples = await PcmWindows.open(pcmFile);
  try {
    cancelled();
    const extractor = new model.MusiCnnMelExtractor();
    const classes = JSON.parse(
      fs.readFileSync(
        path.join(modelRoot, "discogs-effnet-bsdynamic-1.json"),
        "utf8",
      ),
    ).classes;
    const count = 32768,
      hop = 15872;
    const sum = new Float64Array(400);
    let accepted = 0,
      skipped = 0,
      processed = 0;
    const starts = [];
    for (let at = 0; at + count <= samples.length; at += hop) starts.push(at);
    if (!starts.length && samples.length) starts.push(0);
    // Includes the final partial tail without repeatedly counting a long padded segment.
    if (starts.length && samples.length - (starts.at(-1) + count) >= hop / 2)
      starts.push(starts.at(-1) + hop);
    for (const start of starts) {
      cancelled();
      const patch = await samples.read(start,count);
      let energy = 0;
      for (const x of patch) energy += x * x;
      processed++;
      if (Math.sqrt(energy / count) < 0.0015) {
        skipped++;
        continue;
      }
      const mel = extractor.transform(patch),
        tensor = model.buildPatchTensor(mel, [Math.max(0, mel.frames - 128)]);
      const output = await session.run({
        [session.inputNames[0]]: new ort.Tensor(
          "float32",
          tensor,
          [1, 128, 96],
        ),
      });
      const activation = session.outputNames.find(
        (n) => output[n].dims.at(-1) === 400,
      );
      if (!activation) throw new Error("400-class model output missing");
      const row = output[activation].data;
      for (let i = 0; i < 400; i++) sum[i] += row[i];
      accepted++;
      if (processed % 5 === 0)
        progress("ai", { fraction: processed / starts.length, accepted });
    }
    if (!accepted)
      return { id: "unknown", confidence: 0, margin: 0, accepted: 0, skipped };
    const scores = Float32Array.from(sum, (v) => v / accepted);
    const result = model.aggregateGenreScores(scores, classes);
    return {
      ...result,
      rawScores: Array.from(scores),
      accepted,
      skipped,
      totalWindows: starts.length,
      model: "discogs-effnet-bsdynamic-1",
      analysisVersion: 1,
    };
  } finally {
    await samples.close();
  }
}
async function run(data) {
  workerData=data; controller=new AbortController();
  let outcome;
  const { track, root, exe, modelRoot, online, localAI, refresh } = workerData;
  const temp = path.join(root, "temp", track.id + ".pcm");
  let cover;
  try {
    cancelled();
    progress("metadata");
    const { parseFile } = await import("music-metadata");
    let meta = { common: {} };
    try {
      meta = await parseFile(track.filePath, { duration: true });
    } catch {}
    const data = {
      ...track,
      title: meta.common.title || track.title,
      artist: meta.common.artist || "",
      album: meta.common.album || "",
      fileTags: meta.common.genre || [],
    };
    const picture = meta.common.picture?.find(
      (p) =>
        /^image\/(png|jpeg|jpg)$/.test(p.format) &&
        p.data.length <= 8 * 1024 * 1024,
    );
    if (picture) {
      cover =
        "covers/" +
        track.id +
        (picture.format === "image/png" ? ".png" : ".jpg");
      fs.writeFileSync(path.join(root, cover), picture.data);
      data.cover = cover;
    }
    const prepared = await nativeTask(
      exe,
      [
        "--prepare",
        data.filePath,
        path.join(root, "fingerprints.db"),
        data.id,
        temp,
      ],
      {
        signal: controller.signal,
        onEvent: (e) => {
          if (e.type === "progress") progress(e.phase);
        },
      },
    );
    data.durationMs = prepared.durationMs;
    data.hashes = prepared.hashes;
    const hash=crypto.createHash("sha256");
    for await(const chunk of fs.createReadStream(temp)){cancelled();hash.update(chunk);}
    data.audioHash=hash.digest("hex");
    let onlineResult = null,
      ai = null;
    const errors = [];
    if (online) {
      progress("online");
      try {
        const country = await detectNetworkCountry(
          workerData.networkCachePath, workerData.networkSessionId, controller.signal,
        );
        cancelled();
        onlineResult = await lookup(data, path.join(root, "cache"), refresh, country, controller.signal);
      } catch (e) {
        errors.push(e.message);
      }
    }
    cancelled();
    if (localAI) {
      progress("ai", { fraction: 0 });
      try {
        ai = await analyzeAI(temp, modelRoot);
      } catch (e) {
        if (controller.signal.aborted) throw e;
        errors.push("Local AI: " + e.message);
      }
    }
    cancelled();
    atomicJson(path.join(root, "analysis", data.id + ".json"), {
      version: 1,
      ai,
      online: onlineResult,
      fileTags: data.fileTags,
      at: new Date().toISOString(),
    });
    data.suggestion = resolveEvidence(data.fileTags, onlineResult, ai);
    data.analysis = {
      ai: ai
        ? {
            id: ai.id,
            confidence: ai.confidence,
            margin: ai.margin,
            accepted: ai.accepted,
            ranked: ai.ranked?.slice(0, 5),
          }
        : null,
      online: onlineResult,
      errors,
    };
    data.status = "ready";
    data.analyzedAt = new Date().toISOString();
    outcome={ type: "complete", track: data };
  } catch (e) {
    outcome={
      type: "failed",
      id: track.id,
      message: e.message,
      cancelled: controller.signal.aborted,
    };
  } finally {
    try {
      fs.unlinkSync(temp);
    } catch {}
  }
  parentPort.postMessage(outcome);
  if(!initialData?.persistent)await close();
}
async function close(){const session=modelSession;modelSession=null;if(session)await session.release();parentPort.close();}
if(initialData?.persistent){
  let busy=false;
  parentPort.on("message",async m=>{
    if(m?.type==="analyze" && !busy){busy=true;try{await run(m.data);}finally{busy=false;}}
    else if(m==="close" && !busy)await close();
  });
}else run(initialData).catch(e=>{throw e;});
