(() => {
'use strict';
const $ = id => document.getElementById(id);
const live = window.Week11Live;
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const PERSONAS = ['a', 'b'];
const SIDES = ['a', 'b', 'base']; // 'base' is the answer with no system prompt (Step 3)
const SETTINGS = { temperature: 0.7, topk: 50, topp: 1 };

let pair = null,
  annotations = [],
  history = [],
  busy = false,
  dialogSide = null,
  pending = null; // the last phrase selected inside an answer: { side, quote }

const examples = {
  a: 'A manageable plan starts with identifying the exam topics. You could then divide the week between reviewing key ideas and practising retrieval.',
  b: 'Let’s tackle the trickiest topics first! Give yourself a small practice challenge each day, and build momentum through the week.',
  base: 'To prepare for a difficult exam, review your notes and identify the key topics, then practise with past questions or flashcards over several short study sessions.',
};
const featureHints = {
  address: 'How the speaker refers to you or includes you, such as “you” or “let’s”. Explain the relationship those words suggest.',
  certainty: 'How strongly a claim or suggestion is stated, such as cautious “could” versus direct “will”.',
  register: 'Formal, technical or conversational word choices, such as “retrieval” versus “bring back”.',
  evaluation: 'Words or punctuation that convey judgements or feelings, such as “great” or an exclamation mark.',
  politeness: 'How a request or instruction is softened or made direct, such as “please consider” versus “do this”.',
  other: 'Name the language feature you notice and explain it using the exact phrase. More than one interpretation may be reasonable.',
};

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
function exactSpans(text, quote) {
  if (!quote) return [];
  const spans = [];
  let at = 0;
  while ((at = text.indexOf(quote, at)) >= 0) {
    spans.push([at, at + quote.length]);
    at += quote.length;
  }
  return spans;
}
function focusHeading(id) {
  const heading = $(id);
  heading.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
  heading.focus({ preventScroll: true });
}
function setStage(n, status) {
  $(`stage${n}`).classList.remove('active', 'done');
  if (status) $(`stage${n}`).classList.add(status);
}
const label = side => (side === 'base' ? 'No system prompt' : 'Persona ' + side.toUpperCase());
const answerOf = side => (side === 'base' ? 'the answer with no system prompt' : `the ${label(side)} answer`);
const statusFor = side => (side === 'base' ? 'base-status' : 'annotate-status');

// ---- Answers, with saved evidence in yellow and the phrase being annotated in green ----
// Step 3 repeats A and B as read-only recaps, so those copies can't start a new annotation.
function renderOutput(side, logId = 'log-' + side, selectable = true) {
  const log = $(logId);
  log.replaceChildren();
  const text = pair?.outputs[side];
  if (!text) return;
  const li = node('li', undefined, 'chat-turn ai');
  const source = pair.model[side] === 'authored example' ? 'practice answer' : pair.model[side];
  li.append(node('span', `${label(side)} (${source})`, 'chat-turn__speaker'));
  const p = node('p', undefined, 'chat-turn__text');
  if (selectable) p.dataset.side = side;
  const saved = annotations.filter(a => a.side === side).flatMap(a => exactSpans(text, a.quote));
  const active = selectable && dialogSide === side ? exactSpans(text, $('quote').value) : [];
  const cuts = new Set([0, text.length]);
  for (const [a, b] of [...saved, ...active]) { cuts.add(a); cuts.add(b); }
  const points = [...cuts].sort((a, b) => a - b);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const isSaved = saved.some(([s, e]) => a >= s && b <= e);
    const isActive = active.some(([s, e]) => a >= s && b <= e);
    p.append(node(isSaved || isActive ? 'mark' : 'span', text.slice(a, b), isActive ? 'current-phrase' : undefined));
  }
  li.append(p);
  log.append(li);
}

function renderEvidence(side) {
  const list = $('annotations-' + side);
  list.replaceChildren();
  const mine = annotations.map((a, i) => [a, i]).filter(([a]) => a.side === side);
  if (!mine.length) {
    list.append(node('li', 'No annotations yet. Select words in the answer above.', 'evidence-empty'));
    return;
  }
  mine.forEach(([a, i], n) => {
    const li = node('li', undefined, 'evidence-item');
    const body = node('div', undefined, 'evidence-text');
    body.append(node('strong', `“${a.quote}”`), node('span', a.category, 'evidence-feature'), node('span', a.interpretation, 'evidence-note'));
    const remove = node('button', '🗑', 'btn-uga-outline evidence-remove');
    remove.type = 'button';
    remove.title = 'Remove annotation';
    remove.setAttribute('aria-label', `Remove annotation ${n + 1} for ${label(side)}`);
    remove.onclick = () => {
      annotations.splice(i, 1);
      render();
      $('annotate-' + side).focus();
      $(statusFor(side)).textContent = 'Annotation removed.';
    };
    li.append(body, remove);
    list.append(li);
  });
}

function renderHistory() {
  $('history-panel').hidden = history.length === 0;
  $('history').replaceChildren();
  history.forEach((p, i) => {
    const details = node('details', undefined, 'glossary-box');
    details.append(node('summary', `Comparison ${i + 1}: ${p.kind === 'practice' ? 'practice answers' : 'live model'}, ${new Date(p.created).toLocaleTimeString()}`));
    details.append(node('p', 'User question: ' + p.prompt));
    for (const side of SIDES) {
      if (!p.outputs[side]) continue;
      details.append(node('h5', label(side)));
      if (side !== 'base') details.append(node('p', 'System prompt: ' + p.systems[side]));
      details.append(node('p', p.outputs[side]));
      const notes = p.annotations.filter(a => a.side === side);
      if (notes.length) {
        const ul = node('ul');
        notes.forEach(a => ul.append(node('li', `“${a.quote}”: ${a.category}: ${a.interpretation}`)));
        details.append(ul);
      }
    }
    if (p.comparison) details.append(node('h5', 'Your comparison'), node('p', p.comparison));
    $('history').append(details);
  });
}

function render() {
  const sides = new Set(annotations.map(a => a.side));
  const hasBase = !!pair?.outputs.base;
  for (const n of [2, 3]) {
    $(`stage${n}-lock`).hidden = !!pair;
    $(`stage${n}-content`).hidden = !pair;
  }
  $('baseline-panel').hidden = !hasBase;
  setStage(1, pair ? 'done' : 'active');
  setStage(2, !pair ? null : sides.has('a') && sides.has('b') ? 'done' : 'active');
  setStage(3, !pair ? null : hasBase && pair.comparison ? 'done' : annotations.length || hasBase ? 'active' : null);
  SIDES.forEach(side => { renderOutput(side); renderEvidence(side); });
  PERSONAS.forEach(side => renderOutput(side, 'recap-' + side, false));
}

function save() {
  if (!pair) return;
  const snapshot = structuredClone({ ...pair, annotations });
  const existing = history.findIndex(p => p.id === pair.id);
  if (existing >= 0) history[existing] = snapshot;
  else history.push(snapshot);
}

// A new pair of answers: the previous one (with its baseline and annotations) moves to Earlier comparisons.
function loadPair(next) {
  if (pair) { save(); renderHistory(); }
  pair = next;
  annotations = [];
  $('baseline-comparison').value = '';
  $('base-status').textContent = '';
  $('base-error').textContent = '';
  render();
  focusHeading('stage2-title');
}

// ---- The annotation popup ----
function updateQuoteCheck() {
  const quote = $('quote').value;
  $('quote-check').textContent = !quote
    ? `Type words exactly as they appear in ${answerOf(dialogSide)}.`
    : exactSpans(pair.outputs[dialogSide], quote).length
      ? 'Found in the answer (highlighted green).'
      : `This phrase doesn't match ${answerOf(dialogSide)}. Check the exact wording.`;
}
function updateFeatureHint() {
  $('feature-help').textContent = featureHints[$('category').value];
}
function openDialog(side, quote) {
  dialogSide = side;
  pending = null;
  $('dialog-title').textContent = side === 'base' ? 'Annotate the answer with no system prompt' : 'Annotate ' + label(side);
  $('quote').value = quote || '';
  $('interpretation').value = '';
  $('annotation-error').textContent = '';
  updateQuoteCheck();
  updateFeatureHint();
  window.getSelection()?.removeAllRanges();
  $('annotation-dialog').showModal();
  (quote ? $('category') : $('quote')).focus();
  renderOutput(side);
}
function selectionIn(side) {
  const selection = window.getSelection();
  const quote = selection?.toString();
  const anchor = selection?.anchorNode?.parentElement?.closest('[data-side]');
  const focus = selection?.focusNode?.parentElement?.closest('[data-side]');
  if (!pair || !quote || !quote.trim() || !anchor || anchor !== focus) return null;
  if (side && anchor.dataset.side !== side) return null;
  return { side: anchor.dataset.side, quote };
}

// Mouse users get the popup as soon as they finish selecting. Touch and keyboard selections are
// remembered so the Annotate button under that answer can pick them up.
document.addEventListener('selectionchange', () => {
  const found = selectionIn();
  if (found) pending = found;
});
document.addEventListener('pointerdown', e => {
  if (!e.target.closest('[data-annotate], [data-side], dialog')) pending = null;
});
for (const side of SIDES) {
  $('log-' + side).addEventListener('pointerup', e => {
    if (e.pointerType !== 'mouse') return;
    setTimeout(() => {
      const found = selectionIn(side);
      if (found && !$('annotation-dialog').open) openDialog(side, found.quote);
    }, 0);
  });
  $('annotate-' + side).onclick = () => openDialog(side, pending?.side === side ? pending.quote : '');
}
$('quote').addEventListener('input', () => { $('annotation-error').textContent = ''; updateQuoteCheck(); renderOutput(dialogSide); });
$('interpretation').addEventListener('input', () => { $('annotation-error').textContent = ''; });
$('category').addEventListener('change', updateFeatureHint);
// The 'close' event fires asynchronously, so clear the popup's state here as well (Escape still uses the event).
function closeDialog() {
  const side = dialogSide;
  dialogSide = null;
  if ($('annotation-dialog').open) $('annotation-dialog').close();
  if (side) renderOutput(side);
}
$('cancel-annotation').onclick = closeDialog;
$('annotation-dialog').addEventListener('close', closeDialog);
$('annotation-form').addEventListener('submit', e => {
  e.preventDefault();
  const side = dialogSide,
    quote = $('quote').value,
    interpretation = $('interpretation').value.trim();
  if (!quote || !exactSpans(pair.outputs[side], quote).length) {
    $('annotation-error').textContent = `Enter a phrase that appears exactly in ${answerOf(side)}.`;
    $('quote').focus();
    return;
  }
  if (!interpretation) {
    $('annotation-error').textContent = 'Explain how this phrase suggests a persona.';
    $('interpretation').focus();
    return;
  }
  annotations.push({ side, quote, interpretation, category: $('category').selectedOptions[0].textContent });
  closeDialog();
  render();
  $('annotate-' + side).focus({ preventScroll: true });
  if (side === 'base') {
    $('base-status').textContent = 'Annotation added to the answer with no system prompt.';
    return;
  }
  const other = side === 'a' ? 'b' : 'a';
  $('annotate-status').textContent = annotations.some(a => a.side === other)
    ? `Annotation added to ${label(side)}. When you have evidence from both answers, continue to Step 3.`
    : `Annotation added to ${label(side)}. Now find evidence in the ${label(other)} answer.`;
});

// ---- Generating ----
function promptNotice() {
  const changed = pair && pair.kind === 'live' &&
    (pair.prompt !== $('prompt').value.trim() ||
      pair.systems.a !== $('system-a').value.trim() ||
      pair.systems.b !== $('system-b').value.trim());
  $('status').textContent = changed ? 'Prompts changed. The answers in Step 2 still use the previous prompts. Generate again to compare.' : '';
}
for (const id of ['prompt', 'system-a', 'system-b']) $(id).addEventListener('input', promptNotice);

const generateControls = ['generate', 'prompt', 'system-a', 'system-b', 'example', 'generate-base', 'example-base'];
function setBusy(on) {
  busy = on;
  generateControls.forEach(id => { $(id).disabled = on; });
}
$('generate').onclick = async () => {
  if (busy) return;
  const prompt = $('prompt').value.trim(),
    systems = { a: $('system-a').value.trim(), b: $('system-b').value.trim() };
  if (!prompt || !systems.a || !systems.b) {
    $('error').textContent = 'Enter a question and both system prompts.';
    return;
  }
  setBusy(true);
  $('error').textContent = '';
  $('status').textContent = 'Generating both personas…';
  try {
    const results = {};
    for (const side of PERSONAS) results[side] = await live.generate({ mode: 'persona', prompt, system: systems[side], ...SETTINGS });
    loadPair({
      id: crypto.randomUUID(),
      created: new Date().toISOString(),
      kind: 'live',
      prompt,
      systems,
      outputs: { a: results.a.reply, b: results.b.reply },
      model: { a: results.a.model, b: results.b.model },
      settings: SETTINGS,
      comparison: '',
    });
    $('status').textContent = 'Both answers are ready in Step 2.';
  } catch (e) {
    $('error').textContent = e.message;
    $('status').textContent = 'No answers replaced; any existing work is preserved.';
  } finally {
    setBusy(false);
  }
};
$('example').onclick = () => {
  $('error').textContent = '';
  loadPair({
    id: crypto.randomUUID(),
    created: new Date().toISOString(),
    kind: 'practice',
    prompt: 'In 1–2 sentences, how can I prepare for a difficult exam next week?',
    systems: { a: 'Authored to illustrate a measured university tutor.', b: 'Authored to illustrate an enthusiastic peer.' },
    outputs: { a: examples.a, b: examples.b },
    model: { a: 'authored example', b: 'authored example' },
    comparison: '',
  });
  $('status').textContent = 'Practice answers loaded in Step 2. Try finding “You could” in Persona A.';
};

// The baseline answers the question the personas answered, even if the Step 1 box has been edited since.
function setBaseline(text, model) {
  annotations = annotations.filter(a => a.side !== 'base');
  pair.outputs.base = text;
  pair.model.base = model;
  render();
}
$('generate-base').onclick = async () => {
  if (busy || !pair) return;
  setBusy(true);
  $('base-error').textContent = '';
  $('base-status').textContent = 'Generating with no system prompt…';
  try {
    const r = await live.generate({ mode: 'baseline', prompt: pair.prompt, ...SETTINGS });
    setBaseline(r.reply, r.model);
    $('base-status').textContent = 'The answer with no system prompt is ready. Compare it with both personas below.';
  } catch (e) {
    $('base-error').textContent = e.message;
    $('base-status').textContent = 'Existing answers preserved.';
  } finally {
    setBusy(false);
  }
};
$('example-base').onclick = () => {
  if (!pair) return;
  $('base-error').textContent = '';
  setBaseline(examples.base, 'authored example');
  $('base-status').textContent = 'Practice answer loaded. It was written by the course team to illustrate a typical default assistant style.';
};
$('baseline-comparison').addEventListener('input', () => {
  if (!pair) return;
  pair.comparison = $('baseline-comparison').value;
  render();
});

// ---- Saving ----
$('download').onclick = () => {
  save();
  download('11A-style-persona.json', { activity: '11A', comparisons: history });
  $('save-status').textContent = 'Download requested: 11A-style-persona.json, with every comparison, annotation and your written comparison. Download your reflection notes separately below.';
};

live.connection();
render();
})();
