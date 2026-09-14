"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict"), { EventEmitter } = require("node:events");
const { createOutputController } = require("../packages/output-window.cjs");
class Window extends EventEmitter {
  full = false; visible = false; minimized = false; transitioning = false; log = [];
  isDestroyed() { return false; }
  isFullScreen() { return this.full; }
  isMinimized() { return this.minimized; }
  restore() { this.minimized = false; this.log.push("restore"); }
  setFullScreen(value) {
    assert.equal(this.transitioning, false, "Native transitions must never overlap");
    this.transitioning = true;
    this.log.push("begin:" + value);
    setImmediate(() => { this.full = value; this.transitioning = false; this.log.push("end:" + value); this.emit(value ? "enter-full-screen" : "leave-full-screen"); });
  }
  setBounds(bounds) { assert.equal(this.transitioning, false); this.bounds = bounds; }
  show() { assert.equal(this.transitioning, false); this.visible = true; }
  hide() { assert.equal(this.transitioning, false); assert.equal(this.full, false); this.visible = false; this.log.push("hide"); }
}
test("fullscreen, hide and rapid re-show finish native transitions in order", async () => {
  const win = new Window(); let resumes = 0;
  const output = createOutputController({getWindow: () => win, getDisplay: () => ({bounds: {x:0,y:0,width:2560,height:1440}, workArea: {x:0,y:0,width:2560,height:1400}}), onShown: () => resumes++, onChanged: () => {}});
  await Promise.all([output("fullscreen"), output("hide"), output("fullscreen"), output("hide")]);
  assert.equal(win.visible, false); assert.equal(win.full, false); assert.equal(resumes, 2);
  assert.deepEqual(win.log, ["begin:true", "end:true", "begin:false", "end:false", "hide", "begin:true", "end:true", "begin:false", "end:false", "hide"]);
  win.minimized = true;
  await output("window");
  assert.equal(win.minimized, false); assert.equal(win.visible, true);
  assert.equal(win.bounds.width, 1100);
  await assert.rejects(output("unknown"), /Unknown output mode/);
});
