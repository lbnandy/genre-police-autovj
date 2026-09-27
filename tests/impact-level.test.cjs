const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { Library } = require('../packages/library.cjs');

test('impact levels preserve old low/standard and boost only existing impacts', async () => {
  const { applyImpactLevel } = await import('../renderer/impact-level.mjs');
  const { softenMotionMetrics } = await import('../vendor/genre-police/renderer/motion-preference.mjs');
  const source = { impact: .5, accent: .4, rhythmStrength: .6, rhythmPulse: .5, kickPulse: .8, bass: .7, volume: .6, trackedSerial: 9 };
  assert.deepEqual(applyImpactLevel(source, 'low'), softenMotionMetrics(source, 'gentle'));
  assert.strictEqual(applyImpactLevel(source, 'medium'), source);
  const high = applyImpactLevel(source, 'high');
  assert.ok(high.impact > source.impact);
  assert.equal(high.kickPulse, 1);
  assert.equal(high.bass, source.bass);
  assert.equal(high.trackedSerial, 9);
  const extreme = applyImpactLevel(source, 'extreme');
  assert.ok(extreme.impact > high.impact);
  assert.equal(extreme.kickPulse, 1);
  assert.equal(extreme.trackedSerial, 9);
  assert.equal(applyImpactLevel({ impact: 0 }, 'extreme').impact, 0);
  const ultra = applyImpactLevel(source, 'ultra');
  assert.ok(ultra.impact > extreme.impact);
  assert.equal(ultra.trackedSerial, 9);
  assert.equal(applyImpactLevel({ impact: 0 }, 'ultra').impact, 0);
  assert.equal(applyImpactLevel({ impact: 0 }, 'high').impact, 0);
  assert.equal(source.impact, .5);
});

test('presentation tiers stay distinct when normalized metrics have saturated', async()=>{
 const {impactPresentation}=await import('../renderer/impact-level.mjs');
 const medium=impactPresentation({impact:1},'medium'),high=impactPresentation({impact:1},'high'),extreme=impactPresentation({impact:1},'extreme');
 assert.equal(medium.visualScale,1);assert.ok(high.visualScale>medium.visualScale);assert.ok(extreme.visualScale>high.visualScale);
 assert.ok(extreme.titleScale>high.titleScale);
 const ultra=impactPresentation({impact:1},'ultra');
 assert.ok(ultra.visualScale>extreme.visualScale);assert.ok(ultra.titleScale>extreme.titleScale);
 assert.equal(impactPresentation({},'extreme').visualScale,1);
 assert.ok(impactPresentation({impact:1},'extreme',true).visualScale<extreme.visualScale);
});

test('visual sizes keep the existing default and give stacked layouts more space',async()=>{
 const {stageGeometry,visualSizeScale}=await import('../renderer/stage-geometry.mjs');
 assert.deepEqual(['standard','large','maximum'].map(visualSizeScale),[1,1.15,1.3]);
 const small=stageGeometry(1920,1080,'stacked'),large=stageGeometry(1920,1080,'stacked','maximum');
 assert.equal(small.designHeight,400);assert.ok(large.hudTop>small.hudTop);assert.ok(large.designHeight>small.designHeight);
});

test('legacy impact switches migrate once and new libraries default to medium', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'autovj-impact-'));
  try {
    const lib = new Library(root);
    assert.equal(lib.data.settings.impactLevel, 'medium');
    for (const enabled of [false, true]) {
      lib.data.settings = { flashEnabled: enabled }; lib.save();
      const restored = new Library(root);
      assert.equal(restored.data.settings.impactLevel, enabled ? 'medium' : 'low');
      assert.equal('flashEnabled' in restored.data.settings, false);
    }
    lib.data.settings = { impactLevel: 'high', flashEnabled: false }; lib.save();
    assert.equal(new Library(root).data.settings.impactLevel, 'high');
    lib.data.settings = { impactLevel: 'extreme' }; lib.save();
    assert.equal(new Library(root).data.settings.impactLevel, 'extreme');
    lib.data.settings = { impactLevel: 'ultra' }; lib.save();
    assert.equal(new Library(root).data.settings.impactLevel, 'ultra');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
