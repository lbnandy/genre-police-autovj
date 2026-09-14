"use strict";
// Explicit, version-pinned imports. Never modifies either source repository.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const BASE = path.resolve(__dirname, "..");
const [gp, vj, mode] = process.argv.slice(2);
if (!gp || !vj)
  throw new Error(
    "Usage: node scripts/import-upstream.cjs <Genre Police checkout> <VJVision checkout>",
  );
if (mode && !["--apply"].includes(mode))
  throw new Error(
    "Use --apply to install a reviewed import; omit it for a staged preview.",
  );
// The default operation stages a candidate without touching the live application.
const ROOT = path.join(BASE, ".upstream-staging", "candidate-" + Date.now());
fs.mkdirSync(ROOT, { recursive: true });
let oldLock = null;
if (fs.existsSync(path.join(BASE, "upstream.lock.json"))) {
  oldLock = JSON.parse(
    fs.readFileSync(path.join(BASE, "upstream.lock.json"), "utf8"),
  );
  for (const [name, source] of Object.entries(oldLock.sources))
    for (const [rel, hash] of Object.entries(source.files)) {
      const file = path.join(BASE, "vendor", name, rel);
      if (
        !fs.existsSync(file) ||
        crypto
          .createHash("sha256")
          .update(fs.readFileSync(file))
          .digest("hex") !== hash
      )
        throw new Error(
          "Local vendor changes must be reviewed first: " + name + "/" + rel,
        );
    }
}
const lock = { schema: 1, importedAt: new Date().toISOString(), sources: {} };
function importFiles(name, source, seeds, extra = []) {
  const dest = path.join(ROOT, "vendor", name);
  const revision = execFileSync("git", ["-C", source, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const dirty = execFileSync("git", ["-C", source, "status", "--porcelain"], {
    encoding: "utf8",
  }).trim();
  if (dirty)
    throw new Error(
      `${name}: commit or isolate upstream changes before importing`,
    );
  const seen = new Set(),
    queue = [...seeds, ...extra];
  while (queue.length) {
    const rel = queue.shift().replaceAll("\\", "/");
    if (seen.has(rel)) continue;
    if (rel.startsWith("../") || path.isAbsolute(rel))
      throw new Error("Invalid import path");
    const file = path.join(source, rel);
    if (fs.statSync(file).isDirectory()) {
      for (const child of fs.readdirSync(file)) queue.push(`${rel}/${child}`);
      continue;
    }
    seen.add(rel);
    const bytes = fs.readFileSync(file);
    const target = path.join(dest, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
    if (/\.(?:m?js|cjs)$/.test(rel)) {
      const code = bytes.toString("utf8");
      const deps = [
        ...code.matchAll(
          /(?:from\s*|import\s*|require\s*\()\s*['"](\.[^'"]+)['"]/g,
        ),
      ];
      for (const m of deps) {
        let dep = path.posix.normalize(
          path.posix.join(path.posix.dirname(rel), m[1]),
        );
        if (!path.extname(dep)) dep += ".js";
        queue.push(dep);
      }
    }
  }
  const files = Object.fromEntries(
    [...seen].sort().map((rel) => [
      rel,
      crypto
        .createHash("sha256")
        .update(fs.readFileSync(path.join(dest, rel)))
        .digest("hex"),
    ]),
  );
  lock.sources[name] = {
    revision,
    repository: execFileSync(
      "git",
      ["-C", source, "remote", "get-url", "origin"],
      { encoding: "utf8" },
    ).trim(),
    files,
  };
}
importFiles(
  "genre-police",
  path.resolve(gp),
  [
    "renderer/visual-engine.js",
    "renderer/audio-engine.js",
    "renderer/audio-response.mjs",
    "renderer/visual-finish.mjs",
    "renderer/themes.js",
    "renderer/styles.css",
    "renderer/index.html",
    "renderer/app.js",
    "renderer/kawaii-expression.mjs",
    "renderer/motion-preference.mjs",
    "renderer/synthwave-response.mjs",
    "src/audio-genre-model.js",
    "src/audio-genre-runtime.js",
    "src/rhythm-model-runtime.js",
    "src/genre-resolver.js",
    "src/genre-reliability.js",
    "src/themes.js",
    "src/custom-genres.js",
    "LICENSE",
    "THIRD_PARTY_NOTICES.md",
  ],
  [
    "assets/icon.png",
    "assets/trance-far-field.svg",
    "assets/fonts",
    "assets/models/discogs-effnet-bsdynamic-1.onnx",
    "assets/models/discogs-effnet-bsdynamic-1.json",
    "assets/models/beatnet-model-1.onnx",
    "assets/models/BEATNET-CC-BY-4.0.txt",
    "assets/models/ESSENTIA-MODELS-LICENSE.txt",
  ],
);
importFiles("vjvision", path.resolve(vj), [
  "src/fp",
  "src/engine",
  "src/audio",
  "src/util",
  "third_party/pffft",
  "third_party/dr_libs",
  "third_party/sqlite3_extract",
  "LICENSE",
  "AGENTS.md",
  "README.md",
  "RELEASE_NOTES.md",
  "src/viz/viz_controller.cpp",
]);
fs.writeFileSync(
  path.join(ROOT, "upstream.lock.json"),
  JSON.stringify(lock, null, 2) + "\n",
);
// Styles resolve the original relative font directory inside the vendor tree.
// The export contains styles only; none of the desktop controller is executed.
let css = fs.readFileSync(
  path.join(ROOT, "vendor/genre-police/renderer/styles.css"),
  "utf8",
);
css = css.replaceAll("../node_modules/", "../../../node_modules/");
fs.writeFileSync(
  path.join(ROOT, "vendor/genre-police/renderer/stage-styles.css"),
  css,
);
const pkg = JSON.parse(fs.readFileSync(path.join(gp, "package.json"), "utf8"));
const out = {
  name: "genre-police-autovj",
  version: "0.1.0",
  private: true,
  description:
    "Automatic genre-aware VJ. Genre Police visuals and VJVision recognition.",
  main: "app/main.cjs",
  author: "LBN",
  license: "MIT",
  scripts: {
    start: "electron .",
    test: "node --test tests/*.test.cjs",
    "build:native":
      "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-native.ps1",
    pack: "electron-builder --dir",
    dist: "electron-builder --win portable",
    "verify:upstream": "node scripts/verify-upstream.cjs",
  },
  dependencies: pkg.dependencies,
  devDependencies: pkg.devDependencies,
  build: {
    appId: "com.genrepolice.autovj",
    productName: "Genre Police AutoVJ",
    asar: true,
    directories: { output: "dist" },
    files: [
      "app/**/*",
      "renderer/**/*",
      "packages/**/*",
      "vendor/genre-police/**/*",
      "native/bin/*",
      "upstream.lock.json",
      "package.json",
      "LICENSE",
      "THIRD_PARTY_NOTICES.md",
      "README.md",
    ],
    asarUnpack: [
      "native/bin/*",
      "vendor/genre-police/assets/models/**/*",
      "node_modules/onnxruntime-node/bin/**/*",
    ],
    win: {
      target: "portable",
      icon: "vendor/genre-police/assets/icon.png",
      artifactName: "Genre-Police-AutoVJ-${version}-portable.exe",
    },
  },
};
if (!fs.existsSync(path.join(BASE, "package.json")))
  fs.writeFileSync(
    path.join(ROOT, "package.json"),
    JSON.stringify(out, null, 2),
  );
for (const script of ["prepare-native.cjs", "prepare-visuals.cjs"])
  execFileSync(process.execPath, [path.join(BASE, "scripts", script)], {
    env: { ...process.env, AUTOVJ_IMPORT_ROOT: ROOT },
    stdio: "inherit",
  });
const changed = [];
for (const [name, s] of Object.entries(lock.sources))
  for (const [rel, hash] of Object.entries(s.files))
    if (oldLock?.sources[name]?.files[rel] !== hash)
      changed.push(name + "/" + rel);
fs.writeFileSync(
  path.join(ROOT, "IMPORT-REVIEW.json"),
  JSON.stringify(
    {
      oldRevisions: Object.fromEntries(
        Object.entries(oldLock?.sources || {}).map(([n, s]) => [n, s.revision]),
      ),
      newRevisions: Object.fromEntries(
        Object.entries(lock.sources).map(([n, s]) => [n, s.revision]),
      ),
      changed,
    },
    null,
    2,
  ),
);
console.log(
  `Staged ${Object.values(lock.sources).reduce((n, s) => n + Object.keys(s.files).length, 0)} files; ${changed.length} changed. Review: ${ROOT}`,
);
if (mode !== "--apply") {
  console.log(
    "Live application unchanged. Use --apply with the same clean source revisions after review.",
  );
  process.exit(0);
}
// All rename targets are verified descendants of this independent workspace.
const checked = (p) => {
  const absolute = path.resolve(p);
  if (!absolute.startsWith(BASE + path.sep))
    throw new Error("Import target escapes the AutoVJ workspace");
  return absolute;
};
const backup = checked(
  path.join(BASE, ".upstream-staging", "rollback-" + Date.now()),
);
fs.mkdirSync(backup, { recursive: true });
const targets = [
  "vendor",
  "upstream.lock.json",
  "renderer/stage.html",
  "renderer/upstream-riff.mjs",
  "renderer/upstream-typography.mjs",
  "renderer/upstream-text-motion.mjs",
  "native/capture.h",
  "native/capture.cpp",
  "native/live-match.h",
];
const applied = [];
try {
  for (const rel of targets) {
    const destination = checked(path.join(BASE, rel)),
      previous = checked(path.join(backup, rel)),
      candidate = checked(path.join(ROOT, rel));
    fs.mkdirSync(path.dirname(previous), { recursive: true });
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const had = fs.existsSync(destination);
    if (had) fs.renameSync(destination, previous);
    applied.push({ destination, previous, had });
    fs.renameSync(candidate, destination);
  }
} catch (error) {
  for (const { destination, previous, had } of applied.reverse()) {
    if (fs.existsSync(destination))
      fs.renameSync(
        destination,
        checked(destination + ".failed-" + Date.now()),
      );
    if (had) fs.renameSync(previous, destination);
  }
  throw error;
}
console.log(
  "Applied pinned sources. Rollback snapshot: " +
    backup +
    "\nRebuild the native host and run verification before using this build at a show. No AI reanalysis is required for visual-only updates.",
);
