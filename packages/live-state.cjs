"use strict";
function initialLive() {
  return {
    running: false,
    deviceLost: false,
    phase: "stopped",
    currentId: null,
    candidateId: null,
    confidence: 0,
    currentCharge: 0,
    candidateCharge: 0,
    matchEvent: "none",
    peak: 0,
    rms: 0,
    lockedTheme: null,
    blackout: false,
    revision: 0,
  };
}
function reduceLive(state, event) {
  const s = { ...state };
  if (event.type === "ready") {
    s.phase = "listening";
    s.deviceLost = false;
  }
  if (event.type === "device") {
    s.deviceLost = event.lost;
    s.phase = event.lost ? "device-lost" : "listening";
    s.currentId = null;
    s.candidateId = null;
    s.peak = 0;
    s.rms = 0;
  }
  if (event.type === "reconnecting") {
    s.phase = "reconnecting";
    s.currentId = null;
    s.candidateId = null;
    s.peak = 0;
    s.rms = 0;
  }
  if (["standby", "stale"].includes(event.type)) {
    s.phase = event.type;
    s.currentId = null;
    s.candidateId = null;
    s.confidence = 0;
  }
  if (["device", "reconnecting", "standby", "stale"].includes(event.type)) {
    s.currentCharge = 0;
    s.candidateCharge = 0;
    s.confidence = 0;
    s.matchEvent = "none";
  }
  if (event.type === "level") {
    s.peak = event.peak;
    s.rms = event.rms;
  }
  if (event.type === "match") {
    s.matchEvent = event.event;
    s.currentCharge = event.currentCharge;
    s.candidateCharge = event.candidateCharge;
    if (event.event === "confirmed" && event.trackUid) {
      s.currentId = event.trackUid;
      s.candidateId = null;
      s.candidateCharge = 0;
      s.confidence = event.confidence;
      s.phase = "confirmed";
    } else if (["tentative", "mix-hold"].includes(event.event))
      s.candidateId = event.trackUid || null;
    else if (event.event === "no-match" || event.event === "noise")
      s.candidateId = null;
  }
  if (event.type === "error") {
    s.phase = "error";
    s.error = event.message;
  }
  if (s.currentId !== state.currentId) s.revision++;
  return s;
}
module.exports = { initialLive, reduceLive };
