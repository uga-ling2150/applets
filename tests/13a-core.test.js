const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parse, sayAs } = require('../docs/week_13/13a/core.js');

const texts = turn => turn.items.filter(i => i.type === 'text').map(i => i.text);

test('each voice is a turn, and emphasis splits the words into their own chunk', () => {
  const r = parse('<speak><voice name="A"><s>I said the <emphasis level="strong">red</emphasis> one.</s></voice><voice name="B">Oh.</voice></speak>');
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.turns.map(t => t.speaker), ['A', 'B']);
  assert.deepEqual(texts(r.turns[0]), ['I said the', 'red', 'one.']);
  const q = parse('<speak>Not route <emphasis level="strong">ten</emphasis>?</speak>');
  assert.deepEqual(texts(q.turns[0]), ['Not route', 'ten?']);
  assert.equal(q.turns[0].trps[0].question, true);
  const red = r.turns[0].items.find(i => i.text === 'red');
  assert.equal(red.emphasis, 'strong');
  assert.ok(red.pitch > 1 && red.rate < 1);
});

test('prosody values nest and are clamped to what browser voices accept', () => {
  const r = parse('<speak><prosody rate="slow"><prosody rate="50%" pitch="+12st" volume="x-soft">hi</prosody></prosody></speak>');
  const [item] = r.turns[0].items;
  assert.equal(item.rate, 0.375);
  assert.equal(item.pitch, 2);
  assert.equal(item.volume, 0.25);
});

test('breaks accept times and strengths, and paragraphs add a pause', () => {
  const r = parse('<speak><p>One.<break time="1.5s"/>Two.<break strength="weak"/>Three<break/></p></speak>');
  const ms = r.turns[0].items.filter(i => i.type === 'break').map(i => i.ms);
  assert.deepEqual(ms, [1500, 250, 400, 400]);
});

test('TRPs follow sentence ends, with the pause after them', () => {
  const r = parse('<speak><voice name="A"><s>Take route eleven.</s><break time="1200ms"/><s>It leaves at ten, <break time="300ms"/> from Tate.</s></voice></speak>');
  const trps = r.turns[0].trps;
  assert.equal(trps.length, 2);
  assert.deepEqual([trps[0].pause, trps[0].endOfTurn], [1200, false]);
  assert.equal(trps[1].endOfTurn, true);
});

test('say-as and sub change what is read out', () => {
  assert.equal(sayAs('UGA', 'characters'), 'U G A');
  assert.equal(sayAs('706-555-0142', 'telephone'), '7 0 6, 5 5 5, 0 1 4 2');
  assert.equal(sayAs('10:05', 'time'), '10 oh 5');
  assert.equal(sayAs('10/27', 'date', 'md'), 'October 27th');
  const r = parse('<speak>Meet at <sub alias="the Tate Student Center">Tate</sub>.</speak>');
  assert.deepEqual(texts(r.turns[0]), ['Meet at the Tate Student Center.']);
});

test('broken markup gives a line-numbered error; unknown tags only warn', () => {
  assert.match(parse('<speak>\n<emphasis>hi</prosody>\n</speak>').errors[0], /^Line 2: <\/prosody>/);
  assert.match(parse('<speak><s>hi</speak>').errors[0], /<s> from line 1 must be closed with <\/s> before <\/speak>/);
  const r = parse('<speak><foo>hi</foo></speak>');
  assert.deepEqual(r.errors, []);
  assert.equal(r.warnings.length, 1);
  assert.deepEqual(texts(r.turns[0]), ['hi']);
});
