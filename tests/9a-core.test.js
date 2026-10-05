const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const core = require('../docs/week_9/9a/core.js');

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../docs/week_9/9a/data.js'), 'utf8'), context);
const clips = context.window.TRP_CLIPS;

test('five clips have ordered, in-bounds word timings and an excluded next speaker', () => {
  assert.equal(clips.length, 5);
  for (const clip of clips) {
    assert.ok(clip.words.length > 10);
    assert.equal(clip.wave.length, 96);
    assert.ok(clip.wave.every(value => value >= 0 && value <= 1));
    assert.ok(clip.turnEnd > 0 && clip.turnEnd < clip.duration);
    assert.ok(clip.nextOnset > clip.duration);
    let last = 0;
    for (const word of clip.words) {
      assert.ok(word.start >= last);
      assert.ok(word.end >= word.start && word.end <= clip.duration);
      last = word.start;
    }
  }
});

test('click positions are classified relative to the annotated end', () => {
  const clip = clips[0];
  assert.equal(core.offset(null, clip), null);
  assert.equal(core.classify(core.offset(clip.turnEnd - 0.6, clip)), core.BINS[0].label);
  assert.equal(core.classify(core.offset(clip.turnEnd, clip)), core.BINS[2].label);
  assert.equal(core.classify(core.offset(clip.turnEnd + 0.51, clip)), core.BINS[3].label);
});

test('group import rejects wrong versions, missing clips and out-of-range marks', () => {
  const valid = { version: core.VERSION, id: 'participant-1', marks: clips.map(() => null) };
  assert.ok(core.validateSubmission(valid, clips));
  assert.equal(core.validateSubmission({ ...valid, version: 'old' }, clips), false);
  assert.equal(core.validateSubmission({ ...valid, marks: [null] }, clips), false);
  assert.equal(core.validateSubmission({ ...valid, marks: [1000, ...valid.marks.slice(1)] }, clips), false);
  assert.equal(core.summarize([valid], clips).missing, 5);
});
