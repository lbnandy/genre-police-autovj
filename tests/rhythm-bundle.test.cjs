const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {rhythmConfig, MODEL_FILE, MODEL_SHA256} = require('../packages/rhythm-config.cjs');

test('source and packaged rhythm configurations use identical BeatNet+ features and decoder', () => {
  const source = rhythmConfig(p => path.resolve(p));
  const packed = rhythmConfig(p => path.join('resources/app.asar.unpacked', p));
  assert.equal(source.modelKind, 'beatnet-plus');
  assert.equal(packed.modelKind, source.modelKind);
  assert.equal(packed.edmTiming, source.edmTiming);
  assert.equal(source.edmTiming, 'boundary');
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(source.modelPath)).digest('hex'), MODEL_SHA256);
  const build = require('../package.json').build;
  assert.ok(build.files.includes('assets/**/*'));
  assert.ok(build.asarUnpack.includes('assets/models/**/*'));
  assert.ok(MODEL_FILE.startsWith('assets/models/'));
});
