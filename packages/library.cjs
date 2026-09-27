"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { THEMES } = require("../vendor/genre-police/src/themes");
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function normalizeDjName(value) {
  return typeof value === "string"
    ? Array.from(value.replace(/[\u0000-\u001f\u007f]/g, " ").trim()).slice(0, 64).join("")
    : "";
}
function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + ".partial";
  fs.writeFileSync(temp, JSON.stringify(value, null, 2));
  fs.renameSync(temp, file);
}
function inside(root, relative) {
  if (typeof relative !== "string" || path.isAbsolute(relative))
    throw new Error("Invalid relative path");
  const file = path.resolve(root, relative);
  if (!file.startsWith(path.resolve(root) + path.sep))
    throw new Error("Path outside library");
  return file;
}
const defaults = {
  online: true,
  localAI: true,
  deviceId: "",
  channelStart: 0,
  brightness: 1,
  intensity: "standard",
  visualSize: "large",
  textVisible: true,
  showDjName: false,
  headingMode: "genre",
  trackInfoVisible: true,
  artworkVisible: true,
  brandingVisible: true,
  fullscreenCondensed: false,
  fullscreenLayout: "split",
  displayId: null,
  language: "system",
  beatStrength: "dynamic",
  impactMode: "beat",
  standbyTheme: "neutral",
  impactLevel: "medium",
  screenImpact: false,
  renderScale: "auto",
  frameRateLimit: "60",
  idleFrameLimit: true,
  showFps: false,
};
class Library {
  constructor(root) {
    this.root = root;
    this.file = path.join(root, "library.json");
    fs.mkdirSync(root, { recursive: true });
    for (const dir of ["covers", "analysis", "cache", "temp"])
      fs.mkdirSync(path.join(root, dir), { recursive: true });
    this.data = fs.existsSync(this.file)
      ? JSON.parse(fs.readFileSync(this.file, "utf8"))
      : {
          format: "genre-police-autovj",
          version: 1,
          libraryId: UUID.test(path.basename(root))
            ? path.basename(root)
            : crypto.randomUUID(),
          tracks: [],
          presets: [],
          settings: { ...defaults },
        };
    if (
      this.data.format !== "genre-police-autovj" ||
      this.data.version !== 1 ||
      !Array.isArray(this.data.tracks)
    )
      throw new Error("Unsupported library format; existing data retained");
    const previousSettings = this.data.settings || {};
    this.data.settings = { ...defaults, ...previousSettings };
    if (!["low", "medium", "high", "extreme", "ultra"].includes(previousSettings.impactLevel)) {
      this.data.settings.impactLevel = typeof previousSettings.flashEnabled === "boolean"
        ? (previousSettings.flashEnabled ? "medium" : "low") : defaults.impactLevel;
    }
    delete this.data.settings.flashEnabled;
    if (!["standard", "large", "maximum"].includes(this.data.settings.visualSize)) this.data.settings.visualSize = defaults.visualSize;
    delete this.data.settings.rhythmModel;
    if (!previousSettings.headingMode && previousSettings.showDjName) this.data.settings.headingMode = "dj";
    this.data.customArtwork = require("./dj-logo.cjs").validateLogo(this.data.customArtwork);
    this.data.djLogo = require("./dj-logo.cjs").validateLogo(this.data.djLogo);
    this.data.djLogoScale = require("./dj-logo.cjs").logoScale(this.data.djLogoScale);
    this.data.djName = normalizeDjName(this.data.djName);
    for (const track of this.data.tracks)
      if (!UUID.test(track.id)) throw new Error("Invalid track identity");
    this.save();
  }
  get db() {
    return path.join(this.root, "fingerprints.db");
  }
  save() {
    this.revision = (this.revision || 0) + 1;
    atomicJson(this.file, this.data);
  }
  setDjName(value) {
    this.data.djName = normalizeDjName(value);
    this.save();
  }
  track(id) {
    return this.data.tracks.find((t) => t.id === id);
  }
  upsert(track) {
    if (!UUID.test(track.id)) throw new Error("Invalid track ID");
    const old = this.track(track.id);
    if (old)
      Object.assign(old, track, {
        manualGenre: old.manualGenre || null,
        manualVisual: old.manualVisual || null,
      });
    else this.data.tracks.push(track);
    this.save();
    return old || track;
  }
  theme(id) {
    const preset = this.data.presets.find((p) => p.id === id);
    return preset
      ? {
          ...THEMES[preset.base],
          ...preset.colors,
          id: preset.id,
          label: preset.name,
          baseId: preset.base,
        }
      : THEMES[id]
        ? { ...THEMES[id], id }
        : null;
  }
  patch(id, changes) {
    const t = this.track(id);
    if (!t) throw new Error("Track no longer exists");
    for (const k of ["manualGenre", "manualVisual"])
      if (k in changes) {
        const v = changes[k];
        if (v !== null && !this.theme(v))
          throw new Error("Unknown genre or preset");
        t[k] = v;
      }
    if ("confirmed" in changes) t.confirmed = Boolean(changes.confirmed);
    this.save();
    return t;
  }
  addPreset(input) {
    const base = String(input.base || "");
    if (!THEMES[base]) throw new Error("Choose a base visual");
    const name = String(input.name || "")
      .trim()
      .slice(0, 50);
    if (!name) throw new Error("A name is required");
    const colors = {};
    for (const key of ["accent", "accent2", "hot"]) {
      if (!/^#[0-9a-f]{6}$/i.test(input[key])) throw new Error("Invalid color");
      colors[key] = input[key];
    }
    const p = { id: "custom-" + crypto.randomUUID(), name, base, colors };
    this.data.presets.push(p);
    this.save();
    return p;
  }
  genre(t) {
    return t?.manualGenre || t?.suggestion?.id || "unknown";
  }
  visual(t) {
    return t?.manualVisual || this.genre(t);
  }
  cover(t) {
    if (!t?.cover || !UUID.test(t.id)) return "";
    try {
      const f = inside(this.root, t.cover);
      const real = fs.realpathSync(f);
      if (!real.startsWith(fs.realpathSync(this.root) + path.sep)) return "";
      const b = fs.readFileSync(real);
      if (b.length > 8 * 1024 * 1024) return "";
      return `data:${t.cover.endsWith(".png") ? "image/png" : "image/jpeg"};base64,${b.toString("base64")}`;
    } catch {
      return "";
    }
  }
  publicTrack(t, cover = false) {
    return t
      ? {
          ...t,
          filePath: undefined,
          fileHash: undefined,
          genreId: this.genre(t),
          visualId: this.visual(t),
          ...(cover ? { artwork: this.cover(t) } : {}),
        }
      : null;
  }
  themes() {
    return [
      ...Object.entries(THEMES)
        .filter(([id]) => !["unknown", "asmr", "bilibili"].includes(id))
        .map(([id, t]) => ({
          id,
          label: t.label,
          family: t.family,
          parent: t.parent || t.family,
          accent: t.accent,
        })),
      ...this.data.presets.map((p) => ({
        id: p.id,
        label: p.name,
        family: "custom",
        parent: "CUSTOM",
        accent: p.colors.accent,
      })),
    ];
  }
}
module.exports = { Library, atomicJson, inside, UUID, defaults, normalizeDjName };
