(() => {
'use strict';
const $ = id => document.getElementById(id);
const { sentenceBigrams, distribution, sample } = window.SamplingCore;
const live = window.Week11Live;
const LIMIT = 40;

function node(tag, text, cls) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}
function download(name, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function setStage(n, status) {
  $(`stage${n}`).classList.remove('active', 'done');
  if (status) $(`stage${n}`).classList.add(status);
}

let model,
  sentenceWords = [],
  trace = [],
  complete = false,
  context = '<start>',
  rows = [],
  counts = Object.create(null),
  total = 0,
  lastDraw = '',
  generations = [],
  busy = false,
  settings,
  appliedInput,
  modelDirty = false,
  dirty = false,
  unlocked3 = false;

// Observations are real generated words, grouped by their preceding context.
// A parameter change or corpus rebuild starts a new counting condition.
const observations = new Map();
let activeCondition = '';
const conditionKey = p => JSON.stringify([p.temperature, p.topk, p.topq ?? p.topp ?? 1]);
function showObservations(ctx) {
  const observed = observations.get(ctx);
  counts = observed?.counts || Object.create(null);
  total = observed?.total || 0;
  lastDraw = observed?.lastDraw || '';
}
function recordObservation(ctx, word) {
  if (!observations.has(ctx)) observations.set(ctx, { counts: Object.create(null), total: 0, lastDraw: '' });
  const observed = observations.get(ctx);
  observed.counts[word] = (observed.counts[word] || 0) + 1;
  observed.total++;
  observed.lastDraw = word;
}
const settingsLabel = p => `temperature ${p.temperature}, top-k ${p.topk}, ${p.topq !== undefined ? 'top-q' : 'top-p'} ${p.topq ?? p.topp}`;

function parameters(prefix = '') {
  const value = id => ($(prefix + id).value.trim() ? Number($(prefix + id).value) : NaN);
  return {
    temperature: value('temperature'),
    topk: value('topk'),
    [$(prefix + 'nucleus').value]: value('topp'),
  };
}

function updateStages() {
  setStage(1, complete ? 'done' : 'active');
  setStage(2, trace.length ? 'active' : null);
  setStage(3, !unlocked3 ? null : generations.length >= 2 ? 'done' : 'active');
}
function showInspection(open) {
  $('stage2-lock').hidden = open;
  $('inspection-area').hidden = !open;
}

// ---- Probability view for the selected step ----
function renderCharts() {
  const host = $('probability-charts');
  host.replaceChildren();
  host.append(node('p', 'Shared scale: 0% to 100%. Orange: kept from the base probability; red: added by the settings; striped: removed by the settings.', 'field-hint'));
  const grid = node('div', undefined, 'chart-grid');
  for (const phase of ['base', 'prob']) {
    const panel = node('section');
    panel.append(node('h4', phase === 'base' ? 'Base probabilities' : 'Final probabilities and changes', 'chart-heading'));
    const k = Number(settings?.topk || 0);
    rows.forEach((r, i) => {
      if (k > 0 && i === k) panel.append(node('p', `Top-k cutoff: candidates ranked below ${k} are excluded.`, 'cutoff-line'));
      const row = node('div', undefined, 'probability-row');
      const name = r.word === '<end>' ? 'End sentence' : r.word;
      row.append(node('span', `${name}: ${(100 * r[phase]).toFixed(1)}%${!r.kept && phase === 'prob' ? ' (excluded)' : ''}`));
      const track = node('div', undefined, 'probability-track');
      track.setAttribute('aria-hidden', 'true');
      const segment = (val, cls) => { const el = node('span', undefined, cls); el.style.width = `${100 * val}%`; track.append(el); };
      if (phase === 'base') segment(r.base, 'prob-retained');
      else {
        segment(Math.min(r.base, r.prob), 'prob-retained');
        segment(Math.max(0, r.prob - r.base), 'prob-added');
        segment(Math.max(0, r.base - r.prob), 'prob-removed');
      }
      row.append(track);
      panel.append(row);
    });
    grid.append(panel);
  }
  host.append(grid);
}
function render() {
  renderCharts();
  const tbody = $('distribution');
  tbody.replaceChildren();
  rows.forEach(r => {
    const tr = node('tr');
    const word = node('th', r.word);
    word.scope = 'row';
    tr.append(word);
    for (const value of [r.count, (100 * r.base).toFixed(1) + '%', (100 * r.tempered).toFixed(1) + '%', r.kept ? 'Yes' : 'No', (100 * r.prob).toFixed(1) + '%', counts[r.word] || 0])
      tr.append(node('td', String(value)));
    const meter = document.createElement('meter');
    meter.min = 0;
    meter.max = 1;
    meter.value = r.prob;
    meter.setAttribute('aria-label', `Final probability for ${r.word}`);
    tr.children[5].append(meter);
    tbody.append(tr);
  });
  $('sample-status').textContent =
    `Observed at context “${context}” under the current settings: ${total} ${total === 1 ? 'draw' : 'draws'}. ` +
    (lastDraw ? `Last observed word: “${lastDraw}”. ` : '') +
    'Counts add up across generated sentences at this context; changing a setting or rebuilding the model resets them.';
}

// Recompute only the view. Never replace a saved draw or its original settings.
function apply() {
  const savedStep = trace[Number($('inspect-step').value)];
  context = savedStep?.context || '<start>';
  try {
    const nextSettings = parameters();
    const nextRows = distribution(model.get(context) || new Map(), nextSettings);
    const nextCondition = conditionKey(nextSettings);
    if (nextCondition !== activeCondition) { observations.clear(); activeCondition = nextCondition; }
    settings = nextSettings;
    rows = nextRows;
    $('context-view').textContent = context;
    appliedInput = { corpus: $('corpus').value, context };
    dirty = false;
    showInspection(trace.length > 0);
    $('probability-panel').hidden = false;
    showObservations(context);
    if ($('settings-error').textContent) $('status').textContent = '';
    $('settings-error').textContent = '';
    $('error').textContent = '';
    $('inspect-status').textContent = savedStep
      ? `Step ${Number($('inspect-step').value) + 1} originally drew “${savedStep.word}” with ${settingsLabel(savedStep.settings)}. The charts use the current settings.`
      : '';
    render();
    for (const id of ['sample', 'many', 'clear']) $(id).disabled = false;
  } catch (e) {
    // Keep the settings reachable so an invalid value can be fixed.
    showInspection(true);
    $('settings-error').textContent = e.message;
    $('status').textContent = 'No current distribution. Fix the settings in Step 2 or rebuild the model. Your saved sentence has not changed.';
    $('probability-panel').hidden = true;
    dirty = true;
    for (const id of ['sample', 'many', 'clear']) $(id).disabled = true;
  }
  updateStages();
}

function restartSentence() {
  sentenceWords = [];
  trace = [];
  complete = false;
  rows = [];
  counts = Object.create(null);
  total = 0;
  lastDraw = '';
  $('sentence-output').textContent = 'Sentence not started.';
  $('inspect-step').replaceChildren();
  $('context-view').textContent = '<start>';
  showInspection(false);
}
function train() {
  restartSentence();
  observations.clear();
  model = sentenceBigrams($('corpus').value);
  modelDirty = false;
  $('status').textContent = '';
  apply();
}

function unlockStage3() {
  if (unlocked3) return;
  unlocked3 = true;
  $('stage3-lock').hidden = true;
  $('live-activity').hidden = false;
}
function draw(n) {
  try {
    if (complete || trace.length >= LIMIT) restartSentence();
    let remaining = n === 1 ? 1 : LIMIT - trace.length;
    while (remaining-- > 0 && !complete) {
      const ctx = sentenceWords.at(-1) || '<start>';
      const stepRows = distribution(model.get(ctx) || new Map(), settings);
      const word = sample(stepRows);
      trace.push({ context: ctx, word, rows: stepRows, settings: { ...settings } });
      recordObservation(ctx, word);
      if (word === '<end>') complete = true;
      else sentenceWords.push(word);
      if (trace.length >= LIMIT) break;
    }
    $('sentence-output').textContent = sentenceWords.join(' ') + (complete ? '.' : ' …') +
      (trace.length >= LIMIT && !complete ? ` (Stopped at ${LIMIT} steps; restart or adjust the training sentences or settings.)` : '');
    $('inspect-step').replaceChildren();
    trace.forEach((t, i) => $('inspect-step').append(new Option(`${i + 1}. ${t.context} → ${t.word}`, i)));
    // Open on the first step with a real choice, so the charts show something to compare.
    const branching = n === 1 ? -1 : trace.findIndex(t => t.rows.length > 1);
    $('inspect-step').value = branching >= 0 ? branching : trace.length - 1;
    $('sample').hidden = false;
    $('clear').hidden = false;
    const opening = complete && !unlocked3;
    if (complete) unlockStage3();
    apply();
    $('status').textContent = !complete
      ? 'Word added. Keep going, or inspect this choice in Step 2.'
      : opening
        ? 'Sentence complete. Step 2 shows its word choices, and Step 3 is now unlocked.'
        : 'Sentence complete. Step 2 shows its word choices.';
  } catch (e) {
    $('error').textContent = e.message;
  }
}

$('train').onclick = train;
$('inspect-step').onchange = () => { if (!modelDirty) apply(); };
$('sample').onclick = () => draw(1);
$('many').onclick = () => draw(LIMIT);
$('clear').onclick = () => { restartSentence(); apply(); $('status').textContent = 'Sentence restarted.'; };
for (const id of ['temperature', 'topk', 'topp', 'nucleus']) {
  $(id).addEventListener('input', () => { if (!modelDirty) apply(); });
}
$('corpus').addEventListener('input', () => {
  restartSentence();
  observations.clear();
  modelDirty = true;
  dirty = true;
  $('probability-panel').hidden = true;
  $('error').textContent = '';
  for (const id of ['sample', 'many', 'clear']) $(id).disabled = true;
  $('status').textContent = 'Training sentences changed. Click Build bigram model to update the model.';
  updateStages();
});
for (const prefix of ['', 'live-']) {
  $(prefix + 'nucleus').addEventListener('change', () => {
    const name = $(prefix + 'nucleus').value === 'topq' ? 'top-q' : 'top-p';
    $(prefix + 'cutoff-label').textContent = prefix ? 'LLM ' + name : name[0].toUpperCase() + name.slice(1);
  });
}

// ---- Real LLM generations ----
const liveControls = ['generate', 'prompt', 'live-temperature', 'live-topk', 'live-topp', 'live-nucleus'];
$('generate').onclick = async () => {
  if (busy) return;
  const prompt = $('prompt').value.trim(),
    p = parameters('live-');
  try {
    distribution(new Map([['test', 1]]), p);
    if (p.topk < 1 || !prompt) throw Error('Enter a prompt and an integer LLM top-k from 1 to 50.');
  } catch (e) {
    $('live-error').textContent = e.message;
    return;
  }
  busy = true;
  liveControls.forEach(id => { $(id).disabled = true; });
  $('live-error').textContent = '';
  $('live-status').textContent = 'Waiting for the model…';
  try {
    const r = await live.generate({ mode: 'sampling', prompt, ...p });
    const previous = generations.at(-1);
    generations.push({ prompt, settings: p, model: r.model, text: r.reply, created: new Date().toISOString() });
    const li = node('li', undefined, 'generation');
    li.append(node('p', `Generation ${generations.length}: ${settingsLabel(p)} (${r.model})`, 'generation-meta'));
    if (previous && previous.prompt !== prompt) li.append(node('p', 'New prompt: ' + prompt, 'generation-meta'));
    li.append(node('p', r.reply, 'generation-text'));
    $('generations').append(li);
    const same = generations.filter(g => conditionKey(g.settings) === conditionKey(p) && g.prompt === prompt).length;
    $('live-status').textContent = same < 2
      ? 'Result kept. Generate again with the same settings to see how much the wording varies.'
      : `Result kept (${same} with these settings). Change one setting and generate again to compare.`;
    updateStages();
  } catch (e) {
    $('live-error').textContent = e.message;
    $('live-status').textContent = 'Existing results preserved.';
  } finally {
    busy = false;
    liveControls.forEach(id => { $(id).disabled = false; });
  }
};

$('download').onclick = () =>
  download('11B-sampling.json', {
    activity: '11B',
    corpus: appliedInput?.corpus,
    context: appliedInput?.context,
    pendingInputs: dirty ? { corpus: $('corpus').value, context, settings: parameters() } : null,
    settings,
    distribution: rows,
    counts,
    total,
    generations,
    sentenceTrace: trace,
    sentenceWords,
    languageEvidence: $('language-evidence').value,
  });

live.connection();
train();
})();
