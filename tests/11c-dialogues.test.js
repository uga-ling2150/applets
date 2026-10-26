const assert = require('node:assert/strict');
const { test } = require('node:test');
const { dialogues } = require('../docs/week_11/11c/dialogues.js');

test('every conversation has two personas and a clean transcript', () => {
  assert.ok(dialogues.length > 100);
  for (const [i, d] of dialogues.entries()) {
    for (const persona of [d.a, d.b]) {
      assert.ok(persona.length >= 3 && persona.length <= 5, `conversation ${i + 1} persona size`);
      assert.ok(persona.every(fact => typeof fact === 'string' && fact.trim()), `conversation ${i + 1} empty fact`);
    }
    assert.ok(d.turns.length >= 6, `conversation ${i + 1} is too short`);
    assert.ok(d.turns.every(t => typeof t === 'string' && t.trim() && !t.includes('__ SILENCE __')), `conversation ${i + 1} turns`);
    assert.equal(d.rows[0] - d.rows[1], 8939, `conversation ${i + 1} pairs the wrong rows`);
  }
});

test('the excluded conversation stays out', () => {
  assert.ok(!dialogues.some(d => d.rows[1] === 17));
});
