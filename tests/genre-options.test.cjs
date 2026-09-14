"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Library } = require("../packages/library.cjs");

test("genre options keep the automatic choice first and sort labels A-Z", async () => {
  const { sortGenreOptions } = await import("../renderer/genre-options.mjs");
  const options = [
    { value: "techno", label: "Techno" },
    { value: "", label: "Follow automatically", pinned: true },
    { value: "acid-house", label: "Acid House" },
    { value: "drum-bass", label: "Drum & Bass" },
  ];

  assert.deepEqual(sortGenreOptions(options), [
    { value: "", label: "Follow automatically", pinned: true },
    { value: "acid-house", label: "Acid House" },
    { value: "drum-bass", label: "Drum & Bass" },
    { value: "techno", label: "Techno" },
  ]);
});

test("genre search ignores case, punctuation and surrounding spaces", async () => {
  const { matchesGenreQuery } = await import("../renderer/genre-options.mjs");

  assert.equal(matchesGenreQuery("Drum & Bass", " drum bass "), true);
  assert.equal(matchesGenreQuery("J-Pop", "j pop"), true);
  assert.equal(matchesGenreQuery("Hard Techno", "TECH"), true);
  assert.equal(matchesGenreQuery("Ambient", "house"), false);
});

test("visual choices expose the parent genre shown beside each result", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "autovj-options-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const themes = new Library(path.join(root, "library")).themes();

  assert.equal(themes.find((theme) => theme.id === "acid-house").parent, "HOUSE");
});
