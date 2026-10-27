import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context = {window:{}};
vm.runInNewContext(fs.readFileSync(new URL('../docs/highlighter.js',import.meta.url),'utf8'),context);
const H = context.window.Highlighter;
const data = JSON.parse(fs.readFileSync(new URL('../docs/week_12/12a/weights.json',import.meta.url)));
test('all four exports retain lexical coefficients and explicitly audit non-text features',()=>{
  assert.equal(data.combinedTarget,'framing AND validation AND indirectness');
  for(const model of Object.values(data.models)) {
    assert.equal(model.sourceRows,1004);
    assert.equal(Object.keys(model.weights).length,969);
    assert.equal(model.excluded.length,35);
    assert.equal(model.lemmatize,false);
    assert.equal(H.prepare(model).size,969);
    assert.equal(model.excluded.filter(x=>x.reason==='non-text categorical predictor').length,4);
    assert.ok(Object.values(model.weights).every(Number.isFinite));
  }
});
test('word boundaries, repeated words and zero coefficients preserve original offsets',()=>{
  const model=H.prepare({lemmatize:false,weights:{valid:0.68,invalid:-0.5,zero:0}});
  const text='VALID, invalid; validation valid zero.';
  const hits=H.find(text,model);
  assert.equal(hits.length,3);
  assert.deepEqual(Array.from(hits,x=>x.text),['VALID','invalid','valid']);
  assert.ok(hits.every(x=>text.slice(x.start,x.end)===x.text));
});
test('longer phrases win without overlapping words or crossing sentences',()=>{
  const model=H.prepare({lemmatize:false,weights:{'very valid':2,valid:1,'valid next':3}});
  const hits=H.find('very valid. next valid',model);
  assert.deepEqual(Array.from(hits,x=>x.entry),['very valid','valid']);
});
test('exact word forms do not invent lemmatization and preserve Unicode offsets',()=>{
  const model=H.prepare({lemmatize:false,weights:{cafe:1,circle:2}});
  const text='🙂 Café circling circle';
  const hits=H.find(text,model);
  assert.deepEqual(Array.from(hits,x=>x.text),['Café','circle']);
  assert.ok(hits.every(x=>text.slice(x.start,x.end)===x.text));
});
test('small nonzero weights are never misrepresented as zero',()=>{
  assert.equal(H.formatWeight(0.0008),'+0.0008');
  assert.equal(H.formatWeight(-0.0008),'−0.0008');
  assert.equal(H.formatWeight(0),'0');
  assert.equal(H.formatWeight(0.684),' +0.68'.trim());
});
