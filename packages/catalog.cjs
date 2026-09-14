"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { matchingTrack } = require("./evidence.cjs");
const { atomicJson } = require("./library.cjs");
const { catalogPolicy } = require("./network-policy.cjs");
async function json(url, signal) {
  const timeout = AbortSignal.timeout(8000);
  const r = await fetch(url, {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    headers: {
      "User-Agent": "GenrePoliceAutoVJ/0.1 (local music preparation)",
      Accept: "application/json",
    },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
async function lookup(track, cacheRoot, refresh = false, networkCountry = "", signal) {
  signal?.throwIfAborted();
  if (!track.artist || !track.title)
    return { status: "missing-metadata", results: [] };
  const policy = catalogPolicy(networkCountry);
  const key = crypto
    .createHash("sha256")
    .update(
      JSON.stringify([
        "network-policy-v1",
        policy.key,
        track.title,
        track.artist,
        Math.round(track.durationMs / 1000),
      ]),
    )
    .digest("hex");
  const file = path.join(cacheRoot, key + ".json");
  if (!refresh && fs.existsSync(file)) {
    const c = JSON.parse(fs.readFileSync(file, "utf8"));
    if (Date.now() - c.at < 7 * 86400000 && c.status !== "failed") return c;
  }
  const term = encodeURIComponent(track.artist + " " + track.title);
  const requests = [
    (async () => {
      let completed = false, lastError;
      for (const market of policy.appleMarkets) {
        signal?.throwIfAborted();
        try {
          const data = await json(
            `https://itunes.apple.com/search?term=${term}&entity=song&limit=15&country=${market}&lang=en_us`, signal,
          );
          completed = true;
          const item = (data.results || []).find((i) => matchingTrack({
            title: i.trackName, artist: i.artistName, durationMs: i.trackTimeMillis,
          }, track));
          if (item) return {
            source: "Apple Music catalog",
            scope: "track",
            storefront: market,
            tags: [item.primaryGenreName].filter(Boolean),
            title: item.trackName,
            artist: item.artistName,
            url: item.trackViewUrl,
          };
        } catch (error) {
          if (signal?.aborted) throw error;
          lastError = error;
        }
      }
      if (!completed) throw lastError;
      return null;
    })(),
  ];
  if (policy.deezer) requests.push(
    (async () => {
      const data = await json(
        `https://api.deezer.com/search/track?q=${term}&limit=15`, signal,
      );
      const item = (data.data || []).find((i) =>
        matchingTrack(
          {
            title: i.title,
            artist: i.artist?.name,
            durationMs: i.duration * 1000,
          },
          track,
        ),
      );
      if (!item) return null;
      const album = await json(
        `https://api.deezer.com/album/${Number(item.album.id)}`, signal,
      );
      return {
        source: "Deezer album",
        scope: "album",
        tags: (album.genres?.data || []).map((g) => g.name),
        title: item.title,
        artist: item.artist?.name,
        url: item.link,
      };
    })(),
  );
  const providers = await Promise.allSettled(requests);
  signal?.throwIfAborted();
  const results = providers
    .filter((p) => p.status === "fulfilled" && p.value)
    .map((p) => p.value);
  const errors = providers
    .filter((p) => p.status === "rejected")
    .map((p) => p.reason.message);
  const record = {
    at: Date.now(),
    policy: policy.key,
    skippedProviders: policy.deezer ? [] : ["Deezer (China network policy)"],
    status: results.length
      ? "found"
      : errors.length === providers.length
        ? "failed"
        : "no-match",
    results,
    errors,
  };
  atomicJson(file, record);
  return record;
}
module.exports = { lookup };
