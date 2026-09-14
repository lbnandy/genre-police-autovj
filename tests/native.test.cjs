"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const { LiveHost } = require("../packages/native-host.cjs");
const exe = path.resolve(__dirname, "../native/bin/autovj-recognizer.exe");
test(
  "missing endpoint never captures another device; crashed native host restarts",
  { skip: process.platform !== "win32" || !fs.existsSync(exe), timeout: 20000 },
  async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "autovj-native-"));
    const host = new LiveHost(exe);
    let frames = 0;
    host.on("pcm", () => frames++);
    const wait = (predicate) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          host.off("status", listener);
          reject(new Error("Native status timeout"));
        }, 8000);
        const listener = (e) => {
          if (predicate(e)) {
            clearTimeout(timer);
            host.off("status", listener);
            resolve(e);
          }
        };
        host.on("status", listener);
      });
    t.after(async () => {
      await host.stop();
      const absolute = fs.realpathSync(root);
      assert.ok(absolute.startsWith(fs.realpathSync(os.tmpdir()) + path.sep));
      fs.rmSync(absolute, { recursive: true, force: true });
    });
    const lost = wait((e) => e.type === "device" && e.lost);
    await host.start(
      path.join(root, "fingerprints.db"),
      "{AUTOVJ-MISSING-ENDPOINT}",
      0,
    );
    await lost;
    assert.equal(frames, 0);
    const ready = wait((e) => e.type === "ready");
    host.child.kill();
    await ready;
    assert.equal(host.wanted, true);
    assert.equal(frames, 0);
    await host.stop();
    assert.equal(host.child, null);
    assert.equal(host.server, null);
  },
);
