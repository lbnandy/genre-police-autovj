"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { detectNetworkCountry } = require("../packages/network-policy.cjs");
const { lookup } = require("../packages/catalog.cjs");
const track = { title: "Sunrise (Extended Mix)", artist: "Alpha", durationMs: 360000 };
const appleItem = { trackName: track.title, artistName: track.artist, trackTimeMillis: track.durationMs, primaryGenreName: "Techno" };
const response = (data) => ({ ok: true, json: async () => data, text: async () => data });
function temp(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "autovj-network-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test("network probe is shared across workers for a session and stores no IP or trace", async (t) => {
  const file = path.join(temp(t), "country.json");
  const fetch = t.mock.method(global, "fetch", async () => response("ip=192.0.2.1\nloc=CN\ntls=TLSv1.3\n"));
  assert.equal(await detectNetworkCountry(file, "session-a"), "CN");
  assert.equal(await detectNetworkCountry(file, "session-a"), "CN");
  assert.equal(fetch.mock.callCount(), 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(file)), { sessionId: "session-a", country: "CN" });
  fetch.mock.mockImplementation(async () => response("loc=JP\n"));
  assert.equal(await detectNetworkCountry(file, "session-b"), "JP");
  assert.equal(fetch.mock.callCount(), 2);
});

test("failed region detection stays unknown and cancellation never poisons its cache", async (t) => {
  const file = path.join(temp(t), "country.json");
  const fetch = t.mock.method(global, "fetch", async () => { throw new Error("unreachable"); });
  assert.equal(await detectNetworkCountry(file, "session-a"), "");
  assert.equal(await detectNetworkCountry(file, "session-a"), "");
  assert.equal(fetch.mock.callCount(), 1);
  const controller = new AbortController();
  fetch.mock.mockImplementation(async () => { controller.abort(); throw controller.signal.reason; });
  await assert.rejects(detectNetworkCountry(file, "session-b", controller.signal), { name: "AbortError" });
  assert.equal(JSON.parse(fs.readFileSync(file)).sessionId, "session-a");
});

test("China uses Apple CN first, keeps exact-version checks on fallback and never calls Deezer", async (t) => {
  const root = temp(t), urls = [];
  t.mock.method(global, "fetch", async (url) => {
    urls.push(url);
    assert.equal(new URL(url).hostname, "itunes.apple.com");
    return response({ results: new URL(url).searchParams.get("country") === "CN"
      ? [{ ...appleItem, trackName: "Sunrise (Radio Edit)" }] : [appleItem] });
  });
  const result = await lookup(track, root, false, "CN");
  assert.deepEqual(urls.map(u => new URL(u).searchParams.get("country")), ["CN", "US"]);
  assert.equal(result.results[0].storefront, "US");
  assert.equal(result.status, "found");
  assert.deepEqual(result.skippedProviders, ["Deezer (China network policy)"]);
  await lookup(track, root, false, "CN");
  assert.equal(urls.length, 2, "Prepared metadata is reused without another request");
});

test("a matching CN track avoids fallback; international and CN caches remain separate", async (t) => {
  const root = temp(t), urls = [];
  t.mock.method(global, "fetch", async url => {
    urls.push(url);
    return response(url.includes("itunes.apple.com") ? { results: [appleItem] } : { data: [] });
  });
  assert.equal((await lookup(track, root, false, "CN")).results[0].storefront, "CN");
  assert.equal(urls.length, 1);
  const international = await lookup({ ...track, language: "zh" }, root, false, "JP");
  assert.equal(international.policy, "GLOBAL");
  assert.deepEqual(international.skippedProviders, []);
  assert.equal(urls.length, 3);
  assert.ok(urls.some(u => u.includes("api.deezer.com")), "Chinese UI is not a network-region signal");
});

test("unavailable catalogs remain retryable and cancelled lookups write no result", async (t) => {
  const root = temp(t), controller = new AbortController();
  const fetch = t.mock.method(global, "fetch", async () => { throw new Error("offline"); });
  assert.equal((await lookup(track, root, false, "CN")).status, "failed");
  await lookup(track, root, false, "CN");
  assert.equal(fetch.mock.callCount(), 4);
  const target = temp(t);
  fetch.mock.mockImplementation(async () => { controller.abort(); throw controller.signal.reason; });
  await assert.rejects(lookup(track, target, false, "CN", controller.signal), { name: "AbortError" });
  assert.deepEqual(fs.readdirSync(target), []);
});
