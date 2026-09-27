"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const ROOT = path.resolve(__dirname, ".."),
  lock = JSON.parse(
    fs.readFileSync(path.join(ROOT, "upstream.lock.json"), "utf8"),
  );
let count = 0;
for (const [name, source] of Object.entries(lock.sources))
  for (const [rel, hash] of Object.entries(source.files)) {
    const file = path.join(ROOT, "vendor", name, rel);
    const adaptation = lock.adaptations?.[`${name}/${rel}`];
    if (adaptation && (adaptation.upstreamSha256 !== hash || !adaptation.reason || !/^[a-f0-9]{64}$/.test(adaptation.sha256)))
      throw new Error("Invalid upstream adaptation record: " + file);
    if (
      crypto
        .createHash("sha256")
        .update(fs.readFileSync(file))
        .digest("hex") !== (adaptation?.sha256 || hash)
    )
      throw new Error("Modified upstream file: " + file);
    count++;
  }
for (const key of Object.keys(lock.adaptations || {})) {
  const slash = key.indexOf("/");
  if (!lock.sources[key.slice(0, slash)]?.files[key.slice(slash + 1)])
    throw new Error("Adaptation has no pinned upstream source: " + key);
}
const style = path.join(ROOT, "vendor/genre-police/renderer/stage-styles.css");
for (const match of fs
  .readFileSync(style, "utf8")
  .matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\)\s]+))\s*\)/g)) {
  const url = match[1] || match[2] || match[3];
  if (/^(data:|https?:|#)/.test(url)) continue;
  const target = path.resolve(path.dirname(style), url.split("?")[0]);
  if (!fs.existsSync(target))
    throw new Error("Missing visual resource: " + target);
}
console.log(
  `Verified ${count} pinned source files (${Object.keys(lock.adaptations || {}).length} documented adaptations) and all referenced stage stylesheet resources.`,
);
