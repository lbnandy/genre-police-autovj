"use strict";
const fs = require("node:fs");
const { atomicJson } = require("./library.cjs");

function countryCode(value) {
  return typeof value === "string" && /^[a-z]{2}$/i.test(value)
    ? value.toUpperCase() : "";
}

// Like the desktop resolver, use the network exit country, never UI language.
// Workers share a cache for this app session; restarting rechecks after travel.
async function detectNetworkCountry(cachePath, sessionId, signal) {
  signal?.throwIfAborted();
  const cacheable = Boolean(cachePath && sessionId);
  if (cacheable) {
    try {
      const cached = JSON.parse(fs.readFileSync(cachePath, "utf8"));
      if (cached.sessionId === sessionId) return countryCode(cached.country);
    } catch { /* Missing or outdated cache: make a bounded probe. */ }
  }
  let country = "";
  try {
    const timeout = AbortSignal.timeout(1800);
    const response = await fetch("https://www.cloudflare.com/cdn-cgi/trace", {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (response.ok) {
      const trace = await response.text();
      country = countryCode(/^loc=([A-Z]{2})\s*$/m.exec(trace)?.[1]);
    }
  } catch (error) {
    if (signal?.aborted) throw error;
  }
  signal?.throwIfAborted();
  // Persist only the country, not the trace response or IP address.
  if (cacheable) {
    try { atomicJson(cachePath, { sessionId, country }); } catch { /* Optional cache. */ }
  }
  return country;
}

function catalogPolicy(country) {
  return countryCode(country) === "CN"
    ? { key: "CN", appleMarkets: ["CN", "US"], deezer: false }
    : { key: "GLOBAL", appleMarkets: ["US"], deezer: true };
}

module.exports = { detectNetworkCountry, catalogPolicy };
