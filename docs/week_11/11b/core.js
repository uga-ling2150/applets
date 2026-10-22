/* The tiny bigram model and the sampling rules. No page code here, so the same file runs in
   the browser (window.SamplingCore) and in the node tests (require). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SamplingCore = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';

  // Sentence boundaries are explicit so sentence generation can stop naturally.
  function sentenceBigrams(text) {
    const model = new Map();
    for (const line of text.split(/\n/)) {
      const words = line.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || [];
      if (!words.length) continue;
      const seq = ['<start>', ...words, '<end>'];
      for (let i = 0; i < seq.length - 1; i++) {
        if (!model.has(seq[i])) model.set(seq[i], new Map());
        const counts = model.get(seq[i]);
        counts.set(seq[i + 1], (counts.get(seq[i + 1]) || 0) + 1);
      }
    }
    return model;
  }

  function distribution(counts, { temperature = 1, topk = 0, topp, topq } = {}) {
    // Top-q is the nucleus-mass notation used by NAACL 2025, Appendix F.
    if (topp !== undefined && topq !== undefined) throw Error('Choose top-p or top-q, not both.');
    topp = topq ?? topp ?? 1;
    if (
      !Number.isFinite(temperature) || temperature < 0 || temperature > 2 ||
      !Number.isInteger(topk) || topk < 0 || topk > 50 ||
      !Number.isFinite(topp) || topp <= 0 || topp > 1
    )
      throw Error('Use temperature 0–2, integer top-k 0–50, and top-p/top-q greater than 0 up to 1.');
    const rows = [...counts]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([word, count]) => ({ word, count }));
    if (!rows.length) throw Error('This context has no observed next word.');
    const total = rows.reduce((s, r) => s + r.count, 0),
      max = rows[0].count;
    rows.forEach((r) => {
      r.base = r.count / total;
      r.weight = temperature === 0
        ? (r === rows[0] ? 1 : 0)
        : Math.exp(Math.log(r.count / max) / temperature);
    });
    const z = rows.reduce((s, r) => s + r.weight, 0);
    rows.forEach((r) => (r.tempered = r.weight / z));
    const candidates = rows.filter((r) => r.weight > 0).slice(0, topk || rows.length),
      sum = candidates.reduce((s, r) => s + r.tempered, 0),
      kept = [];
    let cumulative = 0;
    for (const r of candidates) {
      if (cumulative >= topp) break;
      kept.push(r);
      cumulative += r.tempered / sum;
    }
    const norm = kept.reduce((s, r) => s + r.tempered, 0);
    return rows.map((r) => ({
      ...r,
      kept: kept.includes(r),
      prob: kept.includes(r) ? r.tempered / norm : 0,
    }));
  }

  function sample(rows, random = Math.random) {
    let x = random();
    for (const r of rows) {
      x -= r.prob;
      if (x < 0) return r.word;
    }
    return rows.filter((r) => r.prob > 0).at(-1).word;
  }

  function sentenceTrace(model, settings, random = Math.random, limit = 40) {
    let context = '<start>';
    const words = [], steps = [];
    for (let i = 0; i < limit; i++) {
      const rows = distribution(model.get(context) || new Map(), settings);
      const word = sample(rows, random);
      steps.push({ context, word, rows });
      if (word === '<end>') return { words, steps, complete: true };
      words.push(word);
      context = word;
    }
    return { words, steps, complete: false };
  }

  return { sentenceBigrams, distribution, sample, sentenceTrace };
});
