"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_RELEASES_URL,
  compareVersions,
  isAllowedReleaseUrl,
  isUpdateCheckDue,
  selectLatestUpdate,
} = require("../packages/update-checker.cjs");

test("AutoVJ update checks compare semantic versions and use its own release page", () => {
  assert.equal(UPDATE_RELEASES_URL, "https://github.com/lbnandy/genre-police-autovj/releases");
  assert.ok(compareVersions("0.10.0", "0.9.9") > 0);
  assert.ok(compareVersions("1.0.0", "1.0.0-beta.4") > 0);
  assert.ok(compareVersions("1.0.0-beta.10", "1.0.0-beta.2") > 0);
});

test("AutoVJ selects the newest valid non-draft GitHub release", () => {
  const result = selectLatestUpdate([
    { tag_name: "v0.1.1", name: "0.1.1", html_url: "https://github.com/lbnandy/genre-police-autovj/releases/tag/v0.1.1" },
    { tag_name: "v0.2.0-beta.2", name: "0.2 beta", prerelease: true, html_url: "https://github.com/lbnandy/genre-police-autovj/releases/tag/v0.2.0-beta.2" },
    { tag_name: "v9.0.0", draft: true, html_url: "https://github.com/lbnandy/genre-police-autovj/releases/tag/v9.0.0" },
    { tag_name: "v10.0.0", html_url: "https://example.com/fake" },
  ], "0.1.0");

  assert.deepEqual(result, {
    version: "v0.2.0-beta.2",
    name: "0.2 beta",
    url: "https://github.com/lbnandy/genre-police-autovj/releases/tag/v0.2.0-beta.2",
    prerelease: true,
  });
});

test("AutoVJ rejects update links outside its HTTPS GitHub releases", () => {
  assert.equal(isAllowedReleaseUrl("https://github.com/lbnandy/genre-police-autovj/releases/tag/v0.1.1"), true);
  assert.equal(isAllowedReleaseUrl("http://github.com/lbnandy/genre-police-autovj/releases"), false);
  assert.equal(isAllowedReleaseUrl("https://github.com/lbnandy/genre-police-visualizer/releases"), false);
  assert.equal(isAllowedReleaseUrl("https://example.com/lbnandy/genre-police-autovj/releases"), false);
});

test("automatic AutoVJ update checks run no more than once per day", () => {
  const now = Date.UTC(2026, 8, 14, 12);
  assert.equal(isUpdateCheckDue(undefined, now), true);
  assert.equal(isUpdateCheckDue(now - UPDATE_CHECK_INTERVAL_MS + 1, now), false);
  assert.equal(isUpdateCheckDue(now - UPDATE_CHECK_INTERVAL_MS, now), true);
  assert.equal(isUpdateCheckDue(now + 60 * 60 * 1000, now), true);
});
