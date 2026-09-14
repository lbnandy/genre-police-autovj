"use strict";
const fs = require("node:fs"),
  path = require("node:path");
const root = process.env.AUTOVJ_IMPORT_ROOT || path.resolve(__dirname, ".."),
  upstream = path.join(root, "vendor/vjvision/src");
fs.mkdirSync(path.join(root, "native"), { recursive: true });
function edit(source, before, after) {
  if (!source.includes(before))
    throw new Error(
      "Upstream native adapter requires review: " + before.slice(0, 70),
    );
  return source.replace(before, after);
}
let h = fs
  .readFileSync(path.join(upstream, "audio/wasapi_capture.h"), "utf8")
  .replaceAll("\r\n", "\n");
h = edit(h, "#include <atomic>", "#include <atomic>\n#include <functional>");
h = edit(
  h,
  "    bool start(RingBuffer* ring);",
  "    std::function<void(const float*, size_t)> onAudio;\n    int channelStart = 0; // selected stereo pair, -1 = all input channels\n    bool start(RingBuffer* ring);",
);
let c = fs
  .readFileSync(path.join(upstream, "audio/wasapi_capture.cpp"), "utf8")
  .replaceAll("\r\n", "\n");
c = edit(c, '#include "wasapi_capture.h"', '#include "capture.h"');
c = edit(
  c,
  "    std::wstring name;\n};",
  "    std::wstring name;\n    int channels=0, sampleRate=0;\n};",
);
c = edit(
  c,
  "        dev->Release();\n        out.push_back",
  "        IAudioClient* formatClient=nullptr;\n        if (SUCCEEDED(dev->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr, (void**)&formatClient))) {\n            WAVEFORMATEX* format=nullptr;\n            if (SUCCEEDED(formatClient->GetMixFormat(&format)) && format) { ei.channels=format->nChannels; ei.sampleRate=format->nSamplesPerSec; CoTaskMemFree(format); }\n            formatClient->Release();\n        }\n        dev->Release();\n        out.push_back",
);
c = edit(c, "e.name, true, 0, 0", "e.name, true, e.channels, e.sampleRate");
c = edit(c, "e.name, false, 0, 0", "e.name, false, e.channels, e.sampleRate");
c = c.replaceAll(
  "deviceLost = (hr == AUDCLNT_E_DEVICE_INVALIDATED);",
  "deviceLost = FAILED(hr); // Any capture-service failure retries the selected endpoint.",
);
const start = c.indexOf(
  "            // Saved endpoint vanished (unplugged / disabled):",
);
const end = c.indexOf("\n        }\n    } else if", start);
if (start < 0 || end < 0) throw new Error("Capture endpoint adapter changed");
c =
  c.slice(0, start) +
  "            // AutoVJ: retain the selected endpoint; never switch to unrelated audio.\n" +
  c.slice(end);
const a = c.indexOf("        // Endpoint exists but cannot activate");
const b = c.indexOf("        lost_.store(true);", a);
if (a < 0 || b < 0) throw new Error("Capture activation adapter changed");
c =
  c.slice(0, a) +
  "        // Retry this exact endpoint after an exclusive lock or unplug.\n" +
  c.slice(b);
c = edit(
  c,
  "    if (ring_) ring_->clear();",
  "    if (ring_) ring_->clear();\n    peak_.store(0.f); rms_.store(0.f);",
);
c = edit(
  c,
  "    IAudioCaptureClient* cap = nullptr;",
  "    if (channelStart >= ch) {\n        client->Release(); lost_.store(true);\n        for (int i=0; i<15 && running_.load(); ++i) Sleep(100);\n        return false;\n    }\n    IAudioCaptureClient* cap = nullptr;",
);
c = edit(
  c,
  "                float inv = 1.0f / (float)ch;",
  "                const int first = channelStart < 0 ? 0 : std::min(channelStart, ch - 1);\n                const int last = channelStart < 0 ? ch : std::min(first + 2, ch);\n                float inv = 1.0f / (float)(last - first);",
);
c = edit(
  c,
  "for (int c = 0; c < ch; ++c) s += f[i * ch + c];",
  "for (int c = first; c < last; ++c) s += f[i * ch + c];",
);
c = edit(
  c,
  "            if (ring_) ring_->write(out.data(), out.size());",
  "            if (ring_) ring_->write(out.data(), out.size());\n            if (onAudio) onAudio(out.data(), out.size());",
);
fs.writeFileSync(path.join(root, "native/capture.h"), h);
fs.writeFileSync(path.join(root, "native/capture.cpp"), c);
const controller = fs
  .readFileSync(path.join(upstream, "viz/viz_controller.cpp"), "utf8")
  .replaceAll("\r\n", "\n");
const tailStart = controller.indexOf("constexpr int kMinSliceHashes");
const tailEnd = controller.indexOf("} // namespace", tailStart);
const blockStart = controller.indexOf("            // 4 phase grids");
const blockEnd = controller.indexOf("\n        MatchTick mt =", blockStart);
let block = controller.slice(blockStart, blockEnd);
// The final brace belongs to the original `if (hasDb)`.
block = block.replace(/\s*}\s*$/, "");
if (tailStart < 0 || tailEnd < 0 || blockStart < 0 || blockEnd < 0)
  throw new Error("Matcher adapter changed");
const match =
  "// Derived from VJVision viz_controller.cpp by ichiryu, MIT. See upstream.lock.json.\n" +
  '#pragma once\n#include "fp/pipeline.h"\n#include "fp/align.h"\n#include "fp/fp_db.h"\n#include "audio/ring_buffer.h"\nnamespace autovj {\nusing namespace vj;\n' +
  controller.slice(tailStart, tailEnd) +
  "\ninline FpResult matchLive(FpDb& db, RingBuffer& ring, float peak, bool transitioning, int& transitionTickIdx, double nowSec) {\nconstexpr float silencePeakThreshold=1e-4f;\nconstexpr size_t kMaxPhaseOff=fp_params::HOP_SIZE*3/4;\nconst size_t windowSamples=fp_params::SAMPLE_RATE*(transitioning?6:12);\nstd::vector<int16_t> i16(windowSamples+kMaxPhaseOff);\nsize_t fpsCount=0; FpResult result;\n" +
  block +
  "\nreturn result;\n}\n}\n";
fs.writeFileSync(path.join(root, "native/live-match.h"), match);
console.log(
  "Generated bounded adapters; Music Battery and fingerprint algorithms remain unmodified.",
);
