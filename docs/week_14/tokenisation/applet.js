(function () {
  'use strict';
  const lab = window.TokenisationLab;
  const $ = id => document.getElementById(id);
  const models = new Map();
  let active = null, replay = 0;
  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function tokenView(container, text, model, limit) {
    const encoded = lab.encode(text, model, limit);
    const visual = el('div', undefined, 'tk-tokens');
    visual.setAttribute('aria-hidden', 'true');
    for (const word of encoded) {
      const group = el('span', undefined, 'tk-word');
      word.tokens.forEach((token,i) => {
        const chip = el('span',token,'tk-token'); chip.dataset.tone = String(i%4); group.append(chip);
      });
      visual.append(group);
    }
    // Screen readers receive explicit token boundaries instead of colour-only chips.
    const accessible = el('p', 'Token boundaries: ' + encoded.map(w => w.tokens.join(', ')).join('; next word: ') + '.', 'visually-hidden');
    container.replaceChildren(accessible, visual);
    return lab.metrics(encoded);
  }
  function renderHistory() {
    const example = lab.examples[Number($('example').value)];
    const word = $('compare-word').value;
    $('word-heading').textContent = `English word: ${word}`;
    $('history').replaceChildren();
    [90,50,10].forEach(share => {
      if (!models.has(share)) return;
      const model = models.get(share), row = el('tr');
      const current = active === model;
      if (current) row.setAttribute('aria-current','true');
      const label = el('th', `${share}% / ${100-share}%${current ? ' (shown above)' : ''}`); label.scope = 'row'; row.append(label);
      for (const language of ['english','pinyin']) {
        const m = lab.metrics(lab.encode(example[language],model));
        row.append(el('td',`${m.tokens} (${m.perWord.toFixed(2)})`));
      }
      const pieces = el('td', undefined, 'tk-word-comparison');
      tokenView(pieces,word,model);
      row.append(pieces);
      $('history').append(row);
    });
    $('history-panel').hidden = models.size === 0;
    const next = [90,50,10].find(share => !models.has(share));
    $('next-step').textContent = next === undefined
      ? 'All three balances are ready. Compare an English word and both token-count columns above, try another test sentence, then explain your observations in step 3.'
      : `Next: choose ${next}% pinyin / ${100-next}% English in step 1 and train. Keep this test sentence unchanged to compare the effect of training balance.`;
  }
  function refreshWords() {
    const example = lab.examples[Number($('example').value)];
    const words = [...new Set(example.english.split(' '))];
    $('compare-word').replaceChildren(...words.map(word => {
      const option = el('option',word); option.value=word; return option;
    }));
    $('compare-word').value = words.includes('library') ? 'library' : words[words.length-1];
  }
  function refreshSavedRuns() {
    $('saved-control').hidden = models.size === 0;
    const options = [90,50,10].filter(share => models.has(share)).map(share => {
      const option = el('option',`${share}% pinyin / ${100-share}% English`); option.value=String(share); return option;
    });
    if (!active) {
      const pending = el('option','Choose a saved run'); pending.value=''; pending.disabled=true; options.unshift(pending);
    }
    $('saved-run').replaceChildren(...options);
    $('saved-run').value = active ? String(active.share) : '';
  }
  function renderResults() {
    const example = lab.examples[Number($('example').value)];
    $('test-note').textContent = example.note;
    $('pinyin-meaning').textContent = `English meaning: “${example.english}.” This is a sentence-level translation, not a word-by-word alignment.`;
    $('results').hidden = !active;
    $('result-prompt').hidden = Boolean(active);
    if (active) {
      $('result-setting').textContent = `Trained on ${active.share}% pinyin / ${100-active.share}% English, ${active.rules.length} merges`;
      for (const language of ['pinyin','english']) {
        $('sentence-'+language).textContent = example[language];
        const m = tokenView($('tokens-'+language),example[language],active);
        $('stats-'+language).textContent = `${m.tokens} tokens, ${m.perWord.toFixed(2)} per word`;
      }
    }
    renderHistory();
  }
  const pinyinMeanings = {
    wo:'I / me', xihuan:'like', zai:'at / in', xuexiao:'school', xuexi:'study',
    tamen:'they', jintian:'today', tushuguan:'library', kanshu:'read', laoshi:'teacher',
    gongzuo:'work', women:'we', mingtian:'tomorrow', qu:'go', xuesheng:'student',
    zhongwen:'Chinese', de:'a grammatical linking word', pengyou:'friend', he:'and / with / drink (depending on the sentence)',
    cha:'tea', gongyuan:'park', sanbu:'take a walk'
  };
  function renderReplay() {
    $('trace-panel').hidden = !active;
    $('trace-prompt').hidden = Boolean(active);
    if (!active) return;
    $('trace-setting').textContent = `Replay of the ${active.share}% pinyin / ${100-active.share}% English tokenizer. This does not change your completed results.`;
    const focused = document.activeElement;
    $('trace-next').disabled = replay >= active.rules.length;
    $('trace-finish').disabled = replay >= active.rules.length;
    $('trace-reset').disabled = replay === 0;
    // Preserve the keyboard path when the activated control becomes disabled.
    if (focused === $('trace-reset') && replay === 0) $('trace-next').focus();
    if ((focused === $('trace-next') || focused === $('trace-finish')) && replay >= active.rules.length) $('trace-reset').focus();
    if (!replay) {
      $('trace-status').textContent = `Round 0 of ${active.rules.length}. Every word starts as individual characters. Select Next merge to see the most frequent pair.`;
      $('trace-example').replaceChildren(); return;
    }
    const step = active.trace[replay-1];
    $('trace-status').textContent = `Round ${replay} of ${active.rules.length}: ${step.pair[0]} + ${step.pair[1]} becomes ${step.pair.join('')}. This pair occurred ${step.count.toLocaleString('en-US')} times in the weighted training text (including repetitions).`;
    $('trace-example').replaceChildren(el('p',pinyinMeanings[step.word] ? `Mandarin example: ${step.word}. English meaning: ${pinyinMeanings[step.word]}. Follow the letter groups below; you do not need to pronounce the word.` : `English example word: ${step.word}`),el('p',`Before: ${step.before.join(' | ')}`,'tk-corpus'),el('p',`After: ${step.after.join(' | ')}`,'tk-corpus'));
  }
  function renderMergeList() {
    $('merge-list').replaceChildren();
    if (!active) return;
    for (const step of active.trace) {
      const row = el('tr'), heading = el('th',String(step.round)); heading.scope = 'row'; row.append(heading);
      for (const value of [step.pair.join(' + '),step.pair.join(''),String(step.count)]) row.append(el('td',value));
      $('merge-list').append(row);
    }
  }
  function updateBalance() {
    const share = Number($('balance').value);
    active = null; replay = 0;
    $('compare-link').hidden = true;
    $('comparison-status').textContent = '';
    $('training-status').textContent = `Balance changed to ${share}% pinyin / ${100-share}% English. Select Train tokenizer to apply it. Previous runs remain in the comparison table.`;
    renderResults(); renderReplay(); renderMergeList(); refreshSavedRuns();
  }
  $('train').addEventListener('click', () => {
    active = lab.train(Number($('balance').value)); models.set(active.share,active); replay = 0;
    renderResults(); renderReplay(); renderMergeList(); refreshSavedRuns();
    $('compare-link').hidden = false;
    $('comparison-status').textContent = '';
    const e = lab.examples[Number($('example').value)];
    const n = lab.metrics(lab.encode(e.english,active)).tokens;
    $('training-status').textContent = `Training complete: ${active.share}% pinyin / ${100-active.share}% English, ${active.rules.length} merges. The English test sentence uses ${n} tokens. Inspect its word boundaries in step 2.`;
  });
  $('balance').addEventListener('change',updateBalance);
  $('example').addEventListener('change', () => {
    refreshWords();
    renderResults();
    $('comparison-status').textContent = models.size ? 'New test sentence: the saved rules are unchanged. All comparison rows now refer to this sentence pair.' : 'Test sentence selected. Train a tokenizer in step 1 to see its pieces.';
  });
  $('compare-word').addEventListener('change', () => {
    renderHistory();
    $('comparison-status').textContent = `The last column now compares “${$('compare-word').value}” across your saved runs.`;
  });
  $('saved-run').addEventListener('change', () => {
    active=models.get(Number($('saved-run').value)); replay=0;
    $('balance').value=String(active.share);
    renderResults(); renderReplay(); renderMergeList();
    $('compare-link').hidden=false;
    $('training-status').textContent=`Viewing the saved ${active.share}/${100-active.share} tokenizer. No retraining was needed.`;
    $('comparison-status').textContent=`Showing saved ${active.share}% pinyin / ${100-active.share}% English token boundaries. The comparison table still includes all trained balances.`;
  });
  $('trace-next').addEventListener('click', () => { if (active && replay < active.rules.length) {replay++;renderReplay();} });
  $('trace-finish').addEventListener('click', () => { if (active) {replay = active.rules.length;renderReplay();} });
  $('trace-reset').addEventListener('click', () => {replay=0;renderReplay();});
  $('reset').addEventListener('click', () => {
    models.clear(); $('balance').value='90'; $('example').value='0'; $('technical').open=false;
    $('training-corpus').open=false; $('merge-details').open=false; $('pinyin-results').open=false;
    refreshWords();
    updateBalance(); $('training-status').textContent='Experiment reset to 90% pinyin / 10% English. Your reflection notes have been kept.';
  });
  lab.corpus.pinyin.forEach((sentence,index) => {
    const item=el('li'), original=el('p',sentence,'tk-corpus'); original.lang='zh-Latn';
    item.append(original,el('p',`English meaning / training sentence: ${lab.corpus.english[index]}`));
    $('corpus-pairs').append(item);
  });
  refreshWords(); renderResults();
})();
