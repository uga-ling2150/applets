(() => {
  'use strict';
  if (new URLSearchParams(location.search).get('mode') !== 'practice') return;
  document.getElementById('practice-panel').hidden = false;
  const clips = window.TRP_CLIPS;
  const core = window.TRPCore;
  const STORAGE = 'ling2150-9a-attempt-v1';
  const GROUP = 'ling2150-9a-group-v1';
  const $ = id => document.getElementById(id);
  const audio = $('clip-audio');
  let state = load(STORAGE);
  let imported = load(GROUP);
  let playing = false;
  let visibleCount = -1;
  let playhead, marker;
  const svgNS = 'http://www.w3.org/2000/svg';

  function load(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }
  function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage may be unavailable */ } }
  function newId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
  }
  function fresh() { return { version: core.VERSION, id: newId(), index: 0, marks: clips.map(() => null) }; }
  if (!core.validateSubmission(state, clips) || !Number.isInteger(state.index) ||
      state.index < 0 || state.index > clips.length) state = fresh();
  if (!Array.isArray(imported)) imported = [];
  imported = imported.filter(item => core.validateSubmission(item, clips)).slice(0, 60);

  function duration(t) { return `0:${Math.floor(t).toString().padStart(2, '0')}`; }
  function transcriptText(clip) { return clip.words.map(word => word.text).join(' '); }
  function wordCount(clip, t) { return clip.words.filter(word => word.start <= t).length; }
  function renderWords() {
    const clip = clips[state.index];
    if (!clip) return;
    const count = wordCount(clip, audio.currentTime);
    if (count === visibleCount) return;
    visibleCount = count;
    const target = $('running-transcript');
    target.replaceChildren();
    if (!count) { target.textContent = 'Listen for the speaker...'; return; }
    clip.words.slice(0, count).forEach((word, i) => {
      const span = document.createElement('span');
      span.className = 'trp-word' + (i === count - 1 ? ' current' : '');
      span.textContent = word.text;
      target.append(span);
    });
    target.scrollTop = target.scrollHeight;
  }
  function renderWave(clip) {
    const svg = $('wave'); svg.replaceChildren();
    clip.wave.forEach((amplitude, i) => {
      const rect = document.createElementNS(svgNS, 'rect');
      const height = Math.max(3, amplitude * 68);
      rect.setAttribute('x', String(i * 10 + 1));
      rect.setAttribute('y', String((80 - height) / 2));
      rect.setAttribute('width', '8'); rect.setAttribute('height', String(height));
      rect.setAttribute('fill', '#48616a'); svg.append(rect);
    });
    marker = document.createElementNS(svgNS, 'line');
    marker.setAttribute('y1', '0'); marker.setAttribute('y2', '80');
    marker.setAttribute('stroke', '#ba0c2f'); marker.setAttribute('stroke-width', '4');
    svg.append(marker);
    playhead = document.createElementNS(svgNS, 'line');
    playhead.setAttribute('y1', '0'); playhead.setAttribute('y2', '80');
    playhead.setAttribute('stroke', '#111'); playhead.setAttribute('stroke-width', '3');
    svg.append(playhead);
    updateWave(clip, 0);
  }
  function updateWave(clip, time) {
    const x = Math.min(960, Math.max(0, time / clip.duration * 960));
    playhead.setAttribute('x1', String(x)); playhead.setAttribute('x2', String(x));
    const chosen = state.marks[state.index];
    marker.style.display = chosen === null ? 'none' : '';
    if (chosen !== null) {
      const m = chosen / clip.duration * 960;
      marker.setAttribute('x1', String(m)); marker.setAttribute('x2', String(m));
    }
  }
  function renderRound() {
    if (state.index >= clips.length) return renderResults();
    const clip = clips[state.index];
    audio.pause();
    audio.src = clip.file;
    audio.load();
    playing = false;
    visibleCount = -1;
    $('round-title').textContent = `Recording ${state.index + 1} of ${clips.length}`;
    $('round-context').textContent = clip.title;
    $('visual-support').hidden = true;
    $('round-status').textContent = 'Ready to listen.';
    $('mark-status').textContent = '';
    $('audio-error').textContent = '';
    $('full-transcript').textContent = transcriptText(clip);
    $('start').textContent = 'Start listening';
    $('start').disabled = false;
    $('mark').disabled = true;
    $('next').hidden = true;
    $('next').textContent = state.index === clips.length - 1 ? 'See my results' : 'Next recording';
    $('play-progress').value = 0;
    $('play-progress').max = clip.duration;
    $('play-clock').textContent = `0:00 / ${duration(clip.duration)}`;
    renderWave(clip);
    renderWords();
  }
  function updatePlayback() {
    if (state.index >= clips.length) return;
    const clip = clips[state.index];
    $('play-progress').value = Math.min(audio.currentTime, clip.duration);
    $('play-clock').textContent = `${duration(audio.currentTime)} / ${duration(clip.duration)}`;
    updateWave(clip, audio.currentTime);
    renderWords();
  }
  $('start').addEventListener('click', async () => {
    if (state.index >= clips.length) return;
    $('visual-support').hidden = true;
    audio.currentTime = 0;
    visibleCount = -1;
    $('audio-error').textContent = '';
    $('start').disabled = true;
    $('next').hidden = true;
    $('round-status').textContent = 'Playing. Choose a possible entry point.';
    try {
      await audio.play();
      playing = true;
      $('mark').disabled = state.marks[state.index] !== null;
      $('mark').focus();
    } catch {
      playing = false;
      $('start').disabled = false;
      $('round-status').textContent = 'Playback did not start.';
      $('audio-error').textContent = 'Check your audio connection, then press Start listening again.';
    }
  });
  $('mark').addEventListener('click', () => {
    if (!playing || audio.paused || audio.ended || state.marks[state.index] !== null) return;
    state.marks[state.index] = Math.round(audio.currentTime * 100) / 100;
    updateWave(clips[state.index], audio.currentTime);
    save(STORAGE, state);
    $('mark').disabled = true;
    $('mark-status').textContent = 'Choice saved. Keep listening to the end.';
  });
  audio.addEventListener('timeupdate', updatePlayback);
  audio.addEventListener('ended', () => {
    playing = false;
    $('mark').disabled = true;
    $('start').disabled = false;
    $('start').textContent = 'Replay recording';
    $('next').hidden = false;
    $('visual-support').hidden = false;
    $('round-status').textContent = 'Recording ended.';
    $('mark-status').textContent = state.marks[state.index] === null ?
      'No choice recorded. You can replay and mark once, or continue without a mark.' :
      'Your choice is saved. Continue when ready.';
    $('next').focus();
  });
  audio.addEventListener('error', () => {
    playing = false;
    $('mark').disabled = true;
    $('start').disabled = false;
    $('audio-error').textContent = 'The recording could not load. Check the connection and try again.';
  });
  $('next').addEventListener('click', () => {
    if (!audio.ended) return;
    state.index++;
    save(STORAGE, state);
    if (state.index === clips.length) renderResults(); else renderRound();
  });

  function offsetText(value) {
    if (value === null) return 'No mark';
    if (value === 0) return 'At the annotated end';
    return `${Math.abs(value).toFixed(2)} s ${value < 0 ? 'before' : 'after'} the annotated end`;
  }
  function chart(target, submissions) {
    window.TRPCharts.render(target, submissions, clips);
  }

  function renderResults() {
    audio.pause();
    $('play-panel').hidden = true;
    $('results').hidden = false;
    const rows = $('result-rows'); rows.replaceChildren();
    clips.forEach((clip, i) => {
      const tr = document.createElement('tr');
      [ `${i + 1}. ${clip.title}`, offsetText(core.offset(state.marks[i], clip)),
        `${(clip.nextOnset - clip.turnEnd).toFixed(2)} s after annotated end` ].forEach(value => {
        const td = document.createElement('td'); td.textContent = value; tr.append(td);
      });
      rows.append(tr);
    });
    chart($('individual-chart'), [state]);
    $('results-title').focus();
    renderGroup();
  }
  function download(name, data) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $('download').addEventListener('click', () => download('ling2150-9a-choices.json', {
    version: core.VERSION, id: state.id, marks: state.marks
  }));
  $('restart').addEventListener('click', () => {
    state = fresh(); save(STORAGE, state);
    $('results').hidden = true; $('play-panel').hidden = false; renderRound();
    $('round-title').focus();
  });
  function renderGroup() {
    const submissions = [...imported];
    if (state.index === clips.length && !submissions.some(item => item.id === state.id)) submissions.push(state);
    chart($('group-chart'), submissions);
  }
  $('import').addEventListener('change', async event => {
    let accepted = 0, rejected = 0;
    for (const file of event.target.files) {
      if (file.size > 1000000 || imported.length >= 60) { rejected++; continue; }
      try {
        const item = JSON.parse(await file.text());
        if (!core.validateSubmission(item, clips) || imported.some(old => old.id === item.id)) { rejected++; continue; }
        imported.push(item); accepted++;
      } catch { rejected++; }
    }
    save(GROUP, imported); renderGroup();
    $('import-status').textContent = `${accepted} file${accepted === 1 ? '' : 's'} imported, ${rejected} rejected or already present.`;
    event.target.value = '';
  });
  $('clear-group').addEventListener('click', () => {
    imported = []; save(GROUP, imported); renderGroup();
    $('import-status').textContent = 'Imported group files cleared.';
  });
  renderGroup();
  if (state.index === clips.length) renderResults(); else renderRound();
})();
