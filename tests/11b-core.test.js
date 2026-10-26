const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sentenceBigrams, sentenceTrace, distribution, sample } = require('../docs/week_11/11b/core.js');

test('sentence generation starts at boundary, ends, and normalizes each step', () => {
  const model = sentenceBigrams('we study language\nwe study speech');
  const result = sentenceTrace(model, { temperature: 1 }, () => 0);
  assert.equal(result.complete, true);
  assert.deepEqual(result.words, ['we', 'study', 'language']);
  assert.equal(result.steps[0].context, '<start>');
  assert.equal(result.steps.at(-1).word, '<end>');
  for (const step of result.steps) assert.ok(Math.abs(step.rows.reduce((s, r) => s + r.prob, 0) - 1) < 1e-12);
});

test('top-k truncates by rank and nucleus keeps normalized mass', () => {
  const counts = new Map([['a', 10], ['b', 5], ['c', 1]]);
  assert.equal(distribution(counts, { topk: 1 })[0].prob, 1);
  assert.equal(distribution(counts, { topp: 0.5 }).filter((r) => r.kept).length, 1);
  assert.equal(distribution(counts, { temperature: 0 })[0].prob, 1);
  assert.throws(() => distribution(counts, { temperature: -1 }));
});

test('cyclic text is bounded and never falsely marked complete', () => {
  const result = sentenceTrace(sentenceBigrams('a a a a'), { temperature: 0 }, () => 0, 10);
  assert.equal(result.complete, false);
  assert.equal(result.steps.length, 10);
});

test('bigram counts never cross sentence boundaries', () => {
  const m = sentenceBigrams('we study language\nwe study speech');
  assert.equal(m.get('we').get('study'), 2);
  assert.deepEqual([...m.get('language').keys()], ['<end>']);
});

test('temperature, k, p and normalization follow the displayed order', () => {
  const counts = new Map([['a', 6], ['b', 3], ['c', 1]]);
  let r = distribution(counts);
  r.forEach((x, i) => assert.ok(Math.abs(x.prob - [0.6, 0.3, 0.1][i]) < 1e-12));
  r = distribution(counts, { temperature: 0, topk: 0, topp: 1 });
  assert.deepEqual(r.map((x) => x.prob), [1, 0, 0]);
  r = distribution(counts, { temperature: 1, topk: 2, topp: 0.6 });
  assert.equal(r.filter((x) => x.kept).length, 1);
  assert.equal(r[0].prob, 1);
  assert.equal(sample(r, () => 0.99), 'a');
});

test('extreme legal temperature stays finite and invalid settings fail', () => {
  const r = distribution(new Map([['a', 100], ['b', 1]]), { temperature: 0.001, topk: 0, topp: 1 });
  assert.ok(r.every((x) => Number.isFinite(x.prob)));
  assert.throws(() => distribution(new Map([['a', 1]]), { topk: 1.5 }));
  assert.throws(() => distribution(new Map()));
});

test('top-q nucleus keeps the boundary candidate and matches top-p', () => {
  const counts = new Map([['a', 6], ['b', 3], ['c', 1]]);
  assert.deepEqual(distribution(counts, { topq: 0.7 }), distribution(counts, { topp: 0.7 }));
  distribution(counts, { topq: 0.7 }).forEach((r, i) => assert.ok(Math.abs(r.prob - [2 / 3, 1 / 3, 0][i]) < 1e-12));
  assert.equal(distribution(counts, { topq: 1 }).filter((r) => r.kept).length, 3);
  assert.throws(() => distribution(counts, { topq: 0 }));
  assert.throws(() => distribution(counts, { topq: 0.7, topp: 0.7 }));
});
