"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), assert = require("node:assert/strict");
const { _electron } = require(process.env.AUTOVJ_PLAYWRIGHT || "playwright");
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "output", "playwright", "genre-update");

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const env = { ...process.env, AUTOVJ_DATA_DIR: path.join(ROOT, ".qa", "genre-update-" + crypto.randomUUID()) };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({
    executablePath: path.join(ROOT, "node_modules/electron/dist/electron.exe"),
    args: [ROOT, "--lang=zh-CN"],
    env,
  });
  const errors = [];
  try {
    const page = app.windows().find(window => window.url().includes("console.html")) ||
      await app.waitForEvent("window", { predicate: window => window.url().includes("console.html") });
    page.on("pageerror", error => errors.push(error.message));
    await page.waitForSelector("#lock-theme-button");
    await page.locator("#lock-theme-button").click();
    const genreSearch = page.locator("#lock-theme-button");
    await genreSearch.waitFor({ state: "visible" });
    assert.equal(await genreSearch.getAttribute("placeholder"), "输入或选择曲风");
    await page.locator("#lock-theme-menu").waitFor({ state: "visible" });

    const options = page.locator("#lock-theme-options [role=option]");
    const entries = await options.evaluateAll(nodes => nodes.map(node => ({
      label: node.querySelector("span")?.textContent || "",
      parent: node.querySelector("small")?.textContent || "",
    })));
    assert.equal(entries[0].label, "自动跟随曲风");
    const labels = entries.slice(1).map(entry => entry.label);
    const sorted = [...labels].sort((a, b) => new Intl.Collator("en", { sensitivity: "base", numeric: true }).compare(a, b));
    assert.deepEqual(labels, sorted, "Genre results should be sorted A-Z");
    assert.ok(entries.slice(1).some(entry => entry.parent), "Genre results should include a parent category");
    await page.screenshot({ path: path.join(OUT, "genre-picker.png") });

    await genreSearch.fill("drum bass");
    const visible = options.locator(":visible");
    assert.ok(await visible.count() > 0);
    assert.ok((await visible.allTextContents()).some(text => /DRUM\s*&\s*BASS/i.test(text)));
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    assert.notEqual(await page.locator("#lock-theme").inputValue(), "");

    await page.locator("[data-tab=settings]").click();
    const state = await page.evaluate(() => window.autovj.call("state"));
    state.update = {
      status: "available",
      currentVersion: "v0.1.0",
      latestVersion: "v0.1.1",
      releaseName: "Genre Police AutoVJ v0.1.1",
      releaseUrl: "https://github.com/lbnandy/genre-police-autovj/releases/tag/v0.1.1",
      dismissed: false,
    };
    await app.evaluate(({ BrowserWindow }, next) => {
      BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes("console.html"))
        .webContents.send("autovj:state", next);
    }, state);
    await page.locator("#update-notice").waitFor({ state: "visible" });
    assert.equal(await page.locator("#update-view-button").isVisible(), true);
    assert.ok((await page.locator("#update-state").innerText()).includes("v0.1.1"));
    await page.screenshot({ path: path.join(OUT, "update-notice.png") });
    assert.deepEqual(errors, []);
    console.log("Genre picker and update UI QA passed.");
  } finally {
    await app.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
