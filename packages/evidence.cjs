"use strict";
const {
  classifyGenre,
} = require("../vendor/genre-police/src/genre-classifier");
const { THEMES } = require("../vendor/genre-police/src/themes");
const {
  titleVersionCompatible,
  scoreTrackCandidate,
} = require("../vendor/genre-police/src/genre-resolver");
const broad = new Set(["unknown", "electronic", "edm", "pop", "rock", "dance"]);
function versionTokens(title) {
  return [
    ...String(title)
      .toLowerCase()
      .matchAll(
        /\b(original|extended|radio|club|live|remix|bootleg|mashup|vip|instrumental|acoustic|sped|slowed)\b/g,
      ),
  ]
    .map((m) => m[1])
    .sort()
    .join("|");
}
function matchingTrack(item, track) {
  const score = scoreTrackCandidate(
    item.title,
    item.artist,
    track.title,
    track.artist,
  );
  const durationOK =
    !item.durationMs ||
    !track.durationMs ||
    Math.abs(item.durationMs - track.durationMs) <=
      Math.max(5000, track.durationMs * 0.035);
  return (
    score.valid &&
    score.titleScore >= 0.85 &&
    score.artistScore >= 0.8 &&
    durationOK &&
    titleVersionCompatible(item.title, track.title) &&
    titleVersionCompatible(track.title, item.title) &&
    versionTokens(item.title) === versionTokens(track.title)
  );
}
function classified(tags) {
  return classifyGenre({
    tags: Array.isArray(tags) ? tags : [],
    artist: "",
    title: "",
    useArtistMapping: false,
  });
}
function resolveEvidence(fileTags, online, ai) {
  const file = classified(fileTags);
  const candidates = [];
  if (file.id !== "unknown")
    candidates.push({
      id: file.id,
      source: "file",
      tags: fileTags,
      specific: !broad.has(file.id),
    });
  for (const e of online?.results || []) {
    const g = classified(e.tags);
    if (g.id !== "unknown")
      candidates.push({
        id: g.id,
        source: e.source,
        tags: e.tags,
        specific: e.scope === "track" && !broad.has(g.id),
        scope: e.scope,
      });
  }
  if (ai?.id && ai.id !== "unknown")
    candidates.push({
      id: ai.id,
      source: "local-ai",
      score: ai.confidence,
      specific: !broad.has(ai.id),
    });
  const credible = candidates.filter(
    (c) => c.specific && (c.source !== "local-ai" || c.score >= 0.15),
  );
  const chosen = credible.find((c) => c.source === "file") ||
    credible.find((c) => c.source !== "local-ai") ||
    credible[0] ||
    candidates[0] || { id: "unknown", source: "default" };
  const conflict = credible.some(
    (c) =>
      c.id !== chosen.id &&
      (THEMES[c.id]?.family !== THEMES[chosen.id]?.family ||
        c.source !== "local-ai"),
  );
  const uncertain =
    chosen.id === "unknown" ||
    broad.has(chosen.id) ||
    conflict ||
    (chosen.source === "local-ai" &&
      (ai.margin < 0.015 || ai.confidence < 0.18));
  return { ...chosen, candidates, conflict, uncertain };
}
module.exports = { matchingTrack, resolveEvidence, versionTokens };
