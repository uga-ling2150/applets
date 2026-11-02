(() => {
'use strict';
const $ = id => document.getElementById(id);
const live = window.Week11Live;
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const CONVERSATIONS = ['a', 'b'];
const SETTINGS = { temperature: 0.7, topk: 50, topp: 1 };

let pair = null,
  annotations = [],
  history = [],
  busy = false,
  dialogSide = null,
  pending = null; // the last phrase selected inside an answer: { side, quote }

const PRACTICE_QUESTION = 'In 2–3 sentences, should I drop a class I’m struggling with?';
const examples = {
  a: 'I’m so sorry this class has been stressful, and it’s completely okay to feel overwhelmed. You should talk with your advisor before deciding, because dropping might affect your financial aid. Asking for help is a really good first step.',
  b: 'Check the drop deadline and your current grade first. If a passing grade is unlikely, dropping is probably the better choice. You must confirm how it affects your program requirements.',
};
// The order is the order students see in the popup and the key.
const STANCES = {
  evaluative: { name: 'Evaluative', tag: 'EVAL', colour: '#ffe39b', hint: 'Judges something as good or bad, easy or hard, important or not, such as “a good step” or “tough”.' },
  deontic: { name: 'Deontic', tag: 'DEON', colour: '#bfe3f5', hint: 'Says what should, must or may happen, such as “you should”, “it’s okay to” or a bare command.' },
  epistemic: { name: 'Epistemic', tag: 'EPIS', colour: '#e2d6f7', hint: 'Shows how certain or how informed the speaker is, such as “might”, “probably” or “I think”.' },
  affective: { name: 'Affective', tag: 'AFF', colour: '#ffd3dc', hint: 'Expresses or responds to feeling, such as “I’m sorry”, “don’t worry” or an exclamation mark.' },
};
const STANCE_ORDER = Object.keys(STANCES);

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
const label = side => 'Conversation ' + side.toUpperCase();
const answerOf = side => `the answer in ${label(side)}`;
// The system persona goes in the system prompt; the user persona, if any, opens the user's own message.
function requestFor(personas, question) {
  const prompt = personas.user ? `${personas.user}\n\n${question}` : question;
  return { mode: 'persona', system: personas.system, prompt, ...SETTINGS };
}
const readPersonas = side => ({ system: $('system-' + side).value.trim(), user: $('user-' + side).value.trim() });

// A run of text covered by one or more stance types. Colour and underline come from the type; with
// several types the colours are stacked as bands. The label sits in the CSS ::after, not in the text,
// so it can't end up inside a phrase a student selects.
function stanceMark(text, types, endingTags, isActive) {
  const mark = node('mark', text, 'stance-mark' + (isActive ? ' current-phrase' : ''));
  if (types.length === 1) mark.classList.add('stance-' + types[0]);
  if (types.length > 1) {
    mark.classList.add('stance-overlap');
    const band = 100 / types.length;
    mark.style.background = `linear-gradient(to bottom, ${types.map((t, i) => `${STANCES[t].colour} ${i * band}% ${(i + 1) * band}%`).join(', ')})`;
  }
  mark.dataset.tag = endingTags.join('+');
  if (types.length) mark.title = types.map(t => STANCES[t].name).join(' and ') + ' stance';
  return mark;
}

// ---- Answers, with saved evidence in its stance colour and the phrase being annotated in green ----
function renderOutput(side) {
  const log = $('log-' + side);
  log.replaceChildren();
  const text = pair?.outputs[side];
  if (!text) return;
  const li = node('li', undefined, 'chat-turn ai');
  const source = pair.model[side] === 'authored example' ? 'practice answer' : pair.model[side];
  li.append(node('span', `${label(side)} (${source})`, 'chat-turn__speaker'));
  const p = node('p', undefined, 'chat-turn__text');
  p.dataset.side = side;
  const saved = annotations.filter(a => a.side === side).flatMap(a => exactSpans(text, a.quote).map(([s, e]) => ({ s, e, stance: a.stance })));
  const active = dialogSide === side ? exactSpans(text, $('quote').value) : [];
  const cuts = new Set([0, text.length]);
  for (const { s, e } of saved) { cuts.add(s); cuts.add(e); }
  for (const [s, e] of active) { cuts.add(s); cuts.add(e); }
  const points = [...cuts].sort((a, b) => a - b);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const covering = saved.filter(({ s, e }) => a >= s && b <= e);
    const isActive = active.some(([s, e]) => a >= s && b <= e);
    const piece = text.slice(a, b);
    if (!covering.length && !isActive) { p.append(node('span', piece)); continue; }
    const types = STANCE_ORDER.filter(t => covering.some(c => c.stance === t));
    const ending = STANCE_ORDER.filter(t => covering.some(c => c.stance === t && c.e === b)).map(t => STANCES[t].tag);
    p.append(stanceMark(piece, types, ending, isActive));
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
    body.append(node('strong', `“${a.quote}”`), node('span', STANCES[a.stance].name, `evidence-feature stance-mark stance-${a.stance}`), node('span', a.interpretation, 'evidence-note'));
    const remove = node('button', '🗑', 'btn-uga-outline evidence-remove');
    remove.type = 'button';
    remove.title = 'Remove annotation';
    remove.setAttribute('aria-label', `Remove annotation ${n + 1} for ${label(side)}`);
    remove.onclick = () => {
      annotations.splice(i, 1);
      render();
      $('annotate-' + side).focus();
      $('annotate-status').textContent = 'Annotation removed.';
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
    details.append(node('p', 'Question: ' + p.prompt));
    for (const side of CONVERSATIONS) {
      details.append(node('h5', label(side)));
      if (p.personas[side].system) details.append(node('p', 'System persona: ' + p.personas[side].system));
      if (p.personas[side].user) details.append(node('p', 'User persona: ' + p.personas[side].user));
      details.append(node('p', p.outputs[side]));
      const notes = p.annotations.filter(a => a.side === side);
      if (notes.length) {
        const ul = node('ul');
        notes.forEach(a => ul.append(node('li', `“${a.quote}”: ${STANCES[a.stance].name}: ${a.interpretation}`)));
        details.append(ul);
      }
    }
    $('history').append(details);
  });
}

function render() {
  const sides = new Set(annotations.map(a => a.side));
  $('stage2-lock').hidden = !!pair;
  $('stage2-content').hidden = !pair;
  setStage(1, pair ? 'done' : 'active');
  setStage(2, !pair ? null : sides.has('a') && sides.has('b') ? 'done' : 'active');
  CONVERSATIONS.forEach(side => { renderOutput(side); renderEvidence(side); });
}

function save() {
  if (!pair) return;
  const snapshot = structuredClone({ ...pair, annotations });
  const existing = history.findIndex(p => p.id === pair.id);
  if (existing >= 0) history[existing] = snapshot;
  else history.push(snapshot);
}

// A new pair of answers: the previous one (with its annotations) moves to Earlier comparisons.
function loadPair(next) {
  if (pair) { save(); renderHistory(); }
  pair = next;
  annotations = [];
  render();
  focusHeading('stage2-title');
}

// ---- The annotation popup ----
function updateQuoteCheck() {
  const quote = $('quote').value;
  $('quote-check').textContent = !quote
    ? `Type words exactly as they appear in ${answerOf(dialogSide)}.`
    : exactSpans(pair.outputs[dialogSide], quote).length
      ? 'Found in the answer (outlined in green).'
      : `This phrase doesn't match ${answerOf(dialogSide)}. Check the exact wording.`;
}
function updateFeatureHint() {
  $('feature-help').textContent = STANCES[$('category').value].hint;
}
function openDialog(side, quote) {
  dialogSide = side;
  pending = null;
  $('dialog-title').textContent = 'Annotate ' + answerOf(side);
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
for (const side of CONVERSATIONS) {
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
    $('annotation-error').textContent = 'Explain how this stance relates to the personas.';
    $('interpretation').focus();
    return;
  }
  annotations.push({ side, quote, interpretation, stance: $('category').value });
  closeDialog();
  render();
  $('annotate-' + side).focus({ preventScroll: true });
  const other = side === 'a' ? 'b' : 'a';
  $('annotate-status').textContent = annotations.some(a => a.side === other)
    ? `Annotation added to ${answerOf(side)}. When you have evidence from both answers, download your work or change a persona and generate again.`
    : `Annotation added to ${answerOf(side)}. Now find evidence in ${answerOf(other)}.`;
});

// ---- Generating ----
function promptNotice() {
  const changed = pair && pair.kind === 'live' &&
    (pair.prompt !== $('prompt').value.trim() ||
      CONVERSATIONS.some(side => JSON.stringify(pair.personas[side]) !== JSON.stringify(readPersonas(side))));
  $('status').textContent = changed ? 'Prompts changed. The answers in Step 2 still use the previous prompts and personas. Generate again to compare.' : '';
}
for (const id of ['prompt', 'system-a', 'system-b', 'user-a', 'user-b']) $(id).addEventListener('input', promptNotice);

const generateControls = ['generate', 'prompt', 'system-a', 'system-b', 'user-a', 'user-b', 'example'];
function setBusy(on) {
  busy = on;
  generateControls.forEach(id => { $(id).disabled = on; });
}
$('generate').onclick = async () => {
  if (busy) return;
  const prompt = $('prompt').value.trim(),
    personas = { a: readPersonas('a'), b: readPersonas('b') };
  if (!prompt || !personas.a.system || !personas.b.system) {
    $('error').textContent = 'Enter a question and a system persona for each conversation.';
    return;
  }
  setBusy(true);
  $('error').textContent = '';
  $('status').textContent = 'Generating both answers…';
  try {
    const results = {};
    for (const side of CONVERSATIONS) results[side] = await live.generate(requestFor(personas[side], prompt));
    loadPair({
      id: crypto.randomUUID(),
      created: new Date().toISOString(),
      kind: 'live',
      prompt,
      personas,
      outputs: { a: results.a.reply, b: results.b.reply },
      model: { a: results.a.model, b: results.b.model },
      settings: SETTINGS,
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
    prompt: PRACTICE_QUESTION,
    personas: { a: { system: '', user: 'Authored to illustrate an anxious first-year student.' }, b: { system: '', user: 'Authored to illustrate an experienced adult returning to school.' } },
    outputs: { a: examples.a, b: examples.b },
    model: { a: 'authored example', b: 'authored example' },
  });
  $('status').textContent = 'Practice answers loaded in Step 2. Try finding “might” in Conversation A.';
};

// ---- Saving ----
$('download').onclick = () => {
  save();
  download('12A-stance-user-persona.json', { activity: '12A', comparisons: history });
  $('save-status').textContent = 'Download requested: 12A-stance-user-persona.json, with every comparison and annotation. Download your reflection notes separately below.';
};

live.connection();
render();
})();
