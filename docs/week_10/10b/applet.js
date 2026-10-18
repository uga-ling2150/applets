(() => {
'use strict';
const core = window.RoomBotCore, PLAN = core.PLAN, $ = id => document.getElementById(id);
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
core.selfTest(msg => console.info(msg));

const TAGS = {
  understood: ['✓', 'understood', 'tag-ok'],
  fallback: ['↺', "didn't catch that", 'tag-miss'],
  reprompt: ['↻', 'asked again', 'tag-miss'],
  restart: ['⟲', 'started over', 'tag-restart'],
  booked: ['★', 'booked', 'tag-booked'],
  done: ['■', 'already booked', 'tag-done']
};
// The requests come from friends' texts. The opening texts arrive together; each later text arrives
// once, after RoomBot accepts an answer at its `after` step. The date header is the only clue to "today".
const THREADS = {
  1: { who: 'Pat', start: 'Tue, Oct 20, 9:41 AM', opening: [
    'hey! can you book us a study room for tomorrow afternoon? 📚',
    "it's 3 of us: you, me and Jackie",
    "we'll need it for 2 hours"],
    later: [
      { id: 'whiteboard', after: 'ID', time: '9:43 AM', text: 'oh and we need a whiteboard for the syntax trees!!' },
      { id: 'jackie', after: 'TIME', time: '9:46 AM', text: 'ugh, Jackie just said they can only make it after 4pm. so start at 4 or later 🙏' }] },
  2: { who: 'Jordan', start: 'Tue, Oct 20, 11:05 AM', opening: [
    'hey, can you book a room for the 6 of us? friday at 3pm'],
    later: [
      { id: 'thursday', after: 'DATE', time: '11:07 AM', text: "Friday's bad for me. Can we do Thursday instead? Same time." }] }
};

function el(tag, props, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) node.append(kid);
  return node;
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const range = h => `${core.hourLabel(h)}–${core.hourLabel(h + 1)}`;
const people = n => `${n} ${n === 1 ? 'person' : 'people'}`;

function announce(message) {
  const region = $('announcer');
  region.textContent = '';
  window.setTimeout(() => { region.textContent = message; }, 60);
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

// ---- Phone: texts from a friend ----
function makePhone(n) {
  const log = $(`phone${n}-log`), thread = THREADS[n];
  const phone = { fired: new Set() };
  const stamp = time => log.append(el('li', { class: 'phone__stamp', text: time }));
  function add(text, fresh) {
    log.querySelectorAll('.is-new').forEach(li => { li.classList.remove('is-new'); li.querySelector('.phone__new').remove(); });
    log.append(el('li', { class: `phone__msg${fresh ? ' is-new' : ''}` },
      fresh ? el('span', { class: 'phone__new', text: 'New' }) : null,
      el('p', { class: 'phone__text' }, el('span', { class: 'visually-hidden', text: `${thread.who} texted: ` }), text)));
    log.scrollTop = log.scrollHeight;
  }
  phone.reset = () => {
    phone.fired.clear();
    log.replaceChildren();
    stamp(thread.start);
    thread.opening.forEach(t => add(t, false));
    $(`phone${n}-alert`).hidden = true;
  };
  // Called after each RoomBot turn. The request counts from now; the text shows up a moment later.
  phone.check = (entry, stillCurrent) => {
    for (const msg of thread.later) {
      if (phone.fired.has(msg.id) || entry.state !== msg.after || entry.tag !== 'understood') continue;
      phone.fired.add(msg.id);
      window.setTimeout(() => {
        if (!stillCurrent()) return;
        stamp(msg.time);
        add(msg.text, true);
        $(`phone${n}-alert`).hidden = false;
      }, 900);
    }
  };
  return phone;
}

// ---- Chat with RoomBot ----
function makeChat(n, onTurn) {
  const log = $(`chat${n}-log`), input = $(`chat${n}-input`);
  const chat = { session: null, busy: false, turns: 0, timer: 0 };
  const scroll = () => { log.scrollTop = log.scrollHeight; };
  function turn(role, text, extra) {
    chat.turns += 1;
    log.append(el('li', { class: `chat-turn ${role}` },
      el('span', { class: 'chat-turn__speaker', 'aria-hidden': 'true', text: `${chat.turns}. ${role === 'human' ? 'You' : 'RoomBot'}` }),
      el('p', { class: 'chat-turn__text' }, el('span', { class: 'visually-hidden', text: role === 'human' ? 'You said: ' : 'RoomBot said: ' }), text),
      extra || null));
    scroll();
  }
  function receipt(b) {
    const row = (k, v) => [el('dt', { text: k }), el('dd', { text: v })];
    return el('div', { class: 'chat-turn__extras receipt' },
      el('p', { class: 'receipt__title', text: 'Booking receipt' }),
      el('dl', null, row('Room', b.room), row('Date', core.dateLabel(b.date)), row('Time', range(b.hour)), row('People', String(b.size)),
        row('Whiteboard', b.whiteboard ? 'Yes' : 'No')));
  }
  chat.start = () => {
    window.clearTimeout(chat.timer);
    chat.session = core.createSession(n);
    chat.busy = false;
    chat.turns = 0;
    log.replaceChildren();
    turn('ai', core.opening());
  };
  $(`chat${n}-form`).addEventListener('submit', event => {
    event.preventDefault();
    const text = input.value.trim();
    input.focus();
    if (!text || chat.busy) return;
    input.value = '';
    turn('human', text);
    chat.busy = true;
    const typing = el('li', { class: 'chat-turn ai thinking', 'aria-hidden': 'true' },
      el('p', { class: 'chat-turn__text' }, 'RoomBot is typing… ',
        el('span', { class: 'thinking-dots' }, el('span'), el('span'), el('span'))));
    log.append(typing);
    scroll();
    chat.timer = window.setTimeout(() => {
      typing.remove();
      const entry = core.respond(chat.session, text);
      turn('ai', entry.botReply, entry.booking ? receipt(entry.booking) : null);
      chat.busy = false;
      if (entry.booking) {
        const b = entry.booking;
        announce(`Booking made: ${b.room}, ${core.dateLabel(b.date)} at ${core.hourLabel(b.hour)}.`);
      }
      onTurn(entry);
    }, 400);
  });
  return chat;
}

// ---- Flowchart, drawn from PLAN.states, PLAN.edges and PLAN.pile ----
function renderFlow(container, log, current, idp) {
  const j = core.journey(log), states = PLAN.states, last = states.length - 1;
  const BX = 96, BW = 150, BH = 50, GAP = 40, TOP = 16, CX = BX + BW / 2, R = BX + BW;
  const PX = 290, PW = 140, BUS = 452;
  const y = i => TOP + i * (BH + GAP);
  const H = y(last) + BH + 20;
  const times = c => `taken ${c}×`;
  const edge = (d, c, extra = '') => `<path d="${d}" class="fedge${c ? ' taken' : ''}${extra}" marker-end="url(#${idp}-${c ? 'at' : 'a'})"/>`;
  const line = (d, c, extra = '') => `<path d="${d}" class="fedge${c ? ' taken' : ''}${extra}"/>`;
  const label = (x, yy, t, c, anchor = 'middle', extra = '') =>
    `<text x="${x}" y="${yy}" text-anchor="${anchor}" class="elabel${c ? ' taken' : ''}"${extra}>${esc(t)}</text>`;
  const rotated = (x, yy, t, c) => label(x, yy, t, c, 'middle', ` transform="rotate(-90 ${x} ${yy})"`);
  const out = [];

  states.slice(0, last).forEach((s, i) => {
    const c = j.forward[`${s.id}>${states[i + 1].id}`] || 0;
    const top = y(i) + BH, mid = top + GAP / 2;
    out.push(edge(`M${CX},${top} V${y(i + 1) - 3}`, c));
    if (c) out.push(label(CX - 12, mid + 4, times(c), c, 'end'));
    if (s.note) out.push(`<text x="${CX + 12}" y="${mid + 4}" class="fnote">${esc(s.note)}</text>`);
    const sc = j.self[s.id] || 0;
    out.push(edge(`M${R},${y(i) + 14} C${R + 44},${y(i) + 2} ${R + 44},${y(i) + 48} ${R + 3},${y(i) + 36}`, sc));
    out.push(label(R + 46, y(i) + 12, PLAN.edges.self, sc, 'start'));
    if (sc) out.push(label(R + 46, y(i) + 26, times(sc), sc, 'start'));
  });

  // Left: everything that returns to the first step
  const ci = states.findIndex(s => s.id === PLAN.edges.saidNo.from), no = j.saidNo;
  out.push(edge(`M${BX},${y(ci) + 25} H60 V${y(0) + 33} H${BX - 3}`, no));
  out.push(rotated(52, y(1) + 42 + (BH + GAP) / 2, PLAN.edges.saidNo.label + (no ? ` (${times(no)})` : ''), no));
  const so = j.startOver;
  for (let i = 1; i < last; i++) out.push(line(`M${BX},${y(i) + 42} H26`, so, ' stub'));
  out.push(edge(`M${BX},${y(last) + 42} H26 V${y(0) + 17} H${BX - 3}`, so));
  out.push(rotated(18, (y(0) + 17 + y(last) + 42) / 2, PLAN.edges.startOver.label + (so ? ` (${times(so)})` : ''), so));

  // Right: the hidden pile of unfinished bookings, and the way back into the plan
  const rs = j.resumed, yl = y(last);
  out.push(edge(`M${R},${yl + 25} H${PX - 3}`, rs));
  out.push(`<rect x="${PX}" y="${yl}" width="${PW}" height="${BH}" rx="8" class="fbox pile"/>`,
    `<text x="${PX + PW / 2}" y="${yl + 21}" text-anchor="middle" class="flabel pile">${esc(PLAN.pile.label)}</text>`,
    `<text x="${PX + PW / 2}" y="${yl + 39}" text-anchor="middle" class="fsub">${esc(j.waiting ? `${j.waiting} still waiting` : PLAN.pile.sub)}</text>`);
  out.push(line(`M${PX + PW},${yl + 25} H${BUS} V${y(0) + 44}`, rs, ' stub'));
  states.slice(0, last).forEach((s, i) => out.push(edge(`M${BUS},${y(i) + 44} H${R + 3}`, j.resumedTo[s.id] || 0, ' stub')));
  out.push(rotated(468, (y(0) + 44 + yl + 25) / 2, PLAN.edges.resume.label + (rs ? ` (${times(rs)})` : ''), rs));

  states.forEach((s, i) => {
    const v = j.visits[s.id] || 0, here = s.id === current;
    const cls = here ? 'current' : v ? 'visited' : 'unvisited';
    const sub = here ? '▶ You are here' : v ? `visited ${v}×` : 'not visited';
    out.push(`<rect x="${BX}" y="${y(i)}" width="${BW}" height="${BH}" rx="8" class="fbox ${cls}"/>`,
      `<text x="${CX}" y="${y(i) + 22}" text-anchor="middle" class="flabel">${esc(s.label)}</text>`,
      `<text x="${CX}" y="${y(i) + 40}" text-anchor="middle" class="fsub ${cls}">${esc(sub)}</text>`);
  });

  const steps = states.map(s => s.label).join(', then ');
  const desc = `RoomBot's plan: ${steps}. Each step before Booked loops back to itself when RoomBot doesn't catch an answer. ` +
    `Saying no at Confirm, saying start over, or getting stuck ${PLAN.maxFallbacks} times returns to ${states[0].label}, ` +
    'and any booking cut off that way is saved in a hidden pile of unfinished bookings. ' +
    'After each booking, RoomBot takes the most recent unfinished booking off the pile and goes back to the step where it stopped. ' +
    (current ? `You are at ${core.stateById(current).label}.` : '');
  const head = (id, fill) => `<marker id="${idp}-${id}" viewBox="0 0 8 8" refX="7" refY="4" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" fill="${fill}"/></marker>`;
  container.innerHTML = `<svg viewBox="0 0 480 ${H}" role="img" aria-labelledby="${idp}-t ${idp}-d" class="flow">` +
    `<title id="${idp}-t">Flowchart of RoomBot's plan</title><desc id="${idp}-d">${esc(desc)}</desc>` +
    `<defs>${head('a', '#6b6b6b')}${head('at', '#004E60')}</defs>${out.join('')}</svg>`;
}

// ---- Outcome check ----
function renderOutcome(container, score, session, needed, who) {
  const g = score.group, bookings = session.bookings;
  const view = el('div', { class: 'outcome-panel' }, el('h5', { text: "RoomBot's view" }),
    el('p', { class: 'bot-view' }, bookings.length ? [el('span', { 'aria-hidden': 'true', text: '✅ ' }), 'Booking complete.'] : 'No booking made.'),
    bookings.length ? el('ul', { class: 'booking-list' }, bookings.map(b =>
      el('li', { text: `${b.room}, ${core.dateLabel(b.date)}, ${range(b.hour)}, for ${people(b.size)}` }))) : null);
  const goal = el('div', { class: 'outcome-panel' }, el('h5', { text: `What ${who} asked for` }),
    el('ul', { class: 'goal-list' }, score.items.map(i => el('li', { class: i.met ? 'met' : 'unmet' },
      el('span', { class: 'goal-mark' }, el('span', { 'aria-hidden': 'true', text: i.met ? '✓ ' : '✗ ' }), i.met ? 'Met:' : 'Not met:'),
      ' ', i.label, el('span', { class: 'goal-detail', text: i.detail })))),
    el('p', { class: 'goal-total', text: `${score.met} of ${score.total} requests met.` }));
  const note = text => goal.append(el('p', { class: 'goal-note', text }));
  if (g && bookings.length > g.length) note(`You have ${bookings.length} bookings in total. RoomBot never asked if you wanted to cancel any of them.`);
  if (g && new Set(g.map(b => b.room)).size > 1) note("The two hours are in different rooms, so you'd have to move halfway through.");
  const wrong = g && g.find(b => b.size !== needed && b.seats >= needed);
  if (wrong) note(`RoomBot thinks ${wrong.size} ${wrong.size === 1 ? 'person is' : 'people are'} coming.`);
  if (session.stack.length) note(`RoomBot is still holding ${session.stack.length} unfinished booking${session.stack.length === 1 ? '' : 's'}, and will try to finish ${session.stack.length === 1 ? 'it' : 'them'} after your next booking.`);
  container.replaceChildren(view, goal);
}

function tag(kind) {
  const [icon, text, cls] = TAGS[kind];
  return el('span', { class: `tag ${cls}` }, el('span', { 'aria-hidden': 'true', text: icon + ' ' }), text);
}
const statsLine = s => `Messages sent: ${s.messages}, Not understood: ${s.notUnderstood}, Restarts: ${s.restarts}`;

// ---- Stage state ----
let unlocked2 = false, unlocked3 = false, round2Done = false;
const meant = [];
const phone1 = makePhone(1), phone2 = makePhone(2);
const chat1 = makeChat(1, onTurn1), chat2 = makeChat(2, onTurn2);
// What each friend has asked for so far, read from the texts that have arrived.
const asked1 = () => ({ whiteboard: phone1.fired.has('whiteboard'), jackie: phone1.fired.has('jackie') });
const asked2 = () => ({ date: core.addDays(PLAN.today, phone2.fired.has('thursday') ? 2 : 3) });

document.querySelectorAll('[data-room-guide]').forEach(body => body.replaceChildren(...PLAN.rooms.map(r => el('tr', null,
  el('td', { text: `${r.min}–${r.max}` }), el('td', { text: r.name }), el('td', { text: String(r.seats) }), el('td', { text: r.whiteboard ? 'Yes' : 'No' })))));
$('never-list').replaceChildren(...PLAN.neverAsks.map(t => el('li', { text: t })));

function textsAfter(phone, chat, entry) {
  const session = chat.session;
  phone.check(entry, () => chat.session === session);
}

function onTurn1(entry) {
  textsAfter(phone1, chat1, entry);
  if (entry.booking && !unlocked2) unlock2(false);
  if (unlocked2) renderReveal();
  else $('skip1').hidden = chat1.session.log.length < 6;
}

function unlock2(viaSkip) {
  unlocked2 = true;
  setStage(1, 'done');
  setStage(2, 'active');
  $('stage2-lock').hidden = true;
  $('stage2-content').hidden = false;
  $('skip1').hidden = true;
  $('reset1').hidden = true;
  const score = renderReveal();
  const result = `Round 1 result: ${score.met} of ${score.total} requests met.`;
  if (viaSkip) {
    focusHeading('stage2-title');
    announce(`Stage 2, Behind the curtain, is now open. ${result}`);
  } else {
    $('to-stage2').hidden = false;
    window.setTimeout(() => announce(`Stage 2, Behind the curtain, is now open below. ${result}`), 1500);
  }
}

function renderReveal() {
  const session = chat1.session, log = session.log;
  const score = core.scoreGoal(1, session.bookings, asked1());
  renderOutcome($('outcome1'), score, session, 3, 'Pat');
  $('stats1').textContent = statsLine(core.stats(log));
  renderFlow($('flow1'), log, null, 'f1');
  $('path1').textContent = `Your path: ${core.journey(log).path}`;
  const hidden = log.map((e, i) => e.hidden && el('li', { text: `After message ${i + 1}: ${e.hidden}` })).filter(Boolean);
  $('hidden1').replaceChildren(...(hidden.length ? hidden
    : [el('li', { class: 'none', text: 'Nothing this time. You never left a booking half-finished, so the pile stayed empty.' })]));
  const misfits = log.filter(e => e.tag === 'fallback' || e.eventType === 'restart-stuck');
  $('misfits1').replaceChildren(...(misfits.length ? misfits.map(e => el('li', { text: `“${e.userText}”` }))
    : [el('li', { class: 'none', text: "Nothing. Everything you typed fit one of RoomBot's questions." })]));
  $('rows1').replaceChildren(...log.map((e, i) => {
    const area = el('textarea', { id: `meant-${i}`, rows: '2', maxlength: '300' });
    area.value = meant[i] || '';
    area.addEventListener('input', () => { meant[i] = area.value; });
    return el('tr', null,
      el('td', { 'data-label': 'You typed' }, el('span', { class: 'msg-num', text: `Message ${i + 1}` }), el('span', { class: 'typed', text: e.userText })),
      el('td', { 'data-label': 'What you meant' }, el('div', { class: 'field meant' },
        el('label', { for: `meant-${i}` }, 'What you meant', el('span', { class: 'visually-hidden', text: ` by message ${i + 1}` }), ' ', el('span', { class: 'field-optional', text: '(optional)' })),
        area)),
      el('td', { 'data-label': 'What RoomBot heard' }, tag(e.tag), el('p', { class: 'heard', text: e.heard })),
      el('td', { 'data-label': 'What RoomBot did, and why' }, el('p', { class: 'did', text: `RoomBot: “${e.botReply}”` }),
        el('p', { class: 'note' }, el('strong', { text: "Designer's note: " }), `“${e.note}”`),
        e.hidden ? el('p', { class: 'behind' }, el('strong', { text: 'Behind the scenes: ' }), e.hidden, ' ', el('span', { class: 'note', text: `“${e.hiddenNote}”` })) : null));
  }));
  return score;
}

function renderMap2() {
  const { log, state } = chat2.session;
  renderFlow($('flow2'), log, state, 'f2');
  $('path2').textContent = `Your path so far: ${core.journey(log).path}`;
}

function onTurn2(entry) {
  textsAfter(phone2, chat2, entry);
  renderMap2();
  if (entry.booking && !round2Done) showRound2(false);
  else if (round2Done) renderRound2();
  if (!round2Done) $('skip2').hidden = chat2.session.log.length < 6;
}

function showRound2(viaSkip) {
  round2Done = true;
  setStage(3, 'done');
  $('round2-results').hidden = false;
  $('skip2').hidden = true;
  $('reset2').hidden = true;
  const score = renderRound2();
  const result = `Round 2 result: ${score.met} of ${score.total} requests met. The results are below the chat.`;
  if (viaSkip) { focusHeading('round2-title'); announce(result); }
  else window.setTimeout(() => announce(result), 1500);
}

function renderRound2() {
  const s1 = chat1.session, s2 = chat2.session;
  const score1 = core.scoreGoal(1, s1.bookings, asked1()), score2 = core.scoreGoal(2, s2.bookings, asked2());
  renderOutcome($('outcome2'), score2, s2, 6, 'Jordan');
  const a = core.stats(s1.log), b = core.stats(s2.log);
  const row = (k, x, y) => el('tr', null, el('th', { scope: 'row', text: k }), el('td', { text: String(x) }), el('td', { text: String(y) }));
  $('compare-body').replaceChildren(row('Messages sent', a.messages, b.messages), row('Not understood', a.notUnderstood, b.notUnderstood),
    row('Restarts', a.restarts, b.restarts), row('Bookings made', s1.bookings.length, s2.bookings.length),
    row('Requests met', `${score1.met} of ${score1.total}`, `${score2.met} of ${score2.total}`));
  return score2;
}

$('skip1').addEventListener('click', () => unlock2(true));
$('to-stage2').addEventListener('click', () => focusHeading('stage2-title'));
$('reset1').addEventListener('click', () => {
  chat1.start();
  phone1.reset();
  meant.length = 0;
  $('skip1').hidden = true;
  $('chat1-input').focus();
});
$('to-stage3').addEventListener('click', () => {
  if (!unlocked3) {
    unlocked3 = true;
    setStage(2, 'done');
    setStage(3, 'active');
    $('stage3-lock').hidden = true;
    $('stage3-content').hidden = false;
    renderMap2();
  }
  focusHeading('stage3-title');
  announce('Stage 3, Try again with the map, is now open.');
});
$('skip2').addEventListener('click', () => showRound2(true));
$('reset2').addEventListener('click', () => {
  chat2.start();
  phone2.reset();
  $('skip2').hidden = true;
  renderMap2();
  $('chat2-input').focus();
});

chat1.start();
chat2.start();
phone1.reset();
phone2.reset();
})();
