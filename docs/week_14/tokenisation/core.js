/* Deterministic, word-bounded character BPE. No language-model/API dependency. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TokenisationLab = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const corpus = {
    pinyin: ['wo xihuan zai xuexiao xuexi', 'tamen jintian zai tushuguan kanshu',
      'laoshi xihuan zai xuexiao gongzuo', 'women mingtian qu tushuguan xuexi',
      'xuesheng jintian xuexi zhongwen', 'wo de pengyou xihuan he cha',
      'women zai gongyuan sanbu', 'tamen mingtian qu xuexiao',
      'laoshi he xuesheng zai tushuguan', 'wo jintian he pengyou kanshu'],
    english: ['i like studying at school', 'they are reading at the library today',
      'teachers like working at school', 'we will study at the library tomorrow',
      'students are learning chinese today', 'my friend likes drinking tea',
      'we walk in the park', 'they will go to school tomorrow',
      'teachers and students are at the library', 'i am reading with friends today']
  };
  const examples = [
    {name:'Studying at the library', pinyin:'women jintian zai tushuguan xuexi', english:'we are studying at the library today', note:'This sentence is held out from training. Some of its words may also be unseen in your selected corpus.'},
    {name:'Going to school', pinyin:'wo mingtian he pengyou qu xuexiao', english:'i will go to school with friends tomorrow', note:'This sentence is held out from training. Some of its words may also be unseen in your selected corpus.'},
    {name:'Reading with friends', pinyin:'xuesheng he pengyou zai tushuguan kanshu', english:'students are reading with friends at the library', note:'This sentence is held out from training. Some of its words may also be unseen in your selected corpus.'},
    {name:'Unseen words: a new library', pinyin:'women zai xin de tushuguan xuexi', english:'we are studying at the new library', note:'The English word new never occurred in training. Look at how the learned pieces apply to it. Its Mandarin counterpart, xin, means new and was also held out.'}
  ];
  const words = text => text.trim() ? text.trim().split(/\s+/u) : [];
  function merge(symbols, pair) {
    const result = [];
    for (let i = 0; i < symbols.length; i++) {
      if (symbols[i] === pair[0] && symbols[i + 1] === pair[1]) result.push(symbols[i++] + symbols[i]);
      else result.push(symbols[i]);
    }
    return result;
  }
  function selectCorpus(share) {
    if (![90,50,10].includes(share)) throw new RangeError('Choose 90, 50 or 10 percent pinyin.');
    return {pinyin:corpus.pinyin.slice(0,share/10), english:corpus.english.slice(0,10-share/10)};
  }
  function createVocabulary(data) {
    if (!data.pinyin.length || !data.english.length) throw new Error('Both corpora need sentences.');
    const vocabulary = new Map();
    for (const sentence of [...data.pinyin,...data.english]) {
      for (const word of words(sentence)) {
        if (!vocabulary.has(word)) vocabulary.set(word, {word, symbols:Array.from(word), weight:0});
        vocabulary.get(word).weight += 1;
      }
    }
    return [...vocabulary.values()];
  }
  function train(share, budget = 60, data = selectCorpus(share)) {
    if (!Number.isInteger(budget) || budget < 0 || budget > 200) throw new RangeError('Merge budget must be 0–200.');
    let vocabulary = createVocabulary(data);
    const trace = [], rules = [];
    for (let round = 0; round < budget; round++) {
      const pairs = new Map();
      for (const {symbols, weight} of vocabulary) {
        for (let i = 0; i < symbols.length - 1; i++) {
          const pair = [symbols[i], symbols[i + 1]], key = JSON.stringify(pair);
          if (!pairs.has(key)) pairs.set(key, {pair, key, count:0});
          pairs.get(key).count += weight;
        }
      }
      // Code-unit order is stable across browsers/locales; ties are not random.
      const best = [...pairs.values()].sort((a,b) => b.count - a.count || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))[0];
      if (!best) break;
      const witness = vocabulary.find(v => v.symbols.some((s,i) => s === best.pair[0] && v.symbols[i+1] === best.pair[1]));
      const before = witness.symbols.slice(), after = merge(before, best.pair);
      trace.push({round:round+1, pair:best.pair, count:best.count, word:witness.word, before, after});
      rules.push(best.pair);
      vocabulary = vocabulary.map(v => ({...v, symbols:merge(v.symbols, best.pair)}));
    }
    return {share, budget, rules, trace, data};
  }
  function encode(text, model, limit = model.rules.length) {
    return words(text).map(word => {
      let symbols = Array.from(word);
      for (const pair of model.rules.slice(0, limit)) symbols = merge(symbols, pair);
      return {word, tokens:symbols};
    });
  }
  function metrics(encoded) {
    const count = encoded.reduce((sum,w) => sum + w.tokens.length,0);
    return {tokens:count, words:encoded.length, perWord:encoded.length ? count/encoded.length : 0};
  }
  return {corpus, examples, words, merge, selectCorpus, createVocabulary, train, encode, metrics};
});
