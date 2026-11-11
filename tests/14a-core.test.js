const {test} = require('node:test');
const assert = require('node:assert/strict');
const lab = require('../docs/week_14/tokenisation/core.js');
test('displayed sentence corpora are exactly the training input, without hidden weights', () => {
 for (const share of [90,50,10]) {
  const data=lab.selectCorpus(share), model=lab.train(share);
  assert.equal(data.pinyin.length,share/10);assert.equal(data.english.length,10-share/10);
  assert.deepEqual(model.data,data);
  const actual=new Map();
  for(const sentence of [...data.pinyin,...data.english])for(const word of lab.words(sentence))actual.set(word,(actual.get(word)||0)+1);
  const v=lab.createVocabulary(data);
  assert.deepEqual(new Map(v.map(w=>[w.word,w.weight])),actual);
 }
});
test('identical spellings from both languages contribute, rather than overwrite', () => {
 const v=lab.createVocabulary({pinyin:['aa bb'],english:['aa cc']});
 assert.equal(v.find(w=>w.word==='aa').weight,2);
});
test('known merge, overlap and ranked rule application', () => {
 assert.deepEqual(lab.merge(['a','a','a'],['a','a']),['aa','a']);
 const model=lab.train(50,2,{pinyin:['aaaa'],english:['aaaa']});
 assert.deepEqual(model.rules,[['a','a'],['aa','aa']]);
 assert.deepEqual(lab.encode('aaaa aaaaa',model).map(w=>w.tokens),[['aaaa'],['aaaa','a']]);
});
test('never crosses word boundaries and recovers all input characters', () => {
 for(const share of [90,50,10]) {
  const model=lab.train(share);
  for(const e of lab.examples) for(const lang of ['pinyin','english']) {
   const out=lab.encode(e[lang],model);
   assert.equal(out.map(w=>w.tokens.join('')).join(' '),e[lang]);
   assert.ok(out.every(w=>w.tokens.every(t=>!t.includes(' '))));
  }
 }
});
test('training is deterministic and encoding never mutates trained rules', () => {
 const m=lab.train(90), snapshot=JSON.stringify(m);
 lab.encode('completely unseen words',m);
 assert.equal(JSON.stringify(m),snapshot);assert.deepEqual(lab.train(90),m);
 assert.equal(m.rules.length,60);
});
test('training does not contain complete test sentences; unseen word pair is unseen', () => {
 for(const e of lab.examples)for(const lang of ['pinyin','english'])assert.ok(!lab.corpus[lang].includes(e[lang]));
 assert.ok(!lab.words(lab.corpus.pinyin.join(' ')).includes('xin'));
 assert.ok(!lab.words(lab.corpus.english.join(' ')).includes('new'));
});
test('all four held-out pairs show fragmentation reversal in both languages', () => {
 const p=lab.train(90), e=lab.train(10);
 for(const example of lab.examples) {
  assert.ok(lab.metrics(lab.encode(example.english,p)).tokens>lab.metrics(lab.encode(example.english,e)).tokens);
  assert.ok(lab.metrics(lab.encode(example.pinyin,e)).tokens>lab.metrics(lab.encode(example.pinyin,p)).tokens);
 }
});
test('zero merges, empty input, exhausted pairs and invalid settings', () => {
 assert.equal(lab.encode('word',lab.train(90,0))[0].tokens.length,4);
 assert.deepEqual(lab.metrics(lab.encode('',lab.train(90))),{tokens:0,words:0,perWord:0});
 assert.equal(lab.train(50,60,{pinyin:['a'],english:['b']}).rules.length,0);
 assert.throws(()=>lab.train(-1));assert.throws(()=>lab.train(90,201));
});
