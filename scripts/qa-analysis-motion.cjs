"use strict";
const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async function checkAnalysisMotion({page, send, base, ids, output}) {
  const track = (phase, fraction = 0, id = ids[0]) => ({id, title:'Afterlife (Original Mix)', phase, fraction});
  const initial = {id:'batch-check', libraryId:base.library.id, total:6, processed:0, succeeded:0, failed:0, status:'running'};
  const push = async (changes, job, queue = 5) => {
    await send({...base, analysisBatch:{...initial,...changes}, job, queue});
    const phases={metadata:'读取曲目信息',decode:'解码音频',online:'查询在线资料',ai:'汇总整曲 AI 结果',cancelling:'正在停止'};
    const expected=job?phases[job.phase]:changes.status==='complete'?'分析完成':changes.status==='cancelled'?'已停止分析':'准备下一首';
    await page.waitForFunction(({done,expected,job}) => document.querySelector('#job-progress').getAttribute('aria-valuenow') === String(done) && document.querySelector(job?'#job-detail':'#job-title').textContent.includes(expected), {done:changes.processed||0,expected,job:!!job});
  };
  const scale = () => page.locator('.job-progress-fill').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a);
  await push({}, track('metadata'));
  assert.equal(await scale(), 0);
  assert.equal(await page.locator('.job-progress-activity').count(), 0);
  assert.equal(await page.locator('#job-progress').evaluate(el => el.getAnimations({subtree:true}).length), 0);
  await push({}, track('ai', .84));
  assert.equal(await scale(), 0, 'An AI percentage must not pretend the track is finished');
  assert.ok((await page.locator('#job-detail').textContent()).includes('84%'));

  await push({processed:1,succeeded:1}, null);
  const midpoint = await page.locator('.job-progress-fill').evaluate(el => {
    const animation = el.getAnimations().find(a => a.transitionProperty === 'transform');
    if (!animation) return null;
    animation.pause();animation.currentTime=90;
    const fraction = new DOMMatrix(getComputedStyle(el).transform).a;
    animation.finish();return fraction;
  });
  assert.ok(midpoint>0 && midpoint<1/6, 'Completed count did not fill smoothly from the left');
  assert.ok(Math.abs(await scale()-1/6)<.001);
  for (const phase of ['metadata','decode','online','ai']) {
    await push({processed:1,succeeded:1}, track(phase,.12,ids[1]),4);
    assert.ok(Math.abs(await scale()-1/6)<.001, 'The next track reset batch progress');
  }
  await push({processed:2,succeeded:1,failed:1}, track('ai',.42,ids[2]),3);
  await page.waitForFunction(()=>Math.abs(new DOMMatrix(getComputedStyle(document.querySelector('.job-progress-fill')).transform).a-1/3)<.001);
  assert.ok((await page.locator('#job-detail').textContent()).includes('失败 1 首'));
  await page.screenshot({path:path.join(output,'batch-progress.png'),fullPage:true});
  await push({processed:2,succeeded:1,failed:1,status:'cancelling'},track('cancelling'),0);
  assert.equal(await page.locator('#job-progress').getAttribute('aria-valuemax'),'6');
  assert.ok(Math.abs(await scale()-1/3)<.001, 'Clearing the queue must not make cancellation complete');
  await push({processed:2,succeeded:1,failed:1,status:'cancelled'},null,0);
  assert.ok((await page.locator('#job-title').textContent()).includes('已停止分析'));
  assert.ok(Math.abs(await scale()-1/3)<.001);
  await push({processed:6,succeeded:5,failed:1,status:'complete'},null,0);
  await page.waitForFunction(()=>new DOMMatrix(getComputedStyle(document.querySelector('.job-progress-fill')).transform).a===1);
  assert.ok((await page.locator('#job-detail').textContent()).includes('成功 5 首'));
  assert.ok((await page.locator('#job-detail').textContent()).includes('失败 1 首'));
  await page.screenshot({path:path.join(output,'batch-complete.png'),fullPage:true});

  await push({id:'next-batch'},track('metadata'));
  assert.equal(await scale(),0,'A new batch must reset without shrinking backwards');
  await page.emulateMedia({reducedMotion:'reduce'});
  await push({id:'next-batch',processed:1,succeeded:1},track('metadata',0,ids[1]));
  assert.ok(Math.abs(await scale()-1/6)<.001);
  assert.equal(await page.locator('#job-progress').evaluate(el => el.getAnimations({subtree:true}).length),0);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await send({...base,analysisBatch:null,job:null,queue:0});
  await page.waitForFunction(()=>document.querySelector('#job').hidden);
  return {cumulative:true,smoothFill:true,separateAI:true,failedCount:true,cancelKeepsTotal:true,completion:true,newBatchReset:true,reducedMotion:true};
};
