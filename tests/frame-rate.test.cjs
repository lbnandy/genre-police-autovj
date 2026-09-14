const test = require('node:test');
const assert = require('node:assert/strict');
test('live unknown tracks and manual previews retain the chosen FPS cap; only stopped standby is reduced', async () => {
  const {outputFrameInterval} = await import('../renderer/output-frame-rate.mjs');
  const settings = {frameRateLimit: '120', idleFrameLimit: true};
  assert.equal(outputFrameInterval({settings, standby: true, active: false}), 1000 / 30);
  assert.equal(outputFrameInterval({settings, standby: true, active: true}), 1000 / 120);
  assert.equal(outputFrameInterval({settings, standby: false, active: false}), 1000 / 120);
  assert.equal(outputFrameInterval({settings: {...settings, idleFrameLimit: false}, standby: true}), 1000 / 120);
  assert.equal(outputFrameInterval({settings: {...settings, frameRateLimit: 'display'}, active: true}), 0);
  assert.equal(outputFrameInterval({settings: {...settings, frameRateLimit: '30'}, active: true}), 1000 / 30);
});
