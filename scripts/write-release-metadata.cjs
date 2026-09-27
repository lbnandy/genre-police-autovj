"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const dist = path.join(ROOT, "dist");
const artifact = `Genre-Police-AutoVJ-${pkg.version}-portable.exe`;
const artifactPath = path.join(dist, artifact);

if (!fs.existsSync(artifactPath)) {
  throw new Error(`Portable artifact not found: ${artifact}`);
}

const sha256 = crypto.createHash("sha256").update(fs.readFileSync(artifactPath)).digest("hex");
const info = {
  productName: pkg.build?.productName || pkg.name,
  version: pkg.version,
  platform: "win32",
  arch: "x64",
  artifact,
  sha256,
  rhythmModel: {kind:'beatnet-plus',sha256:require('../packages/rhythm-config.cjs').MODEL_SHA256,edmTiming:'boundary'},
  builtAt: new Date().toISOString(),
  linkComponent: JSON.parse(fs.readFileSync(path.join(ROOT, "vendor/carabiner/component.json"), "utf8")),
};

fs.writeFileSync(path.join(dist, "BUILD-INFO.json"), `${JSON.stringify(info, null, 2)}\n`);
fs.writeFileSync(path.join(dist, "SHA256SUMS.txt"), `${sha256}  ${artifact}\n`);
console.log(`Wrote release metadata for ${artifact}`);
