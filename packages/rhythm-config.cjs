"use strict";

const MODEL_FILE = "assets/models/beatnet-plus/generic_weights.onnx";
const MODEL_SHA256 = "3660e083dbea50b4ca8ac43e7cf75bd97ffb6522474e1f1d3a337cfa63265a06";

// One model contract for source runs and portable builds. Missing assets must
// surface as errors, never silently change the beat engine.
function rhythmConfig(resourcePath) {
  return {modelPath: resourcePath(MODEL_FILE), modelKind: "beatnet-plus", edmTiming: "boundary"};
}

module.exports = {rhythmConfig, MODEL_FILE, MODEL_SHA256};
