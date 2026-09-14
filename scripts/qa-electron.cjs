"use strict";
// Playwright's Electron API is needed here for the native file-dialog boundary.
// Only the file picker is supplied a synthetic fixture; all production analysis,
// persistence, IPC and rendering code runs unchanged. No production test hooks.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  assert = require("node:assert/strict");
const { _electron } = require(process.env.AUTOVJ_PLAYWRIGHT || "playwright");
const {select} = require("./qa-picker.cjs");
const ROOT = path.resolve(__dirname, ".."),
  OUT = path.join(ROOT, "output/playwright");
(async () => {
  const executable =
    process.argv[2] ||
    path.join(ROOT, "node_modules/electron/dist/electron.exe");
  const packaged = Boolean(process.argv[2]);
  const env = {
    ...process.env,
    AUTOVJ_DATA_DIR: path.join(ROOT, ".qa", "flow-" + crypto.randomUUID()),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const electron = await _electron.launch({
    executablePath: executable,
    args: packaged ? ["--lang=zh-CN"] : [ROOT, "--lang=zh-CN"],
    env,
    timeout: 30000,
  });
  const errors = [];
  try {
    const consolePage =
      electron.windows().find((p) => p.url().includes("console.html")) ||
      (await electron
        .waitForEvent("window", {
          predicate: (p) => p.url().includes("console.html"),
          timeout: 30000,
        })
        .catch(() =>
          electron.windows().find((p) => p.url().includes("console.html")),
        ));
    if (!consolePage) throw new Error("No operator console");
    await consolePage.waitForSelector("#live-toggle");
    for (const p of electron.windows())
      p.on("pageerror", (e) => errors.push(e.message));
    await consolePage.screenshot({
      path: path.join(OUT, packaged ? "packaged-live.png" : "flow-live.png"),
    });
    // Native dialogs are outside the browser. Point just that OS picker to a generated file.
    await electron.evaluate(
      ({ dialog }, fixture) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [fixture],
        });
      },
      path.join(OUT, "audio/alpha.wav"),
    );
    await consolePage
      .getByRole("button", { name: "设置", exact: true })
      .click();
    await consolePage.getByLabel(/^在线查询曲风/).uncheck();
    await consolePage
      .getByRole("button", { name: "准备音乐", exact: true })
      .click();
    await consolePage
      .getByRole("button", { name: "+ 添加音乐", exact: true })
      .click();
    await consolePage
      .getByRole("button", { name: "分析待准备曲目", exact: true })
      .click();
    await consolePage.waitForFunction(
      () => !document.getElementById("job").hidden,
      {},
      { timeout: 10000 },
    );
    await consolePage.waitForFunction(
      () => document.getElementById("job").hidden,
      {},
      { timeout: 120000 },
    );
    let snapshot = await consolePage.evaluate(() =>
      window.autovj.call("state"),
    );
    assert.equal(snapshot.library.tracks.length, 1);
    const track = snapshot.library.tracks[0];
    assert.equal(track.status, "ready");
    assert.equal(track.analysis.errors.length, 0);
    assert.ok(track.analysis.ai.accepted > 10);
    await consolePage
      .getByRole("button", { name: "编辑", exact: true })
      .click();
    await select(consolePage, "edit-genre", "techno");
    await consolePage
      .getByRole("button", { name: "保存选择", exact: true })
      .click();
    await consolePage
      .getByRole("button", { name: "编辑", exact: true })
      .click();
    await consolePage
      .getByRole("button", { name: "预览视觉", exact: true })
      .click();
    const stage = electron
      .windows()
      .find((p) => p.url().includes("stage.html"));
    await stage.waitForFunction(() => document.body.dataset.genre === "techno");
    await stage.screenshot({
      path: path.join(
        OUT,
        packaged ? "packaged-techno.png" : "flow-techno.png",
      ),
    });
    await consolePage.getByRole("button", { name: /^切黑/ }).click();
    await stage.waitForFunction(() =>
      document.body.classList.contains("blackout"),
    );
    await stage.waitForTimeout(220);
    const black = await stage.screenshot();
    assert.ok(black.length < 50000, "Blackout should be a simple black frame");
    await consolePage.getByRole("button", { name: /^恢复画面/ }).click();
    await consolePage
      .getByRole("button", { name: "设置", exact: true })
      .click();
    await consolePage
      .getByRole("button", { name: "+ 创建预设", exact: true })
      .click();
    await consolePage.locator("#preset-name").fill("QA Afterhours");
    await consolePage
      .getByRole("button", { name: "保存预设", exact: true })
      .click();
    await select(consolePage, "language", "en");
    await consolePage
      .getByRole("button", { name: "Live", exact: true })
      .click();
    await select(consolePage, "lock-theme", "classical");
    await stage.waitForFunction(
      () => document.body.dataset.genre === "classical",
    );
    await stage.waitForTimeout(1000);
    await stage.screenshot({
      path: path.join(
        OUT,
        packaged ? "packaged-classical.png" : "flow-classical.png",
      ),
    });
    await select(consolePage, "lock-theme", "kawaii-bass");
    await stage.waitForFunction(
      () => document.body.dataset.genre === "kawaii-bass",
    );
    await stage.waitForTimeout(1000);
    await stage.screenshot({
      path: path.join(
        OUT,
        packaged ? "packaged-kawaii.png" : "flow-kawaii.png",
      ),
    });
    await consolePage
      .getByRole("button", { name: "Prepare", exact: true })
      .click();
    await consolePage.screenshot({
      path: path.join(
        OUT,
        packaged ? "packaged-library.png" : "flow-library.png",
      ),
    });
    const exportRoot = path.join(OUT, "ui-export-" + crypto.randomUUID());
    fs.mkdirSync(exportRoot, { recursive: true });
    await electron.evaluate(({ dialog, shell }, folder) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [folder],
      });
      shell.showItemInFolder = () => {};
    }, exportRoot);
    await consolePage.getByRole("button", { name: /^Export pack/ }).click();
    await consolePage.waitForFunction(
      () =>
        document
          .getElementById("toast")
          .textContent.includes("Library exported"),
      {},
      { timeout: 30000 },
    );
    const pack = path.join(exportRoot, fs.readdirSync(exportRoot)[0]);
    await electron.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [folder],
      });
    }, pack);
    await consolePage
      .getByRole("button", { name: "Import pack", exact: true })
      .click();
    await consolePage.waitForFunction(
      (id) => window.autovj.call("state").then((s) => s.library.id !== id),
      snapshot.library.id,
      { timeout: 10000 },
    );
    snapshot = await consolePage.evaluate(() => window.autovj.call("state"));
    assert.equal(snapshot.library.tracks[0].id, track.id);
    assert.equal(snapshot.library.tracks[0].manualGenre, "techno");
    assert.ok(snapshot.library.themes.some((t) => t.label === "QA Afterhours"));
    assert.equal(snapshot.error, "");
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(OUT, packaged ? "packaged-report.json" : "flow-report.json"),
      JSON.stringify(
        {
          passed: true,
          packaged,
          trackId: track.id,
          aiWindows: track.analysis.ai.accepted,
          libraryImported: true,
          manualChoiceRetained: true,
          presetRetained: true,
          errors,
        },
        null,
        2,
      ),
    );
    console.log("Electron flow passed:", packaged ? "packaged" : "source");
  } finally {
    await electron.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
