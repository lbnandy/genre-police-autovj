"use strict";
// Exercise real native fullscreen/hide cycles and read the resulting rendered
// frames. All data is isolated from the user's live library.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), assert = require("node:assert/strict");
const { _electron } = require(process.env.AUTOVJ_PLAYWRIGHT || "playwright");
const ROOT = path.resolve(__dirname, ".."), OUT = path.join(ROOT, "output/playwright/output-cycle");
(async () => {
  fs.mkdirSync(OUT, {recursive: true});
  const env = {...process.env, AUTOVJ_DATA_DIR: path.join(ROOT, ".qa", "output-" + crypto.randomUUID())};
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({executablePath: path.join(ROOT, "node_modules/electron/dist/electron.exe"), args: [ROOT], env});
  const results = [], errors = [];
  try {
    const p = app.windows().find(w => w.url().includes("console.html")) || await app.waitForEvent("window", {predicate: w => w.url().includes("console.html")});
    await p.waitForSelector("#live-toggle");
    const stage = app.windows().find(w => w.url().includes("output.html"));
    for (const w of app.windows()) w.on("pageerror", e => errors.push(e.message));
    await p.evaluate(() => window.autovj.call("settings", {showFps: true, idleFrameLimit: false, brightness: 1}));
    await p.evaluate(() => { window.outputRates = []; window.autovj.onPerformance(s => window.outputRates.push(s.fps)); });
    const displays = await p.evaluate(() => window.autovj.call("state").then(s => s.displays));
    for (const display of displays) {
      await p.evaluate(displayId => window.autovj.call("settings", {displayId}), display.id);
      for (let cycle = 0; cycle < 4; cycle++) {
        await p.evaluate(() => { window.outputRates = []; return window.autovj.call("output", "fullscreen"); });
        await p.waitForFunction(() => window.outputRates.some(f => f > 20), null, {timeout: 8000});
        const state = await app.evaluate(async ({BrowserWindow}) => {
          const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes("output.html"));
          const image = (await w.webContents.capturePage()).resize({width: 320});
          const bitmap = image.toBitmap(); let bright = 0;
          for (let i = 0; i < bitmap.length; i += 4) if (Math.max(bitmap[i], bitmap[i+1], bitmap[i+2]) > 80) bright++;
          return {visible: w.isVisible(), fullscreen: w.isFullScreen(), minimized: w.isMinimized(), bounds: w.getBounds(), brightPixels: bright, image: image.toPNG().toString("base64")};
        });
        fs.writeFileSync(path.join(OUT, `${display.id}-${cycle}.png`), Buffer.from(state.image, "base64")); delete state.image;
        state.rates = await p.evaluate(() => window.outputRates.slice(-2));
        results.push({display: display.id, cycle, ...state});
        assert.ok(state.visible && state.fullscreen && !state.minimized, JSON.stringify(state));
        assert.ok(state.brightPixels > 40, "Blank output: " + JSON.stringify(state));
        assert.ok(state.rates.some(f => f > 20), "No rendered frames after show: " + JSON.stringify(state));
        await p.evaluate(() => window.autovj.call("output", "hide"));
        await p.waitForTimeout(cycle % 2 ? 30 : 350);
        const hidden = await app.evaluate(({BrowserWindow}) => {
          const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes("output.html"));
          return {visible: w.isVisible(), fullscreen: w.isFullScreen()};
        });
        results.push({hidden});
        assert.equal(hidden.visible, false);
        if (!process.argv.includes("--before")) assert.equal(hidden.fullscreen, false, "Hidden output must finish leaving fullscreen");
      }
      await p.evaluate(() => Promise.all(["fullscreen", "hide", "fullscreen", "window", "hide"].map(mode => window.autovj.call("output", mode))));
      assert.equal(await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes("output.html")).isVisible()), false);
    }
    for (const route of ["escape", "close"]) {
      await p.evaluate(() => window.autovj.call("output", "fullscreen"));
      if (route === "escape") await stage.keyboard.press("Escape");
      else await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes("output.html")).close());
      await p.waitForFunction(() => window.autovj.call("state").then(s => !s.outputVisible));
      assert.equal(await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes("output.html")).isFullScreen()), false);
    }
    await p.evaluate(() => window.autovj.call("blackout", true));
    await p.evaluate(() => window.autovj.call("output", "fullscreen"));
    await p.evaluate(() => window.autovj.call("output", "hide"));
    await p.evaluate(() => window.autovj.call("output", "fullscreen"));
    await stage.waitForFunction(() => document.body.classList.contains("blackout"));
    assert.equal((await p.evaluate(() => window.autovj.call("state"))).live.blackout, true, "Reopening must not override intentional blackout");
    await p.evaluate(() => window.autovj.call("blackout", false));
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({passed: true, cycles: results.length / 2, errors}));
  } finally {
    fs.writeFileSync(path.join(OUT, process.argv.includes("--before") ? "before.json" : "report.json"), JSON.stringify({results, errors}, null, 2));
    await app.close();
  }
})().catch(e => {console.error(e); process.exitCode = 1;});
