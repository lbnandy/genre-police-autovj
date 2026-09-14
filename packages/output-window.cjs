"use strict";

function fullscreen(win, enabled) {
  if (win.isFullScreen() === enabled) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const event = enabled ? "enter-full-screen" : "leave-full-screen";
    const cleanup = () => { clearTimeout(timer); win.removeListener(event, done); win.removeListener("closed", closed); };
    const done = () => { cleanup(); resolve(); };
    const closed = () => { cleanup(); reject(new Error("Output window closed during transition")); };
    const timer = setTimeout(() => {
      if (!win.isDestroyed() && win.isFullScreen() === enabled) done();
      else { cleanup(); reject(new Error("Output fullscreen transition did not complete")); }
    }, 1800);
    win.once(event, done);
    win.once("closed", closed);
    try { win.setFullScreen(enabled); } catch (error) { cleanup(); reject(error); }
  });
}

// Serialize native transitions: a hide or a second show must not overtake an
// unfinished fullscreen change. Hidden output always returns to windowed mode.
function createOutputController({ getWindow, getDisplay, onShown, onChanged }) {
  let pending = Promise.resolve(), wanted = 'hide', savedDisplay = null, savedBounds = null;
  function output(mode, recovering = false) {
    if (!["hide", "window", "fullscreen"].includes(mode)) return Promise.reject(new Error("Unknown output mode"));
    if (!recovering) wanted = mode;
    const task = pending.then(async () => {
      const win = getWindow();
      if (!win || win.isDestroyed()) throw new Error("Output window unavailable");
      await fullscreen(win, false);
      if (mode === "hide") {
        win.hide();
      } else {
        const display = getDisplay(recovering ? savedDisplay?.id : undefined);
        if (win.isMinimized()) win.restore();
        win.setBounds(mode === "fullscreen" ? display.bounds : recovering && savedBounds ? savedBounds : {
          x: display.workArea.x + 30, y: display.workArea.y + 30,
          width: Math.max(1, Math.min(1100, display.workArea.width - 60)),
          height: Math.max(1, Math.min(680, display.workArea.height - 60)),
        });
        win.show();
        if (mode === "fullscreen") await fullscreen(win, true);
        savedDisplay = display;
        savedBounds = win.getBounds ? win.getBounds() : null;
        onShown();
      }
      onChanged();
    });
    pending = task.catch(() => {});
    return task;
  }
  output.capture = () => {
    const win = getWindow();
    if (win && !win.isDestroyed() && win.getBounds) savedBounds = win.getBounds();
  };
  output.restore = () => output(wanted, true);
  return output;
}
module.exports = { createOutputController };
