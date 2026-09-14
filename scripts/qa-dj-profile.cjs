"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), assert = require("node:assert/strict");
const { _electron } = require(process.env.AUTOVJ_PLAYWRIGHT || "playwright");
const { Library, atomicJson } = require("../packages/library.cjs");
const { select } = require("./qa-picker.cjs");
const ROOT = path.resolve(__dirname, ".."), OUT = path.join(ROOT, "output/playwright/dj-profile");
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const data = path.join(ROOT, ".qa", "dj-profile-" + crypto.randomUUID()), id = crypto.randomUUID(), trackId = crypto.randomUUID();
  const library = new Library(path.join(data, "libraries", id));
  library.upsert({ id: trackId, title: "Night Drive", artist: "Test Artist", status: "ready", manualGenre: "techno" });
  atomicJson(path.join(data, "app.json"), { activeLibrary: id, language: "zh" });
  const env = { ...process.env, AUTOVJ_DATA_DIR: data }; delete env.ELECTRON_RUN_AS_NODE;
  const launch = () => _electron.launch({ executablePath: path.join(ROOT, "node_modules/electron/dist/electron.exe"), args: [ROOT], env });
  let app = await launch();
  const errors = [], layouts = [];
  try {
    let p = app.windows().find(w => w.url().includes("console.html")) || await app.waitForEvent("window", { predicate: w => w.url().includes("console.html") });
    await p.waitForSelector("#show-dj-name", {state:"attached"});
    const stage = app.windows().find(w => w.url().includes("stage.html"));
    for (const w of [p, stage]) w.on("pageerror", e => errors.push(e.message));
    await p.locator("[data-tab=library]").click();
    console.log(await p.locator(".library-bar").ariaSnapshot());
    await p.locator("#dj-name").fill("DJ ICHIRYU");
    await p.locator("#dj-name").press("Tab");
    await p.waitForFunction(async () => (await window.autovj.call("state")).library.djName === "DJ ICHIRYU");
    await p.screenshot({ path: path.join(OUT, "library.png") });
    await p.locator("[data-tab=settings]").click();
    await p.locator("#show-dj-name").check();
    await stage.waitForFunction(() => document.querySelector("#genre-face").textContent === "DJ ICHIRYU");
    await p.evaluate(() => window.autovj.call("settings", { standbyTheme: "synthwave" }));
    await stage.waitForFunction(() => document.body.dataset.genre === "synthwave");
    assert.equal(await stage.locator("body").getAttribute("data-neutral-standby"), "false");
    await p.evaluate(id => window.autovj.call("preview-track", id), trackId);
    await stage.waitForFunction(() => document.body.dataset.genre === "techno");
    assert.equal(await stage.locator("#genre-face").textContent(), "DJ ICHIRYU");
    assert.equal(await stage.locator("#genre").getAttribute("data-text"), "DJ ICHIRYU");
    assert.equal(await stage.locator("#title").textContent(), "Night Drive");
    assert.equal(await stage.locator("#artist").textContent(), "Test Artist");
    const themeFont = await stage.evaluate(() => document.documentElement.style.getPropertyValue("--genre-font"));
    await p.locator("#show-dj-name").uncheck();
    await stage.waitForFunction(() => document.body.dataset.headingKind === "genre");
    assert.equal(await stage.locator("#genre-face").textContent(), "TECHNO");
    assert.equal(await stage.evaluate(() => document.documentElement.style.getPropertyValue("--genre-font")), themeFont);
    await p.locator("#show-dj-name").check();
    await p.locator("#text-visible").uncheck();
    await stage.waitForFunction(() => document.body.dataset.stageOutputText === "false");
    assert.equal(await stage.locator("#hud").isVisible(), false);
    await p.locator("#text-visible").check();
    await stage.waitForFunction(() => document.body.dataset.stageOutputText === "true");
    await p.evaluate(() => window.autovj.call("library-profile", { djName: "W".repeat(64) }));
    await stage.waitForFunction(() => document.querySelector("#genre-face").textContent.length === 64);
    await stage.waitForFunction(() => document.querySelector("#genre-face").scrollWidth <= document.querySelector("#genre").clientWidth + 2);
    await p.evaluate(() => window.autovj.call("output", "window"));
    // Confirm the dynamic heading fits long and mixed-script names, even on a portrait output.
    for (const name of ["DJ iChiryu", "DJ 夜空の音楽", "DJ 서울", "W".repeat(64)]) {
      await p.evaluate(djName => window.autovj.call("library-profile", { djName }), name);
      await stage.waitForFunction(name => document.querySelector("#genre-face").textContent === name, name);
      for (const layout of ["split", "stacked"]) {
        await select(p, "layout", layout);
        for (const [width, height] of [[1920, 1080], [1080, 1920]]) {
          await stage.setViewportSize({ width, height });
          await stage.waitForTimeout(180);
          await stage.evaluate(() => document.fonts.ready);
          const measure = await stage.evaluate(() => {
            const g = document.querySelector("#genre"), f = document.querySelector("#genre-face");
            return { text: f.textContent, available: g.clientWidth, inkWidth: f.scrollWidth, lang: g.lang, font: getComputedStyle(g).fontFamily, size: getComputedStyle(g).fontSize, faceSize: getComputedStyle(f).fontSize, style: g.getAttribute("style"), hidden: document.hidden };
          });
          assert.ok(measure.inkWidth <= measure.available + 2, JSON.stringify({ layout, width, height, ...measure }));
          if (name.includes("の")) assert.equal(measure.lang, "ja");
          if (name.includes("서울")) assert.equal(measure.lang, "ko");
          layouts.push({ layout, width, height, ...measure });
        }
      }
    }
    await p.evaluate(() => window.autovj.call("library-profile", { djName: "DJ ICHIRYU" }));
    await stage.setViewportSize({ width: 1920, height: 1080 });
    await stage.waitForTimeout(350);
    await stage.screenshot({ path: path.join(OUT, "dj-heading.png") });
    await p.locator("[data-tab=live]").click();
    await p.screenshot({ path: path.join(OUT, "live.png") });
    await p.evaluate(() => window.autovj.call("library-profile", { djName: "" }));
    await stage.waitForFunction(() => document.querySelector("#genre-face").textContent === "TECHNO");
    await p.evaluate(() => window.autovj.call("new-library", "Other DJ"));
    await p.waitForFunction(id => window.autovj.call("state").then(s => s.library.id !== id), id);
    const second = await p.evaluate(() => window.autovj.call("state"));
    assert.equal(second.library.djName, "");
    await p.evaluate(() => window.autovj.call("settings", { showDjName: true }));
    await stage.waitForFunction(() => document.querySelector("#genre-face").textContent === "STANDBY");
    await p.evaluate(() => window.autovj.call("library-profile", { djName: "DJ SECOND" }));
    await stage.waitForFunction(() => document.querySelector("#genre-face").textContent === "DJ SECOND");
    await p.evaluate(id => window.autovj.call("library", id), id);
    await p.evaluate(() => window.autovj.call("library-profile", { djName: "DJ ICHIRYU" }));
    // Check controls in all four UI languages and compact/large console widths.
    for (const language of ["zh", "en", "ja", "ko"]) {
      await p.evaluate(language => window.autovj.call("settings", { language }), language);
      await p.waitForFunction(language => document.documentElement.lang === (language === "zh" ? "zh-CN" : language), language);
      for (const [width, height] of [[1000, 720], [1920, 1080], [2560, 1440]]) {
        await p.setViewportSize({ width, height });
        for (const tab of ["live", "library", "settings"]) {
          await p.locator(`[data-tab=${tab}]`).click();
          await p.waitForTimeout(80);
          assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${language} ${width} ${tab} overflows`);
        }
      }
    }
    await p.evaluate(() => window.autovj.call("settings", { language: "zh" }));
    await p.setViewportSize({ width: 1440, height: 900 });
    await p.waitForFunction(() => document.documentElement.lang === "zh-CN");
    const logo = p.locator(".credit-logo img");
    assert.ok(await logo.evaluate(el => el.complete && el.naturalWidth === 4096));
    assert.ok((await p.locator(".recognition-credit").textContent()).includes("Audio recognition by DJ ICHIRYU"));
    await p.screenshot({ path: path.join(OUT, "settings.png") });
    await p.locator(".about-card").screenshot({ path: path.join(OUT, "credit.png") });
    assert.deepEqual(errors, []);
    await app.close(); app = await launch();
    p = app.windows().find(w => w.url().includes("console.html")) || await app.waitForEvent("window", { predicate: w => w.url().includes("console.html") });
    await p.waitForSelector("#show-dj-name", {state:"attached"});
    const state = await p.evaluate(() => window.autovj.call("state"));
    assert.equal(state.library.djName, "DJ ICHIRYU");
    assert.equal(state.settings.showDjName, true);
    assert.equal(state.version, "0.1.0");
    assert.equal(fs.existsSync(path.join(data, "network-country.json")), false, "Opening the app, previewing and editing should not perform a network probe");
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ version: state.version, errors, layouts, consoleChecks: 36, persistedDjName: state.library.djName }, null, 2));
    console.log(JSON.stringify({ output: OUT, stageLayouts: layouts.length, consoleChecks: 36, persistence: "passed", errors }));
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
