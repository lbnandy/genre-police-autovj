const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {Library} = require('../packages/library.cjs');

async function simulation(frameRateLimit = '60') {
  const {AdaptiveResolution} = await import('../renderer/adaptive-resolution.mjs');
  const controller = new AdaptiveResolution();
  let time = 0;
  const prepare = (context = 'techno:1920:1080', active = true) =>
    controller.prepare({context, active, time, frameRateLimit});
  prepare();
  return {controller, prepare,
    advance(ms) {time += ms;},
    window(interval = 1000 / 60, workMs = 3) {
      // Drive complete measurement windows without a wall-clock sleep.
      time = Math.max(time, controller.warmupUntil);
      for (let i = 0; i < 1000; i++) {
        time += interval;
        const result = controller.sample({time, interval, workMs});
        if (result) return result;
      }
      return null;
    },
  };
}

test('transient missed frames do not lower quality; sustained low-work stalls do, with a floor', async () => {
  const sim = await simulation();
  assert.equal(sim.window(1000 / 30).scale, 1);
  assert.equal(sim.window().scale, 1);
  assert.equal(sim.window(1000 / 30).scale, 1);
  assert.equal(sim.window(1000 / 30).scale, .9);
  for (let i = 0; i < 12; i++) sim.window(1000 / 30);
  assert.equal(sim.controller.scale, .76);
});

test('recovery needs a long stable run and raises quality one step at a time', async () => {
  const sim = await simulation();
  for (let i = 0; i < 4; i++) sim.window(1000 / 30);
  assert.equal(sim.controller.scale, .82);
  for (let i = 0; i < 19; i++) assert.equal(sim.window().scale, .82);
  assert.equal(sim.window().scale, .9);
  for (let i = 0; i < 20; i++) sim.window();
  assert.equal(sim.controller.scale, 1);
});

test('CPU-heavy frames and an intentional 30 FPS cap do not trigger resolution reduction', async () => {
  const cpu = await simulation();
  for (let i = 0; i < 5; i++) assert.equal(cpu.window(1000 / 30, 18).scale, 1);
  const capped = await simulation('30');
  for (let i = 0; i < 5; i++) assert.equal(capped.window(1000 / 30).scale, 1);
});

test('warmup, native-window stalls and inactive output cannot accumulate false overload', async () => {
  const sim = await simulation();
  for (let time = 0; time < 1200; time += 33) {
    assert.equal(sim.controller.sample({time, interval:33, workMs:1}), null);
  }
  assert.equal(sim.window(1000 / 30).scale, 1);
  sim.advance(5000);
  assert.equal(sim.window(5000), null);
  assert.equal(sim.window(1000 / 30).scale, 1);
  sim.prepare(undefined, false);
  assert.equal(sim.window(1000 / 30), null);
  sim.prepare();
  assert.equal(sim.window(1000 / 30).scale, 1);
  assert.equal(sim.window(1000 / 30).scale, .9);
});

test('theme/display contexts keep independent session quality and reset measurements on return', async () => {
  const sim = await simulation();
  sim.window(1000 / 30); sim.window(1000 / 30);
  assert.equal(sim.controller.scale, .9);
  assert.equal(sim.prepare('techno:2560:1440'), 1);
  sim.window(1000 / 30);
  assert.equal(sim.prepare(), .9);
  assert.equal(sim.window(1000 / 30).scale, .9);
  assert.equal(sim.window(1000 / 30).scale, .82);
  sim.controller.suspend(0);
  sim.prepare();
  assert.equal(sim.window(1000 / 30).scale, .82);
});

test('new libraries default to adaptive quality and existing manual choices survive reopening', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autovj-resolution-'));
  try {
    const library = new Library(dir);
    assert.equal(library.data.settings.renderScale, 'auto');
    for (const renderScale of [1, .75, .5, 'auto']) {
      library.data.settings.renderScale = renderScale;
      library.save();
      assert.equal(new Library(dir).data.settings.renderScale, renderScale);
    }
  } finally {fs.rmSync(dir, {recursive:true, force:true});}
});
