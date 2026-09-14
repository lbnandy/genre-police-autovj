"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  assert = require("node:assert/strict");
const { _electron } = require(process.env.AUTOVJ_PLAYWRIGHT || "playwright");
const { Library, atomicJson } = require("../packages/library.cjs");
const ROOT = path.resolve(__dirname, ".."),
  OUT = path.join(ROOT, "output/playwright");
(async () => {
  const env = {
    ...process.env,
    AUTOVJ_DATA_DIR: path.join(ROOT, ".qa", "layouts-" + crypto.randomUUID()),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const id = crypto.randomUUID(),
    trackId = crypto.randomUUID(),
    lib = new Library(path.join(env.AUTOVJ_DATA_DIR, "libraries", id));
  lib.upsert({
    id: trackId,
    title:
      "A very long track title · 夜空を駆ける音楽と光の世界 · Extended Mix",
    artist: "Genre Police AutoVJ — generated layout fixture",
    manualGenre: "uptempo-hardcore",
    status: "ready",
  });
  atomicJson(path.join(env.AUTOVJ_DATA_DIR, "app.json"), { activeLibrary: id });
  const electron = await _electron.launch({
    executablePath:
      process.argv[2] ||
      path.join(ROOT, "node_modules/electron/dist/electron.exe"),
    args: process.argv[2] ? [] : [ROOT],
    env,
  });
  const prefix = process.argv[2] ? "packaged-layout" : "layout";
  const errors = [],
    report = [];
  try {
    let consolePage = electron
      .windows()
      .find((p) => p.url().includes("console.html"));
    if (!consolePage)
      consolePage = await electron.waitForEvent("window", {
        predicate: (p) => p.url().includes("console.html"),
      });
    await consolePage.waitForSelector("#live-toggle");
    const stage = electron
      .windows()
      .find((p) => p.url().includes("stage.html"));
    stage.on("pageerror", (e) => errors.push(e.message));
    await consolePage.evaluate(
      (id) => window.autovj.call("preview-track", id),
      trackId,
    );
    for (const layout of ["split", "stacked"]) {
      await consolePage
        .getByLabel("布局", { exact: true })
        .selectOption(layout);
      await stage.waitForFunction(
        (layout) => document.body.dataset.fullscreenLayout === layout,
        layout,
      );
      await stage.waitForTimeout(1300);
      const measured = await stage.evaluate(() => {
        const rect = (id) => {
          const r = document.getElementById(id).getBoundingClientRect();
          return {
            x: r.x,
            y: r.y,
            w: r.width,
            h: r.height,
            right: r.right,
            bottom: r.bottom,
          };
        };
        return {
          genre: rect("genre-face"),
          title: rect("title"),
          artist: rect("artist"),
          hud: rect("hud"),
          width: innerWidth,
          height: innerHeight,
          text: document.body.dataset.stageOutputText,
          titleScrolling: document
            .getElementById("title")
            .classList.contains("is-overflowing"),
        };
      });
      assert.equal(measured.text, "true");
      for (const key of ["genre", "title", "artist"]) {
        const r = measured[key];
        assert.ok(
          r.x >= 0 &&
            r.y >= 0 &&
            r.right <= measured.width + 1 &&
            r.bottom <= measured.height + 1,
          `${layout}: ${key} clipped: ${JSON.stringify(measured)}`,
        );
      }
      assert.ok(measured.titleScrolling, "Long track name should scroll");
      report.push({ layout, ...measured });
      await stage.screenshot({
        path: path.join(OUT, `${prefix}-${layout}.png`),
      });
    }
    await consolePage.getByLabel("显示文字", { exact: true }).uncheck();
    await stage.waitForFunction(
      () => document.body.dataset.stageOutputText === "false",
    );
    const hidden = await stage.locator("#hud").isVisible();
    assert.equal(hidden, false);
    await stage.screenshot({
      path: path.join(OUT, `${prefix}-text-hidden.png`),
    });
    await consolePage.getByLabel("显示文字", { exact: true }).check();
    await stage.waitForFunction(
      () => document.body.dataset.stageOutputText === "true",
    );
    assert.equal(await stage.locator("#hud").isVisible(), true);
    // Exercise the actual output-window path and Esc, without selecting a remote display.
    await consolePage
      .getByRole("button", { name: "窗口预览", exact: true })
      .click();
    await stage.waitForTimeout(300);
    await stage.keyboard.press("Escape");
    await consolePage.waitForFunction(() =>
      window.autovj.call("state").then((s) => !s.outputVisible),
    );
    const state = await consolePage.evaluate(() => window.autovj.call("state"));
    assert.equal(state.settings.fullscreenLayout, "stacked");
    assert.equal(state.settings.textVisible, true);
    assert.equal(state.error, "");
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(OUT, `${prefix}-report.json`),
      JSON.stringify({ passed: true, errors, report }, null, 2),
    );
    console.log(
      "Text, original typography, layout choices, long-title scrolling and output toggle passed.",
    );
  } finally {
    await electron.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
