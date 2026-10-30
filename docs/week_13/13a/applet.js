(() => {
'use strict';
const $ = id => document.getElementById(id);
const { parse } = window.SsmlCore;
const synth = window.speechSynthesis;
const TURN_GAP = 250;

const SAMPLE = `<speak>
  <voice name="Assistant">
    <s>Thanks for calling the <say-as interpret-as="characters">UGA</say-as> bus line.</s>
    <s>Where are you <emphasis level="moderate">heading</emphasis> today?</s>
    <mark name="TRP"/>
  </voice>

  <voice name="Caller">
    <s>Um, <break time="400ms"/> the Science Library.</s>
  </voice>

  <voice name="Assistant">
    <p>
      <s>OK, the Science Library.</s>
      <s>Take route <emphasis level="strong">eleven</emphasis> from the <sub alias="Tate Student Center">Tate Center</sub>.</s>
    </p>
    <break time="1200ms"/>
    <s>It leaves at <say-as interpret-as="time">10:45</say-as>, <break strength="weak"/>
       and gets there <prosody rate="slow">about ten minutes later</prosody>.</s>
  </voice>

  <voice name="Caller">
    <s>Route eleven? <break time="200ms"/> Not route <emphasis level="strong">ten</emphasis>?</s>
  </voice>

  <voice name="Assistant">
    <s>Right. <emphasis level="strong">Eleven</emphasis>, not ten.</s>
    <s>Route ten is <prosody pitch="low" rate="slow">out of service</prosody>
       until <say-as interpret-as="date" format="md">10/27</say-as>,
       so for updates you can call <say-as interpret-as="telephone">706-555-0142</say-as>.</s>
  </voice>

  <voice name="Caller">
    <s><prosody rate="fast" volume="soft">Got it, thanks.</prosody></s>
  </voice>
</speak>`;

function node(tag, text, cls) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}
function setStage(n, status) {
  $(`stage${n}`).classList.remove('active', 'done');
  if (status) $(`stage${n}`).classList.add(status);
}

let parsed = { turns: [], errors: [], warnings: [] };
let chunkEls = new Map();
let voices = [];
const voiceFor = Object.create(null); // speaker name -> voiceURI
let run = 0;
let playing = false;
let current = null;
const versions = [];
const heard = { example: false, sample: false };

/* ---------- Voices ---------- */

function loadVoices() {
  if (!synth) return;
  const all = synth.getVoices();
  const english = all.filter(v => /^en\b|^en-/i.test(v.lang));
  voices = english.length ? english : all;
  renderVoicePicker();
}
function voiceObj(speaker) {
  const uri = voiceFor[speaker];
  return voices.find(v => v.voiceURI === uri) || null;
}
function assignVoices(speakers) {
  const used = new Set(Object.values(voiceFor));
  for (const s of speakers) {
    if (voiceFor[s] && voices.some(v => v.voiceURI === voiceFor[s])) continue;
    const fresh = voices.find(v => !used.has(v.voiceURI)) || voices[Object.keys(voiceFor).length % Math.max(1, voices.length)];
    if (fresh) {
      voiceFor[s] = fresh.voiceURI;
      used.add(fresh.voiceURI);
    }
  }
}
function speakers(result) {
  return [...new Set(result.turns.map(t => t.speaker))];
}
function renderVoicePicker() {
  const names = speakers(parsed);
  const box = $('voice-fields');
  box.replaceChildren();
  $('voice-picker').hidden = !synth || !voices.length || !names.length;
  if ($('voice-picker').hidden) return;
  assignVoices(names);
  names.forEach((name, i) => {
    const wrap = node('div', undefined, 'field');
    const id = `voice-${i}`;
    const label = node('label', name);
    label.htmlFor = id;
    const select = node('select');
    select.id = id;
    select.className = 'form-select';
    for (const v of voices) {
      const opt = node('option', `${v.name} (${v.lang})`);
      opt.value = v.voiceURI;
      select.append(opt);
    }
    select.value = voiceFor[name] || '';
    select.addEventListener('change', () => { voiceFor[name] = select.value; });
    wrap.append(label, select);
    box.append(wrap);
  });
}

/* ---------- Prosody view ---------- */

function describe(item) {
  const bits = [];
  if (item.emphasis) bits.push(`${item.emphasis} emphasis`);
  if (item.pitch !== 1) bits.push(`pitch ${item.pitch.toFixed(2)}`);
  if (item.rate !== 1) bits.push(`rate ${item.rate.toFixed(2)}`);
  if (item.volume !== 1) bits.push(`volume ${item.volume.toFixed(2)}`);
  return bits.join(', ');
}
function trpChip(trp) {
  const kind = trp.endOfTurn ? 'end' : trp.pause >= 500 ? 'mid' : 'weak';
  const what = trp.endOfTurn ? 'end of turn' : trp.pause ? `mid-turn, ${trp.pause} ms pause` : 'mid-turn, no pause';
  const chip = node('span', 'TRP', `trp trp--${kind}`);
  chip.title = `Possible TRP${trp.question ? ' after a question' : ''}: ${what}`;
  chip.append(node('span', ` (${trp.question ? 'question, ' : ''}${what})`, 'visually-hidden'));
  return chip;
}
function renderScore() {
  const score = $('score');
  score.replaceChildren();
  chunkEls = new Map();
  if (parsed.errors.length) {
    score.append(node('p', 'Fix the problem above to see the prosody view.', 'field-hint'));
    return;
  }
  if (!parsed.turns.length) {
    score.append(node('p', 'There is nothing to say yet. Put some words inside <speak> … </speak>.', 'field-hint'));
    return;
  }
  parsed.turns.forEach((turn, ti) => {
    const row = node('div', undefined, 'score-turn');
    const head = node('div', undefined, 'score-turn__head');
    head.append(node('span', `${ti + 1}. ${turn.speaker}`, 'score-turn__speaker'));
    const btn = node('button', 'Play from here', 'btn-uga-outline score-turn__play');
    btn.type = 'button';
    btn.setAttribute('aria-label', `Play from turn ${ti + 1} (${turn.speaker})`);
    btn.addEventListener('click', () => play(parsed, ti, true));
    head.append(btn);
    const line = node('p', undefined, 'score-line');
    const trpAfter = new Map(turn.trps.map(t => [t.after, t]));
    turn.items.forEach((item, ii) => {
      if (item.type === 'text') {
        const span = node('span', item.text, 'chunk');
        if (item.emphasis) span.classList.add(`chunk--${item.emphasis}`);
        // Draw pitch as height, volume as size and rate as spacing.
        span.style.setProperty('--rise', `${((item.pitch - 1) * 22).toFixed(1)}px`);
        span.style.setProperty('--size', `${(0.85 + 0.25 * item.volume + (item.emphasis === 'strong' ? 0.15 : 0)).toFixed(2)}em`);
        span.style.setProperty('--spread', `${Math.max(-0.02, (1 / item.rate - 1) * 0.12).toFixed(3)}em`);
        const d = describe(item);
        if (d) {
          span.title = d;
          span.append(node('span', ` (${d})`, 'visually-hidden'));
        }
        chunkEls.set(`${ti}:${ii}`, span);
        line.append(span);
        if (trpAfter.has(ii)) line.append(trpChip(trpAfter.get(ii)));
      } else if (item.type === 'break' && item.ms > 0) {
        const gap = node('span', undefined, 'pause');
        gap.style.width = `${Math.min(120, Math.max(6, item.ms / 15))}px`;
        gap.title = `${item.ms} ms pause`;
        if (item.ms >= 300) gap.append(node('span', `${item.ms} ms`, 'pause__label'));
        else gap.append(node('span', `${item.ms} ms pause`, 'visually-hidden'));
        line.append(gap);
      } else if (item.type === 'mark') {
        line.append(node('span', item.name || 'mark', 'mark-flag'));
      }
    });
    row.append(head, line);
    score.append(row);
  });
}
function renderProblems() {
  const err = parsed.errors[0] || '';
  $('parse-error').textContent = err;
  const list = $('warnings');
  list.replaceChildren(...parsed.warnings.slice(0, 6).map(w => node('li', w)));
  $('problems').hidden = !err && !parsed.warnings.length;
  $('play').disabled = !!err || !parsed.turns.length || !synth;
}
function update() {
  parsed = parse($('script').value);
  renderProblems();
  renderScore();
  renderVoicePicker();
}

/* ---------- Playback ---------- */

const sleep = ms => new Promise(r => setTimeout(r, ms));
function say(item, speaker) {
  return new Promise(resolve => {
    const u = new SpeechSynthesisUtterance(item.text);
    const v = voiceObj(speaker);
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    }
    u.rate = item.rate;
    u.pitch = item.pitch;
    u.volume = item.volume;
    u.onend = u.onerror = () => resolve();
    current = u; // keep a reference: some browsers drop events for collected utterances
    synth.speak(u);
  });
}
function highlight(el) {
  document.querySelectorAll('.chunk.speaking').forEach(n => n.classList.remove('speaking'));
  if (el) el.classList.add('speaking');
}
function setPlaying(on) {
  playing = on;
  $('stop').disabled = !on;
  if (!on) highlight(null);
}
async function play(result, fromTurn = 0, showInView = false) {
  if (!synth || result.errors.length) return;
  stop();
  const id = ++run;
  setPlaying(true);
  assignVoices(speakers(result));
  for (let ti = fromTurn; ti < result.turns.length; ti++) {
    const turn = result.turns[ti];
    if (ti > fromTurn) await sleep(TURN_GAP);
    if (id !== run) return;
    if (showInView) $('status').textContent = `Playing turn ${ti + 1} (${turn.speaker})`;
    for (let ii = 0; ii < turn.items.length; ii++) {
      const item = turn.items[ii];
      if (id !== run) return;
      if (item.type === 'break' && item.ms) await sleep(item.ms);
      if (item.type !== 'text') continue;
      if (showInView) highlight(chunkEls.get(`${ti}:${ii}`));
      await say(item, turn.speaker);
    }
  }
  if (id !== run) return;
  setPlaying(false);
  if (showInView) $('status').textContent = 'Finished.';
}
function stop() {
  run++;
  if (synth) synth.cancel();
  setPlaying(false);
}

/* ---------- Saved versions ---------- */

function renderVersions() {
  const list = $('versions');
  list.replaceChildren();
  versions.forEach((v, i) => {
    const li = node('li', undefined, 'version');
    li.append(node('span', v.label, 'version__label'), node('span', ` saved ${v.time}`, 'version__time'));
    const row = node('div', undefined, 'btn-row');
    const playBtn = node('button', 'Play', 'btn-uga-outline');
    playBtn.type = 'button';
    playBtn.setAttribute('aria-label', `Play version ${i + 1}: ${v.label}`);
    playBtn.addEventListener('click', () => {
      $('status').textContent = '';
      play(parse(v.script));
    });
    const loadBtn = node('button', 'Load into the editor', 'btn-uga-outline');
    loadBtn.type = 'button';
    loadBtn.setAttribute('aria-label', `Load version ${i + 1} into the editor: ${v.label}`);
    loadBtn.addEventListener('click', () => {
      stop();
      $('script').value = v.script;
      update();
      $('save-status').textContent = `Loaded “${v.label}” into the editor.`;
      $('script').focus();
    });
    row.append(playBtn, loadBtn);
    li.append(row);
    list.append(li);
  });
  $('versions-panel').hidden = !versions.length;
}
function saveVersion() {
  const script = $('script').value;
  const label = $('version-label').value.trim() || `Version ${versions.length + 1}`;
  versions.push({ label, script, time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) });
  $('version-label').value = '';
  renderVersions();
  $('save-status').textContent = `Saved “${label}”. You have ${versions.length} saved version${versions.length === 1 ? '' : 's'}.`;
  if (versions.length >= 2) setStage(3, 'done');
}
function downloadWork() {
  const parts = [
    'Activity 13A: Prosody with SSML',
    `Downloaded ${new Date().toLocaleString()}`,
    '',
    '=== Current script ===',
    $('script').value,
  ];
  versions.forEach((v, i) => parts.push('', `=== Version ${i + 1}: ${v.label} (saved ${v.time}) ===`, v.script));
  const url = URL.createObjectURL(new Blob([parts.join('\n') + '\n'], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'week13a-ssml-scripts.txt';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('save-status').textContent = 'Downloaded your scripts.';
}

/* ---------- Wiring ---------- */

let timer;
$('script').addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (playing) stop();
    update();
  }, 250);
});
$('play').addEventListener('click', () => {
  play(parsed, 0, true);
  if (!heard.sample) {
    heard.sample = true;
    setStage(2, 'done');
    setStage(3, 'active');
  }
});
$('stop').addEventListener('click', () => {
  stop();
  $('status').textContent = 'Stopped.';
});
$('reset').addEventListener('click', () => {
  stop();
  $('script').value = SAMPLE;
  update();
  $('status').textContent = 'The sample script is back.';
});
$('save-version').addEventListener('click', saveVersion);
$('download').addEventListener('click', downloadWork);

document.querySelectorAll('[data-listen]').forEach(btn => {
  const code = btn.previousElementSibling.textContent;
  const src = /^\s*<speak[\s>]/.test(code) ? code : `<speak>${code}</speak>`;
  btn.setAttribute('aria-label', `Listen: ${code}`);
  btn.addEventListener('click', () => {
    play(parse(src));
    if (!heard.example) {
      heard.example = true;
      setStage(1, 'done');
      if (!heard.sample) setStage(2, 'active');
    }
  });
});

if (!synth || typeof window.SpeechSynthesisUtterance !== 'function') {
  $('no-speech').hidden = false;
  document.querySelectorAll('[data-listen]').forEach(b => { b.disabled = true; });
} else {
  loadVoices();
  synth.addEventListener?.('voiceschanged', loadVoices);
}
window.addEventListener('pagehide', stop);
$('script').value = SAMPLE;
update();
})();
